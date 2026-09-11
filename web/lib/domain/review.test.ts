import { describe, expect, test } from "vitest";
import { clearOnVariantSuccess, dueItems, problemForReview, recomputeFromAttempts, scheduleOnMiss, type ReviewItem } from "./review";
import type { Problem } from "../content/schema";
import type { StoredAttempt } from "./skills";

const T0 = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

describe("scheduleOnMiss", () => {
  test("a first miss schedules 14 days out and starts misses at 1", () => {
    const item = scheduleOnMiss("s1-w06-think-04-p03", undefined, T0);
    expect(item.problemId).toBe("s1-w06-think-04-p03");
    expect(item.dueAt).toBe(T0 + 14 * DAY_MS);
    expect(item.misses).toBe(1);
    expect(item.variantSeed).toBe(1);
  });

  test("a second miss reschedules at 7 days, not 14, and bumps misses and variantSeed", () => {
    const first = { problemId: "s1-w06-think-04-p03", dueAt: T0 + 14 * DAY_MS, misses: 1, variantSeed: 1 };
    const second = scheduleOnMiss("s1-w06-think-04-p03", first, T0 + 15 * DAY_MS);
    expect(second.dueAt).toBe(T0 + 15 * DAY_MS + 7 * DAY_MS);
    expect(second.misses).toBe(2);
    expect(second.variantSeed).toBe(2);
  });

  test("a third miss also reschedules at 7 days, not 14", () => {
    const second = { problemId: "p", dueAt: T0, misses: 2, variantSeed: 2 };
    const third = scheduleOnMiss("p", second, T0 + 30 * DAY_MS);
    expect(third.dueAt).toBe(T0 + 30 * DAY_MS + 7 * DAY_MS);
    expect(third.misses).toBe(3);
    expect(third.variantSeed).toBe(3);
  });

  test("uses the problemId passed in, not any problemId on the existing item", () => {
    const first = { problemId: "old-id", dueAt: T0, misses: 1, variantSeed: 1 };
    const second = scheduleOnMiss("s1-w06-think-04-p03", first, T0);
    expect(second.problemId).toBe("s1-w06-think-04-p03");
  });
});

describe("clearOnVariantSuccess", () => {
  test("a first-try correct on the variant clears the item (returns null)", () => {
    const item: ReviewItem = { problemId: "p", dueAt: T0, misses: 1, variantSeed: 1 };
    expect(clearOnVariantSuccess(item, true, T0)).toBeNull();
  });

  test("a variant solved on try 2 (not first try) does not clear the item", () => {
    const item: ReviewItem = { problemId: "p", dueAt: T0, misses: 1, variantSeed: 1 };
    const result = clearOnVariantSuccess(item, false, T0);
    expect(result).not.toBeNull();
  });

  test("a non-first-try success reschedules 7 days out from now and bumps misses and variantSeed", () => {
    const item: ReviewItem = { problemId: "p", dueAt: T0, misses: 1, variantSeed: 1 };
    const result = clearOnVariantSuccess(item, false, T0);
    expect(result).toEqual({ problemId: "p", dueAt: T0 + 7 * DAY_MS, misses: 2, variantSeed: 2 });
  });

  test("a late review reschedules from when it was actually answered, not from the old due date", () => {
    // Due three days ago, answered wrong today: the next review is 7 days from today (T0),
    // not 7 days from the old due date (which would land only 4 days from today).
    const threeDaysAgo = T0 - 3 * DAY_MS;
    const item: ReviewItem = { problemId: "p", dueAt: threeDaysAgo, misses: 1, variantSeed: 1 };
    const result = clearOnVariantSuccess(item, false, T0);
    expect(result?.dueAt).toBe(T0 + 7 * DAY_MS);
    expect(result?.dueAt).not.toBe(threeDaysAgo + 7 * DAY_MS);
  });
});

describe("dueItems", () => {
  test("returns only items due at or before now, sorted by dueAt", () => {
    const items: ReviewItem[] = [
      { problemId: "later", dueAt: T0 + 5000, misses: 1, variantSeed: 1 },
      { problemId: "due-now", dueAt: T0, misses: 1, variantSeed: 1 },
      { problemId: "past-due", dueAt: T0 - 5000, misses: 1, variantSeed: 1 },
      { problemId: "future", dueAt: T0 + 999_999, misses: 1, variantSeed: 1 },
    ];
    const result = dueItems(items, T0);
    expect(result.map((i) => i.problemId)).toEqual(["past-due", "due-now"]);
  });

  test("returns an empty array when nothing is due", () => {
    const items: ReviewItem[] = [{ problemId: "p", dueAt: T0 + 1, misses: 1, variantSeed: 1 }];
    expect(dueItems(items, T0)).toEqual([]);
  });
});

function firstTry(problemId: string, correct: boolean, at: number): StoredAttempt {
  return { problemId, questId: "q", correct, tryNumber: 1, hintTier: 0, revealed: false, retry: false, at };
}

function laterTry(problemId: string, tryNumber: 2 | 3, correct: boolean, at: number): StoredAttempt {
  return { problemId, questId: "q", correct, tryNumber, hintTier: 1, revealed: false, retry: false, at };
}

describe("recomputeFromAttempts", () => {
  test("a wrong first try produces the same item scheduleOnMiss would", () => {
    const attempts: StoredAttempt[] = [firstTry("p", false, T0)];
    const queue = recomputeFromAttempts(attempts, T0 + DAY_MS);
    expect(queue).toEqual([scheduleOnMiss("p", undefined, T0)]);
  });

  test("a first-try correct with no prior miss produces no item", () => {
    const attempts: StoredAttempt[] = [firstTry("p", true, T0)];
    expect(recomputeFromAttempts(attempts, T0 + DAY_MS)).toEqual([]);
  });

  test("try 2 and try 3 attempts do not schedule or clear anything: only tryNumber 1 matters", () => {
    const attempts: StoredAttempt[] = [
      firstTry("p", false, T0),
      laterTry("p", 2, false, T0 + 1),
      laterTry("p", 3, true, T0 + 2), // solved on try 3: still leaves the mistake-box item scheduled
    ];
    const queue = recomputeFromAttempts(attempts, T0 + DAY_MS);
    expect(queue).toEqual([scheduleOnMiss("p", undefined, T0)]);
  });

  test("reproduces the same queue the event-driven scheduleOnMiss/clearOnVariantSuccess calls produce for the same history", () => {
    // Problem A: missed at T0 (first miss, 14 days), missed again on the due variant at
    // T0 + 20 days (a second miss, 7 days from then).
    const aFirstMiss = scheduleOnMiss("A", undefined, T0);
    const aSecondMiss = clearOnVariantSuccess(aFirstMiss, false, T0 + 20 * DAY_MS)!;

    // Problem B: missed at T0 + 5 days, then cleared by a first-try correct on the variant at
    // T0 + 30 days, so it has no item left in the expected queue at all.
    const attempts: StoredAttempt[] = [
      firstTry("A", false, T0),
      firstTry("B", false, T0 + 5 * DAY_MS),
      firstTry("A", false, T0 + 20 * DAY_MS),
      firstTry("B", true, T0 + 30 * DAY_MS),
    ];

    const queue = recomputeFromAttempts(attempts, T0 + 100 * DAY_MS);
    expect(queue).toEqual([aSecondMiss]);
  });

  test("removing a problem's attempts from the input removes its item", () => {
    const withBoth: StoredAttempt[] = [firstTry("A", false, T0), firstTry("B", false, T0 + 1)];
    const withoutA: StoredAttempt[] = [firstTry("B", false, T0 + 1)];

    const before = recomputeFromAttempts(withBoth, T0 + DAY_MS).map((i) => i.problemId);
    const after = recomputeFromAttempts(withoutA, T0 + DAY_MS).map((i) => i.problemId);

    expect(before).toContain("A");
    expect(after).not.toContain("A");
    expect(after).toContain("B");
  });

  test("an attempt timestamped after now is ignored", () => {
    const attempts: StoredAttempt[] = [firstTry("p", false, T0 + 5 * DAY_MS)];
    expect(recomputeFromAttempts(attempts, T0)).toEqual([]);
  });

  test("the returned queue is sorted by dueAt", () => {
    const attempts: StoredAttempt[] = [
      firstTry("later", false, T0 + 10 * DAY_MS), // due T0 + 24 days
      firstTry("sooner", false, T0), // due T0 + 14 days
    ];
    const queue = recomputeFromAttempts(attempts, T0 + 100 * DAY_MS);
    expect(queue.map((i) => i.problemId)).toEqual(["sooner", "later"]);
  });
});

// Task 17 (final review finding C2): the mistake box's own screen. problemForReview decides
// what a due item actually shows; clearOnVariantSuccess (already exercised above in the
// abstract) is what the review screen calls exactly once, right after the due item's first
// attempt, with whatever "was that first try correct" turned out to be.

const withVariant: Problem = {
  id: "s1-w06-think-04-p03",
  kind: "number",
  lane: "skills",
  prompt: "What is 3/4 of 8?",
  answer: { kind: "number", value: "6" },
  explanation: ["3/4 means split into 4 equal parts and take 3.", "8 split into 4 parts is 2 each.", "3 parts of 2 is 6."],
  ideaId: "idea-fractions",
  useAgain: "when a problem asks for a fraction of a whole number.",
  hints: ["Split the number into that many equal parts first.", "Then take the number of parts the fraction asks for."],
  socraticHint: "What does the bottom number of the fraction tell you to do to the whole number first?",
  skills: ["think.number-sense"],
  thinkMinutes: 4,
  difficulty: 2,
  variant: {
    prompt: "What is 2/3 of 9?",
    answer: { kind: "number", value: "6" },
  },
};

const withoutVariant: Problem = {
  ...withVariant,
  id: "s1-w06-think-04-p09",
  kind: "text",
  answer: { kind: "rubric", mustMention: ["equal parts", "fraction"] },
  variant: undefined,
};

describe("problemForReview", () => {
  test("a problem with an authored variant shows the variant's prompt and answer, not the original's", () => {
    const shown = problemForReview(withVariant);
    expect(shown.prompt).toBe("What is 2/3 of 9?");
    expect(shown.answer).toEqual({ kind: "number", value: "6" });
    // Same id: this is still the mistake-box entry for THIS problem, just a new surface.
    expect(shown.id).toBe(withVariant.id);
    // Everything the variant does not author stays the parent's own, unchanged.
    expect(shown.explanation).toBe(withVariant.explanation);
    expect(shown.hints).toBe(withVariant.hints);
    expect(shown.useAgain).toBe(withVariant.useAgain);
  });

  test("a problem with no authored variant shows the original problem unchanged (task 17: the 15-problem decision)", () => {
    expect(problemForReview(withoutVariant)).toEqual(withoutVariant);
  });
});

describe("task 17: the review screen's calls to clearOnVariantSuccess", () => {
  test("getting the variant right on the first try clears the item", () => {
    const item: ReviewItem = { problemId: withVariant.id, dueAt: T0, misses: 1, variantSeed: 1 };
    expect(clearOnVariantSuccess(item, true, T0 + 60_000)).toBeNull();
  });

  test("getting the variant wrong leaves the item in the box, rescheduled rather than removed", () => {
    const item: ReviewItem = { problemId: withVariant.id, dueAt: T0, misses: 1, variantSeed: 1 };
    const result = clearOnVariantSuccess(item, false, T0 + 60_000);
    expect(result).not.toBeNull();
    expect(result!.problemId).toBe(withVariant.id); // still the same item, not dropped
    expect(result!.dueAt).toBeGreaterThan(T0 + 60_000); // comes back again, does not just vanish
    expect(result!.misses).toBe(item.misses + 1);
  });
});
