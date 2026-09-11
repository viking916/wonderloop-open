// Pure mistake-box scheduling (spec 7.4). One item per problem id, rescheduled with a longer
// gap on the first miss and a shorter, steady gap on every miss after that. No Firebase, no
// React, no Date.now() inside functions: time always arrives as the "now" parameter.

import type { Problem } from "../content/schema";
import type { StoredAttempt } from "./skills";

export type ReviewItem = { problemId: string; dueAt: number; misses: number; variantSeed: number };

/**
 * The synthetic quest id review attempts and review progress are stored under
 * (households/{hid}/profiles/{pid}/progress/review and .../attempts with questId: "review"),
 * never a real quest id (real quest ids match /^s\d-w\d{2}-(build|think|speak)$/, so this can
 * never collide with one). Opening a due item starts a fresh attempt cycle under this id, kept
 * completely apart from the same problem's entry in its real quest's progress doc
 * (progress/{realQuestId}/problems/{problemId}) -- see components/quest/ProblemPlayer.tsx and
 * app/explorer/review/page.tsx for why reusing the real quest id would corrupt that doc: its
 * firstSeenAt/attempts already exist from the original attempt, so a review cycle reusing that
 * id would inherit the OLD cycle's tries/cooldown/think-floor state instead of starting fresh.
 */
export const REVIEW_QUEST_ID = "review";

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_MISS_DAYS = 14;
const LATER_MISS_DAYS = 7;

/**
 * Schedules a review after a wrong first try. "existing" is the item's current mistake-box
 * entry, or undefined when this is the problem's first miss ever.
 */
export function scheduleOnMiss(problemId: string, existing: ReviewItem | undefined, now: number): ReviewItem {
  const misses = (existing?.misses ?? 0) + 1;
  const days = misses === 1 ? FIRST_MISS_DAYS : LATER_MISS_DAYS;
  return {
    problemId,
    dueAt: now + days * DAY_MS,
    misses,
    variantSeed: (existing?.variantSeed ?? 0) + 1,
  };
}

/**
 * Applies the outcome of a due variant. A first-try correct clears the item (null). Anything
 * else (solved on a later try, or missed again) reschedules 7 days from now (not from the
 * item's old due date, so a late review still gets a full 7-day gap) and counts as another
 * miss, so a repeat never shows the identical variant.
 */
export function clearOnVariantSuccess(item: ReviewItem, firstTryCorrect: boolean, now: number): ReviewItem | null {
  if (firstTryCorrect) return null;
  return {
    ...item,
    dueAt: now + LATER_MISS_DAYS * DAY_MS,
    misses: item.misses + 1,
    variantSeed: item.variantSeed + 1,
  };
}

/** Items due at or before now, soonest first. */
export function dueItems(items: ReviewItem[], now: number): ReviewItem[] {
  return items.filter((i) => i.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);
}

/**
 * The problem a due item actually shows (final review, finding C2: "the same idea, a new
 * shape" is the whole point of the mistake box). A problem with an authored `variant` gets its
 * prompt/options/items/rows/cols/answer swapped in for the parent's; everything else (id, kind,
 * lane, explanation, ideaId, useAgain, hints, skills, thinkMinutes, difficulty) is the parent's
 * own, unchanged, since the variant only ever authors the surface that changes.
 *
 * `figure` is deliberately NOT inherited the way options/items/rows/cols are above (task 40,
 * owner direction: whether a spatial problem's options are drawn or described in words is a
 * per-problem choice, made once per surface -- shown on the first meeting, imagined on review,
 * see docs/superpowers/plan-2-notes-from-content.md). Falling back to the parent's figure here
 * would silently undo that choice the moment a variant omitted its own: a variant that means to
 * go word-only (no figure at all) would instead quietly inherit the original's drawing. A
 * variant's figure is shown only if the variant itself authors one; no fallback, ever.
 *
 * 15 of 241 problems (all of them "text"/rubric explain-its, never auto-graded -- see
 * lib/content/schema.ts's ProblemSchema: "auto-graded problems need a variant" -- so the ones
 * without one are never numeric/choice/etc. and always caller-approved rather than machine-
 * checked) have no authored variant. Decision (task 17): show the ORIGINAL problem again rather
 * than silently dropping the item from review. This is said plainly on screen (the review page
 * shows a note when this happens), not left implicit.
 */
export function problemForReview(problem: Problem): Problem {
  const v = problem.variant;
  if (!v) return problem;
  return {
    ...problem,
    prompt: v.prompt,
    options: v.options ?? problem.options,
    items: v.items ?? problem.items,
    rows: v.rows ?? problem.rows,
    cols: v.cols ?? problem.cols,
    answer: v.answer,
    figure: v.figure,
  };
}

/**
 * The mistake box's own recompute-from-remaining-attempts, alongside skills.ts's (spec 7.2
 * gives the two equal weight: "the mistake box and skills recompute from remaining
 * attempts"). Folds every problem's first-try attempts in timestamp order: a wrong first try
 * is a miss (scheduleOnMiss), a first-try correct clears the item, exactly mirroring the
 * event-driven scheduleOnMiss/clearOnVariantSuccess calls Task 5 makes as attempts happen live.
 * Only tryNumber 1 ever changes the queue: a try 2 or try 3 attempt does not schedule or clear
 * anything, since spec 7.4 keys the mistake box on first-try outcomes only. Attempts with an
 * "at" after now are ignored, so a caller recomputing "as of now" (after a parent reset, for
 * instance) gets a queue that only reflects what had actually happened by then. Removing a
 * problem's attempts from the input naturally removes its item, since nothing folds it back in.
 */
export function recomputeFromAttempts(attempts: StoredAttempt[], now: number): ReviewItem[] {
  const firstTries = attempts
    .filter((a) => a.tryNumber === 1 && a.at <= now)
    .sort((a, b) => a.at - b.at);

  const items = new Map<string, ReviewItem>();
  for (const a of firstTries) {
    if (a.correct) {
      items.delete(a.problemId);
    } else {
      items.set(a.problemId, scheduleOnMiss(a.problemId, items.get(a.problemId), a.at));
    }
  }

  return [...items.values()].sort((a, b) => a.dueAt - b.dueAt);
}
