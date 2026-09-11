import type { HTMLAttributes, ReactNode } from "react";

export type CardTone = "surface" | "kraft" | "forest";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  tone?: CardTone;
  shadow?: boolean;
  className?: string;
  children: ReactNode;
}

/** A Trail surface: the base container used by tracks, notes and panels. */
export function Card({ tone = "surface", shadow = false, className, children, ...rest }: CardProps) {
  const classes = [
    "tr-card",
    `tr-card--${tone}`,
    shadow ? "tr-card--shadow" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
