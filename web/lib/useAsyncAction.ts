// useAsyncAction: the same "something is happening" mechanism as Button.tsx's own pending
// support, for the places that are not a Button -- a form submit, a file input's onChange, a
// card press, a select's onChange. See app/globals.css's Button block and Button.tsx's own doc
// comment for the taxonomy this pairs with; see lib/pendingTiming.ts for the anti-flicker timing
// both share, so the numbers can never drift between the two.

import { useCallback, useRef, useState } from "react";
import { useDelayedPending } from "./pendingTiming";

export interface UseAsyncActionResult<Args extends unknown[]> {
  /** Call this instead of the wrapped action directly. Ignored (a no-op) while a previous call
   * is still in flight -- the same "blocks repeat activation" rule Button.tsx applies to a
   * pending click, so a second tap on a slow card or a double-submit of a slow form cannot start
   * a second run underneath the first. */
  run: (...args: Args) => Promise<void>;
  /** True once the current run has been in flight for about PENDING_SHOW_DELAY_MS, false again
   * once it has settled and shown for at least PENDING_MIN_VISIBLE_MS. Drive a spinner, an
   * aria-busy, or a disabled state from this -- never from a raw "am I awaiting something" flag,
   * or a fast action will strobe it. */
  pending: boolean;
  /** The error thrown by the most recent run, or undefined once a run has started again or has
   * succeeded. run() always re-throws after recording this, so the caller's own error handling
   * (a toast, a form-level message) still runs exactly as if useAsyncAction were not here. */
  error: unknown;
}

/** Wraps an async function with the shared pending/error bookkeeping. `action` may change across
 * renders (it is read fresh on every call, not captured once), but only one call is ever allowed
 * in flight at a time regardless of which `action` reference started it. */
export function useAsyncAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<unknown>
): UseAsyncActionResult<Args> {
  // A ref, not the `active` state below, gates re-entrancy: state updates are batched and would
  // not be visible yet to a second call made synchronously after the first (e.g. two rapid
  // clicks in the same tick), which a ref reads and writes immediately. Read and written only
  // from inside the run() callback below, never during render.
  const activeRef = useRef(false);

  const [active, setActive] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const pending = useDelayedPending(active);

  const run = useCallback(
    async (...args: Args) => {
      if (activeRef.current) return;
      activeRef.current = true;
      setActive(true);
      setError(undefined);
      try {
        await action(...args);
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        activeRef.current = false;
        setActive(false);
      }
    },
    [action]
  );

  return { run, pending, error };
}
