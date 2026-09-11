// @vitest-environment jsdom
//
// Task 43: PenCanvas must work with pointer events from a mouse, a finger or an Apple Pencil --
// there is no real 2d canvas context in jsdom (this project's unit-test environment), so these
// tests exercise the stroke bookkeeping (what reaches onStrokesChange, and when) rather than
// anything about pixels. The real paint is verified by screenshot in a real browser (see
// docs/ui-styleguide.md's Process section), not here.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Stroke } from "@/lib/data/types";
import { PenCanvas } from "./PenCanvas";

afterEach(() => cleanup());

function down(el: Element, x = 10, y = 10) {
  fireEvent.pointerDown(el, { clientX: x, clientY: y, pointerId: 1 });
}
function move(el: Element, x: number, y: number) {
  fireEvent.pointerMove(el, { clientX: x, clientY: y, pointerId: 1 });
}
function up(el: Element) {
  fireEvent.pointerUp(el, { pointerId: 1 });
}

describe("PenCanvas, editable", () => {
  test("a pointer down, move, up sequence commits exactly one new stroke", () => {
    const onStrokesChange = vi.fn();
    render(<PenCanvas strokes={[]} onStrokesChange={onStrokesChange} tool="pen" ariaLabel="Draw here" />);
    const canvas = screen.getByRole("img", { name: "Draw here" });

    down(canvas, 10, 10);
    move(canvas, 20, 20);
    move(canvas, 30, 15);
    up(canvas);

    expect(onStrokesChange).toHaveBeenCalledTimes(1);
    const [newStrokes] = onStrokesChange.mock.calls[0] as [Stroke[]];
    expect(newStrokes).toHaveLength(1);
    expect(newStrokes[0].tool).toBe("pen");
    // Three points: the down plus the two moves.
    expect(newStrokes[0].points).toHaveLength(3);
  });

  test("moving with no pointer down first commits nothing", () => {
    const onStrokesChange = vi.fn();
    render(<PenCanvas strokes={[]} onStrokesChange={onStrokesChange} ariaLabel="Draw here" />);
    const canvas = screen.getByRole("img", { name: "Draw here" });

    move(canvas, 20, 20);
    up(canvas);

    expect(onStrokesChange).not.toHaveBeenCalled();
  });

  test("a completed stroke is appended to the existing strokes, not replacing them", () => {
    const onStrokesChange = vi.fn();
    const existing: Stroke[] = [{ tool: "pen", points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] }];
    render(<PenCanvas strokes={existing} onStrokesChange={onStrokesChange} tool="pen" ariaLabel="Draw here" />);
    const canvas = screen.getByRole("img", { name: "Draw here" });

    down(canvas, 5, 5);
    up(canvas);

    const [newStrokes] = onStrokesChange.mock.calls[0] as [Stroke[]];
    expect(newStrokes).toHaveLength(2);
    expect(newStrokes[0]).toBe(existing[0]);
  });

  test("the eraser tool tags the committed stroke as an eraser stroke, not a pen stroke", () => {
    const onStrokesChange = vi.fn();
    render(<PenCanvas strokes={[]} onStrokesChange={onStrokesChange} tool="eraser" ariaLabel="Draw here" />);
    const canvas = screen.getByRole("img", { name: "Draw here" });

    down(canvas, 5, 5);
    move(canvas, 8, 8);
    up(canvas);

    const [newStrokes] = onStrokesChange.mock.calls[0] as [Stroke[]];
    expect(newStrokes[0].tool).toBe("eraser");
  });

  test("pointer cancel still commits the stroke so far, the same as pointer up", () => {
    const onStrokesChange = vi.fn();
    render(<PenCanvas strokes={[]} onStrokesChange={onStrokesChange} ariaLabel="Draw here" />);
    const canvas = screen.getByRole("img", { name: "Draw here" });

    down(canvas, 5, 5);
    move(canvas, 8, 8);
    fireEvent.pointerCancel(canvas, { pointerId: 1 });

    expect(onStrokesChange).toHaveBeenCalledTimes(1);
  });

  test("a bare tap with no movement still commits a one-point stroke", () => {
    const onStrokesChange = vi.fn();
    render(<PenCanvas strokes={[]} onStrokesChange={onStrokesChange} ariaLabel="Draw here" />);
    const canvas = screen.getByRole("img", { name: "Draw here" });

    down(canvas, 5, 5);
    up(canvas);

    const [newStrokes] = onStrokesChange.mock.calls[0] as [Stroke[]];
    expect(newStrokes[0].points).toHaveLength(1);
  });
});

describe("PenCanvas, read-only (no onStrokesChange)", () => {
  test("pointer events never throw and never call anything, since there is nothing to call", () => {
    const strokes: Stroke[] = [{ tool: "pen", points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] }];
    render(<PenCanvas strokes={strokes} ariaLabel="Your working from last time" />);
    const canvas = screen.getByRole("img", { name: "Your working from last time" });

    expect(() => {
      down(canvas, 5, 5);
      move(canvas, 8, 8);
      up(canvas);
    }).not.toThrow();
  });
});

// Regression test for a real bug found by screenshot, not by this suite (see docs/ui-styleguide
// .md's Process section: unit tests could not have caught this on their own -- jsdom has neither
// a real 2d context nor a real ResizeObserver, and PenCanvas's own ResizeObserver branch is a
// silent no-op without one). Root cause: the ResizeObserver set up in the mount effect (keyed
// only on `height`, so it is created exactly once) closed over that one render's `redraw`,
// which itself closed over that render's `strokes` prop -- the empty array from the very first
// render. Any later real layout nudge (typing in the Notes textarea below the canvas, a sidebar
// reflow, anything) fired that permanently stale closure and silently wiped a real stroke off
// the canvas. Live-reproduced in a real browser, fixed by having `redraw` read from
// strokesRef/toolRef (`.current` is read at call time, not closure-creation time) instead of the
// closed-over props directly. This test installs the minimal fakes jsdom lacks (a canvas
// context that only needs to count strokes(), and a ResizeObserver polyfill that hands back its
// own callback) so the exact stale-closure race can be reproduced and locked in here too.
describe("PenCanvas: a later ResizeObserver firing must repaint the CURRENT strokes, not a stale snapshot", () => {
  test("invoking the mount-time ResizeObserver callback after strokes changed still paints the new stroke", () => {
    let strokeCallsInLastPass = 0;
    const fakeCtx = {
      save() {},
      restore() {},
      scale() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      clearRect() {
        strokeCallsInLastPass = 0;
      },
      stroke() {
        strokeCallsInLastPass += 1;
      },
    } as unknown as CanvasRenderingContext2D;
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(fakeCtx);

    let capturedCallback: (() => void) | undefined;
    class FakeResizeObserver {
      constructor(cb: () => void) {
        capturedCallback = cb;
      }
      observe() {}
      disconnect() {}
    }
    const originalRO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;

    try {
      const { rerender } = render(<PenCanvas strokes={[]} onStrokesChange={vi.fn()} ariaLabel="Draw here" />);
      expect(strokeCallsInLastPass).toBe(0); // nothing drawn yet at mount

      const withOneStroke: Stroke[] = [{ tool: "pen", points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] }];
      rerender(<PenCanvas strokes={withOneStroke} onStrokesChange={vi.fn()} ariaLabel="Draw here" />);
      expect(strokeCallsInLastPass).toBe(1); // the [strokes, tool] effect's own fresh redraw

      // Only one ResizeObserver is ever constructed (the effect that creates it is keyed on
      // [height], which never changes in this test) -- firing it simulates a real layout nudge
      // reaching that same long-lived instance well after strokes changed.
      capturedCallback?.();
      expect(strokeCallsInLastPass).toBe(1); // must still be the real stroke, not wiped to 0
    } finally {
      getContextSpy.mockRestore();
      if (originalRO === undefined) delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
      else (globalThis as { ResizeObserver?: unknown }).ResizeObserver = originalRO;
    }
  });
});
