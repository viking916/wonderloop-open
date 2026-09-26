"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useDelayedPending } from "@/lib/pendingTiming";

/**
 * Owner report: "Start", "Open the Ladder", "Back to This week" and "Open as Explorer" load a
 * new screen and currently look dead while the browser or router is busy. Mounted once from the
 * root layout (app/layout.tsx); see app/globals.css's ".tr-route-progress" block for the visual.
 *
 * Next 16's App Router has no public "a navigation just started" event to subscribe to.
 * useLinkStatus (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-link-status.md)
 * only reports the pending state of the one <Link> it is rendered underneath, which cannot drive
 * a single top-of-viewport bar shared by every navigating control in the app. useRouter()
 * (node_modules/next/dist/client/components/navigation.d.ts) exposes no pending flag at all.
 *
 * What this uses instead: a capture of same-tab, same-origin anchor clicks that actually target a
 * different URL, as the "a navigation just started" signal (covers both a plain <a href> and a
 * next/link <Link>, which renders one); usePathname()/useSearchParams() as the "usePathname-based
 * transition" the task names, confirming when a client-side navigation has actually landed.
 *
 * Two different navigations, two different paint strategies. Button.tsx's `href` form and
 * ExplorerNav now render a real next/link <Link> for every internal route (Button.tsx's own
 * isClientRoute doc comment has the full story), marking that anchor data-tr-nav="client" --
 * for those, React never loses the page out from under it, so the ordinary state-driven path
 * below (setActive, gated by useDelayedPending's PENDING_SHOW_DELAY_MS/PENDING_MIN_VISIBLE_MS so
 * a fast landing never flashes it) works exactly as designed. Anything else clicked here -- a
 * plain <a href> with no such marker, still the shape of a few internal links not yet converted
 * (components/quest/QuestShell.tsx's "Back to This Week" sentence link, for one), and every
 * external link -- is a full document load: a previous agent proved with non-blocking CDP
 * screenshots that for exactly this shape, the click handler runs and calls setActive(true), but
 * Chromium can replace the document before React's own commit ever paints that state change. So
 * for an unmarked anchor this handler also writes the bar's own opacity directly onto its DOM
 * node, synchronously, in the same capture-phase listener that read the click -- a real mutation
 * already in the page before this function returns, not a scheduled one -- which is what actually
 * painted in that proof. The wait is guaranteed for a real hard navigation (the document is about
 * to be torn down regardless), so this skips the show delay outright; the routeKey effect below
 * still clears the same inline style on a landed route change, in case a click was ever
 * misclassified as a hard navigation and the page did not, in fact, unload.
 *
 * Known gap: a navigation started from a plain <button onClick> that calls router.push() or
 * window.location itself (WeekPlan's "Open as Explorer" is exactly this, on purpose -- see that
 * component's own comment) is invisible to a click listener scoped to anchors, and Next 16
 * exposes nothing else this component could watch instead without wrapping every such call site
 * -- out of scope for "build the shared mechanism only". Once such a caller adopts Button's own
 * `pending` support (a Promise-returning onClick, or an explicit `pending` prop), the button
 * itself gets a spinner regardless of this bar's own gap.
 */
export function RouteProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const visible = useDelayedPending(active);
  const barRef = useRef<HTMLDivElement | null>(null);

  // The route (path or query) actually changed: whatever navigation was in flight has landed.
  // Folded into render rather than an effect (react.dev, "Adjusting some state when a prop
  // changes") -- there is no external system to synchronize with here, only React's own state
  // reacting to React's own committed route, and a ref cannot be read or written during render
  // (this file's own eslint run enforces exactly that), so the "previous value" side of the
  // comparison is state too.
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [lastRouteKey, setLastRouteKey] = useState(routeKey);
  if (lastRouteKey !== routeKey) {
    setLastRouteKey(routeKey);
    if (active) setActive(false);
  }

  // Undoes the direct DOM write in handleClick below, in case a click that took the immediate
  // hard-navigation path turned out to land as a client-side route change after all (a missing
  // data-tr-nav marker, say) -- without this, that forced opacity would otherwise never clear,
  // since nothing else in this component owns it once it has been set. A genuine hard navigation
  // never runs this effect again: the whole document, this component included, is gone by then.
  // An effect, not the render-time branch above, because a ref may never be read or written
  // during render (react.dev, useRef -- and this file's own eslint run enforces exactly that).
  useEffect(() => {
    if (barRef.current) {
      barRef.current.style.opacity = "";
      barRef.current.style.transition = "";
    }
  }, [routeKey]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!anchor || !(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Same pathname and query -- a hash link, or a link back to exactly where we already are.
      // Nothing loads, so nothing should show.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      setActive(true);

      // The hard-navigation paint fix (see this file's own doc comment above): an anchor that
      // Button.tsx/ExplorerNav did not mark data-tr-nav="client" is a plain <a href>, which is a
      // full document load, not a client transition -- React's setActive(true) above is not
      // guaranteed to paint before Chromium tears this document down for one of those. Mutate the
      // bar's own node directly and synchronously, right here in the same capture-phase handler
      // that read the click, so there is a real paint for the browser to show before it navigates
      // away. No transition and no PENDING_SHOW_DELAY_MS wait: the document is about to unload
      // regardless, so the wait is already guaranteed and a fade-in would only cost visible time.
      if (anchor.dataset.trNav !== "client" && barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.opacity = "1";
      }
    }

    // Capture, not bubble: this must run, and must have already written the DOM, before the
    // click finishes dispatching and the browser acts on the anchor's own default navigation.
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return (
    <div ref={barRef} className="tr-route-progress" aria-hidden="true" data-visible={visible ? "true" : undefined}>
      {/* Always in the DOM, not just once `visible`: the hard-navigation path above shows this
          element by writing the parent's opacity directly, and it needs the animated fill
          already there to reveal, not a bare kraft strip with nothing moving on it. Its own
          animation runs regardless of visibility -- cheap, and the parent's opacity: 0 hides it
          the rest of the time -- so there is nothing left for a delayed re-render to add. */}
      <i />
    </div>
  );
}
