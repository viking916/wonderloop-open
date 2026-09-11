// progress.ts: everything about a profile's live quest progress, attempts, mistake-box queue
// and skills map (spec 9). Watchers are built on onSnapshot and return an unsubscribe; nothing
// here polls. Writers return the promise of the write so a caller can show "saving" until it
// resolves (spec 12) -- this module builds no queue of its own, since Firestore's own offline
// persistence (enabled in lib/firebase/client.ts) already queues a write while offline and
// replays it once the network returns.

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { currentCycleProblemState, type AttemptRecord, type ProblemState } from "../domain/attempts";
import { questStatus, resumePosition, type QuestProgress } from "../domain/completion";
import type { ReviewItem } from "../domain/review";
import type { SkillProgress, StoredAttempt } from "../domain/skills";
import type { Quest } from "../content/schema";
import { getDb } from "../firebase/client";
import {
  attemptsCol,
  progressCol,
  progressRef,
  reviewItemRef,
  reviewQueueCol,
  screenTimeConverter,
  screenTimePath,
  screenTimeRef,
  skillRef,
  skillsCol,
  type AttemptDoc,
  type ProblemProgress,
  type ProgressDoc,
} from "./types";

// ---------------------------------------------------------------------------
// Quest progress
// ---------------------------------------------------------------------------

export function watchProgress(
  hid: string, pid: string, cb: (progress: Array<{ questId: string; progress: ProgressDoc }>) => void,
): Unsubscribe {
  const db = getDb();
  return onSnapshot(progressCol(db, hid, pid), (snap) => {
    cb(snap.docs.map((d) => ({ questId: d.id, progress: d.data() })));
  });
}

/**
 * Which of a Sprout week's activities are done (spec 7.2: "Sprout activities complete when they
 * end"), read straight off each activity's own progress doc status -- the same one-line rule
 * app/sprout/page.tsx (the Hill) and app/parent/page.tsx (the SproutCard) both need to agree on
 * before feeding lib/domain/sprout.ts's starsForWeek. Final whole-branch review, minor finding:
 * previously duplicated verbatim in both.
 */
export function doneActivityIds(activities: Array<{ id: string }>, progressDocs: Record<string, ProgressDoc>): Set<string> {
  return new Set(activities.filter((a) => progressDocs[a.id]?.status === "done").map((a) => a.id));
}

/**
 * Merges patch into progress/{questId}, creating the document on first write. A nested
 * `problems` map merges deeply (Firestore's set-with-merge behaviour), so passing
 * `{ problems: { [problemId]: { whatYouTried: "..." } } }` updates just that one problem's
 * entry without touching any other problem already recorded on this quest. Prefer
 * buildProgressDoc below to construct the patch, so status/stepIndex/problemIndex never drift
 * out of sync with the `quest` state they are derived from.
 */
export function saveQuestProgress(
  hid: string, pid: string, questId: string, patch: Partial<ProgressDoc>,
): Promise<void> {
  const db = getDb();
  return setDoc(progressRef(db, hid, pid, questId), patch, { merge: true });
}

/**
 * Builds a full ProgressDoc from the quest's content and its current QuestProgress (the full
 * lib/domain/completion.ts state -- ticks, checklist, problemOutcomes, explains, artifacts,
 * logs, debates, parked -- everything the child actually produced), so a caller never
 * hand-computes status/stepIndex/problemIndex itself: they are always resumePosition/
 * questStatus run over the same `quest` object that gets persisted, which is also exactly what
 * a reader gets back and can hand straight to isStepComplete/resumePosition without
 * reconstructing anything. `problems` and the startedAt/completedAt scalars are supplied
 * separately since nothing in QuestProgress tracks them.
 */
export function buildProgressDoc(
  quest: Quest, questProgress: QuestProgress,
  extra: { startedAt?: number; completedAt?: number; problems?: Record<string, ProblemProgress> } = {},
): ProgressDoc {
  const resume = resumePosition(quest, questProgress);
  // Conditional spreads, not a plain { startedAt: extra.startedAt } assignment: a JS object
  // literal keeps a key whose value is undefined, and converterWithTimestamps used to treat
  // "key present" the same as "value present" and stamp it with serverTimestamp() anyway, so a
  // never-started quest was coming back with a real startedAt/completedAt. Leaving the key out
  // entirely when there is nothing to record is what actually keeps it unset end to end.
  return {
    status: questStatus(quest, questProgress),
    stepIndex: resume.stepIndex,
    problemIndex: resume.problemIndex ?? 0,
    minutes: quest.minutes,
    ...(extra.startedAt !== undefined ? { startedAt: extra.startedAt } : {}),
    ...(extra.completedAt !== undefined ? { completedAt: extra.completedAt } : {}),
    quest: questProgress,
    problems: extra.problems ?? {},
  };
}

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

export type NewAttempt = {
  questId: string;
  problemId: string;
  answer: string;
  correct: boolean;
  tryNumber: 1 | 2 | 3;
  hintTier: 0 | 1 | 2 | 3;
  ideaIds: string[];
  revealed: boolean;
  retry: boolean;
  at: number;
  confidence?: "sure" | "probably" | "guessing";
  // The current attempt cycle's firstSeenAt (ProblemState.firstSeenAt / ProblemProgress.firstSeenAt),
  // NOT this attempt's own timestamp. Only used to build a deterministic doc id (see
  // attemptDocId below); never stored on the attempt document itself.
  cycleStartedAt: number;
};

/**
 * Task 10 fix (review finding 1, part 2): a deterministic id, not addDoc's random one, so a
 * duplicate write for the same try (e.g. handleSubmit landing twice inside a stale-state
 * window, or a retried network write) overwrites itself instead of creating a second attempt
 * document that recomputeFromAttempts could then credit as extra, unearned evidence.
 *
 * cycleStartedAt (the attempt cycle's firstSeenAt) is part of the id, not just problemId and
 * tryNumber, because "Try it again" (spec 7.2) starts a brand new cycle with its own try 1/2/3
 * on the very same problemId: without cycleStartedAt in the key, a retry's try 1 would collide
 * with and overwrite the original cycle's try 1, destroying exactly the history spec 7.2 says
 * must be kept ("history is kept, the newest is shown"). Two different cycles on one problem
 * always have two different firstSeenAt values, since a fresh cycle is only ever started once
 * the previous one has finished.
 */
export function attemptDocId(problemId: string, cycleStartedAt: number, tryNumber: 1 | 2 | 3): string {
  return `${problemId}__${cycleStartedAt}__try${tryNumber}`;
}

/** Persists one attempt at its deterministic id (see attemptDocId) and returns that id. */
export async function recordAttempt(hid: string, pid: string, attempt: NewAttempt): Promise<string> {
  const db = getDb();
  const { cycleStartedAt, ...rest } = attempt;
  const id = attemptDocId(attempt.problemId, cycleStartedAt, attempt.tryNumber);
  const ref = doc(attemptsCol(db, hid, pid), id);
  await setDoc(ref, rest);
  return ref.id;
}

/** After a first-try miss the child names the kind of miss; it lands on that attempt. */
export async function setAttemptMissKind(hid: string, pid: string, attemptId: string, missKind: "misread" | "did-not-know" | "slipped"): Promise<void> {
  const db = getDb();
  await updateDoc(doc(attemptsCol(db, hid, pid), attemptId), { missKind });
}

export function watchAttemptsForQuest(
  hid: string, pid: string, questId: string, cb: (attempts: Array<{ id: string; attempt: AttemptDoc }>) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getDb();
  const q = query(attemptsCol(db, hid, pid), where("questId", "==", questId));
  // onError (review round 2, finding 1): onSnapshot silently stops delivering on a permission
  // error or a persistent offline condition with no callback at all unless one is supplied here
  // -- a caller that never gets a first snapshot and never finds out why has no way to tell "still
  // loading" apart from "never going to load". ProblemPlayer uses this to stop showing an
  // indefinite loading state and instead offer a real message plus a way forward.
  return onSnapshot(q, (snap) => {
    const attempts = snap.docs.map((d) => ({ id: d.id, attempt: d.data() })).sort((a, b) => a.attempt.at - b.attempt.at);
    cb(attempts);
  }, onError);
}

/**
 * Every attempt on record for this profile, across every quest -- watchAttemptsForQuest's same
 * shape, without the questId filter. The idea box (lib/domain/ideas.ts's metIdeas) needs "every
 * problem he has ever attempted", not one quest's worth, since an idea first met in an earlier
 * week's warm-up is still met.
 */
export function watchAllAttempts(
  hid: string, pid: string, cb: (attempts: Array<{ id: string; attempt: AttemptDoc }>) => void,
): Unsubscribe {
  const db = getDb();
  return onSnapshot(attemptsCol(db, hid, pid), (snap) => {
    const attempts = snap.docs.map((d) => ({ id: d.id, attempt: d.data() })).sort((a, b) => a.attempt.at - b.attempt.at);
    cb(attempts);
  });
}

/** An AttemptDoc reduced to the shape skills.ts's recomputeFromAttempts consumes. */
export function toStoredAttempt(attempt: AttemptDoc): StoredAttempt {
  return {
    problemId: attempt.problemId,
    questId: attempt.questId,
    correct: attempt.correct,
    tryNumber: attempt.tryNumber,
    hintTier: attempt.hintTier,
    revealed: attempt.revealed,
    retry: attempt.retry,
    at: attempt.at,
  };
}

/**
 * Rebuilds a ProblemState (lib/domain/attempts.ts) for one problem from its progress-doc entry
 * (firstSeenAt, whatYouTried, revealedAt) and its attempts, so the UI can call viewProblem /
 * recordAttempt from lib/domain/attempts.ts without ever storing a ProblemState directly.
 *
 * `attempts` here is every attempt on record for the problem, across every past "Try it again"
 * cycle -- scoping that down to the CURRENT cycle (the one firstSeenAt describes) is
 * currentCycleProblemState's job, not this function's; see that function's own comment for why
 * this is the one place that rule lives, shared with ProblemPlayer.tsx's live view.
 */
export function toProblemState(
  progress: ProgressDoc | undefined, problemId: string, attempts: AttemptDoc[],
): ProblemState {
  const entry = progress?.problems?.[problemId];
  const attemptRecords: AttemptRecord[] = attempts
    .filter((a) => a.problemId === problemId)
    .map((a) => ({ tryNumber: a.tryNumber, correct: a.correct, hintTier: a.hintTier, at: a.at }));
  return currentCycleProblemState(problemId, entry?.firstSeenAt ?? Date.now(), attemptRecords, entry?.whatYouTried, entry?.revealedAt);
}

// ---------------------------------------------------------------------------
// Mistake-box review queue
// ---------------------------------------------------------------------------

export function upsertReviewItem(hid: string, pid: string, item: ReviewItem): Promise<void> {
  const db = getDb();
  const { problemId, ...rest } = item;
  return setDoc(reviewItemRef(db, hid, pid, problemId), rest);
}

/** Removes a problem from the mistake box (clearOnVariantSuccess in lib/domain/review.ts
 * returning null: a first-try correct on the due variant). */
export function clearReviewItem(hid: string, pid: string, problemId: string): Promise<void> {
  const db = getDb();
  return deleteDoc(reviewItemRef(db, hid, pid, problemId));
}

export function watchReviewQueue(
  hid: string, pid: string, cb: (items: ReviewItem[]) => void,
): Unsubscribe {
  const db = getDb();
  return onSnapshot(reviewQueueCol(db, hid, pid), (snap) => {
    cb(snap.docs.map((d) => ({ problemId: d.id, ...d.data() })));
  });
}

// ---------------------------------------------------------------------------
// Skills map
// ---------------------------------------------------------------------------

/**
 * Replaces the profile's whole skills collection with the given list. recomputeFromAttempts
 * (lib/domain/skills.ts) always returns the full, from-scratch skill set, never a delta, so a
 * skill with no more evidence (e.g. after a reset) must be deleted here rather than left stale.
 */
export async function saveSkills(hid: string, pid: string, skills: SkillProgress[]): Promise<void> {
  const db = getDb();
  const currentSnap = await getDocs(skillsCol(db, hid, pid));
  const keepIds = new Set(skills.map((s) => s.skillId));
  const batch = writeBatch(db);
  for (const d of currentSnap.docs) {
    if (!keepIds.has(d.id)) batch.delete(d.ref);
  }
  for (const s of skills) {
    batch.set(skillRef(db, hid, pid, s.skillId), { level: s.level, points: s.points, evidence: s.evidence, source: s.source });
  }
  await batch.commit();
}

export function watchSkills(hid: string, pid: string, cb: (skills: SkillProgress[]) => void): Unsubscribe {
  const db = getDb();
  return onSnapshot(skillsCol(db, hid, pid), (snap) => {
    cb(snap.docs.map((d) => ({ skillId: d.id, ...d.data() })));
  });
}

// ---------------------------------------------------------------------------
// Sprout screen time (spec 2: capped at 15 minutes/day)
// ---------------------------------------------------------------------------

function todayId(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function bumpScreenTime(hid: string, pid: string, minutes: number, now: Date = new Date()): Promise<void> {
  const db = getDb();
  // Raw (converter-free) write: increment() is a FieldValue, not a number.
  return setDoc(doc(db, `${screenTimePath(hid, pid)}/${todayId(now)}`), { minutes: increment(minutes) }, { merge: true });
}

/** Live version of a one-shot "today's minutes" read (removed as a dead export, final review
 * minor finding: every real caller already needs the live value, not a one-shot read), so the
 * Hill (spec 6's 15-minute cap) shows the
 * daily-limit screen the moment today's minutes cross the cap, without a manual reload -- an
 * activity finishing in another tab, or this same accrual interval, both land here as soon as
 * Firestore delivers the write. */
export function watchScreenTimeToday(
  hid: string, pid: string, cb: (minutes: number) => void, now: Date = new Date(),
): Unsubscribe {
  const db = getDb();
  return onSnapshot(screenTimeRef(db, hid, pid, todayId(now)), (snap) => {
    cb(snap.exists() ? snap.data().minutes : 0);
  });
}

/** Every screenTime/{yyyy-mm-dd} doc this profile has, unfiltered -- the Parent view's
 * lib/domain/calendar.ts's weekDateRange decides which date ids belong to a given week; this
 * only supplies the raw minutes-by-date-id map to slice. A whole season is at most 84 days, so
 * one small collection watch is simpler and just as live as a per-week ranged query. */
export function watchScreenTime(
  hid: string, pid: string, cb: (entries: Array<{ date: string; minutes: number }>) => void,
): Unsubscribe {
  const db = getDb();
  const col = collection(db, screenTimePath(hid, pid)).withConverter(screenTimeConverter);
  return onSnapshot(col, (snap) => {
    cb(snap.docs.map((d) => ({ date: d.id, minutes: d.data().minutes })));
  });
}

// ---------------------------------------------------------------------------
// Parent review (spec 7.3: "parent sees it and can thumbs-up or mark redo")
// ---------------------------------------------------------------------------

/** The Parent view's thumbs-up on a rubric (not-auto-graded) explain-it answer: a quiet,
 * persisted acknowledgement, written the same merge-into-`problems` way whatYouTried is. There
 * is no domain rule attached to it -- it changes no score, level or completion -- so it is
 * written directly here rather than through a lib/domain module. "Redo" is deliberately not a
 * sibling of this function: the Parent view's redo control calls resetProblem
 * (lib/data/resets.ts) instead, which is the real, spec 7.2 "logged and recomputed" reset. */
export function approveParentReview(hid: string, pid: string, questId: string, problemId: string): Promise<void> {
  return saveQuestProgress(hid, pid, questId, {
    problems: { [problemId]: { parentReview: "approved" } } as Record<string, ProblemProgress>,
  });
}
