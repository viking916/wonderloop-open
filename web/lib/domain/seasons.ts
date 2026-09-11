// Season rollover, per profile (owner decision, 4 September 2026: a child's season ends when
// that child has finished it, and only then does that child's next season start; two siblings'
// seasons never wait on each other, so nothing here looks at more than one profile).
// Pure: no Firebase, no React, no Date.now(); "now" is always passed in, as calendar.ts does.

import type { ProfileDoc } from "../data/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The season a profile would move to, or undefined when it is already on the last one the
 * content ships. `seasonCount` comes from the content bundle (how many seasons are landed), so
 * this never hardcodes "4". */
export function nextSeasonFor(profile: Pick<ProfileDoc, "seasonId">, seasonCount: number): number | undefined {
  const next = profile.seasonId + 1;
  return next <= seasonCount ? next : undefined;
}

/**
 * The "YYYY-MM-DD" (local) Monday on or before `now`: the start date a profile gets when its
 * next season begins today. ProfileDoc.startDate is documented as "the Monday the season starts"
 * and calendar.ts's currentWeekFor counts whole weeks from it, so starting on a Wednesday still
 * makes this week "week 1" rather than leaving the child in a half-week nobody counts.
 */
export function mondayOnOrBefore(now: number): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  // getDay(): Sunday is 0, Monday is 1. Days back to Monday: Mon 0, Tue 1, ... Sun 6.
  const daysBack = (d.getDay() + 6) % 7;
  const monday = new Date(d.getTime() - daysBack * DAY_MS);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const day = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The two profile fields a rollover writes, so the data layer and its caller agree on the
 * shape without either restating it. */
export function seasonRollover(profile: Pick<ProfileDoc, "seasonId">, seasonCount: number):
  | { seasonId: number }
  | undefined {
  const seasonId = nextSeasonFor(profile, seasonCount);
  if (seasonId === undefined) return undefined;
  // The next season's clock starts when the child starts its week 1 (households.ts startClock),
  // not when the parent presses the button, so startDate is cleared rather than set here.
  return { seasonId };
}
