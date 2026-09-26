// @vitest-environment jsdom
// Unit tests for the timing helper shared by Button.tsx, useAsyncAction.ts and
// RouteProgressBar.tsx. Pure state-machine behaviour, driven with fake timers -- no rendering of
// any of the three consumers (each of those gets its own test file for its own extra behaviour).

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { PENDING_MIN_VISIBLE_MS, PENDING_SHOW_DELAY_MS, useDelayedPending } from "./pendingTiming";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useDelayedPending", () => {
  it("shows nothing while the action is still under the show delay", () => {
    vi.useFakeTimers();
    const { result } = renderHook(({ active }) => useDelayedPending(active), {
      initialProps: { active: true },
    });
    act(() => {
      vi.advanceTimersByTime(PENDING_SHOW_DELAY_MS - 1);
    });
    expect(result.current).toBe(false);
  });

  it("never shows anything for an action that settles before the show delay", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ active }) => useDelayedPending(active), {
      initialProps: { active: true },
    });
    act(() => {
      vi.advanceTimersByTime(PENDING_SHOW_DELAY_MS - 20);
    });
    rerender({ active: false });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current).toBe(false);
  });

  it("shows once the action has run past the show delay", () => {
    vi.useFakeTimers();
    const { result } = renderHook(({ active }) => useDelayedPending(active), {
      initialProps: { active: true },
    });
    act(() => {
      vi.advanceTimersByTime(PENDING_SHOW_DELAY_MS);
    });
    expect(result.current).toBe(true);
  });

  it("stays visible for the minimum time even once the action ends right away", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ active }) => useDelayedPending(active), {
      initialProps: { active: true },
    });
    act(() => {
      vi.advanceTimersByTime(PENDING_SHOW_DELAY_MS);
    });
    expect(result.current).toBe(true);

    rerender({ active: false });
    act(() => {
      vi.advanceTimersByTime(PENDING_MIN_VISIBLE_MS - 50);
    });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(false);
  });

  it("hides immediately once the minimum has already elapsed by the time the action ends", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ active }) => useDelayedPending(active), {
      initialProps: { active: true },
    });
    act(() => {
      vi.advanceTimersByTime(PENDING_SHOW_DELAY_MS + PENDING_MIN_VISIBLE_MS + 500);
    });
    expect(result.current).toBe(true);

    rerender({ active: false });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe(false);
  });
});
