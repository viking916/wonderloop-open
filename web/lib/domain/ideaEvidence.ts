// View-level grouping for the idea box's evidence list (polish pass, 15 September 2026). An idea
// used across several problems inside the same step (a problem set) resolves to the same
// "<step> . <quest> (week N)" display label once per problem -- lib/domain/ideas.ts's metIdeas
// correctly keeps those as distinct problemIds (they are distinct problems), but the box showed
// the identical label five times in a row, which read as a broken list rather than five separate
// facts. This groups already-resolved display labels by their text, in the order each distinct
// label first appeared, and folds the repeat count into the line itself instead of repeating the
// line. Pure presentation: lib/domain/ideas.ts's own "what counts as met" semantics are untouched.

const WEEK_SUFFIX = /\s*\(week (\d+)\)\s*$/;

/**
 * Turns a resolved label such as "Warm-up . Fractions are slices, and true or false (week 1)"
 * into the comma-joined prose reading used once occurrences are grouped: "Warm-up, Fractions are
 * slices, and true or false, week 1". A label with no " . " separator or week suffix passes
 * through unchanged.
 */
function toProseLine(label: string): string {
  const weekMatch = label.match(WEEK_SUFFIX);
  const withoutWeek = weekMatch ? label.slice(0, weekMatch.index) : label;
  const prose = withoutWeek.split(" · ").join(", ");
  return weekMatch ? `${prose}, week ${weekMatch[1]}` : prose;
}

export type GroupedEvidenceLine = { text: string; count: number };

/**
 * Groups already-resolved evidence labels by identical text, keeping the order each distinct
 * label first appears in, and rewrites a repeated label as one line, "<label in prose>, N times",
 * rather than N identical lines. A label seen once keeps its prose form with no count suffix.
 */
export function groupIdeaEvidenceLines(labels: string[]): GroupedEvidenceLine[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const label of labels) {
    if (!counts.has(label)) order.push(label);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return order.map((label) => {
    const count = counts.get(label) ?? 0;
    const prose = toProseLine(label);
    return { text: count > 1 ? `${prose}, ${count} times` : prose, count };
  });
}
