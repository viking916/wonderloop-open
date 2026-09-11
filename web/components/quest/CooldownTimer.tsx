/** Formats a millisecond duration as "m:ss", rounding up so the display never shows 0:00 while
 * time is technically still left (matches TypingStep's mm:ss convention). */
export function formatMMSS(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type CooldownTimerProps = {
  /** The epoch ms the wait ends at. */
  targetMs: number;
  /** The caller's own ticking clock (never Date.now() here, so this stays pure and testable). */
  now: number;
  label: string;
};

/**
 * A live countdown, reused for both waits the problem player shows: the 45 s cooldown after a
 * wrong answer, and the think-time floor holding the worked explanation shut after the third
 * try. The caller supplies `now` from its own ticking state and decides when the wait is over
 * (this component never hides itself); ProblemPlayer stops rendering it once the target has
 * passed.
 */
export function CooldownTimer({ targetMs, now, label }: CooldownTimerProps) {
  const remaining = Math.max(0, targetMs - now);
  return (
    <div className="tr-timer" aria-live="polite">
      <div className="tr-timer__big">{formatMMSS(remaining)}</div>
      <p className="tr-timer__label">{label}</p>
    </div>
  );
}
