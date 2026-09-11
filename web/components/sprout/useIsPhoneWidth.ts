"use client";

import { useEffect, useState } from "react";

/** Matches app/globals.css's `@media (max-width: 700px)` rule (the one that already shrinks
 * .sp-thing__pill's icon on a narrow screen) -- kept as one named constant so the JS layout
 * decision below and that CSS breakpoint can never quietly drift apart. */
export const PHONE_MAX_WIDTH = 700;

/**
 * Whether the real viewport is at or under phone width (Task 16). Hill.tsx needs this, not just
 * the CSS breakpoint that already shrinks the pill icon: at phone width the three activity pills
 * also need a different, gate-safe *position* table (see PHONE_THING_POSITIONS in Hill.tsx), and
 * that has to be picked in JS the same way useIsLandscape already picks a position table.
 *
 * Driven entirely by window.innerWidth, the same signal useIsLandscape uses and for the same
 * reason: no navigator.userAgent guess, since iPadOS Safari can report a desktop-class UA.
 *
 * Starts `false` on every render before the first effect runs (matching what the server renders
 * and what the client's first paint shows, so hydration never mismatches -- same pattern as
 * useIsLandscape), then corrects itself a beat later once `window` exists, and keeps tracking
 * resize for as long as the component stays mounted.
 */
export function useIsPhoneWidth(): boolean {
  const [phone, setPhone] = useState(false);

  useEffect(() => {
    const update = () => setPhone(window.innerWidth <= PHONE_MAX_WIDTH);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return phone;
}
