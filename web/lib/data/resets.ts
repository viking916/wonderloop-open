// resets.ts: parent-triggered resets (spec 7.2: "Parent can reset a problem, a quest, a week
// or a season for a profile. Resets are logged; the mistake box and skills recompute from
// remaining attempts."). Every reset deletes the matching progress, attempts and review items,
// writes a resets document, and recomputes and saves skills from what is left.
//
// Ordering and atomicity: a reset's operations are always performed skills-and-resets-doc
// last, after every deletion has committed. When the whole reset fits in one Firestore batch
// (at most MAX_OPS_PER_BATCH operations -- true for a problem or quest reset, and for most week
// resets), it is committed as exactly one writeBatch: one commit, or nothing, so there is no
// window where a deletion has landed but the skill docs still cite evidence that no longer
// exists. A week or season reset can exceed Firestore's 500-operation-per-batch cap (up to 36
// quests and 241 problems, several attempts each), so once the op count crosses the cap the
// deletions are chunked into sequential batches, committed first, with the resets document and
// the recomputed skills committed last in their own (also chunked, though this is normally
// small) batch. A crash mid-way through the deletion chunks then leaves the reset visibly
// incomplete -- some attempts or progress still present, skills untouched -- rather than
// silently landing a skills doc that overstates what remains; re-running the same reset is safe
// (every operation here is idempotent: deleting an already-deleted document is a no-op, and
// recomputeFromAttempts always recomputes from scratch).
//
// This module stays free of the content bundle: it never imports lib/content. The app layer
// (which does have content access) tells it which quest ids and problem ids are in scope for a
// week/season reset, and hands it the skillsForProblem resolver plus the profile's logs and any
// parent-entered skill notes, exactly as lib/domain/skills.ts's recomputeFromAttempts expects
// them: recomputeFromAttempts(remainingAttempts, logs, parentEntries, skillsForProblem).

import { deleteField, doc, getDocs, onSnapshot, writeBatch, type DocumentReference, type Firestore, type Unsubscribe } from "firebase/firestore";
import { recomputeFromAttempts, type ParentSkillEntry, type SkillProgress, type SkillsForProblem, type StoredAttempt, type StoredLog } from "../domain/skills";
import { getDb } from "../firebase/client";
import { toStoredAttempt } from "./progress";
import { attemptsCol, progressRef, resetsCol, reviewItemRef, skillRef, skillsCol, type ResetDoc, type ResetScope } from "./types";

export type ResetSkillInputs = {
  logs: StoredLog[];
  parentEntries: ParentSkillEntry[];
  skillsForProblem: SkillsForProblem;
};

// Firestore's cap is 500 operations per batch; stay comfortably under it so a batch that is
// already near the cap for other reasons (unlikely here, but cheap to guard against) still has
// headroom.
const MAX_OPS_PER_BATCH = 450;

type BatchOp =
  | { kind: "delete"; ref: DocumentReference<unknown> }
  | { kind: "set"; ref: DocumentReference<unknown>; data: Record<string, unknown> }
  | { kind: "setMerge"; ref: DocumentReference<unknown>; data: Record<string, unknown> };

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function applyOp(batch: ReturnType<typeof writeBatch>, op: BatchOp): void {
  if (op.kind === "delete") batch.delete(op.ref);
  else if (op.kind === "set") batch.set(op.ref, op.data);
  else batch.set(op.ref, op.data, { merge: true });
}

async function commitChunked(db: Firestore, ops: BatchOp[]): Promise<void> {
  for (const group of chunk(ops, MAX_OPS_PER_BATCH)) {
    const batch = writeBatch(db);
    for (const op of group) applyOp(batch, op);
    await batch.commit();
  }
}

/**
 * Commits deleteOps and finalOps (the resets document plus the skill writes) together as one
 * atomic batch when the whole reset fits under the per-batch operation cap; otherwise commits
 * the deletions first, in chunks, then the final (resets doc + skills) operations last, also
 * chunked. See the module comment for why this ordering is the right fallback once true
 * atomicity is no longer possible.
 */
async function commitReset(db: Firestore, deleteOps: BatchOp[], finalOps: BatchOp[]): Promise<void> {
  const allOps = [...deleteOps, ...finalOps];
  if (allOps.length <= MAX_OPS_PER_BATCH) {
    const batch = writeBatch(db);
    for (const op of allOps) applyOp(batch, op);
    await batch.commit();
    return;
  }
  await commitChunked(db, deleteOps);
  await commitChunked(db, finalOps);
}

async function performReset(
  hid: string, pid: string, scope: ResetScope, targetId: string,
  questIds: string[], problemIds: string[], byUid: string,
  skillInputs: ResetSkillInputs, now: number,
): Promise<SkillProgress[]> {
  const db = getDb();
  const [attemptsSnap, skillsSnap] = await Promise.all([
    getDocs(attemptsCol(db, hid, pid)),
    getDocs(skillsCol(db, hid, pid)),
  ]);

  const questIdSet = new Set(questIds);
  const problemIdSet = new Set(problemIds);
  const isProblemScope = scope === "problem";

  const deleteOps: BatchOp[] = [];
  const keptAttempts: StoredAttempt[] = [];

  for (const d of attemptsSnap.docs) {
    const a = d.data();
    const inScope = isProblemScope
      ? a.questId === questIds[0] && a.problemId === problemIds[0]
      : questIdSet.has(a.questId);
    if (inScope) deleteOps.push({ kind: "delete", ref: d.ref });
    else keptAttempts.push(toStoredAttempt(a));
  }

  if (isProblemScope) {
    // Drop just this one problem's entry from the quest's progress doc, leaving the rest of
    // the quest's progress (other problems, stepIndex, status) untouched.
    deleteOps.push({
      kind: "setMerge",
      ref: progressRef(db, hid, pid, questIds[0]),
      data: { problems: { [problemIds[0]]: deleteField() } },
    });
  } else {
    for (const questId of questIds) deleteOps.push({ kind: "delete", ref: progressRef(db, hid, pid, questId) });
  }

  for (const problemId of problemIdSet) deleteOps.push({ kind: "delete", ref: reviewItemRef(db, hid, pid, problemId) });

  // Skills are always recomputed from scratch (lib/domain/skills.ts never increments), so a
  // skill with no evidence left after this reset must be deleted rather than left stale; that
  // delete belongs in the same final phase as the new skill values, never in the deletion phase
  // above, since it depends on `keptAttempts`, which the deletion phase does not yet reflect.
  const skills = recomputeFromAttempts(keptAttempts, skillInputs.logs, skillInputs.parentEntries, skillInputs.skillsForProblem);
  const keepSkillIds = new Set(skills.map((s) => s.skillId));

  const finalOps: BatchOp[] = [];
  for (const d of skillsSnap.docs) if (!keepSkillIds.has(d.id)) finalOps.push({ kind: "delete", ref: d.ref });
  for (const s of skills) {
    finalOps.push({
      kind: "set",
      ref: skillRef(db, hid, pid, s.skillId),
      data: { level: s.level, points: s.points, evidence: s.evidence, source: s.source },
    });
  }
  finalOps.push({ kind: "set", ref: doc(resetsCol(db, hid, pid)), data: { scope, targetId, byUid, at: now } });

  await commitReset(db, deleteOps, finalOps);

  return skills;
}

export function resetProblem(
  hid: string, pid: string, questId: string, problemId: string, byUid: string,
  skillInputs: ResetSkillInputs, now: number = Date.now(),
): Promise<SkillProgress[]> {
  return performReset(hid, pid, "problem", problemId, [questId], [problemId], byUid, skillInputs, now);
}

export function resetQuest(
  hid: string, pid: string, questId: string, problemIds: string[], byUid: string,
  skillInputs: ResetSkillInputs, now: number = Date.now(),
): Promise<SkillProgress[]> {
  return performReset(hid, pid, "quest", questId, [questId], problemIds, byUid, skillInputs, now);
}

/** targetId identifies the reset week, e.g. "s1-w01" (the app layer's convention; this module
 * never parses it). questIds/problemIds are every quest and problem in that week. */
export function resetWeek(
  hid: string, pid: string, targetId: string, questIds: string[], problemIds: string[], byUid: string,
  skillInputs: ResetSkillInputs, now: number = Date.now(),
): Promise<SkillProgress[]> {
  return performReset(hid, pid, "week", targetId, questIds, problemIds, byUid, skillInputs, now);
}

/** targetId identifies the reset season, e.g. "s1". questIds/problemIds are every quest and
 * problem in that season. */
export function resetSeason(
  hid: string, pid: string, targetId: string, questIds: string[], problemIds: string[], byUid: string,
  skillInputs: ResetSkillInputs, now: number = Date.now(),
): Promise<SkillProgress[]> {
  return performReset(hid, pid, "season", targetId, questIds, problemIds, byUid, skillInputs, now);
}

/** Every reset on record for a profile, live (task 13 fix 1: since performReset never deletes
 * logs or artifacts at any scope, the Parent view needs this list to tell whether a surviving
 * log or artifact predates the most recent reset that covers its quest -- see
 * lib/domain/resets.ts's coveringResetAt, which this module's callers feed with exactly this
 * shape). */
export function watchResets(hid: string, pid: string, cb: (resets: Array<{ id: string; reset: ResetDoc }>) => void): Unsubscribe {
  const db = getDb();
  return onSnapshot(resetsCol(db, hid, pid), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, reset: d.data() })));
  });
}
