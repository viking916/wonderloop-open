import type { Problem } from "../content/schema";
import { checkAnswer, type UserInput } from "../answers";

// Pure attempt-rules engine (spec 7.3): three tries, hint tiers, a 45 s cooldown after a wrong
// answer, a per-problem think-time floor before the worked explanation opens, and the fast-fail
// flag. No Firebase, no React, no Date.now(): time always arrives as the "now" parameter.

export const COOLDOWN_MS = 45_000;
export const FAST_FAIL_DELIBERATION_MS = 30_000;

const MAX_TRIES = 3;

export type AttemptRecord = { tryNumber: 1 | 2 | 3; correct: boolean; hintTier: 0 | 1 | 2 | 3; at: number };

export type ProblemState = {
  problemId: string;
  attempts: AttemptRecord[];
  firstSeenAt: number; // ms epoch, when the problem was opened
  whatYouTried?: string; // required before try 3
  revealedAt?: number;
};

export type ProblemView = {
  triesUsed: number;
  triesLeft: number;
  canSubmit: boolean;
  cooldownEndsAt?: number; // 45 s after a wrong answer
  hintsUnlocked: 0 | 1 | 2; // authored tier 1 and tier 2 hints
  tier3HintAvailable: boolean; // true after try 2: the authored Socratic hint (problem.socraticHint) may show
  needsWhatYouTried: boolean; // true when the problem is still open, triesUsed === 2, and whatYouTried is empty
  explanationOpen: boolean;
  explanationOpensAt?: number; // when only the think-time floor is holding it back
  outcome: "unanswered" | "correct" | "revealed" | "exhausted";
  earnsSkillCredit: boolean; // correct without a reveal
  firstTryCorrect: boolean;
  fastFail: boolean; // 3 wrong with under 30 s of thinking time (elapsed minus the cooldowns the app forced)
};

export function viewProblem(problem: Problem, state: ProblemState, now: number): ProblemView {
  const attempts = state.attempts;
  const triesUsed = attempts.length;
  const triesLeft = Math.max(0, MAX_TRIES - triesUsed);
  const correctAttempt = attempts.find((a) => a.correct);

  // A reveal (state.revealedAt) can only produce a "revealed" outcome when the child has not
  // already answered correctly; a correct answer is always reported as "correct", even if a
  // reveal happened first, so the reveal-vs-credit distinction lives in earnsSkillCredit below.
  let outcome: ProblemView["outcome"];
  if (correctAttempt) outcome = "correct";
  else if (state.revealedAt !== undefined) outcome = "revealed";
  else if (triesUsed >= MAX_TRIES) outcome = "exhausted";
  else outcome = "unanswered";

  const hintsUnlocked = Math.min(triesUsed, 2) as 0 | 1 | 2;
  const tier3HintAvailable = triesUsed >= 2;
  const needsWhatYouTried = outcome === "unanswered" && triesUsed === 2 && !(state.whatYouTried && state.whatYouTried.trim());

  // Cooldown only matters while the problem is still open (outcome "unanswered"): that is exactly
  // the state where the most recent attempt exists and was wrong.
  const cooldownEndsAt = outcome === "unanswered" && triesUsed > 0
    ? attempts[triesUsed - 1].at + COOLDOWN_MS
    : undefined;
  const inCooldown = cooldownEndsAt !== undefined && now < cooldownEndsAt;

  const canSubmit = outcome === "unanswered" && !inCooldown && !needsWhatYouTried;

  const thinkFloorAt = state.firstSeenAt + problem.thinkMinutes * 60_000;
  const explanationOpen = outcome === "correct" || outcome === "revealed" || (outcome === "exhausted" && now >= thinkFloorAt);
  const explanationOpensAt = outcome === "exhausted" && now < thinkFloorAt ? thinkFloorAt : undefined;

  // The state.revealedAt > correctAttempt.at check exists for a future explicit reveal action
  // (a child who peeks at the explanation and then still answers correctly gets no credit). This
  // module has no such action today: recordAttempt never produces a state with both a correct
  // attempt and revealedAt set, since the only writer of revealedAt is the not-auto-graded
  // (rubric) path, which is never correct.
  const earnsSkillCredit = outcome === "correct" && correctAttempt !== undefined
    && (state.revealedAt === undefined || state.revealedAt > correctAttempt.at);

  const firstTryCorrect = attempts.some((a) => a.tryNumber === 1 && a.correct);

  // Fast-fail measures deliberation, not the wall clock: a 45 s cooldown after each wrong
  // answer forces at least 90 s to elapse across three tries, so a raw "three wrong inside
  // 60 s" window could never fire. Subtract the cooldowns the app itself imposed from the
  // elapsed time to get the time he actually spent thinking, floored at zero.
  const lastAttempt = attempts[attempts.length - 1];
  const thinkingTimeMs = lastAttempt
    ? Math.max(0, (lastAttempt.at - state.firstSeenAt) - COOLDOWN_MS * (attempts.length - 1))
    : 0;
  const fastFail = attempts.length === MAX_TRIES
    && attempts.every((a) => !a.correct)
    && thinkingTimeMs < FAST_FAIL_DELIBERATION_MS;

  return {
    triesUsed,
    triesLeft,
    canSubmit,
    cooldownEndsAt,
    hintsUnlocked,
    tier3HintAvailable,
    needsWhatYouTried,
    explanationOpen,
    explanationOpensAt,
    outcome,
    earnsSkillCredit,
    firstTryCorrect,
    fastFail,
  };
}

export function recordAttempt(problem: Problem, state: ProblemState, input: UserInput, now: number):
  { state: ProblemState; correct: boolean; reason?: string } {
  const view = viewProblem(problem, state, now);
  if (!view.canSubmit) {
    // Outcome-terminal gates are checked before the mid-problem gates: a problem already solved
    // or already revealed stays "already-solved" / "already-revealed" even if it happens to also
    // satisfy the structural shape of another gate (e.g. solved on try 2 with whatYouTried never
    // filled in looks, by shape alone, like it needs that field, but it does not: it is done).
    let reason: string;
    if (view.outcome === "correct") reason = "already-solved";
    else if (view.outcome === "revealed") reason = "already-revealed";
    else if (view.outcome === "exhausted") reason = "no-tries-left";
    else if (view.cooldownEndsAt !== undefined && now < view.cooldownEndsAt) reason = "cooldown";
    else if (view.needsWhatYouTried) reason = "needs-what-you-tried";
    else reason = "cannot-submit"; // defensive default: every real canSubmit=false case is named above
    return { state, correct: false, reason };
  }

  const result = checkAnswer(problem.answer, input);
  const tryNumber = (view.triesUsed + 1) as 1 | 2 | 3;
  // hintTier records the highest hint already unlocked before this attempt, not after.
  const attempt: AttemptRecord = { tryNumber, correct: result.correct, hintTier: view.hintsUnlocked, at: now };
  const attempts = [...state.attempts, attempt];
  // A proof or explain-it (text/rubric answer) is not machine-graded: checkAnswer reports
  // "not-auto-graded" and the worked explanation opens immediately on this submission.
  const revealedAt = result.reason === "not-auto-graded" ? now : state.revealedAt;

  const nextState: ProblemState = { ...state, attempts, revealedAt };
  return { state: nextState, correct: result.correct, reason: result.reason };
}

/**
 * Rebuilds a ProblemState scoped to the CURRENT attempt cycle from a firstSeenAt plus every
 * attempt and every revealedAt candidate on record for a problem. "Current cycle" means what it
 * means everywhere else in this module: an attempt or a reveal from before firstSeenAt belongs
 * to a finished, earlier cycle (the original one, or an earlier "Try it again") and must not
 * leak into the fresh cycle's view -- most importantly for fastFail (spec 7.3), which is a
 * statement about THIS cycle's three tries, not the problem's whole history.
 *
 * This is the one place that rule is applied. Both callers need exactly this, not two different
 * notions of "current": ProblemPlayer.tsx (playing live) resolves firstSeenAt/whatYouTried/
 * revealedAt from Firestore-backed state plus its own short-lived optimistic overrides (a
 * "Try it again" or a submission not yet round-tripped) and then calls this with the result;
 * lib/data/progress.ts's toProblemState (the Parent view's fastFail rebuild, run later, over
 * whatever is persisted) resolves the same three inputs straight from the stored progress doc.
 * Only the resolution of the inputs differs; the cycle rule itself does not, so it lives here
 * once rather than being reimplemented, or drifting, in each caller.
 */
export function currentCycleProblemState(
  problemId: string,
  firstSeenAt: number,
  allAttempts: AttemptRecord[],
  whatYouTried: string | undefined,
  revealedAtCandidate: number | undefined,
): ProblemState {
  const attempts = allAttempts.filter((a) => a.at >= firstSeenAt).sort((a, b) => a.at - b.at);
  const revealedAt = revealedAtCandidate !== undefined && revealedAtCandidate >= firstSeenAt ? revealedAtCandidate : undefined;
  return { problemId, attempts, firstSeenAt, whatYouTried, revealedAt };
}

/**
 * The Firestore doc id of the CURRENT cycle's first attempt, given every attempt on record for
 * one problem with its id attached (lib/data/progress.ts's watchAttemptsForQuest shape). "Current
 * cycle" is scoped exactly as currentCycleProblemState above does it: an attempt at or after
 * firstSeenAt belongs to this cycle, one before it belongs to a finished, earlier one.
 *
 * ProblemPlayer.tsx's "What kind of miss was that?" row needs this id to write a chosen miss kind
 * onto the right attempt doc. It used to come only from a local, in-session `lastAttemptId` state
 * set inside handleSubmit once persistAttempt's own write promise resolved -- lost outright on a
 * reload or a remount (a child who reloads after a wrong try could no longer say what kind of
 * miss it was, even though the attempt itself was safely persisted), and racy even within the
 * same session: the attempts listener's local echo of that very write (what actually flips
 * view.triesUsed to 1 and renders the row's own gate) can arrive before handleSubmit's outer
 * await chain reaches the line that sets lastAttemptId, so the row's gate condition
 * (triesUsed === 1) could already be true for one or more renders while lastAttemptId was still
 * empty -- observed directly: reproduced against the running app, the row was reliably absent for
 * roughly 100ms after the hint panel first appeared, before self-correcting once handleSubmit's
 * own state update landed. verify:ui's frozen-clock capture removes exactly the slack that
 * self-correction relied on (the cooldown label reads its final, settled value on the very first
 * render instead of ticking down to it over a real second), so a screenshot taken the instant that
 * label is stable can land inside the gap and permanently miss the row.
 *
 * Deriving the id from the SAME attempts list that already drives triesUsed removes both problems
 * at once: the id becomes known at exactly the moment triesUsed becomes 1, from the same snapshot,
 * so there is no separate value to race against; and since that list comes from Firestore via
 * watchAttemptsForQuest, a fresh subscription (a reload, a remount) re-delivers the same persisted
 * attempt and its id, so the row survives a reload just as the attempt itself already does.
 */
export function currentCycleFirstAttemptId(
  attemptsWithIds: Array<{ id: string; at: number }>,
  firstSeenAt: number,
): string | undefined {
  const inCycle = attemptsWithIds.filter((a) => a.at >= firstSeenAt).sort((a, b) => a.at - b.at);
  return inCycle[0]?.id;
}
