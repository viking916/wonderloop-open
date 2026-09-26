// @vitest-environment jsdom
// Unit tests for Button.tsx's pending support: automatic Promise tracking, the anti-flicker
// timing it shares with lib/pendingTiming.ts, blocked repeat activation, and the explicit
// `pending` prop overriding automatic tracking. Visual review (spinner legible, tier colour kept,
// not greyed out) happens by screenshot per docs/ui-styleguide.md's own process section, not here.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MouseEvent } from "react";
import { PENDING_SHOW_DELAY_MS } from "@/lib/pendingTiming";
import { Button } from "./Button";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Button pending support", () => {
  it("tracks a Promise-returning onClick automatically: spinner and aria-busy appear, then clear on resolve", async () => {
    vi.useFakeTimers();
    const work = deferred<void>();
    const onClick = vi.fn(() => work.promise);
    render(<Button variant="primary" onClick={onClick}>Check</Button>);

    const button = screen.getByRole("button", { name: /check/i }) as HTMLButtonElement;
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();

    // aria-busy is immediate (a correctness signal, not a flourish); the spinner is still under
    // the show delay and has not appeared yet.
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector(".tr-btn__spinner")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_SHOW_DELAY_MS);
    });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector(".tr-btn__spinner")).not.toBeNull();
    // Never the disabled attribute -- ui-styleguide: never the washed-out kraft fill.
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain("Check");

    await act(async () => {
      work.resolve();
      await work.promise;
      await vi.runAllTimersAsync();
    });
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(button.querySelector(".tr-btn__spinner")).toBeNull();
  });

  it("clears pending on rejection and lets the rejection propagate for the caller's own handling", async () => {
    vi.useFakeTimers();
    const failure = new Error("boom");
    const work = deferred<void>();
    let capturedResult: Promise<void> | undefined;
    const onClick = vi.fn(() => {
      capturedResult = work.promise;
      return work.promise;
    });
    render(<Button variant="primary" onClick={onClick}>Save</Button>);

    const button = screen.getByRole("button", { name: /save/i }) as HTMLButtonElement;
    fireEvent.click(button);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_SHOW_DELAY_MS);
    });
    expect(button.getAttribute("aria-busy")).toBe("true");

    // The caller's own .catch on the exact Promise Button received still runs -- proof Button
    // never swallows the rejection, only observes it via .finally.
    const observedByCaller = capturedResult!.catch((err) => err);

    await act(async () => {
      work.reject(failure);
      await observedByCaller;
      await vi.runAllTimersAsync();
    });

    expect(button.getAttribute("aria-busy")).toBeNull();
    await expect(observedByCaller).resolves.toBe(failure);
  });

  it("ignores a repeat click while pending instead of disabling the control", async () => {
    vi.useFakeTimers();
    const work = deferred<void>();
    const onClick = vi.fn(() => work.promise);
    render(<Button variant="primary" onClick={onClick}>Check</Button>);
    const button = screen.getByRole("button", { name: /check/i }) as HTMLButtonElement;

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    // A second click lands while the first is still in flight -- must be ignored, and the
    // control must never have gained the real `disabled` attribute (it should still be focusable
    // and legible, per the pending doc comment).
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    await act(async () => {
      work.resolve();
      await work.promise;
      await vi.runAllTimersAsync();
    });
  });

  it("shows nothing for an action that resolves before the show delay", async () => {
    vi.useFakeTimers();
    const work = deferred<void>();
    const onClick = vi.fn(() => work.promise);
    render(<Button variant="primary" onClick={onClick}>Check</Button>);
    const button = screen.getByRole("button", { name: /check/i }) as HTMLButtonElement;

    fireEvent.click(button);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_SHOW_DELAY_MS - 20);
      work.resolve();
      await work.promise;
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(button.querySelector(".tr-btn__spinner")).toBeNull();
  });

  it("an explicit pending prop wins over automatic tracking", async () => {
    vi.useFakeTimers();
    const onClick = vi.fn(() => Promise.resolve());
    const { rerender } = render(
      <Button variant="primary" pending={false} onClick={onClick}>
        Check
      </Button>
    );
    const button = screen.getByRole("button", { name: /check/i }) as HTMLButtonElement;

    fireEvent.click(button);
    // Automatic tracking is disabled once `pending` is passed at all: even though onClick
    // returned a Promise, the caller's own `pending={false}` is authoritative.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_SHOW_DELAY_MS);
    });
    expect(button.getAttribute("aria-busy")).toBeNull();

    rerender(
      <Button variant="primary" pending onClick={onClick}>
        Check
      </Button>
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_SHOW_DELAY_MS);
    });
    expect((screen.getByRole("button", { name: /check/i }) as HTMLButtonElement).getAttribute("aria-busy")).toBe(
      "true"
    );
  });

  it("keeps working for a caller that already owns its own busy flag via void", () => {
    const handleSubmit = vi.fn(() => Promise.resolve());
    const onClick = vi.fn(() => {
      void handleSubmit();
    });
    render(
      <Button variant="primary" onClick={onClick} disabled={false}>
        Check
      </Button>
    );
    const button = screen.getByRole("button", { name: /check/i }) as HTMLButtonElement;
    fireEvent.click(button);
    expect(handleSubmit).toHaveBeenCalledOnce();
    // onClick itself returned undefined (not a Promise), so Button never auto-tracks it.
    expect(button.getAttribute("aria-busy")).toBeNull();
  });

  it("supports pending on the anchor (href) form, and blocks its click while pending", () => {
    const onClick = vi.fn((event: MouseEvent) => event.preventDefault());
    render(
      <Button variant="secondary" href="/explorer" pending onClick={onClick}>
        Back to This week
      </Button>
    );
    const link = screen.getByRole("link", { name: /back to this week/i });
    expect(link.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(link);
    // The click was ignored outright (pending blocks activation), so the caller's own handler
    // never even ran.
    expect(onClick).not.toHaveBeenCalled();
  });
});
