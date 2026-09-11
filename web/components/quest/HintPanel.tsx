export type HintPanelProps = {
  hints: readonly [string, string];
  /** How many authored hints are unlocked (spec 7.3: tier 1 after try one, tier 2 after try
   * two). */
  unlocked: 0 | 1 | 2;
  /** Tier 3: the problem's authored Socratic question (schema.ts's socraticHint). Written to
   * ask, not tell, so it is not part of the "how many are unlocked" tell-more sequence above:
   * it either shows, once tier3Available, or it does not. */
  socraticHint: string;
  /** True once the child has used two tries (lib/domain/attempts.ts's tier3HintAvailable).
   * Reuses that same unlock moment as hint 2, since both exist to help before the last try. */
  tier3Available: boolean;
};

/** Shows every tell-more hint unlocked so far, cumulatively (once hint 2 is unlocked, hint 1
 * stays visible: he does not lose it), plus the tier-3 Socratic question once it is available.
 * Renders nothing before the first wrong answer. */
export function HintPanel({ hints, unlocked, socraticHint, tier3Available }: HintPanelProps) {
  if (unlocked === 0) return null;
  return (
    <div className="tr-hint">
      {hints.slice(0, unlocked).map((hint, i) => (
        <div key={i} className="tr-hint__item">
          <span className="tr-eyebrow">Hint {i + 1}</span>
          <p>{hint}</p>
        </div>
      ))}
      {tier3Available ? (
        <div className="tr-hint__item">
          <span className="tr-eyebrow">Think about it</span>
          <p>{socraticHint}</p>
        </div>
      ) : null}
    </div>
  );
}
