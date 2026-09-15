import type { HTMLAttributes, ReactNode } from "react";

export type PatchState = "earned" | "locked";

export interface PatchProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  label: string;
  icon?: ReactNode;
  state: PatchState;
  /**
   * One short line under the badge: the date and time it was earned (state "earned"), or a
   * plain, one-sentence invitation for what would earn it (state "locked"). Never a count of
   * what is missing, a fraction or a percentage -- see components/portfolio/PatchSash.tsx.
   */
  caption?: string;
  className?: string;
}

/**
 * A sash patch, earned for firsts and for showing up, never for speed. Earned renders as a
 * medal (a solid cream circle, double gold border, matching task 33's "lead with what he has
 * earned"); locked renders as a light, dashed, non-circular row -- still never shaped like a
 * button (app/globals.css's Button block comment: dashed is reserved for a genuinely empty or
 * placeholder panel, never a control). No animation: this is a quiet, static wall, not a
 * celebration -- that is owned elsewhere.
 * Designed to sit on a dark (forest) surface, matching the portfolio sash.
 */
export function Patch({ label, icon, state, caption, className, ...rest }: PatchProps) {
  const classes = [
    "tr-patch",
    state === "earned" ? "tr-patch--earned" : "tr-patch--locked",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="tr-patch-tile" {...rest}>
      <div className={classes}>
        <span>
          {icon}
          {label}
        </span>
      </div>
      {caption ? <p className="tr-patch-tile__caption">{caption}</p> : null}
    </div>
  );
}
