// This Week's "which week is it" arithmetic. No Firebase, no React, no Date.now(): "now" always
// arrives as an explicit ms parameter, matching review.ts's convention, so a caller (or a test)
// controls the clock instead of this module reading it.
//
// Owner decision, 13 September 2026: a week is bounded by finishing it, not by a date. He could
// not tell what his child had actually finished because the app had moved on by the calendar
// while the work had not. currentWeekFromDone replaces the old date-driven currentWeekFor: the
// caller works out, from each week's real content and progress, which of the twelve weeks are
// done, and this module only ever answers "which is the first one that is not". Nothing here
// reads a startDate or a season calendar any more.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parses a "YYYY-MM-DD" date-only string (ProfileDoc.startDate, pausedAt) as local midnight.
 * Returns null for anything else, so a malformed date never throws here. */
function parseDateOnly(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const ms = new Date(Number(y), Number(m) - 1, Number(d)).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Midnight on the Monday on or before `now`. */
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
 * The current week: the first of the twelve, in order, that is not yet done. `doneByWeek[i]` is
 * whether week `i + 1` is done (its caller's own rule -- for an Explorer, every one of that
 * profile's tracks status "done"; for a Sprout, every activity done; see
 * app/explorer/page.tsx and app/sprout/page.tsx). A short or empty array is treated as "nothing
 * recorded yet", so it never throws, only ever answers week 1. Once every week (1 through 12) is
 * done, the season is finished and the child stays on week 12 rather than running off the end.
 */
export function currentWeekFromDone(doneByWeek: boolean[]): number {
  for (let i = 0; i < 12; i++) {
    if (!doneByWeek[i]) return i + 1;
  }
  return 12;
}

/** Today as "YYYY-MM-DD" (local), the form ProfileDoc.startDate and pausedAt use. */
export function dateOnly(now: number): string {
  return formatDateOnly(now);
}

export function calendarWeekRange(now: number): { startId: string; endId: string } {
  const startMs = mondayMs(now);
  return { startId: formatDateOnly(startMs), endId: formatDateOnly(startMs + 6 * DAY_MS) };
}
