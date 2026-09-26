import { describe, expect, test } from "vitest";
import { calendarWeekRange, currentWeekFromDone, dateOnly } from "./calendar";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAfterStart(days: number): number {
  return new Date(2026, 8, 7).getTime() + days * DAY_MS; // 2026-09-07 is a Monday
}

function doneThrough(n: number): boolean[] {
  return Array.from({ length: 12 }, (_, i) => i < n);
}

describe("currentWeekFromDone", () => {
  test("nothing done yet is week 1", () => {
    expect(currentWeekFromDone([])).toBe(1);
    expect(currentWeekFromDone(doneThrough(0))).toBe(1);
  });

  test("the first not-done week is current", () => {
    expect(currentWeekFromDone(doneThrough(1))).toBe(2);
    expect(currentWeekFromDone(doneThrough(5))).toBe(6);
  });

  test("a week done out of order does not move the current week past an earlier gap", () => {
    const doneByWeek = doneThrough(3);
    doneByWeek[7] = true; // week 8 done, weeks 4-7 still not
    expect(currentWeekFromDone(doneByWeek)).toBe(4);
  });

  test("every week done holds the child on week 12, the season is finished", () => {
    expect(currentWeekFromDone(doneThrough(12))).toBe(12);
  });

  test("a short array is read as not-done for the missing weeks", () => {
    expect(currentWeekFromDone([true, true])).toBe(3);
  });
});

describe("dateOnly", () => {
  test("formats a timestamp as a local YYYY-MM-DD", () => {
    expect(dateOnly(daysAfterStart(0))).toBe("2026-09-07");
  });
});

describe("calendarWeekRange", () => {
  test("a Monday is the start of its own real week", () => {
    expect(calendarWeekRange(daysAfterStart(0))).toEqual({ startId: "2026-09-07", endId: "2026-09-13" });
  });

  test("a Sunday still belongs to the same real week that started the Monday before it", () => {
    expect(calendarWeekRange(daysAfterStart(6))).toEqual({ startId: "2026-09-07", endId: "2026-09-13" });
  });

  test("the next Monday starts the next real week", () => {
    expect(calendarWeekRange(daysAfterStart(7))).toEqual({ startId: "2026-09-14", endId: "2026-09-20" });
  });
});
