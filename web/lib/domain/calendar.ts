// This Week's "which week is it" arithmetic (spec 7.1 screen 2). No Firebase, no React, no
// Date.now(): "now" always arrives as an explicit ms parameter, matching review.ts's convention,
// so a caller (or a test) controls the clock instead of this module reading it.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parses a "YYYY-MM-DD" date-only string (calendar.json's seasonStart, ProfileDoc.startDate)
 * as local midnight. Returns null for anything else, so a malformed date never throws here. */
function parseDateOnly(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const ms = new Date(Number(y), Number(m) - 1, Number(d)).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Midnight on the Monday on or before `now` (a clock that has not started counts from this week). */
function mondayMs(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime() - ((d.getDay() + 6) % 7) * DAY_MS;
}

function formatDateOnly(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The current week number: floor(days since the season start / 7) + 1, clamped to 1..12
 * (task 8 brief). Prefers the profile's own startDate; falls back to the season calendar's
 * seasonStart when the profile's date is missing or unparseable, and to `now` itself (week 1)
 * if both are, so a malformed profile document never throws here, only ever under-informs.
 */
/** A profile with no startDate has not started its season: it is on week 1, whatever the date
 * (6 September 2026: the week clock is the child's own, it starts on their first saved step). */
export function currentWeekFor(profileStartDate: string | undefined, seasonStart: string, now: number, pausedAt?: string): number {
  if (!profileStartDate) return 1;
  const startMs = parseDateOnly(profileStartDate) ?? parseDateOnly(seasonStart) ?? now;
  // A paused clock (owner decision, 6 September 2026: the child pauses whenever they want) is
  // read as of the day it was paused, so the week stops moving until the clock resumes.
  const pausedMs = pausedAt ? parseDateOnly(pausedAt) : null;
  const effectiveNow = pausedMs !== null && pausedMs < now ? pausedMs : now;
  const daysSinceStart = Math.floor((effectiveNow - startMs) / DAY_MS);
  const week = Math.floor(daysSinceStart / 7) + 1;
  return Math.max(1, Math.min(12, week));
}

/** Today as "YYYY-MM-DD" (local), the form ProfileDoc.startDate and pausedAt use. */
export function dateOnly(now: number): string {
  return formatDateOnly(now);
}

/**
 * Where startDate lands once a clock paused on `pausedAt` resumes at `now`: moved forward by the
 * whole days paused, so the child is on the same week and the same day of it as when they
 * stopped. A malformed date leaves startDate untouched, which is the safe failure (the week
 * jumps forward rather than the profile breaking).
 */
export function resumedStartDate(startDate: string, pausedAt: string, now: number): string {
  const startMs = parseDateOnly(startDate);
  const pausedMs = parseDateOnly(pausedAt);
  if (startMs === null || pausedMs === null) return startDate;
  const pausedDays = Math.max(0, Math.floor((now - pausedMs) / DAY_MS));
  return formatDateOnly(startMs + pausedDays * DAY_MS);
}

/**
 * The "YYYY-MM-DD" screenTime document ids (lib/data/progress.ts's todayId) that fall inside
 * the given week (1-12), inclusive, so the Parent view can sum a Sprout profile's screen time
 * for a whole week rather than only today. Mirrors currentWeekFor's own date arithmetic and the
 * same startDate-then-seasonStart fallback, so "week 3" always means the same seven days as the
 * rest of the app already agrees it does. `now` is the final fallback (both dates missing or
 * unparseable), matching this module's own rule (see file header): no Date.now() here, the
 * caller always supplies "now".
 */
export function weekDateRange(profileStartDate: string | undefined, seasonStart: string, week: number, now: number): { startId: string; endId: string } {
  const startMs = (profileStartDate ? parseDateOnly(profileStartDate) : null) ?? mondayMs(now);
  const weekStartMs = startMs + (week - 1) * 7 * DAY_MS;
  const weekEndMs = weekStartMs + 6 * DAY_MS;
  return { startId: formatDateOnly(weekStartMs), endId: formatDateOnly(weekEndMs) };
}
