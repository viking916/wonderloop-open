"use client";

import type { ReactNode } from "react";
import { Star } from "./Star";
import { useIsLandscape } from "./useIsLandscape";
import { useIsPhoneWidth } from "./useIsPhoneWidth";
import type { SproutActivity } from "@/lib/content/schema";

/** A hillside spot for one activity thing: `left` is always a percentage of the hill's own
 * width. Vertical placement is either `top` (percentage of the hill's height -- what the tablet
 * tables below use) or `bottom` (a fixed pixel offset from the hill's bottom edge -- what the
 * phone table uses instead, and why: see PHONE_THING_POSITIONS's own comment). */
type ThingPosition = { left: string; top?: string; bottom?: string };

export type HillProps = {
  activities: SproutActivity[];
  /** Which of `activities` (by id) already ended in a star this week. */
  doneIds: Set<string>;
  stars: 0 | 1 | 2 | 3;
  onOpenActivity: (activityId: string) => void;
  /** Rendered in the hill's bottom-right corner (ParentGate): the long-press exit and parent
   * card live there, never inside the child-facing scene itself. */
  parentGate: ReactNode;
};

/** One of three generic hill-object icons, cycled by position -- decorative only (spec 6/14:
 * "the three activities are things on the hill", the design demo's rocks/path/birds). The
 * child's actual round content supplies the real shapes and colours; these are just what marks
 * a spot on the hill as tappable. Shared between the portrait and landscape scenes below -- the
 * icon itself doesn't change with orientation, only where it sits. */
function HillThingArt({ index }: { index: number }) {
  if (index % 3 === 0) {
    return (
      <svg viewBox="0 0 170 150" aria-hidden="true">
        <ellipse cx="40" cy="120" rx="26" ry="18" fill="#9aa08f" />
        <ellipse cx="95" cy="112" rx="36" ry="26" fill="#7d8578" />
        <ellipse cx="145" cy="118" rx="18" ry="12" fill="#b3b8a8" />
      </svg>
    );
  }
  if (index % 3 === 1) {
    return (
      <svg viewBox="0 0 170 150" aria-hidden="true">
        <g fill="#e6d9bf" stroke="#274235" strokeWidth="3">
          <ellipse cx="30" cy="120" rx="18" ry="11" />
          <ellipse cx="75" cy="95" rx="18" ry="11" />
          <ellipse cx="120" cy="70" rx="18" ry="11" />
        </g>
        <circle cx="30" cy="95" r="12" fill="#d9432b" />
        <rect x="24" y="106" width="12" height="16" rx="4" fill="#274235" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 170 150" fill="none" stroke="#274235" strokeWidth="5" strokeLinecap="round" aria-hidden="true">
      <path d="M20 60 q15-20 30 0 q15-20 30 0" />
      <path d="M85 35 q15-20 30 0 q15-20 30 0" />
      <path d="M60 100 q15-20 30 0 q15-20 30 0" />
    </svg>
  );
}

// Tuned for the tablet-portrait viewport Sprout runs in when the iPad is held upright (Task 15:
// verified at 820x1180). All three sit inside the hill band the portrait scene below draws
// (roughly the bottom 40% of the container), never over the sun.
const PORTRAIT_THING_POSITIONS: ThingPosition[] = [
  { left: "14%", top: "66%" },
  { left: "50%", top: "80%" },
  { left: "70%", top: "60%" },
];

// Task 15, Part 2: landscape is Sprout's primary orientation (owner's instruction -- "more room,
// easier to navigate"), verified at 1194x834 and 1366x1024. Spread across the width rather than
// stacked down the middle, so the three activities are large, well separated and comfortable for
// a small finger, not a portrait layout stretched sideways. Percentages, not pixels, so this
// reflows correctly at any real landscape width (Task 15, 1b) -- and each left value stays far
// enough from 100% that .sp-thing svg's clamp(…, 16vw, 210px) ceiling (see globals.css) can never
// push a thing's box past the right edge of even the narrower 1194px iPad.
const LANDSCAPE_THING_POSITIONS: ThingPosition[] = [
  { left: "10%", top: "56%" },
  { left: "44%", top: "66%" },
  { left: "78%", top: "52%" },
];

// Task 16: the owner found the hill broken on his phone -- a cream pill's ring badge (the
// yellow "play" circle or the cream "done" checkmark) sitting on its own, oversized, with no
// card underneath it. Root cause, confirmed by measuring real getBoundingClientRect()s at
// 320/390/430 CSS px wide portrait and down to 568 CSS px wide landscape: PORTRAIT_THING_
// POSITIONS' lowest thing (50% left, 80% top) and LANDSCAPE_THING_POSITIONS' middle one (44%,
// 66%) both land underneath ParentGate's own card (.sp-foot/.sp-gate in app/globals.css, a
// FIXED-pixel-size box pinned to the hill's bottom-right corner: right 20px, bottom 18px,
// ~86px tall). Those two tables were tuned and verified only at tablet sizes (Task 15: 820x1180
// portrait, 1194x834/1366x1024 landscape), where the gate's fixed-size corner is a tiny sliver
// of a tall viewport; a `top: 80%` computes a real pixel value against the *hill's own height*,
// which shrinks right along with a shorter phone viewport, while the gate's own footprint does
// not shrink at all -- so the percentage-placed pill's bottom edge and the gate's fixed-height
// top edge close the gap and eventually cross on a short enough viewport. Neither table was
// ever wrong for the sizes it was checked at; nobody had checked a phone.
//
// The fix is a different vertical anchor, not smaller pills or a smaller gate (the brief: "Keep
// tap targets large. Do not shrink anything to make it fit."). Every phone-width thing below is
// placed with `bottom` (a fixed pixel offset from the hill's own bottom edge) instead of `top` (a
// percentage of it) -- the same units ParentGate's own card already uses to place itself. Two
// things pinned by the same kind of fixed offset keep a constant pixel gap between them no matter
// how tall or short the actual viewport is, instead of a percentage gap that can shrink to zero.
// GATE_CLEARANCE_PX is that gap's whole budget: the gate's own ~86px height, its own 18px bottom
// inset, and a real margin above that -- so a thing's bottom edge sits comfortably above the
// gate's top edge at every phone height this app supports (down to .sp-world's own 560px
// min-height floor), regardless of which orientation put it there. One shared table for both
// orientations, not a phone-portrait and a phone-landscape one: with the vertical anchor now
// pixel-fixed instead of percentage-of-height, orientation stops being the thing that decides
// whether a pill collides with the gate -- only its horizontal spread does, and the same
// left-percentages hold together in both (verified at 390 and 900 CSS px wide, portrait and
// landscape).
const GATE_CLEARANCE_PX = 140;
const PHONE_THING_POSITIONS: ThingPosition[] = [
  { left: "4%", bottom: `${GATE_CLEARANCE_PX}px` },
  { left: "36%", bottom: `${GATE_CLEARANCE_PX}px` },
  { left: "68%", bottom: `${GATE_CLEARANCE_PX}px` },
];

// Task 15, Part 3 (direction B, "Soft world, with a guide" -- design-demos/sprout-art-
// directions.html, middle panel): a fixed spot for the rabbit on each scene's empty upper
// hillside, clear of every LANDSCAPE_/PORTRAIT_THING_POSITIONS box above. Cheap on purpose --
// one small character, reused every week for all four seasons -- rather than a new drawing per
// week.
const PORTRAIT_RABBIT_SPOT = { left: "31%", top: "46%" };
const LANDSCAPE_RABBIT_SPOT = { left: "58%", top: "47%" };

/**
 * The rabbit guide (Task 15, Part 3): "lives on the hill and looks toward whatever is next."
 * `facing` leans the whole drawing a few degrees toward the next not-yet-done activity (computed
 * by the caller, which knows the actual positions); `celebrating` swaps its face for a simple
 * closed-eyes smile once the week's three stars are all earned -- the one way it "reacts" to the
 * child finishing something, with no animation and no extra drawing to maintain. Kept
 * intentionally plain (a handful of ellipses and two short paths) so it survives being looked at
 * every day for twelve weeks across four seasons without needing new art.
 *
 * A lean (rotate), not a mirror (scaleX): the drawing is left-right symmetric -- same ellipses,
 * same eye spacing on both sides -- so scaleX(-1) on it is a no-op a viewer can never actually
 * see (caught by direct comparison of the two facings' screenshots before this landed). A small
 * rotation toward the target reads as "leaning that way" regardless of the drawing's own
 * symmetry, at the same near-zero cost.
 */
function Rabbit({ facing, celebrating }: { facing: "left" | "right"; celebrating: boolean }) {
  return (
    <svg
      className="sp-rabbit"
      viewBox="-40 -62 80 112"
      aria-hidden="true"
      style={{ transform: `rotate(${facing === "left" ? "-7deg" : "7deg"})` }}
    >
      <ellipse cx="0" cy="34" rx="27" ry="24" fill="var(--cream)" />
      <circle cx="0" cy="2" r="21" fill="var(--cream)" />
      <ellipse cx="-9" cy="-24" rx="6.5" ry="19" fill="var(--cream)" />
      <ellipse cx="9" cy="-24" rx="6.5" ry="19" fill="var(--cream)" />
      <ellipse cx="-9" cy="-24" rx="3.2" ry="12.5" fill="#e8b9b0" />
      <ellipse cx="9" cy="-24" rx="3.2" ry="12.5" fill="#e8b9b0" />
      {celebrating ? (
        <>
          <path d="M-11 1 q3 3.4 6 0" stroke="var(--forest)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M5 1 q3 3.4 6 0" stroke="var(--forest)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M-6 10 q6 6 12 0" stroke="var(--forest)" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="-7" cy="2" r="2.8" fill="var(--forest)" />
          <circle cx="7" cy="2" r="2.8" fill="var(--forest)" />
          <path d="M-4 9 q4 4 8 0" stroke="var(--forest)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/** The sky-and-hill scene, portrait build: a viewBox close to a tablet-portrait ratio
 * (100:145 ~= 0.69, matching the 820x1180 verification viewport), so preserveAspectRatio="none"
 * barely stretches anything. Unchanged from before Task 15 -- portrait still works, it just is
 * not what Sprout is designed for now. */
function PortraitScene() {
  return (
    <svg className="sp-scene" viewBox="0 0 100 145" preserveAspectRatio="none" aria-hidden="true">
      {/* Task 15, Part 3 (direction B): a soft two-stop sky gradient instead of the flat --sky
          fill .sp-world's own CSS background already provides -- one of Direction B's own named
          traits ("softer gradients, fat rounded shapes"). */}
      <defs>
        <linearGradient id="sp-sky-portrait" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfe6ee" />
          <stop offset="1" stopColor="#eef3e4" />
        </linearGradient>
      </defs>
      <rect width="100" height="145" fill="url(#sp-sky-portrait)" />
      <circle cx="58" cy="27" r="9" fill="var(--sun)" />
      <ellipse cx="24" cy="20" rx="11" ry="3.2" fill="#fff" opacity=".85" />
      <ellipse cx="58" cy="11" rx="8" ry="2.4" fill="#fff" opacity=".85" />
      <ellipse cx="14" cy="40" rx="7" ry="2.2" fill="#fff" opacity=".55" />
      <path d="M-5 78 Q25 60 50 74 T105 68 V145 H-5z" fill="#8fb07a" />
      <path d="M-5 98 Q30 82 60 96 T105 90 V145 H-5z" fill="#6b8f5a" />
      <path
        d="M12 100 Q32 90 52 101 T92 95"
        stroke="var(--moss)"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeDasharray="0.2 3"
        opacity="0.4"
      />
      <g fill="var(--forest)">
        <ellipse cx="11" cy="77.5" rx="3.9" ry="4.7" />
        <ellipse cx="11" cy="73.2" rx="2.9" ry="3.5" />
        <rect x="10.4" y="81.5" width="1.2" height="3.5" rx="0.55" />
        <ellipse cx="95.4" cy="73.4" rx="4.1" ry="4.9" />
        <ellipse cx="95.4" cy="68.9" rx="3" ry="3.6" />
        <rect x="94.8" y="77.6" width="1.2" height="3.6" rx="0.55" />
      </g>
    </svg>
  );
}

/** Task 15, Part 2: the wide-screen redraw of the same hill, in its own viewBox (145:100 ~= 1.45,
 * close to both the 11" iPad Pro's 1194x834 and the 13"'s 1366x1024) rather than the portrait
 * scene stretched sideways -- the sun, clouds, hill bands and treeline are all repositioned for a
 * screen that is wider than it is tall, with the hill's front edge kept low enough that all three
 * LANDSCAPE_THING_POSITIONS sit inside grass, not sky. */
function LandscapeScene() {
  return (
    <svg className="sp-scene" viewBox="0 0 145 100" preserveAspectRatio="none" aria-hidden="true">
      {/* Task 15, Part 3 (direction B): same soft sky gradient as PortraitScene, own id so two
          mounted <defs> (there never are, since only one scene renders at a time, but SVG ids
          are global) never collide. */}
      <defs>
        <linearGradient id="sp-sky-landscape" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfe6ee" />
          <stop offset="1" stopColor="#eef3e4" />
        </linearGradient>
      </defs>
      <rect width="145" height="100" fill="url(#sp-sky-landscape)" />
      <circle cx="99" cy="19" r="10.5" fill="var(--sun)" />
      <ellipse cx="34" cy="20" rx="13" ry="3.6" fill="#fff" opacity=".85" />
      <ellipse cx="66" cy="11" rx="9" ry="2.6" fill="#fff" opacity=".85" />
      <ellipse cx="16" cy="30" rx="8" ry="2.4" fill="#fff" opacity=".55" />
      <path d="M-5 58 Q42 42 78 56 T150 48 V100 H-5z" fill="#8fb07a" />
      <path d="M-5 72 Q46 58 92 72 T150 64 V100 H-5z" fill="#6b8f5a" />
      <path
        d="M10 76 Q45 66 80 77 T140 71"
        stroke="var(--moss)"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
        strokeDasharray="0.2 3"
        opacity="0.4"
      />
      <g fill="var(--forest)">
        <ellipse cx="10.4" cy="51.4" rx="3.5" ry="4.2" />
        <ellipse cx="10.4" cy="47.6" rx="2.6" ry="3.1" />
        <rect x="9.9" y="55" width="1.1" height="3.2" rx="0.5" />
        <ellipse cx="138.6" cy="47.4" rx="3.7" ry="4.4" />
        <ellipse cx="138.6" cy="43.4" rx="2.7" ry="3.2" />
        <rect x="138.1" y="51" width="1.1" height="3.3" rx="0.5" />
      </g>
    </svg>
  );
}

/**
 * Sprout home (spec 7.1 screen 7, design demo "Screen 4, Sprout home"): a sky-and-hill scene
 * with the week's three activities as things on the hill, a star row, and no text a child must
 * read to use it. Every button still carries an aria-label -- for the parent, and for tests.
 *
 * Task 15: which scene and which THING_POSITIONS render is decided entirely by the real viewport
 * (useIsLandscape), never by a user-agent guess, so it stays correct on an iPad however Safari
 * identifies itself. Task 16: a phone-width viewport (useIsPhoneWidth) overrides that choice with
 * PHONE_THING_POSITIONS regardless of orientation -- see that table's own comment for why.
 */
export function Hill({ activities, doneIds, stars, onOpenActivity, parentGate }: HillProps) {
  const landscape = useIsLandscape();
  const phone = useIsPhoneWidth();
  const positions = phone ? PHONE_THING_POSITIONS : landscape ? LANDSCAPE_THING_POSITIONS : PORTRAIT_THING_POSITIONS;
  const rabbitSpot = landscape ? LANDSCAPE_RABBIT_SPOT : PORTRAIT_RABBIT_SPOT;

  // Task 15, Part 3: the rabbit faces whichever activity is next -- the first one in the week
  // not yet done -- and, once all three are, faces the star row instead (top-right on both
  // scenes) with its "reacting" celebrating face. Comparing raw left percentages is enough here:
  // both position tables only ever place things left-to-right along the hill, never stacked.
  const nextIndex = activities.findIndex((a) => !doneIds.has(a.id));
  const allDone = nextIndex === -1;
  const targetLeft = allDone ? 100 : parseFloat(positions[nextIndex % positions.length]!.left);
  const rabbitLeft = parseFloat(rabbitSpot.left);
  const facing: "left" | "right" = targetLeft >= rabbitLeft ? "right" : "left";

  return (
    <div className="sp-world">
      {landscape ? <LandscapeScene /> : <PortraitScene />}

      <div className="sp-rabbit-spot" style={{ left: rabbitSpot.left, top: rabbitSpot.top }}>
        <Rabbit facing={facing} celebrating={allDone} />
      </div>

      <div className="sp-top">
        <svg viewBox="0 0 26 26" fill="none" stroke="var(--forest)" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true" className="sp-mark">
          <path d="M13 3.5a9.5 9.5 0 1 1-8.2 4.7" />
          <path d="M3.2 3.6l1.6 4.6 4.6-1.6" />
        </svg>
        <div className="sp-stars" aria-label={`${stars} of 3 stars this week`}>
          {[0, 1, 2].map((i) => (
            <Star key={i} earned={i < stars} />
          ))}
        </div>
      </div>

      {activities.map((activity, i) => {
        const done = doneIds.has(activity.id);
        const pos = positions[i % positions.length];
        return (
          <button
            key={activity.id}
            type="button"
            className={`sp-thing${done ? " sp-thing--done" : ""}`}
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}
            aria-label={`${activity.title}${done ? ". Done." : ""}`}
            onClick={() => onOpenActivity(activity.id)}
          >
            {/* Task 15, Part 3 (direction B): a big white-cream pill behind the icon, unmissable
                against the green hill -- the fix for the old layout's "activity objects that are
                the least noticeable things on screen" (docs/screenshots/task12-ui-after-06-
                sprout-hill-820.png). The done/todo ring now overlaps the pill's own top-right
                corner like a badge, instead of sitting in a separate row below it. */}
            <span className="sp-thing__pill">
              <HillThingArt index={i} />
              {/* The "this is interactive" ring (design-demos/trail-v2.html:341-358) on every
                  thing regardless of state -- a check on a cream ring when done, a play triangle
                  on a sun-coloured ring when not, so the state that most needs a "tap me" cue
                  (not yet done) gets one, not just the state that needs no further action
                  (task-12 fix1 review, Issue 3: this used to render only for `done`). */}
              <span className={`sp-thing__ring${done ? "" : " sp-thing__ring--todo"}`} aria-hidden="true">
                {done ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--forest)" strokeWidth="3" strokeLinecap="round">
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="var(--forest)" aria-hidden="true">
                    <path d="M8 5l10 7-10 7z" />
                  </svg>
                )}
              </span>
            </span>
          </button>
        );
      })}

      <div className="sp-foot">{parentGate}</div>
    </div>
  );
}
