import { describe, expect, test } from "vitest";
import { currentWeekFor, resumedStartDate, weekDateRange } from "./calendar";

const START = "2026-09-07"; // a Monday
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAfterStart(days: number): number {
  return new Date(2026, 8, 7).getTime() + days * DAY_MS;
}

describe("currentWeekFor", () => {
  test("the start date itself is week 1", () => {
    expect(currentWeekFor(START, START, daysAfterStart(0))).toBe(1);
  });

  test("day 6 is still week 1", () => {
    expect(currentWeekFor(START, START, daysAfterStart(6))).toBe(1);
  });

  test("day 7 rolls over to week 2", () => {
    expect(currentWeekFor(START, START, daysAfterStart(7))).toBe(2);
  });

  test("day 13 is the last day of week 2", () => {
    expect(currentWeekFor(START, START, daysAfterStart(13))).toBe(2);
  });

  test("day 77 (11 * 7) is week 12", () => {
    expect(currentWeekFor(START, START, daysAfterStart(77))).toBe(12);
  });

  test("clamps at 12 well past the season's end", () => {
    expect(currentWeekFor(START, START, daysAfterStart(400))).toBe(12);
  });

  test("clamps at 1 before the season starts", () => {
    expect(currentWeekFor(START, START, daysAfterStart(-30))).toBe(1);
  });

  test("falls back to the season calendar when the profile's startDate is unparseable", () => {
    expect(currentWeekFor("not-a-date", START, daysAfterStart(7))).toBe(2);
  });

  test("falls back to now (week 1) when both dates are unparseable", () => {
    const now = daysAfterStart(30);
    expect(currentWeekFor("nope", "also-nope", now)).toBe(1);
  });

  test("a paused clock reads the week as of the pause day, however long ago", () => {
    // Paused on day 9 (week 2); asked on day 40: still week 2.
    expect(currentWeekFor(START, START, daysAfterStart(40), "2026-09-16")).toBe(2);
  });

  test("a pause date in the future is ignored", () => {
    expect(currentWeekFor(START, START, daysAfterStart(20), "2026-12-01")).toBe(3);
  });
});

describe("resumedStartDate", () => {
  test("moves the start forward by the whole days paused, so the week is unchanged on resume", () => {
    // Paused on day 9, resumed on day 30: 21 days paused, start moves from Sep 7 to Sep 28.
    const resumed = resumedStartDate(START, "2026-09-16", daysAfterStart(30));
    expect(resumed).toBe("2026-09-28");
    expect(currentWeekFor(resumed, START, daysAfterStart(30))).toBe(2);
  });

  test("resuming the same day changes nothing", () => {
    expect(resumedStartDate(START, "2026-09-16", daysAfterStart(9))).toBe(START);
  });

  test("a malformed date leaves the start alone", () => {
    expect(resumedStartDate(START, "yesterday", daysAfterStart(30))).toBe(START);
  });

  test("prefers the profile's own startDate over the season calendar's", () => {
    const profileStart = "2026-10-05"; // 4 weeks after the season default
    // 7 days after the profile's own start: week 2 by the profile's clock, not the calendar's.
    expect(currentWeekFor(profileStart, START, new Date(2026, 9, 12).getTime())).toBe(2);
  });
});

describe("weekDateRange", () => {
  // now is only ever the last-resort fallback here (both dates below parse), so it is passed
  // but must not affect the result.
  const now = daysAfterStart(0);

  test("week 1 is the start date through 6 days later", () => {
    expect(weekDateRange(START, START, 1, now)).toEqual({ startId: "2026-09-07", endId: "2026-09-13" });
  });

  test("week 2 picks up the day after week 1 ends", () => {
    expect(weekDateRange(START, START, 2, now)).toEqual({ startId: "2026-09-14", endId: "2026-09-20" });
  });

  test("falls back to the season calendar when the profile's startDate is unparseable", () => {
    expect(weekDateRange("not-a-date", START, 1, now)).toEqual({ startId: "2026-09-07", endId: "2026-09-13" });
  });

  // Final review, domain-purity note: weekDateRange took no `now` parameter at all, so this
  // fallback (both dates unparseable) was unreachable and untestable. Now that `now` is a real
  // parameter, it is both.
  test("falls back to the Monday of now when both dates are unparseable", () => {
    expect(weekDateRange("nope", "also-nope", 1, daysAfterStart(30))).toEqual({
      startId: "2026-10-05",
      endId: "2026-10-11",
    });
  });

  test("a profile whose clock has not started is on week 1, whatever the date", () => {
    expect(currentWeekFor(undefined, "2026-09-07", daysAfterStart(60))).toBe(1);
    expect(weekDateRange(undefined, "2026-09-07", 1, daysAfterStart(30))).toEqual({ startId: "2026-10-05", endId: "2026-10-11" });
  });
});
