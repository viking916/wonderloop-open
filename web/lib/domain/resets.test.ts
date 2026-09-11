import { describe, expect, test } from "vitest";
import { coveringResetAt, type ResetRecord } from "./resets";

const QUEST = { questId: "s1-w01-build", season: 1, week: 1 };

describe("coveringResetAt", () => {
  test("undefined when no resets are on record", () => {
    expect(coveringResetAt(1000, QUEST, [])).toBeUndefined();
  });

  test("a quest-scoped reset after the item covers it", () => {
    const resets: ResetRecord[] = [{ scope: "quest", targetId: "s1-w01-build", at: 2000 }];
    expect(coveringResetAt(1000, QUEST, resets)).toBe(2000);
  });

  test("a quest-scoped reset before the item does not cover it (the item is newer, from after the reset)", () => {
    const resets: ResetRecord[] = [{ scope: "quest", targetId: "s1-w01-build", at: 500 }];
    expect(coveringResetAt(1000, QUEST, resets)).toBeUndefined();
  });

  test("a quest-scoped reset for a different quest does not cover it", () => {
    const resets: ResetRecord[] = [{ scope: "quest", targetId: "s1-w01-think", at: 2000 }];
    expect(coveringResetAt(1000, QUEST, resets)).toBeUndefined();
  });

  test("a week-scoped reset covers every quest in that week", () => {
    const resets: ResetRecord[] = [{ scope: "week", targetId: "s1-w01", at: 2000 }];
    expect(coveringResetAt(1000, QUEST, resets)).toBe(2000);
  });

  test("a week-scoped reset for a different week does not cover it", () => {
    const resets: ResetRecord[] = [{ scope: "week", targetId: "s1-w02", at: 2000 }];
    expect(coveringResetAt(1000, QUEST, resets)).toBeUndefined();
  });

  test("a season-scoped reset covers every quest in that season", () => {
    const resets: ResetRecord[] = [{ scope: "season", targetId: "s1", at: 2000 }];
    expect(coveringResetAt(1000, QUEST, resets)).toBe(2000);
  });

  test("a season-scoped reset for a different season does not cover it", () => {
    const resets: ResetRecord[] = [{ scope: "season", targetId: "s2", at: 2000 }];
    expect(coveringResetAt(1000, QUEST, resets)).toBeUndefined();
  });

  test("a problem-scoped reset never covers a quest, no matter its targetId", () => {
    const resets: ResetRecord[] = [{ scope: "problem", targetId: "s1-w01-build", at: 2000 }];
    expect(coveringResetAt(1000, QUEST, resets)).toBeUndefined();
  });

  test("the latest of several covering resets wins", () => {
    const resets: ResetRecord[] = [
      { scope: "quest", targetId: "s1-w01-build", at: 1500 },
      { scope: "week", targetId: "s1-w01", at: 3000 },
      { scope: "season", targetId: "s1", at: 2000 },
    ];
    expect(coveringResetAt(1000, QUEST, resets)).toBe(3000);
  });

  test("an item created after every covering reset is not stale", () => {
    const resets: ResetRecord[] = [{ scope: "quest", targetId: "s1-w01-build", at: 1000 }];
    expect(coveringResetAt(1500, QUEST, resets)).toBeUndefined();
  });
});
