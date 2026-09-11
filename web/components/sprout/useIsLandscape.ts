"use client";

import { useEffect, useState } from "react";

/**
 * Whether the real viewport is wider than it is tall right now (Task 15: landscape is Sprout's
 * primary orientation on the iPad it runs on, at the owner's instruction -- "more room, easier to
 * navigate"). Driven entirely by window.innerWidth/innerHeight, never by navigator.userAgent:
 * iPadOS Safari requests desktop sites by default and can report a desktop-class user agent, so
 * any UA-based guess would happily hand an iPad the wrong layout. This only ever looks at actual
 * geometry (Task 15, 1b).
 *
 * Starts `true` on every render before the first effect runs -- matching what the server renders
 * (no `window` there) and what the client's very first paint shows, so hydration never mismatches
 * -- then corrects itself to the real value a beat later once `window` exists, and keeps tracking
 * resize/orientation changes for as long as the component stays mounted (rotating the iPad, or
 * Safari's own dynamic toolbar resizing the viewport).
 */
export function useIsLandscape(): boolean {
  const [landscape, setLandscape] = useState(true);

  useEffect(() => {
    const update = () => setLandscape(window.innerWidth >= window.innerHeight);
    update();
    const query = window.matchMedia("(orientation: landscape)");
    // Safari (including iPadOS) has shipped addEventListener on MediaQueryList for years now,
    // but this stays defensive rather than assuming it: resize below is the real fallback, this
    // is just the fast path for rotation specifically.
    query.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    return () => {
      query.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return landscape;
}
