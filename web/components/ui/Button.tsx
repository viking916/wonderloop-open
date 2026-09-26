"use client";

import Link from "next/link";
import {
  useCallback,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useDelayedPending } from "@/lib/pendingTiming";

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

/** Loading-indicator support (owner report: "Many times when I press button nothing happens
 * instantly so it makes me feel like something is broken"). See lib/pendingTiming.ts for the
 * shared anti-flicker timing and lib/useAsyncAction.ts for the equivalent mechanism outside a
 * Button.
 *
 * Automatic tracking: if `onClick` returns a Promise and the caller has not passed `pending`
 * itself, the Button watches that one Promise and is pending from the click until it settles
 * (resolve or reject) -- no wiring required at the call site. A caller that already owns a busy
 * flag (ArtifactStep's "Saving...", ProblemPlayer's `busy`) keeps working unchanged; pass
 * `pending` explicitly to opt into this component's spinner/aria-busy/blocked-repeat-click
 * treatment instead of, or in addition to, that flag. `pending` is also read on an anchor
 * (`href`) Button, for a navigation link whose "pending" reason has nothing to do with its own
 * onClick.
 *
 * While pending, the button never takes on the disabled kraft fill (app/globals.css's own
 * comment on that rule: a washed-out primary reads as a rendering fault, not a control on pause)
 * -- it keeps its tier's own colour and label, sets aria-busy, blocks a repeat click by ignoring
 * it (never by setting the real `disabled` attribute, so focus is not lost and the control stays
 * legible), and switches the cursor to "progress", all of that immediately (blocking a click is
 * a correctness rule, not a flourish, so it is never delayed). Only the spinner itself, and the
 * aria-live announcement below, wait out PENDING_SHOW_DELAY_MS first -- see lib/pendingTiming.ts.
 * A rejection is never swallowed: pending clears and the same Promise the caller already holds
 * still rejects for their own error handling to see. */
type PendingProps = {
  /** Force the pending treatment on or off, overriding automatic Promise tracking entirely.
   * Leave unset to let a Promise-returning onClick drive this itself. */
  pending?: boolean;
  /** What the polite live region announces while pending is actually showing (see
   * PENDING_SHOW_DELAY_MS -- a fast action never announces anything either). Default "Working";
   * override with something that names the action when more than one control on screen could be
   * pending at once ("Saving your answer"). */
  pendingLabel?: string;
};

type CommonProps = PendingProps & {
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "onClick"> & {
    href?: undefined;
    /** May return a Promise -- see the pending-support doc comment above. */
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<unknown>;
  };

type ButtonAsAnchor = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "onClick"> & {
    href: string;
    /** May return a Promise -- see the pending-support doc comment above. */
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void | Promise<unknown>;
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

/**
 * Whether an anchor-form Button's `href` should navigate through next/link's client transition
 * instead of a plain `<a>` full page load. This is the actual fix for the defect a previous
 * agent proved with non-blocking CDP screenshots: "Start", "Resume" and "Open the Ladder" all
 * render through this anchor form, and a plain `<a href>` is a full document load, which tears
 * the page down before React's own pending state ever gets a chance to paint. next/link keeps
 * the navigation client-side, so React paints normally and RouteProgressBar (which now marks a
 * client-nav anchor with data-tr-nav="client", see that file's own doc comment) can apply its
 * ordinary delayed timing instead of the hard-navigation fallback.
 *
 * External destinations (a URL with its own scheme, `mailto:`, `tel:`, protocol-relative `//`)
 * and anything that must stay a real browser navigation (`target` other than `_self`, or
 * `download`) are left as an ordinary `<a>` -- next/link cannot usefully wrap either, and a
 * caller reaching for `target="_blank"` or `download` wants the browser's own handling.
 */
function isClientRoute(href: string, rest: { target?: string; download?: unknown }): boolean {
  if (rest.download !== undefined) return false;
  if (rest.target !== undefined && rest.target !== "_self") return false;
  return href.startsWith("/") && !href.startsWith("//");
}

/** The pending spinner. Purely decorative (the aria-live span below carries the announcement),
 * and under prefers-reduced-motion the CSS swaps it to a static dashed ring rather than relying
 * on the app-wide animation freeze (app/globals.css) to happen to leave it looking deliberate --
 * see that rule's own comment for why a frozen single frame of a spinning ring is not good enough
 * on its own. */
function Spinner() {
  return <span className="tr-btn__spinner" aria-hidden="true" />;
}

/** A Trail-styled button. Renders an anchor when `href` is given, otherwise a button.
 *
 * variant="destructive" always renders a warning-triangle icon before its label -- callers never
 * pass their own icon for it, so every reset in the app carries the identical, unmistakable mark
 * (task 20: shape and icon, not colour, are what tell a colour-blind parent this one is
 * different). */
export function Button(props: ButtonProps) {
  const {
    variant = "default",
    className,
    children,
    href,
    pending: explicitPending,
    pendingLabel = "Working",
    onClick,
    ...rest
  } = props;

  // Only used when the caller has not passed `pending` itself -- see isPending below.
  const [trackedPending, setTrackedPending] = useState(false);
  const isPending = explicitPending !== undefined ? explicitPending : trackedPending;
  // Post anti-flicker-delay visibility: the spinner and the live-region announcement both wait
  // for this, not for isPending directly, so a fast action never shows or announces either one.
  const showIndicator = useDelayedPending(isPending);

  // Immediate press feedback (owner report: "nothing happens instantly so it makes me feel like
  // something is broken"), the same pointerdown/up pattern Hill.tsx's own sp-thing--pressed
  // already uses on Sprout: set on pointerdown, not click, so it shows before the tap even
  // completes, and never CSS :active alone (iOS Safari, the family's real device per
  // ui-styleguide section 6, does not reliably apply :active on a plain tap). Cleared on
  // pointerup/leave/cancel so a finger that lands and drags off the control never leaves it stuck
  // looking pressed. This is a transform-only class (app/globals.css's .tr-btn--pressed) so it
  // never shifts layout and composes with every tier and with the pending spinner above it.
  const [pressed, setPressed] = useState(false);
  const pressHandlers = {
    onPointerDown: () => setPressed(true),
    onPointerUp: () => setPressed(false),
    onPointerLeave: () => setPressed(false),
    onPointerCancel: () => setPressed(false),
  };

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
      if (isPending) {
        // Blocks repeat activation by ignoring the click outright, never by setting `disabled`
        // -- ui-styleguide section 1: a control that explains it is busy beats one that looks
        // dead, and a real `disabled` would drop focus and trigger the kraft disabled fill.
        event.preventDefault();
        return;
      }
      const result = (onClick as ((event: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void | Promise<unknown>) | undefined)?.(
        event
      );
      if (
        explicitPending === undefined &&
        result != null &&
        typeof (result as PromiseLike<unknown>).then === "function"
      ) {
        setTrackedPending(true);
        // Both arms clear the same way and neither rethrows -- not to swallow the rejection
        // (the original Promise `result` is untouched: anyone else already holding that same
        // reference, e.g. a caller with its own .catch, still sees it reject exactly as it
        // always would have), only so *this* attached handler's own derived Promise resolves
        // instead of rejecting. A plain .finally() here would leave that derived Promise
        // rejected and unobserved by anyone, reporting a second, spurious "unhandled rejection"
        // for every rejected auto-tracked action on top of whatever the caller does with it.
        (result as Promise<unknown>).then(
          () => setTrackedPending(false),
          () => setTrackedPending(false)
        );
      }
    },
    [isPending, onClick, explicitPending]
  );

  const classes = [
    "tr-btn",
    variant !== "default" ? `tr-btn--${variant}` : "",
    isPending ? "tr-btn--pending" : "",
    pressed ? "tr-btn--pressed" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {isPending && showIndicator ? <Spinner /> : null}
      {variant === "destructive" ? <DestructiveIcon /> : null}
      {children}
      {/* Always rendered (not only while pending) so a screen reader already has this live
       * region in the tree before its text changes -- some announce a change to existing content
       * far more reliably than a brand-new node that already has content on arrival. */}
      <span className="sr-only" aria-live="polite">
        {isPending && showIndicator ? pendingLabel : ""}
      </span>
    </>
  );

  if (href !== undefined) {
    const anchorRest = rest as AnchorHTMLAttributes<HTMLAnchorElement>;

    if (isClientRoute(href, anchorRest)) {
      return (
        <Link
          href={href}
          className={classes}
          aria-busy={isPending ? "true" : undefined}
          onClick={handleClick}
          {...anchorRest}
          {...pressHandlers}
          // RouteProgressBar's own click listener reads this to know a client transition is
          // already under way and to stay on its normal, PENDING_SHOW_DELAY_MS-gated timing
          // instead of the immediate hard-navigation fallback -- see that file's doc comment.
          data-tr-nav="client"
        >
          {content}
        </Link>
      );
    }

    return (
      <a
        href={href}
        className={classes}
        aria-busy={isPending ? "true" : undefined}
        onClick={handleClick}
        {...anchorRest}
        {...pressHandlers}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      aria-busy={isPending ? "true" : undefined}
      onClick={handleClick}
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      {...pressHandlers}
    >
      {content}
    </button>
  );
}
