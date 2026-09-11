"use client";

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Task 20's control taxonomy (see app/globals.css's "Button" block for the full rationale):
 *   - "primary": the one thing this screen or section is for. At most one per group.
 *   - "secondary": a real, always-visible dashboard action that is not the one thing (Rename,
 *     Add activity, Mark as bought, Open as Explorer).
 *   - "quiet": low-stakes, easily reversible, visually recessive (Back, Cancel, Skip for now).
 *   - "destructive": a reset that permanently deletes a child's work. Never used for anything
 *     else -- see ConfirmResetButton, the only place this app ever needs it.
 *   - "default": exists only for SwitchProfileButton, whose fill must hold contrast on the dark
 *     forest header regardless of what is behind it. Never used next to a field, and never for a
 *     general-purpose action -- see that component's own comment.
 */
export type ButtonVariant = "default" | "primary" | "secondary" | "quiet" | "destructive";

type CommonProps = {
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
    href?: undefined;
  };

type ButtonAsAnchor = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className"> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

/** The destructive tier's non-colour marker (task 20: "must be distinguishable from the others
 * without relying on colour alone, since colour blindness is common in boys and the parent may
 * be colour blind too"). A filled warning triangle, not an outline, so it stays legible at the
 * small size a button icon renders at. */
function DestructiveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M12 3.5 22 20.5H2z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <rect x="11" y="10" width="2" height="5.5" rx="1" fill="var(--cream)" />
      <rect x="11" y="17" width="2" height="2" rx="1" fill="var(--cream)" />
    </svg>
  );
}

/** A Trail-styled button. Renders an anchor when `href` is given, otherwise a button.
 *
 * variant="destructive" always renders a warning-triangle icon before its label -- callers never
 * pass their own icon for it, so every reset in the app carries the identical, unmistakable mark
 * (task 20: shape and icon, not colour, are what tell a colour-blind parent this one is
 * different). */
export function Button(props: ButtonProps) {
  const { variant = "default", className, children, href, ...rest } = props;
  const classes = [
    "tr-btn",
    variant !== "default" ? `tr-btn--${variant}` : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const content = variant === "destructive" ? (
    <>
      <DestructiveIcon />
      {children}
    </>
  ) : (
    children
  );

  if (href !== undefined) {
    return (
      <a href={href} className={classes} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" className={classes} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {content}
    </button>
  );
}
