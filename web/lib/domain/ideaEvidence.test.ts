import { describe, expect, test } from "vitest";
import { groupIdeaEvidenceLines } from "./ideaEvidence";

describe("groupIdeaEvidenceLines", () => {
  test("groups identical labels and folds the repeat count into the line", () => {
    const label = "Warm-up · Fractions are slices, and true or false (week 1)";
    const result = groupIdeaEvidenceLines([label, label, label, label, label]);
    expect(result).toEqual([
      { text: "Warm-up, Fractions are slices, and true or false, week 1, 5 times", count: 5 },
    ]);
  });

  test("keeps the order of first appearance and leaves a singleton without a count suffix", () => {
    const a = "Warm-up · Doubling (week 2)";
    const b = "Puzzle of the week · Ratios (week 3)";
    const result = groupIdeaEvidenceLines([a, b, a]);
    expect(result).toEqual([
      { text: "Warm-up, Doubling, week 2, 2 times", count: 2 },
      { text: "Puzzle of the week, Ratios, week 3", count: 1 },
    ]);
  });

  test("passes through a label with no week suffix or dot separator unchanged", () => {
    const result = groupIdeaEvidenceLines(["some-quest-id"]);
    expect(result).toEqual([{ text: "some-quest-id", count: 1 }]);
  });

  test("returns an empty list for no labels", () => {
    expect(groupIdeaEvidenceLines([])).toEqual([]);
  });
});
