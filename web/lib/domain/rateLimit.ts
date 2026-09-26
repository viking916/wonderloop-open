// Per-profile rate limit for the live-model routes (Plan 3 task 4). Pure: the caller supplies
// the timestamps of recent calls and "now"; storage is the server's business (lib/ai/usage.ts).
//
// The window is one hour. The cap was 20 calls (a full debate is five calls -- steelman check,
// three rounds, coach card -- so four debates fit an hour). Raised to 45 on 25 September 2026
// alongside the higher Ask/Builder Ask per-conversation caps (lib/domain/tutor.ts's
// MAX_CHILD_MESSAGES, 15, and lib/domain/builderAsk.ts's MAX_BUILDER_STEP_MESSAGES, 25): one call
// is spent per child message sent, shared across every AI route for a profile, so a child who
// genuinely worked a math Ask conversation all the way to its own cap (15 calls) AND a Builder
// Ask conversation all the way to its own cap (25 calls) in the same hour needs 40 calls just for
// that, with nothing left over for a debate or a retry. 45 clears a full run of both caps with a
// little room to spare, while a stuck retry loop or a curious sibling still cannot run up an
// unbounded bill.

export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const RATE_LIMIT_MAX_CALLS = 45;

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
