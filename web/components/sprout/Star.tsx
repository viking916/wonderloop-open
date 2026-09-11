/** One star, filled (earned) or an outline (not yet earned). Used by the hill's star row and by
 * ActivityPlayer's end-of-activity celebration. Purely decorative (aria-hidden): the row that
 * places these always carries its own aria-label with the count in words. */
export function Star({ earned, size = 44 }: { earned: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.6 5.9 20.9l1.3-6.7-5-4.7 6.8-.8z"
        fill={earned ? "var(--sun)" : "none"}
        stroke="var(--forest)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeDasharray={earned ? undefined : "3 3"}
      />
    </svg>
  );
}
