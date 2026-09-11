"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { diagramFrames, frameHold, resolveDiagramFrame } from "@/lib/content/diagram-frames";

/**
 * A `diagram` figure with frames: the same SVG the still diagram draws, re-drawn every hold
 * with the next frame's overrides, and the frame's caption under it. Under
 * prefers-reduced-motion nothing plays on its own; a tap on the figure steps to the next
 * frame, so the motion is still there for a child who asks for it. The same tap works while
 * playing, which pauses on that frame; a second tap resumes.
 */
const reducedMotionStore = {
  subscribe(cb: () => void) {
    if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener?.("change", cb);
    return () => mq.removeEventListener?.("change", cb);
  },
  get() {
    return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  },
  server() {
    return false;
  },
};

export function AnimatedDiagram({
  spec,
  alt,
  viewBox,
  render,
  onFrame,
}: {
  spec: Record<string, unknown>;
  alt: string;
  viewBox: string;
  render: (items: Record<string, unknown>[]) => React.ReactNode;
  /** Called with the frame index whenever it changes, so a caller can highlight the step a
   * frame belongs to (the Ladder's ways chooser). */
  onFrame?: (index: number) => void;
}) {
  const frames = diagramFrames(spec);
  const count = frames.length;
  const reduced = useSyncExternalStore(reducedMotionStore.subscribe, reducedMotionStore.get, reducedMotionStore.server);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduced || paused || count < 2) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), frameHold(spec, index));
    return () => clearTimeout(t);
  }, [index, count, reduced, paused, spec]);

  const shown = count ? index % count : 0;
  useEffect(() => { onFrame?.(shown); }, [shown, onFrame]);
  const items = resolveDiagramFrame(spec, shown);
  const caption = frames[index % Math.max(1, count)]?.caption;

  function tap() {
    if (reduced) setIndex((i) => (i + 1) % Math.max(1, count));
    else setPaused((p) => !p);
  }

  return (
    <figure className={spec.wide ? "tr-figure tr-figure--wide tr-figure--frames" : "tr-figure tr-figure--frames"}>
      <svg
        className="tr-figure-svg"
        viewBox={viewBox}
        role="img"
        aria-label={alt}
        preserveAspectRatio="xMidYMid meet"
        onClick={tap}
      >
        <title>{alt}</title>
        {render(items)}
      </svg>
      <figcaption className="tr-figure__caption">
        <span className="tr-figure__frame-dots" aria-hidden="true">
          {frames.map((_, i) => (
            <span key={i} className={i === index % Math.max(1, count) ? "tr-figure__dot tr-figure__dot--on" : "tr-figure__dot"} />
          ))}
        </span>
        <span className="tr-figure__caption-text">{caption ?? ""}</span>
        {reduced ? <span className="tr-figure__hint">Tap the picture to step through</span> : null}
      </figcaption>
    </figure>
  );
}
