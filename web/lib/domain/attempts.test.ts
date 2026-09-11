import { describe, expect, test } from "vitest";
import type { UserInput } from "../answers";
import type { Problem } from "../content/schema";
import {
  COOLDOWN_MS,
  FAST_FAIL_DELIBERATION_MS,
  recordAttempt,
  viewProblem,
  type AttemptRecord,
  type ProblemState,
} from "./attempts";

const T0 = 1_700_000_000_000;

const numberProblem: Problem = {
  id: "s1-w06-think-04-p03",
  kind: "number",
  lane: "puzzle",
  prompt: "How many sides does a hexagon have?",
  answer: { kind: "number", value: "6" },
  explanation: [
    "Hexagon comes from the Greek for six.",
    "Count the sides one at a time: six edges.",
    "Six sides, six angles, that is the rule for this shape name.",
  ],
  ideaId: "polygon-names",
  useAgain: "when a shape name tells you the number of sides.",
  hints: ["Think about the Greek prefix in the name.", "Hexa means six."],
  socraticHint: "Where else have you seen that Greek prefix before?",
  skills: ["think.geometry"],
  thinkMinutes: 4,
  difficulty: 1,
  variant: { prompt: "How many sides does a pentagon have?", answer: { kind: "number", value: "5" } },
};

const textProblem: Problem = {
  id: "s1-w06-think-04-p04",
  kind: "text",
  lane: "puzzle",
  prompt: "Explain why a square is a rectangle.",
  answer: { kind: "rubric", mustMention: ["four right angles", "opposite sides equal"] },
  explanation: [
    "A rectangle needs four right angles and opposite sides equal.",
    "A square has both of those, so every square passes the rectangle test.",
    "Not every rectangle is a square, since a rectangle's sides can differ.",
  ],
  ideaId: "shape-hierarchy",
  useAgain: "when a shape's definition is a checklist another shape can also pass.",
  hints: ["What makes a rectangle a rectangle, exactly?", "Check the square against that checklist."],
  socraticHint: "Does the checklist ever say a rectangle's sides must be different lengths?",
  skills: ["think.geometry"],
  thinkMinutes: 5,
  difficulty: 2,
};

const correctInput: UserInput = { kind: "number", text: "6" };
const wrongInput: UserInput = { kind: "number", text: "5" };
const expressionInput: UserInput = { kind: "number", text: "2+4" };
const rubricInput: UserInput = { kind: "text", text: "A square has four right angles and equal opposite sides." };

const emptyState = (firstSeenAt: number, problem: Problem = numberProblem): ProblemState => ({
  problemId: problem.id,
  attempts: [],
  firstSeenAt,
});

function attempt(tryNumber: 1 | 2 | 3, correct: boolean, hintTier: 0 | 1 | 2 | 3, at: number): AttemptRecord {
  return { tryNumber, correct, hintTier, at };
}

describe("viewProblem: fresh problem", () => {
  test("unanswered, all three tries open, no hints", () => {
    const view = viewProblem(numberProblem, emptyState(T0), T0);
    expect(view.outcome).toBe("unanswered");
    expect(view.triesUsed).toBe(0);
    expect(view.triesLeft).toBe(3);
    expect(view.canSubmit).toBe(true);
    expect(view.hintsUnlocked).toBe(0);
    expect(view.tier3HintAvailable).toBe(false);
    expect(view.needsWhatYouTried).toBe(false);
    expect(view.explanationOpen).toBe(false);
    expect(view.cooldownEndsAt).toBeUndefined();
  });
});

describe("first try correct", () => {
  test("outcome correct, earns credit, explanation opens immediately", () => {
    const { state, correct, reason } = recordAttempt(numberProblem, emptyState(T0), correctInput, T0 + 1_000);
    expect(correct).toBe(true);
    expect(reason).toBeUndefined();
    const view = viewProblem(numberProblem, state, T0 + 1_000);
    expect(view.outcome).toBe("correct");
    expect(view.earnsSkillCredit).toBe(true);
    expect(view.explanationOpen).toBe(true);
    expect(view.firstTryCorrect).toBe(true);
    expect(view.canSubmit).toBe(false);
  });
});

describe("wrong try 1", () => {
  test("unlocks hint 1, sets a 45 s cooldown, blocks and then allows submission", () => {
    const r1 = recordAttempt(numberProblem, emptyState(T0), wrongInput, T0);
    expect(r1.correct).toBe(false);
    const duringCooldown = viewProblem(numberProblem, r1.state, T0 + 1_000);
    expect(duringCooldown.hintsUnlocked).toBe(1);
    expect(duringCooldown.cooldownEndsAt).toBe(T0 + COOLDOWN_MS);
    expect(duringCooldown.canSubmit).toBe(false);

    const afterCooldown = viewProblem(numberProblem, r1.state, T0 + COOLDOWN_MS);
    expect(afterCooldown.canSubmit).toBe(true);
  });

  test("a submission attempted during the cooldown is refused and the state is unchanged", () => {
    const r1 = recordAttempt(numberProblem, emptyState(T0), wrongInput, T0);
    const blocked = recordAttempt(numberProblem, r1.state, correctInput, T0 + 1_000);
    expect(blocked.reason).toBe("cooldown");
    expect(blocked.state).toBe(r1.state);
  });
});

describe("wrong try 2", () => {
  test("unlocks hint 2 and the AI hint slot", () => {
    const r1 = recordAttempt(numberProblem, emptyState(T0), wrongInput, T0);
    const r2 = recordAttempt(numberProblem, r1.state, wrongInput, T0 + COOLDOWN_MS);
    const view = viewProblem(numberProblem, r2.state, T0 + COOLDOWN_MS);
    expect(view.hintsUnlocked).toBe(2);
    expect(view.tier3HintAvailable).toBe(true);
    expect(view.triesUsed).toBe(2);
  });
});

describe("needsWhatYouTried before try 3", () => {
  test("blocks try 3 until whatYouTried is set, then allows it", () => {
    const r1 = recordAttempt(numberProblem, emptyState(T0), wrongInput, T0);
    const r2 = recordAttempt(numberProblem, r1.state, wrongInput, T0 + COOLDOWN_MS);
    const t3 = T0 + 2 * COOLDOWN_MS;

    const view = viewProblem(numberProblem, r2.state, t3);
    expect(view.needsWhatYouTried).toBe(true);
    expect(view.canSubmit).toBe(false);

    const blocked = recordAttempt(numberProblem, r2.state, correctInput, t3);
    expect(blocked.reason).toBe("needs-what-you-tried");
    expect(blocked.state).toBe(r2.state);

    const withWhatYouTried: ProblemState = { ...r2.state, whatYouTried: "I counted the sides twice and got different numbers." };
    const view2 = viewProblem(numberProblem, withWhatYouTried, t3);
    expect(view2.needsWhatYouTried).toBe(false);
    expect(view2.canSubmit).toBe(true);

    const r3 = recordAttempt(numberProblem, withWhatYouTried, correctInput, t3);
    expect(r3.correct).toBe(true);
  });
});

describe("hintTier is recorded pre-attempt, not post-attempt", () => {
  test("the try-2 record has hintTier 1 and the try-3 record has hintTier 2", () => {
    const r1 = recordAttempt(numberProblem, emptyState(T0), wrongInput, T0);
    const r2 = recordAttempt(numberProblem, r1.state, wrongInput, T0 + COOLDOWN_MS);
    const withWhatYouTried: ProblemState = { ...r2.state, whatYouTried: "I tried counting twice and got different answers." };
    const r3 = recordAttempt(numberProblem, withWhatYouTried, wrongInput, T0 + 2 * COOLDOWN_MS);

    // Each record carries the hint tier unlocked BEFORE that attempt, not the tier the attempt
    // itself unlocks: try 1 sees 0 hints unlocked yet, try 2 sees only hint 1, try 3 sees hint 2.
    expect(r1.state.attempts[0]).toMatchObject({ tryNumber: 1, hintTier: 0 });
    expect(r2.state.attempts[1]).toMatchObject({ tryNumber: 2, hintTier: 1 });
    expect(r3.state.attempts[2]).toMatchObject({ tryNumber: 3, hintTier: 2 });
  });
});

describe("three wrong tries", () => {
  function exhaustedState(): ProblemState {
    const r1 = recordAttempt(numberProblem, emptyState(T0), wrongInput, T0);
    const r2 = recordAttempt(numberProblem, r1.state, wrongInput, T0 + COOLDOWN_MS);
    const withWhatYouTried: ProblemState = { ...r2.state, whatYouTried: "I counted twice and got different answers." };
    const r3 = recordAttempt(numberProblem, withWhatYouTried, wrongInput, T0 + 2 * COOLDOWN_MS);
    return r3.state;
  }

  test("outcome exhausted, explanation shut until the think-time floor passes", () => {
    const state = exhaustedState();
    const t3 = T0 + 2 * COOLDOWN_MS;
    const thinkFloorAt = T0 + numberProblem.thinkMinutes * 60_000;

    const rightAfter = viewProblem(numberProblem, state, t3);
    expect(rightAfter.outcome).toBe("exhausted");
    expect(rightAfter.explanationOpen).toBe(false);
    expect(rightAfter.explanationOpensAt).toBe(thinkFloorAt);
    expect(rightAfter.canSubmit).toBe(false);
    expect(rightAfter.triesLeft).toBe(0);

    const atFloor = viewProblem(numberProblem, state, thinkFloorAt);
    expect(atFloor.outcome).toBe("exhausted");
    expect(atFloor.explanationOpen).toBe(true);
    expect(atFloor.explanationOpensAt).toBeUndefined();
    expect(atFloor.earnsSkillCredit).toBe(false);
  });

  test("recordAttempt refuses a fourth attempt", () => {
    const state = exhaustedState();
    const thinkFloorAt = T0 + numberProblem.thinkMinutes * 60_000;
    const r4 = recordAttempt(numberProblem, state, correctInput, thinkFloorAt);
    expect(r4.correct).toBe(false);
    expect(r4.reason).toBe("no-tries-left");
    expect(r4.state).toBe(state);
  });
});

describe("correct on try 2", () => {
  test("earns credit but firstTryCorrect is false", () => {
    const r1 = recordAttempt(numberProblem, emptyState(T0), wrongInput, T0);
    const r2 = recordAttempt(numberProblem, r1.state, correctInput, T0 + COOLDOWN_MS);
    const view = viewProblem(numberProblem, r2.state, T0 + COOLDOWN_MS);
    expect(view.outcome).toBe("correct");
    expect(view.earnsSkillCredit).toBe(true);
    expect(view.firstTryCorrect).toBe(false);
  });

  test("resubmitting reports already-solved, not needs-what-you-tried, even though whatYouTried was never set", () => {
    const r1 = recordAttempt(numberProblem, emptyState(T0), wrongInput, T0);
    const r2 = recordAttempt(numberProblem, r1.state, correctInput, T0 + COOLDOWN_MS);
    // By shape alone (triesUsed === 2, whatYouTried unset) this looks like the
    // needs-what-you-tried gate, but the problem is already solved: it should never fire.
    const view = viewProblem(numberProblem, r2.state, T0 + COOLDOWN_MS);
    expect(view.needsWhatYouTried).toBe(false);

    const r3 = recordAttempt(numberProblem, r2.state, correctInput, T0 + COOLDOWN_MS);
    expect(r3.reason).toBe("already-solved");
    expect(r3.state).toBe(r2.state);
  });
});

describe("fastFail (deliberation time, not the wall clock)", () => {
  test("three wrong attempts each submitted the instant the cooldown lifts sets fastFail", () => {
    // Zero thinking before try 1, and each next submission lands exactly when the cooldown
    // from the previous wrong answer ends, so there is no deliberation time to subtract to.
    const state: ProblemState = {
      problemId: numberProblem.id,
      firstSeenAt: T0,
      whatYouTried: "I tried counting twice.",
      attempts: [
        attempt(1, false, 0, T0),
        attempt(2, false, 1, T0 + COOLDOWN_MS),
        attempt(3, false, 2, T0 + 2 * COOLDOWN_MS),
      ],
    };
    expect(viewProblem(numberProblem, state, T0 + 2 * COOLDOWN_MS).fastFail).toBe(true);
  });

  test("the same three attempts with a minute of thinking before each one does not set fastFail", () => {
    const attempt1At = T0 + 60_000;
    const attempt2At = attempt1At + COOLDOWN_MS + 60_000;
    const attempt3At = attempt2At + COOLDOWN_MS + 60_000;
    const state: ProblemState = {
      problemId: numberProblem.id,
      firstSeenAt: T0,
      whatYouTried: "I tried counting twice.",
      attempts: [attempt(1, false, 0, attempt1At), attempt(2, false, 1, attempt2At), attempt(3, false, 2, attempt3At)],
    };
    expect(viewProblem(numberProblem, state, attempt3At).fastFail).toBe(false);
  });

  test("two wrong attempts never set fastFail, no matter how fast", () => {
    const state: ProblemState = {
      problemId: numberProblem.id,
      firstSeenAt: T0,
      attempts: [attempt(1, false, 0, T0), attempt(2, false, 1, T0 + COOLDOWN_MS)],
    };
    expect(viewProblem(numberProblem, state, T0 + COOLDOWN_MS).fastFail).toBe(false);
  });

  test("exactly 30 s of deliberation does not set fastFail (strictly under)", () => {
    const attempt1At = T0;
    const attempt2At = attempt1At + COOLDOWN_MS;
    const attempt3At = attempt2At + COOLDOWN_MS + FAST_FAIL_DELIBERATION_MS;
    const state: ProblemState = {
      problemId: numberProblem.id,
      firstSeenAt: T0,
      whatYouTried: "I tried counting twice.",
      attempts: [attempt(1, false, 0, attempt1At), attempt(2, false, 1, attempt2At), attempt(3, false, 2, attempt3At)],
    };
    expect(viewProblem(numberProblem, state, attempt3At).fastFail).toBe(false);
  });
});

describe("earnsSkillCredit reveal-ordering (hand-built state; not reachable via recordAttempt today)", () => {
  test("a reveal before the correct attempt earns no credit", () => {
    const state: ProblemState = {
      problemId: numberProblem.id,
      firstSeenAt: T0,
      attempts: [attempt(1, true, 0, T0 + 10_000)],
      revealedAt: T0 + 5_000,
    };
    const view = viewProblem(numberProblem, state, T0 + 10_000);
    expect(view.outcome).toBe("correct");
    expect(view.earnsSkillCredit).toBe(false);
  });

  test("a reveal after the correct attempt still earns credit", () => {
    const state: ProblemState = {
      problemId: numberProblem.id,
      firstSeenAt: T0,
      attempts: [attempt(1, true, 0, T0 + 5_000)],
      revealedAt: T0 + 10_000,
    };
    const view = viewProblem(numberProblem, state, T0 + 10_000);
    expect(view.outcome).toBe("correct");
    expect(view.earnsSkillCredit).toBe(true);
  });
});

describe("checkAnswer passthrough", () => {
  test("a rejected expression is recorded as a wrong attempt with checkAnswer's reason", () => {
    const r1 = recordAttempt(numberProblem, emptyState(T0), expressionInput, T0);
    expect(r1.correct).toBe(false);
    expect(r1.reason).toBe("expression-not-accepted");
    expect(r1.state.attempts).toHaveLength(1);
    expect(r1.state.attempts[0]).toMatchObject({ tryNumber: 1, correct: false, hintTier: 0 });
  });
});

describe("text problems with a rubric answer are not auto-graded", () => {
  test("recordAttempt records neither correct nor incorrect and opens the explanation on submission", () => {
    const r1 = recordAttempt(textProblem, emptyState(T0, textProblem), rubricInput, T0 + 500);
    expect(r1.correct).toBe(false);
    expect(r1.reason).toBe("not-auto-graded");
    expect(r1.state.revealedAt).toBe(T0 + 500);

    const view = viewProblem(textProblem, r1.state, T0 + 500);
    expect(view.outcome).toBe("revealed");
    expect(view.explanationOpen).toBe(true);
    expect(view.earnsSkillCredit).toBe(false);
    expect(view.canSubmit).toBe(false);
  });

  test("a second submission after the reveal is refused", () => {
    const r1 = recordAttempt(textProblem, emptyState(T0, textProblem), rubricInput, T0 + 500);
    const r2 = recordAttempt(textProblem, r1.state, rubricInput, T0 + 1_000);
    expect(r2.reason).toBe("already-revealed");
    expect(r2.state).toBe(r1.state);
  });
});
