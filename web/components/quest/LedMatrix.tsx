"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * An animated micro:bit, for the `leds` figure kind (schema.ts FigureSchema): a 5 by 5 LED
 * grid on a board with its two buttons, playing the frames content declares. The owner's
 * catch from the first real session (5 September 2026): the LED explanation was good, but a
 * child meeting a light matrix for the first time should SEE it beat, scan and scroll rather
 * than imagine it. Content gives frames as five strings of five characters, "#" lit and "."
 * dark, each with its own hold in milliseconds, so the picture on screen is exactly what the
 * words say (the same declarative rule every ProblemFigure follows).
 *
 * Under prefers-reduced-motion the first frame is held still, which also keeps screenshots
 * deterministic.
 */
export type LedFrame = { rows: string[]; ms?: number };
export type LedSpec = { frames: LedFrame[]; ms?: number; caption?: string };

const DEFAULT_MS = 500;

export function parseLedSpec(spec: Record<string, unknown>): LedSpec {
  const raw = Array.isArray(spec.frames) ? spec.frames : [];
  const frames: LedFrame[] = raw
    .map((f) => {
      const rows = Array.isArray((f as LedFrame).rows) ? ((f as LedFrame).rows as unknown[]).map(String) : [];
      const ms = typeof (f as LedFrame).ms === "number" ? (f as LedFrame).ms : undefined;
      return { rows, ms };
    })
    .filter((f) => f.rows.length === 5 && f.rows.every((r) => r.length === 5));
  return { frames, ms: typeof spec.ms === "number" ? spec.ms : DEFAULT_MS, caption: typeof spec.caption === "string" ? spec.caption : undefined };
}

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

// Board geometry in SVG units.
const W = 260;
const H = 204;
const LED = 16;
const GAP = 14;
const GRID_W = 5 * LED + 4 * GAP;
const GRID_X = (W - GRID_W) / 2;
const GRID_Y = 26;

export function LedMatrix({ spec, alt }: { spec: Record<string, unknown>; alt: string }) {
  const led = parseLedSpec(spec);
  const reduced = useSyncExternalStore(reducedMotionStore.subscribe, reducedMotionStore.get, reducedMotionStore.server);
  const [index, setIndex] = useState(0);
  const count = led.frames.length;

  useEffect(() => {
    if (reduced || count < 2) return;
    const hold = led.frames[index % count]?.ms ?? led.ms ?? DEFAULT_MS;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), Math.max(60, hold));
    return () => clearTimeout(t);
  }, [index, count, reduced, led.frames, led.ms]);

  const frame = led.frames[count ? index % count : 0];

  return (
    <figure className="tr-figure tr-led">
      <svg className="tr-figure-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={alt} preserveAspectRatio="xMidYMid meet">
        <title>{alt}</title>
        <rect x="4" y="4" width={W - 8} height={H - 8} rx="14" className="tr-led__board" />
        <rect x="16" y="82" width="26" height="26" rx="6" className="tr-led__button" />
        <text x="29" y="100" textAnchor="middle" className="tr-led__label">
          A
        </text>
        <rect x={W - 42} y="82" width="26" height="26" rx="6" className="tr-led__button" />
        <text x={W - 29} y="100" textAnchor="middle" className="tr-led__label">
          B
        </text>
        {Array.from({ length: 5 }, (_, r) =>
          Array.from({ length: 5 }, (_, c) => {
            const on = frame?.rows[r]?.[c] === "#";
            return (
              <rect
                key={`${r}-${c}`}
                x={GRID_X + c * (LED + GAP)}
                y={GRID_Y + r * (LED + GAP)}
                width={LED}
                height={LED}
                rx="3"
                className={on ? "tr-led__dot tr-led__dot--on" : "tr-led__dot"}
              />
            );
          }),
        )}
        {Array.from({ length: 5 }, (_, i) => (
          <rect key={`pin-${i}`} x={34 + i * 50} y={H - 20} width="20" height="12" rx="2" className="tr-led__pin" />
        ))}
      </svg>
      {led.caption ? <figcaption className="tr-led__caption">{led.caption}</figcaption> : null}
    </figure>
  );
}
