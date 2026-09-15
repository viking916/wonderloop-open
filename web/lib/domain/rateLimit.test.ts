import { describe, expect, it } from "vitest";
import { RATE_LIMIT_MAX_CALLS, RATE_LIMIT_WINDOW_MS, checkRateLimit, pruneCalls } from "./rateLimit";

describe("checkRateLimit", () => {
  it("allows the first call and refuses once the window is full", () => {
    const now = 1_000_000;
    const full = Array.from({ length: RATE_LIMIT_MAX_CALLS }, (_, i) => now - i * 1000);
    expect(checkRateLimit([], now).allowed).toBe(true);
    expect(checkRateLimit(full, now).allowed).toBe(false);
  });

  it("forgets calls outside the window", () => {
    const now = 1_000_000 + RATE_LIMIT_WINDOW_MS * 2;
    const old = Array.from({ length: RATE_LIMIT_MAX_CALLS }, (_, i) => now - RATE_LIMIT_WINDOW_MS - 1 - i * 1000);
    expect(checkRateLimit(old, now).allowed).toBe(true);
  });

  it("counts the call being decided", () => {
    const now = 5_000_000;
    expect(checkRateLimit([now - 10], now).used).toBe(2);
  });

  it("says when a refused caller may try again: when the oldest call ages out", () => {
    const now = 9_000_000;
    const oldest = now - 30 * 60 * 1000;
    const calls = [oldest, ...Array.from({ length: RATE_LIMIT_MAX_CALLS - 1 }, (_, i) => now - i * 1000)];
    const decision = checkRateLimit(calls, now);
    expect(decision.allowed).toBe(false);
    expect(decision.retryAt).toBe(oldest + RATE_LIMIT_WINDOW_MS);
  });

  it("ignores timestamps from the future, which a skewed clock could produce", () => {
    const now = 9_000_000;
    const future = Array.from({ length: RATE_LIMIT_MAX_CALLS }, (_, i) => now + 1000 + i);
    expect(checkRateLimit(future, now).allowed).toBe(true);
  });
});

describe("pruneCalls", () => {
  it("keeps only what is still inside the window", () => {
    const now = 9_000_000;
    const kept = pruneCalls([now - RATE_LIMIT_WINDOW_MS - 1, now - 5, now + 5, now - 100], now);
    expect(kept).toEqual([now - 5, now - 100]);
  });
});
