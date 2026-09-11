export type ProgressBarTone = "blaze" | "moss";

export interface ProgressBarProps {
  /** Percent complete, 0 to 100. */
  value: number;
  tone?: ProgressBarTone;
  label?: string;
  className?: string;
}

/** A thin progress track, kraft base with a filled bar. */
export function ProgressBar({ value, tone = "blaze", label, className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const classes = [
    "tr-bar-p",
    tone === "moss" ? "tr-bar-p--moss" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <i style={{ width: `${clamped}%` }} />
    </div>
  );
}
