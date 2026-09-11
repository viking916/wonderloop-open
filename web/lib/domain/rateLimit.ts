// Per-profile rate limit for the live-model routes (Plan 3 task 4). Pure: the caller supplies
// the timestamps of recent calls and "now"; storage is the server's business (lib/ai/usage.ts).
//
// The window is one hour and the cap is 20 calls. A full debate is five calls (steelman check,
// three rounds, coach card), so a child can hold four debates in an hour, which is more than any
// week asks for, while a stuck retry loop or a curious sibling cannot run up a bill.

export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const RATE_LIMIT_MAX_CALLS = 20;

export type RateLimitDecision = {
  allowed: boolean;
  /** Calls inside the window, including the one being decided when allowed. */
  used: number;
  /** When the oldest in-window call ages out, so a refused caller can be told how long to wait.
   * Undefined when nothing is in the window. */
  retryAt?: number;
};

export function checkRateLimit(recentCalls: number[], now: number): RateLimitDecision {
  const inWindow = recentCalls.filter((t) => t > now - RATE_LIMIT_WINDOW_MS && t <= now).sort((a, b) => a - b);
  if (inWindow.length >= RATE_LIMIT_MAX_CALLS) {
    return { allowed: false, used: inWindow.length, retryAt: inWindow[0] + RATE_LIMIT_WINDOW_MS };
  }
  return { allowed: true, used: inWindow.length + 1, retryAt: inWindow[0] !== undefined ? inWindow[0] + RATE_LIMIT_WINDOW_MS : undefined };
}

/** The timestamps worth keeping after a call is recorded: only those still inside the window,
 * so the stored list never grows past the cap plus one. */
export function pruneCalls(recentCalls: number[], now: number): number[] {
  return recentCalls.filter((t) => t > now - RATE_LIMIT_WINDOW_MS && t <= now);
}
