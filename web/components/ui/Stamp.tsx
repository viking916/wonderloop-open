import type { HTMLAttributes } from "react";

export type StampSize = "sm" | "lg";
export type StampTone = "moss" | "blaze";

export interface StampProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  /** Stamp text; a newline splits it onto a second line, as in "done\ntue". */
  label: string;
  size?: StampSize;
  tone?: StampTone;
  className?: string;
}

/** A rotated circular stamp marking a finished track or journal spread. */
export function Stamp({ label, size = "sm", tone, className, ...rest }: StampProps) {
  const resolvedTone = tone ?? (size === "lg" ? "blaze" : "moss");
  const classes = [
    "tr-stamp",
    size === "lg" ? "tr-stamp--lg" : "tr-stamp--sm",
    `tr-stamp--${resolvedTone}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const lines = label.split("\n");

  return (
    <div className={classes} {...rest}>
      <span>
        {lines.map((line, i) => (
          <span key={line + i}>
            {i > 0 ? <br /> : null}
            {line}
          </span>
        ))}
      </span>
    </div>
  );
}
