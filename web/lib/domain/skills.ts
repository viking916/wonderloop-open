// Pure skill levelling (spec section 8 and spec 3's "level movement" rule): points per problem
// come from the child's best attempt on it, skills are recomputed from scratch on every call
// (never incremented), so a parent reset and a fresh attempt go through the exact same code
// path. No Firebase, no React, no Date.now() inside functions: time always arrives via the
// "at" field on each stored record.

import type { Track } from "../content/schema";
import type { ProblemView } from "./attempts";

/** Mirrors lib/data/types.ts's SkillSource (spec 9's skills/{skillId}.source), redeclared here
 * rather than imported so this module stays Firebase-free. A skill with any app-earned evidence
 * (an attempt or a log) is "app" even when it also carries a parent-entered note; "parent" is
 * reserved for a skill whose only evidence, so far, is parent-entered (task 13 brief: "add a
 * dated note against a skill... which then appears in the skills map with source: parent"). */
export type SkillSource = "app" | "parent";

export type SkillProgress = { skillId: string; points: number; level: 1 | 2 | 3 | 4 | 5; evidence: string[]; source: SkillSource };

/** What Task 5 persists per attempt (attempts/{id} in Firestore, spec section 9). */
export type StoredAttempt = {
  problemId: string;
  questId: string;
  correct: boolean;
  tryNumber: 1 | 2 | 3;
  hintTier: 0 | 1 | 2 | 3;
  revealed: boolean;
  // Task 10 fix (spec 7.2 "he can retry any problem"): true when this attempt was recorded
  // during a "Try it again" cycle, not the problem's original one. pointsForOutcome below
  // always scores a retry attempt at 0, so retrying can never manufacture credit; the attempt
  // still counts as evidence (recomputeFromAttempts keeps it if it is the best-scoring attempt
  // on record, e.g. when the original cycle was also 0).
  retry: boolean;
  at: number;
};

/** A completed Maker's Log or Speak log (spec section 8): questId/track/at is all skills.ts needs. */
export type StoredLog = { questId: string; track: Track; at: number };

/** A parent-entered activity (chess, piano) noted on the skills map: evidence, never points. */
export type ParentSkillEntry = { skillId: string; note: string; at: number };

/**
 * Resolves a problem id to the skill ids it is tagged with, so recomputeFromAttempts never
 * reaches into the content layer itself: the caller (the app layer, not this pure module)
 * passes a resolver such as (id) => getProblem(id)?.problem.skills ?? [].
 */
export type SkillsForProblem = (problemId: string) => string[];

const EVIDENCE_CAP = 20;

const LEVEL_THRESHOLDS: Array<[number, 1 | 2 | 3 | 4 | 5]> = [
  [50, 5],
  [30, 4],
  [15, 3],
  [6, 2],
  [0, 1],
];

/** Level thresholds: 0, 6, 15, 30, 50 (spec section 8). */
export function levelFor(points: number): 1 | 2 | 3 | 4 | 5 {
  for (const [threshold, level] of LEVEL_THRESHOLDS) if (points >= threshold) return level;
  return 1;
}

/**
 * The 3/2/1/0 point ladder (spec 7.3 / section 8), shared by every caller that scores an
 * outcome: a correct answer earns 3 on the first try, 2 after one hint, 1 after two hints; a
 * revealed or otherwise-not-earned answer earns 0. pointsForAttempt (a live ProblemView) and
 * pointsForStoredAttempt (a persisted StoredAttempt) each reduce their own shape down to
 * these three facts and call this once, so the ladder itself exists in exactly one place.
 */
export type AttemptOutcomeFacts = { correct: boolean; tryNumber: 1 | 2 | 3; revealed: boolean; retry?: boolean };

export function pointsForOutcome(facts: AttemptOutcomeFacts): number {
  // retry defaults to false so every existing caller (a live ProblemView never carries the
  // concept of a retry cycle; a StoredAttempt from before this fix has no such field either)
  // keeps scoring exactly as before. A retry attempt (spec 7.2 "he can retry any problem")
  // always earns 0, correct or not: retrying can never manufacture skill credit.
  if (facts.revealed || facts.retry || !facts.correct) return 0;
  if (facts.tryNumber === 1) return 3;
  if (facts.tryNumber === 2) return 2;
  return 1; // tryNumber === 3
}

/**
 * Points for a single live attempt, from its ProblemView (spec 7.3 / section 8).
 * earnsSkillCredit already rules out revealed and exhausted outcomes, so the only fact left
 * to supply the shared ladder is which try earned the correct answer.
 */
export function pointsForAttempt(view: ProblemView): number {
  if (!view.earnsSkillCredit) return 0;
  return pointsForOutcome({ correct: true, tryNumber: view.triesUsed as 1 | 2 | 3, revealed: false });
}

/** The same shared ladder, applied to a persisted StoredAttempt record. */
function pointsForStoredAttempt(a: StoredAttempt): number {
  return pointsForOutcome({ correct: a.correct, tryNumber: a.tryNumber, revealed: a.revealed, retry: a.retry });
}

/**
 * Adds one evidence entry and its points to a skill, creating the entry if it is new.
 * `source` follows an "app wins" merge rule, independent of call order: a skill already marked
 * "app" (or newly credited by an app-sourced call) stays "app" even if a parent-entered note
 * touches it too, since the skill is still fundamentally tracked by the app; only a skill whose
 * evidence is exclusively parent-entered, so far, is "parent".
 */
function addEvidence(progress: SkillProgress[], skillId: string, points: number, evidence: string, source: SkillSource): SkillProgress[] {
  const idx = progress.findIndex((p) => p.skillId === skillId);
  const current = idx >= 0 ? progress[idx] : { skillId, points: 0, level: levelFor(0), evidence: [] as string[], source };
  const nextPoints = current.points + points;
  const nextEvidence = [...current.evidence, evidence].slice(-EVIDENCE_CAP);
  const nextSource: SkillSource = current.source === "app" || source === "app" ? "app" : "parent";
  const updated: SkillProgress = { skillId, points: nextPoints, level: levelFor(nextPoints), evidence: nextEvidence, source: nextSource };
  if (idx >= 0) {
    const copy = [...progress];
    copy[idx] = updated;
    return copy;
  }
  return [...progress, updated];
}

/**
 * A Build maker log awards 2 points to build.debugging; a Speak log awards 2 to
 * speak.reflection (spec section 8: "Debugging and Reflection level from Maker's Logs, not
 * artifacts"). A Think quest has no log step, so a think-track call is a no-op. A log is always
 * app-sourced evidence. A Practice log (the Play track) awards 2 to play.practice-craft and 2
 * to play.listening: the log is where the week's sittings and the listen-back get written down,
 * and the Play track has no problems, so its logs are the app's only evidence of practice.
 */
export function applyLog(progress: SkillProgress[], questTrack: Track): SkillProgress[] {
  if (questTrack === "build") return addEvidence(progress, "build.debugging", 2, "log", "app");
  if (questTrack === "make") return addEvidence(progress, "make.notebook", 2, "log", "app");
  if (questTrack === "speak") return addEvidence(progress, "speak.reflection", 2, "log", "app");
  if (questTrack === "play") {
    return addEvidence(addEvidence(progress, "play.practice-craft", 2, "log", "app"), "play.listening", 2, "log", "app");
  }
  return progress;
}

/**
 * The single source of truth for skill progress: recomputes every skill from the attempts,
 * logs and parent entries that currently exist, in timestamp order. Called both after a fresh
 * attempt and after a parent reset (spec 7.2: "the mistake box and skills recompute from
 * remaining attempts"), so there is never a separate increment path to drift out of sync.
 *
 * A problem answered more than once (a mistake-box retry, or a "Try it again" cycle) counts
 * once, at its best attempt, regardless of when that best attempt happened. pointsForStoredAttempt
 * already scores every retry:true attempt at 0, so a "Try it again" cycle can only ever pull a
 * problem's best score down to what it already was, never up: the highest-scoring non-retry
 * attempt still wins the max, and a retry attempt is kept as evidence only when it happens to
 * tie or exceed (i.e. both are 0) every other attempt on that problem. This module stays
 * content-free: skill tags
 * for a problem come from the skillsForProblem resolver the caller passes in, not from a
 * lookup this module performs itself. A problem the resolver returns no skills for (an
 * unknown id, or a genuinely tagless one) contributes no skill credit rather than throwing.
 */
export function recomputeFromAttempts(
  attempts: StoredAttempt[],
  logs: StoredLog[],
  parentEntries: ParentSkillEntry[],
  skillsForProblem: SkillsForProblem,
): SkillProgress[] {
  const bestByProblem = new Map<string, { points: number; at: number }>();
  for (const a of attempts) {
    const points = pointsForStoredAttempt(a);
    const current = bestByProblem.get(a.problemId);
    if (!current || points > current.points || (points === current.points && a.at > current.at)) {
      bestByProblem.set(a.problemId, { points, at: a.at });
    }
  }

  type Event = { at: number; apply: (progress: SkillProgress[]) => SkillProgress[] };
  const events: Event[] = [];

  for (const [problemId, best] of bestByProblem) {
    const skills = skillsForProblem(problemId);
    if (skills.length === 0) continue; // unresolved or tagless: no skill tags to credit
    events.push({
      at: best.at,
      apply: (progress) => skills.reduce((next, skillId) => addEvidence(next, skillId, best.points, problemId, "app"), progress),
    });
  }

  for (const log of logs) events.push({ at: log.at, apply: (progress) => applyLog(progress, log.track) });
  for (const entry of parentEntries) events.push({ at: entry.at, apply: (progress) => addEvidence(progress, entry.skillId, 0, entry.note, "parent") });

  events.sort((a, b) => a.at - b.at);

  let progress: SkillProgress[] = [];
  for (const event of events) progress = event.apply(progress);
  return progress.sort((a, b) => a.skillId.localeCompare(b.skillId));
}
