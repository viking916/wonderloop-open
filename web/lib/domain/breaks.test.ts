import { describe, expect, test } from "vitest";
import { BREAK_INTERVAL_MS, BREAK_SNOOZE_MS, breakDue } from "./breaks";

const START = 1_700_000_000_000;

describe("breakDue", () => {
  test("not due before 30 minutes of continuous work", () => {
    expect(breakDue({ workStartedAt: START, now: START + BREAK_INTERVAL_MS - 1 })).toBe(false);
  });

  test("due at exactly 30 minutes", () => {
    expect(breakDue({ workStartedAt: START, now: START + BREAK_INTERVAL_MS })).toBe(true);
  });

  test("due well past 30 minutes, with no dismissal on record", () => {
    expect(breakDue({ workStartedAt: START, now: START + BREAK_INTERVAL_MS * 2 })).toBe(true);
  });

  test("a dismissal fewer than 15 minutes ago suppresses the offer, even though 30 minutes of work has passed", () => {
    const dismissedAt = START + BREAK_INTERVAL_MS;
    const now = dismissedAt + BREAK_SNOOZE_MS - 1;
    expect(breakDue({ workStartedAt: START, lastDismissedAt: dismissedAt, now })).toBe(false);
  });

  test("due again once 15 minutes have passed since the dismissal", () => {
    const dismissedAt = START + BREAK_INTERVAL_MS;
    const now = dismissedAt + BREAK_SNOOZE_MS;
    expect(breakDue({ workStartedAt: START, lastDismissedAt: dismissedAt, now })).toBe(true);
  });

  test("a dismissal recorded before 30 minutes of work has even passed does not itself block the first real offer", () => {
    // Defensive: this ordering should never happen in practice (a dismissal only ever follows an
    // offer, which only ever follows breakDue already being true), but the function does not
    // assume its own precondition -- it just applies both rules independently.
    const dismissedAt = START + 5 * 60 * 1000;
    const now = START + BREAK_INTERVAL_MS + BREAK_SNOOZE_MS;
    expect(breakDue({ workStartedAt: START, lastDismissedAt: dismissedAt, now })).toBe(true);
  });

  test("fresh work (no time passed) is never due", () => {
    expect(breakDue({ workStartedAt: START, now: START })).toBe(false);
  });
});
