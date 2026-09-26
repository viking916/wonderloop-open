// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { PENDING_SHOW_DELAY_MS } from "./pendingTiming";
import { useAsyncAction } from "./useAsyncAction";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** A promise plus its own resolve/reject, so a test can control exactly when the wrapped action
 * settles relative to fake-timer advances. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useAsyncAction", () => {
  it("resolves cleanly: pending appears after the delay and error stays undefined", async () => {
    vi.useFakeTimers();
    const work = deferred<void>();
    const { result } = renderHook(() => useAsyncAction(() => work.promise));

    let runPromise!: Promise<void>;
    act(() => {
      runPromise = result.current.run();
    });
    expect(result.current.pending).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_SHOW_DELAY_MS);
    });
    expect(result.current.pending).toBe(true);

    await act(async () => {
      work.resolve();
      await runPromise;
    });
    expect(result.current.error).toBeUndefined();
  });

  it("rejects without being swallowed: error is recorded and run() still throws", async () => {
    vi.useFakeTimers();
    const failure = new Error("save failed");
    const work = deferred<void>();
    const { result } = renderHook(() => useAsyncAction(() => work.promise));

    let runPromise!: Promise<void>;
    act(() => {
      runPromise = result.current.run();
    });
    // The caller's own .catch on the very promise run() returned still fires -- proof this
    // hook never intercepts or replaces the rejection, only observes it.
    const caughtByCaller = runPromise.catch((err) => err);

    await act(async () => {
      work.reject(failure);
      await expect(runPromise).rejects.toBe(failure);
    });

    expect(result.current.error).toBe(failure);
    await expect(caughtByCaller).resolves.toBe(failure);
  });

  it("ignores a second run() while the first is still in flight", async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const work = deferred<void>();
    const action = vi.fn((n: number) => {
      calls.push(n);
      return work.promise;
    });
    const { result } = renderHook(() => useAsyncAction(action));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.run(1);
      second = result.current.run(2);
    });

    expect(action).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([1]);

    await act(async () => {
      work.resolve();
      await Promise.all([first, second]);
    });
  });

  it("shows nothing for an action that settles before the show delay", async () => {
    vi.useFakeTimers();
    const work = deferred<void>();
    const { result } = renderHook(() => useAsyncAction(() => work.promise));

    let runPromise!: Promise<void>;
    act(() => {
      runPromise = result.current.run();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_SHOW_DELAY_MS - 20);
      work.resolve();
      await runPromise;
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.pending).toBe(false);
  });
});
