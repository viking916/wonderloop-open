import { describe, expect, test } from "vitest";
import { COOLDOWN_MS, viewProblem } from "../domain/attempts";
import { emptyQuestProgress } from "../domain/completion";
import type { Problem } from "../content/schema";
import type { AttemptDoc, ProgressDoc } from "./types";
import { attemptDocId, toProblemState } from "./progress";

// Task 10 fix (review finding 1, part 2): attemptDocId is the pure piece of recordAttempt's
// idempotency fix, so it is covered directly here without needing the emulator. Firestore
// round-trip behaviour (a second write at the same id overwriting the first) is exercised live
// against the emulator, not unit-testable without it.
describe("attemptDocId", () => {
  test("the same problem, cycle and try number always produces the same id (idempotent writes)", () => {
    const a = attemptDocId("s1-w01-think-01-p01", 1_700_000_000_000, 1);
    const b = attemptDocId("s1-w01-think-01-p01", 1_700_000_000_000, 1);
    expect(a).toBe(b);
  });

  test("a different try number in the same cycle produces a different id", () => {
    const t1 = attemptDocId("p1", 1_700_000_000_000, 1);
    const t2 = attemptDocId("p1", 1_700_000_000_000, 2);
    expect(t1).not.toBe(t2);
  });

  test("a retry cycle (a new cycleStartedAt on the same problem) never collides with the original cycle's ids", () => {
    const originalTry1 = attemptDocId("p1", 1_700_000_000_000, 1);
    const retryTry1 = attemptDocId("p1", 1_700_000_060_000, 1);
    expect(originalTry1).not.toBe(retryTry1);
  });
});

// Final whole-branch review, finding C1: ProblemPlayer.tsx scopes attempts to the current
// cycle (a.at >= cycleStart) before handing them to viewProblem; toProblemState did not, so a
// problem the child fast-failed kept reporting fastFail forever, EVEN AFTER a "Try it again"
// should have started a brand-new cycle and left the old, fast-failed one behind. This is the
// Parent view's only signal that a problem was button-mashed (spec 7.3): it must survive a
// retry, not be clearable by the very "Try it again" button the app offers on every finished
// problem.
describe("toProblemState (Parent view's fastFail rebuild) scopes attempts to the current cycle", () => {
  const problem: Problem = {
    id: "s1-w01-think-01-p01",
    kind: "number",
    lane: "warmup",
    prompt: "How many sides does a triangle have?",
    answer: { kind: "number", value: "3" },
    explanation: ["A triangle has three sides.", "Tri means three.", "Three sides, three corners."],
    ideaId: "polygon-names",
    useAgain: "when a shape name tells you the number of sides.",
    hints: ["Think about the prefix in the name.", "Tri means three."],
    socraticHint: "What does a tricycle have three of?",
    skills: ["think.geometry"],
    thinkMinutes: 2,
    difficulty: 1,
  };

  const T0 = 1_700_000_000_000;

  function attemptDoc(tryNumber: 1 | 2 | 3, correct: boolean, at: number, retry: boolean): AttemptDoc {
    return {
      problemId: problem.id,
      questId: "s1-w01-think-01",
      answer: "wrong",
      correct,
      tryNumber,
      hintTier: 0,
      ideaIds: [],
      revealed: false,
      retry,
      at,
    };
  }

  test("a fast-failed retry cycle still reports fastFail once the original cycle's attempts are also on record (the exact C1 repro)", () => {
    // Original cycle: three fast wrong tries -- fastFail on its own, same shape
    // attempts.test.ts uses to prove the rule fires.
    const originalAttempts = [
      attemptDoc(1, false, T0, false),
      attemptDoc(2, false, T0 + COOLDOWN_MS, false),
      attemptDoc(3, false, T0 + 2 * COOLDOWN_MS, false),
    ];

    // "Try it again" starts a brand-new cycle (a new, later firstSeenAt, retry:true) --
    // everything already recorded stays in Firestore untouched (spec 7.2: "history is kept").
    // The child then mashes the retry cycle too: three more fast wrong tries.
    const retryAt = T0 + 10 * COOLDOWN_MS;
    const retryAttempts = [
      attemptDoc(1, false, retryAt, true),
      attemptDoc(2, false, retryAt + COOLDOWN_MS, true),
      attemptDoc(3, false, retryAt + 2 * COOLDOWN_MS, true),
    ];

    // Every attempt ever taken on this problem is on record, exactly what
    // watchAttemptsForQuest / watchAllAttempts hand back -- toProblemState, not the caller,
    // is responsible for scoping this down to the current cycle.
    const allAttempts = [...originalAttempts, ...retryAttempts];

    const progress: ProgressDoc = {
      status: "in_progress",
      stepIndex: 0,
      problemIndex: 0,
      minutes: 0,
      quest: emptyQuestProgress(),
      problems: { [problem.id]: { firstSeenAt: retryAt, retry: true } },
    };

    const state = toProblemState(progress, problem.id, allAttempts);

    // Without cycle scoping, all 6 attempts land in state.attempts: triesUsed reports 6 of 3,
    // and fastFail's own "attempts.length === MAX_TRIES" check silently fails on 6 !== 3 --
    // the parent view reports outcome "exhausted" with no fastFail flag at all, exactly the
    // false-negative the browser repro (final-fix-*.png) shows.
    expect(state.attempts).toHaveLength(3);
    expect(state.attempts.every((a) => a.at >= retryAt)).toBe(true);

    const view = viewProblem(problem, state, retryAt + 2 * COOLDOWN_MS);
    expect(view.triesUsed).toBe(3);
    expect(view.fastFail).toBe(true);
  });

  test("a retry cycle with no attempts yet is not (falsely) flagged", () => {
    const originalAttempts = [
      attemptDoc(1, false, T0, false),
      attemptDoc(2, false, T0 + COOLDOWN_MS, false),
      attemptDoc(3, false, T0 + 2 * COOLDOWN_MS, false),
    ];
    const retryAt = T0 + 10 * COOLDOWN_MS;
    const progress: ProgressDoc = {
      status: "in_progress",
      stepIndex: 0,
      problemIndex: 0,
      minutes: 0,
      quest: emptyQuestProgress(),
      problems: { [problem.id]: { firstSeenAt: retryAt, retry: true } },
    };
    const state = toProblemState(progress, problem.id, originalAttempts);
    expect(state.attempts).toHaveLength(0);
    const view = viewProblem(problem, state, retryAt);
    expect(view.outcome).toBe("unanswered");
    expect(view.fastFail).toBe(false);
  });
});
