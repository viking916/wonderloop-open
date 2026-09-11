import { Button } from "./Button";
import { ProgressBar } from "./ProgressBar";
import { QuestMaterials } from "./QuestMaterials";
import { Stamp } from "./Stamp";

export type TrackStatus = "done" | "current" | "todo";

export interface TrackCardProps {
  /** e.g. "Build · 60 min" */
  eyebrow: string;
  title: string;
  description: string;
  status: TrackStatus;
  /** Percent complete, 0 to 100. */
  progress: number;
  /** e.g. "Problem 5 of 9 · about 40 min left" */
  meta: string;
  ctaLabel: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  /** Shown as a rotated stamp in the corner when status is "done". */
  stampLabel?: string;
  /** A 25-item on/off pattern for the 5x5 LED picture on Build tracks. */
  ledPattern?: boolean[];
  /** Task 14: this quest's own materials ("get these ready"), and which of them are new to
   * this track this season. Omitted (not just empty) skips the checklist entirely. */
  materials?: string[];
  newMaterials?: Set<string> | string[];
  className?: string;
}

// Task 12 fix (UX audit finding 1): "todo" used to be the "default" variant -- a white box
// with a 2px border, measured visually identical to a <select>. "Start" is a primary action
// (task brief calls it out by name alongside Resume and Check), so it now gets the same
// unmistakable solid-fill treatment "current"/Resume already had.
//
// Task 20: "done"'s own CTA ("Open the journal page") used to be "ghost" (dashed) -- now
// "secondary", the tier for a real action that is not the one thing this card is for. Only one
// TrackCard on This Week is ever "current" or "todo" with something left to *start or resume*;
// a "done" card's own CTA is a real but secondary look-back, not competing for the same
// attention Resume/Start need.
const CTA_VARIANT: Record<TrackStatus, "secondary" | "primary"> = {
  done: "secondary",
  current: "primary",
  todo: "primary",
};

/** One of the three quest tracks for the week: Build, Think or Speak. */
export function TrackCard({
  eyebrow,
  title,
  description,
  status,
  progress,
  meta,
  ctaLabel,
  ctaHref,
  onCtaClick,
  stampLabel,
  ledPattern,
  materials,
  newMaterials,
  className,
}: TrackCardProps) {
  const classes = [
    "tr-track",
    status === "done" ? "tr-track--done" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const buttonProps = ctaHref ? { href: ctaHref } : { onClick: onCtaClick };

  return (
    <article className={classes}>
      {status === "done" && stampLabel ? <Stamp label={stampLabel} size="sm" /> : null}
      <div className="tr-track__head">
        <span className="tr-eyebrow">{eyebrow}</span>
        {ledPattern ? (
          <span className="tr-led5" aria-hidden="true">
            {ledPattern.map((on, i) => (
              <i key={i} className={on ? "on" : undefined} />
            ))}
          </span>
        ) : null}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <ProgressBar value={progress} tone={status === "done" ? "moss" : "blaze"} label={`${title} progress`} />
      <div className="tr-track__meta">{meta}</div>
      {materials ? <QuestMaterials materials={materials} newMaterials={newMaterials} /> : null}
      <Button variant={CTA_VARIANT[status]} {...buttonProps}>
        {ctaLabel}
      </Button>
    </article>
  );
}
