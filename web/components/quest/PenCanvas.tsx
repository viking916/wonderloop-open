"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { Stroke } from "@/lib/data/types";

export type PenTool = "pen" | "eraser";

export type PenCanvasProps = {
  strokes: Stroke[];
  /** Undefined (rather than a no-op function) is how a caller says "this canvas is read-only" --
   * PastWorking.tsx's whole reason for existing is showing strokes with no way to touch them,
   * and a missing handler is a stronger guarantee of that than a boolean flag a render path
   * could forget to also check. */
  onStrokesChange?: (strokes: Stroke[]) => void;
  tool?: PenTool;
  /** Plain CSS height; width always fills the container. Kept small on purpose (task brief:
   * "simple: one pen, an eraser, clear" -- this is scratch space, not a drawing app). */
  height?: number;
  ariaLabel: string;
};

/**
 * A pen/eraser drawing surface, task 43. Pointer events, not touch/mouse-specific handlers, so
 * the exact same code path fires for an Apple Pencil on the iPad Pro, a finger, and a mouse on
 * the laptop (spec: "use pointer events that work with pencil, finger and mouse"). Every stroke
 * is stored as normalized (0..1) points, never a raster -- see lib/data/types.ts's Stroke doc
 * comment -- so a stroke drawn at one canvas size still lines up correctly when redrawn at a
 * different one (a phone-width panel, a parent-view thumbnail).
 *
 * An eraser stroke is real points too, painted back with a destination-out composite when every
 * stroke is replayed in order; nothing here ever touches or reads raw pixel data, so the canvas
 * element is purely a redraw target, not a second source of truth (`strokes` always is).
 *
 * jsdom (this project's unit-test environment) does not implement CanvasRenderingContext2D, so
 * every drawing call below is guarded by a null check on the context -- a unit test exercising
 * the pointer-event wiring (does a completed stroke reach onStrokesChange with the right
 * points?) still runs correctly with nothing actually painted; the real paint is verified by
 * screenshot in a real browser, not by a unit test (see docs/ui-styleguide.md's process).
 */
export function PenCanvas({ strokes, onStrokesChange, tool = "pen", height = 220, ariaLabel }: PenCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<{ points: { x: number; y: number }[] } | null>(null);
  const readOnly = onStrokesChange === undefined;

  // Task 43 bug fix (found by looking at a real screenshot, not just React state: strokes were
  // reaching state correctly -- Clear enabled itself -- but the canvas stayed visibly blank).
  // Root cause: the ResizeObserver set up below lives inside an effect keyed only on [height],
  // so it is created ONCE and its callback closes over that one render's `redraw` -- which
  // itself closes over that render's `strokes` prop. The very first render has strokes=[], so
  // any time the OS/browser's ResizeObserver actually fires later (a layout nudge from typing
  // in the Notes textarea below, a sidebar reflow, anything), it repaints from that permanently
  // stale, empty strokes list and silently wipes out whatever the correctly-fresh [strokes,
  // tool] effect had just painted a moment before. Refs sidestep this the same way drawingRef
  // already does for the in-progress stroke: `redraw` reads `.current` at CALL time, not at
  // closure-creation time, so it is always current regardless of which render's closure ends up
  // calling it.
  const strokesRef = useRef(strokes);
  const toolRef = useRef(tool);
  useEffect(() => {
    strokesRef.current = strokes;
    toolRef.current = tool;
  }, [strokes, tool]);

  function resizeCanvas() {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const cssWidth = wrap.clientWidth || 1;
    const cssHeight = height;
    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    canvas.style.width = "100%";
    canvas.style.height = `${cssHeight}px`;
  }

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // jsdom (unit tests) has no real canvas backend: getContext("2d") there logs a "not
    // implemented" jsdom warning and returns undefined rather than a context, so this is
    // wrapped defensively and bails out the same way for either outcome -- the stroke-state
    // logic in every caller (handlePointerDown/Move/Up, commitStroke) never depends on this.
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      ctx = null;
    }
    if (!ctx) return;
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(canvas.width, canvas.height); // paint in normalized 0..1 space directly
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const allStrokes = [...strokesRef.current];
    const inProgress = drawingRef.current;
    if (inProgress && inProgress.points.length > 0) {
      allStrokes.push({ tool: toolRef.current, points: inProgress.points });
    }
    for (const stroke of allStrokes) {
      if (stroke.points.length === 0) continue;
      ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = "#274235"; // --forest; ignored for eraser strokes (composite mode erases instead)
      ctx.lineWidth = (stroke.tool === "eraser" ? 0.06 : 0.012);
      ctx.beginPath();
      const [first, ...rest] = stroke.points;
      ctx.moveTo(first.x, first.y);
      if (rest.length === 0) {
        // A tap with no drag: draw a dot so a single touch is still visible.
        ctx.lineTo(first.x + 0.0001, first.y + 0.0001);
      }
      for (const p of rest) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  useEffect(() => {
    resizeCanvas();
    redraw();
    if (typeof ResizeObserver === "undefined" || !wrapRef.current) return;
    const ro = new ResizeObserver(() => {
      resizeCanvas();
      redraw();
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, tool]);

  function pointFromEvent(e: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    const y = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (readOnly) return;
    // jsdom (unit tests) has no real pointer-capture implementation; guarded so a synthetic
    // pointerdown in a test never throws instead of exercising the stroke logic below.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // no-op outside a real browser
    }
    drawingRef.current = { points: [pointFromEvent(e)] };
    redraw();
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (readOnly || !drawingRef.current) return;
    drawingRef.current.points.push(pointFromEvent(e));
    redraw();
  }

  function commitStroke() {
    const drawing = drawingRef.current;
    drawingRef.current = null;
    if (!drawing || drawing.points.length === 0 || !onStrokesChange) return;
    onStrokesChange([...strokes, { tool, points: drawing.points }]);
  }

  function handlePointerUp() {
    if (readOnly) return;
    commitStroke();
  }

  return (
    <div ref={wrapRef} className={`tr-pencanvas${readOnly ? " tr-pencanvas--readonly" : ""}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        className="tr-pencanvas__surface"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={(e) => {
          // A pointer that leaves the canvas mid-stroke without an up/cancel event (observed
          // with a fast mouse drag past the edge) must not leave drawingRef holding a stroke
          // that never commits -- close it out the same way an up would.
          if (e.buttons === 0 && drawingRef.current) commitStroke();
        }}
      />
    </div>
  );
}
