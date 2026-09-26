import { describe, expect, test } from "vitest";
import type { Problem } from "../content/schema";
import { getContent, getProblem } from "../content/app-content";
import { viewProblem, type ProblemState } from "./attempts";
import {
  applyLog,
  levelFor,
  pointsForAttempt,
  pointsForOutcome,
  recomputeFromAttempts,
  type ParentSkillEntry,
  type SkillsForProblem,
  type StoredAttempt,
  type StoredLog,
} from "./skills";

const T0 = 1_700_000_000_000;

// A real content problem, tagged with exactly one skill, used to build ProblemView objects
// through the real attempt-rules engine's viewProblem (attempts.ts). pointsForAttempt takes a
// ProblemView directly, not a resolver, so this part of the file is unaffected by the
// content-free change to recomputeFromAttempts below.
const content = getContent();
function findProblem(skillId: string): Problem {
  for (const quest of content.quests) {
    for (const step of quest.steps) {
      const problems = step.kind === "warmup" || step.kind === "problem-set" ? step.problems
        : step.kind === "puzzle-of-week" ? [step.problem] : [];
      for (const p of problems) if (p.skills.length === 1 && p.skills[0] === skillId && p.kind === "number") return p;
    }
  }
  throw new Error(`no single-skill number problem tagged ${skillId} in content`);
}

const numberProblem = findProblem("think.number-sense");

function viewFor(attempts: Array<{ tryNumber: 1 | 2 | 3; correct: boolean }>, revealedAt?: number) {
  const state: ProblemState = {
    problemId: numberProblem.id,
    firstSeenAt: T0,
    attempts: attempts.map((a, i) => ({ tryNumber: a.tryNumber, correct: a.correct, hintTier: Math.min(a.tryNumber - 1, 2) as 0 | 1 | 2, at: T0 + i * 1000 })),
    revealedAt,
  };
  const now = T0 + attempts.length * 1000 + numberProblem.thinkMinutes * 60_000 + 1;
  return viewProblem(numberProblem, state, now);
}

describe("pointsForAttempt", () => {
  test("first-try correct earns 3", () => {
    expect(pointsForAttempt(viewFor([{ tryNumber: 1, correct: true }]))).toBe(3);
  });

  test("correct after one hint (try 2) earns 2", () => {
    expect(pointsForAttempt(viewFor([{ tryNumber: 1, correct: false }, { tryNumber: 2, correct: true }]))).toBe(2);
  });

  test("correct after two hints (try 3) earns 1", () => {
    expect(pointsForAttempt(viewFor([{ tryNumber: 1, correct: false }, { tryNumber: 2, correct: false }, { tryNumber: 3, correct: true }]))).toBe(1);
  });

  test("exhausted (three wrong) earns 0", () => {
    expect(pointsForAttempt(viewFor([{ tryNumber: 1, correct: false }, { tryNumber: 2, correct: false }, { tryNumber: 3, correct: false }]))).toBe(0);
  });

  test("revealed earns 0 even though an attempt was marked correct", () => {
    expect(pointsForAttempt(viewFor([{ tryNumber: 1, correct: true }], T0))).toBe(0);
  });
});

describe("levelFor", () => {
  test("thresholds are 0, 6, 15, 30, 50", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(5)).toBe(1);
    expect(levelFor(6)).toBe(2);
    expect(levelFor(14)).toBe(2);
    expect(levelFor(15)).toBe(3);
    expect(levelFor(29)).toBe(3);
    expect(levelFor(30)).toBe(4);
    expect(levelFor(49)).toBe(4);
    expect(levelFor(50)).toBe(5);
    expect(levelFor(1000)).toBe(5);
  });
});

function attempt(
  problemId: string, correct: boolean, tryNumber: 1 | 2 | 3, at: number, revealed = false, retry = false,
): StoredAttempt {
  return { problemId, questId: "s1-w01-think", correct, tryNumber, hintTier: Math.min(tryNumber - 1, 2) as 0 | 1 | 2, revealed, retry, at };
}

// recomputeFromAttempts stays content-free: it takes a skillsForProblem resolver instead of
// reaching into the content layer itself. Most tests below use a small explicit map so they do
// not depend on real content at all; one test (evidence capped at 20) uses a resolver backed by
// the real compiled content bundle, to prove that wiring still works end to end.
function mapResolver(map: Record<string, string[]>): SkillsForProblem {
  return (id) => map[id] ?? [];
}
const noSkills: SkillsForProblem = () => [];

describe("pointsForOutcome: the shared 3/2/1/0 ladder", () => {
  test("correct on try 1, 2 or 3 earns 3, 2 or 1; revealed or wrong earns 0", () => {
    expect(pointsForOutcome({ correct: true, tryNumber: 1, revealed: false })).toBe(3);
    expect(pointsForOutcome({ correct: true, tryNumber: 2, revealed: false })).toBe(2);
    expect(pointsForOutcome({ correct: true, tryNumber: 3, revealed: false })).toBe(1);
    expect(pointsForOutcome({ correct: false, tryNumber: 3, revealed: false })).toBe(0);
    expect(pointsForOutcome({ correct: true, tryNumber: 1, revealed: true })).toBe(0);
  });

  test("a retry attempt earns zero points even when correct on the first try (Task 10 fix, spec 7.2)", () => {
    expect(pointsForOutcome({ correct: true, tryNumber: 1, revealed: false, retry: true })).toBe(0);
    expect(pointsForOutcome({ correct: true, tryNumber: 1, revealed: false, retry: false })).toBe(3);
  });

  test("a live ProblemView (pointsForAttempt) and a persisted record score the same outcome identically", () => {
    // Walk correct-on-try-1, correct-on-try-2 and correct-on-try-3 through both the live path
    // (pointsForAttempt on a ProblemView) and the persisted path (pointsForStoredAttempt, via
    // recomputeFromAttempts) and check they land on the same points every time, since both now
    // call the one shared pointsForOutcome ladder.
    for (const tryNumber of [1, 2, 3] as const) {
      const tries = Array.from({ length: tryNumber }, (_, i) => ({
        tryNumber: (i + 1) as 1 | 2 | 3,
        correct: i + 1 === tryNumber,
      }));
      const livePoints = pointsForAttempt(viewFor(tries));

      const resolve = mapResolver({ p1: ["think.number-sense"] });
      const storedAttempts: StoredAttempt[] = tries.map((a, i) => attempt("p1", a.correct, a.tryNumber, T0 + i));
      const storedPoints = recomputeFromAttempts(storedAttempts, [], [], resolve).find((p) => p.skillId === "think.number-sense")?.points ?? 0;

      const expected = pointsForOutcome({ correct: true, tryNumber, revealed: false });
      expect(livePoints).toBe(expected);
      expect(storedPoints).toBe(expected);
    }
  });
});

describe("recomputeFromAttempts: points and evidence", () => {
  test("a first-try correct attempt awards 3 points to every skill the problem is tagged with", () => {
    const resolve = mapResolver({ "s1-w01-think-01-p01": ["think.number-sense"] });
    const progress = recomputeFromAttempts([attempt("s1-w01-think-01-p01", true, 1, T0)], [], [], resolve);
    const entry = progress.find((p) => p.skillId === "think.number-sense");
    expect(entry?.points).toBe(3);
    expect(entry?.evidence).toContain("s1-w01-think-01-p01");
    expect(entry?.level).toBe(1);
  });

  test("a multi-skill problem awards its best points to every one of its skills", () => {
    const resolve = mapResolver({ p1: ["think.logic", "think.proof"] });
    const progress = recomputeFromAttempts([attempt("p1", true, 1, T0)], [], [], resolve);
    expect(progress.find((p) => p.skillId === "think.logic")?.points).toBe(3);
    expect(progress.find((p) => p.skillId === "think.proof")?.points).toBe(3);
  });

  test("a problem answered again later (a mistake-box retry) counts once, at its best", () => {
    const resolve = mapResolver({ p1: ["think.number-sense"] });
    const attempts: StoredAttempt[] = [
      attempt("p1", false, 1, T0),
      attempt("p1", false, 2, T0 + 1),
      attempt("p1", false, 3, T0 + 2, true), // exhausted and revealed on the first pass: 0
      attempt("p1", true, 1, T0 + 14 * 24 * 60 * 60 * 1000), // mistake-box variant, first try correct: 3
    ];
    const progress = recomputeFromAttempts(attempts, [], [], resolve);
    const entry = progress.find((p) => p.skillId === "think.number-sense");
    // Best across all attempts on this problem is 3, not 3 + 0, and not counted twice.
    expect(entry?.points).toBe(3);
    expect(entry?.evidence.filter((id) => id === "p1")).toHaveLength(1);
  });

  test("evidence is capped at 20 entries, keeping the most recent (real-content-backed resolver)", () => {
    const problems = content.quests
      .flatMap((q) => q.steps)
      .flatMap((s) => (s.kind === "warmup" || s.kind === "problem-set" ? s.problems : s.kind === "puzzle-of-week" ? [s.problem] : []))
      .filter((p) => p.skills.length === 1 && p.skills[0] === "think.skills.fractions");
    expect(problems.length).toBeGreaterThanOrEqual(25);
    const chosen = problems.slice(0, 25);
    const attempts = chosen.map((p, i) => attempt(p.id, true, 1, T0 + i * 1000));
    // Shuffled (reversed) on purpose: recomputeFromAttempts must sort events by "at", not trust
    // array order, so the cap-and-keep-most-recent result has to come out the same either way.
    const shuffledAttempts = [...attempts].reverse();
    const resolveFromRealContent: SkillsForProblem = (id) => getProblem(id)?.problem.skills ?? [];
    const progress = recomputeFromAttempts(shuffledAttempts, [], [], resolveFromRealContent);
    const entry = progress.find((p) => p.skillId === "think.skills.fractions");
    expect(entry?.evidence).toHaveLength(20);
    // The most recent 20 are kept: the first 5 chosen (oldest "at") are dropped.
    const expectedIds = chosen.slice(5).map((p) => p.id);
    expect(entry?.evidence).toEqual(expectedIds);
    expect(entry?.points).toBe(75); // 25 attempts x 3 points, points are not capped, only evidence
  });

  test("a problem the resolver has no skills for contributes no skill credit and does not crash", () => {
    const progress = recomputeFromAttempts([attempt("not-tagged", true, 1, T0)], [], [], noSkills);
    expect(progress).toEqual([]);
  });
});

describe("recomputeFromAttempts: logs (spec section 8)", () => {
  test("a Build maker log awards 2 points to build.debugging", () => {
    const logs: StoredLog[] = [{ questId: "s1-w01-build", track: "build", at: T0 }];
    const progress = recomputeFromAttempts([], logs, [], noSkills);
    const entry = progress.find((p) => p.skillId === "build.debugging");
    expect(entry?.points).toBe(2);
    expect(entry?.level).toBe(1);
  });

  test("a Speak log awards 2 points to speak.reflection", () => {
    const logs: StoredLog[] = [{ questId: "s1-w01-speak", track: "speak", at: T0 }];
    const progress = recomputeFromAttempts([], logs, [], noSkills);
    const entry = progress.find((p) => p.skillId === "speak.reflection");
    expect(entry?.points).toBe(2);
  });

  test("a Think log awards no points to any skill", () => {
    const logs: StoredLog[] = [{ questId: "s1-w01-think", track: "think", at: T0 }];
    const progress = recomputeFromAttempts([], logs, [], noSkills);
    expect(progress).toEqual([]);
  });

  test("applyLog is the same rule, callable directly on a SkillProgress list", () => {
    expect(applyLog([], "build")[0]).toMatchObject({ skillId: "build.debugging", points: 2 });
    expect(applyLog([], "speak")[0]).toMatchObject({ skillId: "speak.reflection", points: 2 });
    expect(applyLog([], "think")).toEqual([]);
  });
});

describe("recomputeFromAttempts: parent entries", () => {
  test("a parent entry (chess, piano) contributes evidence but no points", () => {
    const entries: ParentSkillEntry[] = [{ skillId: "think.deduction", note: "Won a chess puzzle rush round.", at: T0 }];
    const progress = recomputeFromAttempts([], [], entries, noSkills);
    const entry = progress.find((p) => p.skillId === "think.deduction");
    expect(entry?.points).toBe(0);
    expect(entry?.level).toBe(1);
    expect(entry?.evidence).toContain("Won a chess puzzle rush round.");
  });

  test("a skill touched only by parent entries is source \"parent\" (task 13 brief)", () => {
    const entries: ParentSkillEntry[] = [{ skillId: "think.deduction", note: "Chess class: learned to spot a fork.", at: T0 }];
    const progress = recomputeFromAttempts([], [], entries, noSkills);
    expect(progress.find((p) => p.skillId === "think.deduction")?.source).toBe("parent");
  });

  test("a skill touched by an attempt is source \"app\"", () => {
    const resolve = mapResolver({ p1: ["think.number-sense"] });
    const progress = recomputeFromAttempts([attempt("p1", true, 1, T0)], [], [], resolve);
    expect(progress.find((p) => p.skillId === "think.number-sense")?.source).toBe("app");
  });

  test("a Build log's skill is source \"app\"", () => {
    const logs: StoredLog[] = [{ questId: "s1-w01-build", track: "build", at: T0 }];
    const progress = recomputeFromAttempts([], logs, [], noSkills);
    expect(progress.find((p) => p.skillId === "build.debugging")?.source).toBe("app");
  });

  test("a skill with both app and parent evidence is still source \"app\", regardless of event order", () => {
    const resolve = mapResolver({ p1: ["think.deduction"] });
    const entries: ParentSkillEntry[] = [{ skillId: "think.deduction", note: "Chess class.", at: T0 }];

    // Parent entry recorded before the attempt.
    const parentFirst = recomputeFromAttempts([attempt("p1", true, 1, T0 + 1)], [], entries, resolve);
    expect(parentFirst.find((p) => p.skillId === "think.deduction")?.source).toBe("app");

    // Parent entry recorded after the attempt.
    const appFirst = recomputeFromAttempts(
      [attempt("p1", true, 1, T0)], [], [{ ...entries[0], at: T0 + 1 }], resolve,
    );
    expect(appFirst.find((p) => p.skillId === "think.deduction")?.source).toBe("app");
  });
});

describe("recomputeFromAttempts: retry attempts never earn points (Task 10 fix, spec 7.2 'he can retry any problem')", () => {
  test("a retry attempt correct on its first try earns zero points", () => {
    const resolve = mapResolver({ p1: ["think.number-sense"] });
    const progress = recomputeFromAttempts([attempt("p1", true, 1, T0, false, true)], [], [], resolve);
    expect(progress.find((p) => p.skillId === "think.number-sense")?.points).toBe(0);
  });

  test("the best non-retry attempt still stands even after a later retry cycle", () => {
    const resolve = mapResolver({ p1: ["think.number-sense"] });
    const attempts: StoredAttempt[] = [
      attempt("p1", true, 1, T0), // original cycle: correct first try, 3 points
      attempt("p1", true, 1, T0 + 60_000, false, true), // later "Try it again" cycle: also correct first try, but retry -> 0
    ];
    const progress = recomputeFromAttempts(attempts, [], [], resolve);
    // The retry cycle's attempt scores higher points-wise than nothing, but never above the
    // original 3: the best-by-problem selection still picks the original, non-retry attempt.
    expect(progress.find((p) => p.skillId === "think.number-sense")?.points).toBe(3);
  });

  test("evidence includes the retry attempt when it is the best (or only) attempt on record", () => {
    const resolve = mapResolver({ p1: ["think.number-sense"] });
    const attempts: StoredAttempt[] = [
      attempt("p1", false, 1, T0),
      attempt("p1", false, 2, T0 + 1),
      attempt("p1", false, 3, T0 + 2), // original cycle: exhausted, 0 points
      attempt("p1", true, 1, T0 + 60_000, false, true), // retry cycle: correct, but retry -> still 0
    ];
    const progress = recomputeFromAttempts(attempts, [], [], resolve);
    const entry = progress.find((p) => p.skillId === "think.number-sense");
    expect(entry?.points).toBe(0);
    // Both 0-point attempts tie; recomputeFromAttempts's tie-break keeps the later one, so the
    // retry attempt is exactly what shows up as evidence.
    expect(entry?.evidence).toContain("p1");
  });
});

describe("recomputeFromAttempts: parent reset", () => {
  test("recomputing from a smaller remaining set of attempts (after a reset) produces lower or equal points, never stale credit", () => {
    const resolve = mapResolver({ p1: ["think.number-sense"] });
    const before = recomputeFromAttempts([attempt("p1", true, 1, T0)], [], [], resolve);
    const after = recomputeFromAttempts([], [], [], resolve); // parent reset the problem: no attempts remain
    expect(before.find((p) => p.skillId === "think.number-sense")?.points).toBe(3);
    expect(after).toEqual([]);
  });
});
