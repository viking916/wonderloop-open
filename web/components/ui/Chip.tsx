import type { HTMLAttributes, ReactNode } from "react";

export type ChipTone = "neutral" | "money" | "flag" | "positive" | "progress";

export interface ChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  tone?: ChipTone;
  className?: string;
  children: ReactNode;
}

/** A small pill label -- this app's whole "Status" tier (task 20): a subject tag, a state like
 * "Done" or "Already have this", never a control. Deliberately unlike a button on every axis a
 * glance can catch, not just colour: a pill, not a rounded rectangle; ~24px tall against a
 * button's 48px; a small mono-spaced label, not bold body text; and never a border, dashed or
 * otherwise (task 20's hard rule: dashed means "button" in this app, so a status chip can never
 * wear one without starting to look pressable again).
 *
 * "flag" (task 14) marks something newly needed -- the season shopping list's "soon" items, and
 * a quest's materials not needed by any earlier week. "positive" (task 20) marks a state that is
 * done or satisfied -- a finished track, an approved explain-it answer, an item already bought.
 * "progress" (task 20) marks a state actively under way -- a track that is neither done nor
 * unstarted. Neither borrows "money"'s look, and neither is used for anything but a genuine
 * completion/progress state. */
export function Chip({ tone = "neutral", className, children, ...rest }: ChipProps) {
  const classes = [
    "tr-chip",
    tone === "money" ? "tr-chip--money" : "",
    tone === "flag" ? "tr-chip--flag" : "",
    tone === "positive" ? "tr-chip--positive" : "",
    tone === "progress" ? "tr-chip--progress" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
