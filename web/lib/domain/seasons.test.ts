import { describe, expect, test } from "vitest";
import { mondayOnOrBefore, nextSeasonFor, seasonRollover } from "./seasons";

// Local-time constructor, matching calendar.ts's parseDateOnly, so the day of week is the
// machine's own and never shifts across a UTC boundary.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe("nextSeasonFor", () => {
  test("season 1 moves to season 2", () => {
    expect(nextSeasonFor({ seasonId: 1 }, 4)).toBe(2);
  });

  test("the last landed season has no next", () => {
    expect(nextSeasonFor({ seasonId: 4 }, 4)).toBeUndefined();
  });

  test("the season count comes from the caller, never a hardcoded four", () => {
    expect(nextSeasonFor({ seasonId: 2 }, 2)).toBeUndefined();
    expect(nextSeasonFor({ seasonId: 4 }, 5)).toBe(5);
  });
});

describe("mondayOnOrBefore", () => {
  test("a Monday is its own start", () => {
    expect(mondayOnOrBefore(at(2026, 11, 30))).toBe("2026-11-30");
  });

  test("a Wednesday goes back to that week's Monday", () => {
    expect(mondayOnOrBefore(at(2026, 12, 2))).toBe("2026-11-30");
  });

  test("a Sunday goes back six days, not forward one", () => {
    expect(mondayOnOrBefore(at(2026, 12, 6))).toBe("2026-11-30");
  });

  test("late at night on a Monday is still that Monday", () => {
    expect(mondayOnOrBefore(at(2026, 11, 30, 23))).toBe("2026-11-30");
  });

  test("crosses a month boundary", () => {
    expect(mondayOnOrBefore(at(2027, 3, 3))).toBe("2027-03-01");
    expect(mondayOnOrBefore(at(2026, 10, 3))).toBe("2026-09-28");
  });
});

describe("seasonRollover", () => {
  test("writes the next season only; the clock starts when the child starts", () => {
    expect(seasonRollover({ seasonId: 1 }, 4)).toEqual({ seasonId: 2 });
  });

  test("nothing to write past the last season", () => {
    expect(seasonRollover({ seasonId: 4 }, 4)).toBeUndefined();
  });
});
