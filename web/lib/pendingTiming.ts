// Shared anti-flicker timing for anything that says "this is taking a moment": Button's own
// pending spinner (components/ui/Button.tsx), useAsyncAction (this folder), and the route change
// progress bar (components/RouteProgressBar.tsx). One module, one pair of numbers, so the three
// places this app shows a "working" indicator can never drift apart from each other.
//
// Owner report: "Many times when I press button nothing happens instantly so it makes me feel
// like something is broken." The fix is a loading indicator on the thing that was pressed, but a
// naive "show it whenever pending" flashes a spinner on and instantly off for anything that
// finishes fast, which reads as a glitch, not feedback -- so every indicator in this app waits
// out PENDING_SHOW_DELAY_MS before appearing, and once it has appeared, stays for at least
// PENDING_MIN_VISIBLE_MS even if the action already finished.

import { useEffect, useRef, useState } from "react";

/** How long an action has to stay in flight before any spinner/bar/indicator appears at all.
 * Below this, nothing is shown. */
export const PENDING_SHOW_DELAY_MS = 120;

/** Once an indicator has actually appeared, it stays up at least this long even if the action
 * settles a moment later, so it never flashes for a few milliseconds and vanishes before anyone
 * can register it. */
export const PENDING_MIN_VISIBLE_MS = 400;

/**
 * Turns a raw "is this active right now" boolean into "should the indicator be visible right
 * now", debounced by the two constants above. Used directly by useAsyncAction, and by
 * Button.tsx and RouteProgressBar.tsx the same way, so all three share one implementation of the
 * timing rule as well as the two numbers.
 *
 * `active` toggling true -> false -> true faster than PENDING_SHOW_DELAY_MS never shows anything
 * (kept re-entrant: each change replaces the previous effect's timers via its cleanup). `active`
 * going true for longer than that shows the indicator after the delay, and once shown it will not
 * go false again until PENDING_MIN_VISIBLE_MS has elapsed since it appeared, however soon `active`
 * itself returns to false.
 */
export function useDelayedPending(active: boolean): boolean {
  const [visible, setVisible] = useState(false);
  // Not state: read inside the effect below to compute "how long has it been shown", never used
  // to drive a render directly.
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    if (active) {
      showTimer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, PENDING_SHOW_DELAY_MS);
    } else if (shownAtRef.current !== null) {
      const elapsed = Date.now() - shownAtRef.current;
      const remaining = Math.max(0, PENDING_MIN_VISIBLE_MS - elapsed);
      hideTimer = setTimeout(() => {
        setVisible(false);
        shownAtRef.current = null;
      }, remaining);
    } else {
      setVisible(false);
    }

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [active]);

  return visible;
}
