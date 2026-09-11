// format.ts: small display-string helpers shared across components. Not a domain module (no
// business rule lives here, only Intl formatting), so it stays outside lib/domain/.

/** "August 29, 2:14 PM" style timestamp, used anywhere a component shows when something
 * happened (a log, an explain-it answer, a fast-fail flag, a reset). Previously duplicated
 * verbatim in MistakeBox.tsx and LogList.tsx (task 13 review, Minor #1). */
export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "August 29" style date, no time -- used for a future or scheduled date (a mistake-box due
 * date, the This Week side strip's "returns"), where a time of day would be noise. Previously
 * duplicated verbatim in SideStrip.tsx and MistakeBox.tsx (final whole-branch review, minor). */
export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}
