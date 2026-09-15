import { describe, expect, test } from "vitest";
import { calibrationRows, calibrationSentences, missKindCounts, missSentence } from "./calibration";

const a = (confidence: "sure" | "probably" | "guessing" | undefined, correct: boolean, tryNumber = 1, retry = false) => ({ confidence, correct, tryNumber, retry });

describe("calibrationRows", () => {
  test("counts first tries with a mark, in the fixed order, and drops empty rows", () => {
    const rows = calibrationRows([a("guessing", true), a("sure", true), a("sure", false), a(undefined, true), a("sure", true, 2), a("sure", true, 1, true)]);
    expect(rows).toEqual([
      { confidence: "sure", total: 2, correct: 1 },
      { confidence: "guessing", total: 1, correct: 1 },
    ]);
  });
});

describe("calibrationSentences", () => {
  test("one sentence per confidence, and the sure-and-wrong observation only after three marks", () => {
    expect(calibrationSentences([a("sure", false), a("sure", false)])).toEqual(["When you said sure, you were right 0 of 2 times."]);
    const three = calibrationSentences([a("sure", false), a("sure", false), a("sure", true)]);
    expect(three[0]).toBe("When you said sure, you were right 1 of 3 times.");
    expect(three[1]).toMatch(/read the question twice/);
  });

  test("guessing and right most of the time earns the encouraging line", () => {
    const s = calibrationSentences([a("guessing", true), a("guessing", true), a("guessing", false)]);
    expect(s[1]).toMatch(/know more than you think/);
  });

  test("nothing to say without marks", () => {
    expect(calibrationSentences([a(undefined, true)])).toEqual([]);
  });
});

describe("miss kinds", () => {
  test("counts and names the most common kind's fix", () => {
    const attempts = [
      { correct: false, tryNumber: 1, missKind: "misread" as const },
      { correct: false, tryNumber: 1, missKind: "misread" as const },
      { correct: false, tryNumber: 1, missKind: "slipped" as const },
      { correct: true, tryNumber: 1 },
    ];
    expect(missKindCounts(attempts)).toEqual([
      { kind: "misread", count: 2 },
      { kind: "slipped", count: 1 },
    ]);
    expect(missSentence(attempts)).toBe("Misses so far: misread it 2, knew it and slipped 1. Most misses were misreads, so the fix is slowing down, not more practice.");
    expect(missSentence([{ correct: true, tryNumber: 1 }])).toBeUndefined();
  });
});
