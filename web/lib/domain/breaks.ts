// The Explorer break rule (Plan 4 task 35). The owner first asked for a forced 5-minute break
// after 30 minutes; the counter-argument that won the conversation: forcing it interrupts flow
// exactly where the 35-minute proof lane needs it most, takes away the rep a child needs
// to learn noticing his own tiredness (a skill worth more than the break itself), and he would
// only route around a countdown they resent. The Sprout child's 15-minute cap (lib/domain/sprout.ts's
// SPROUT_DAILY_CAP_MINUTES/capReached) stays enforced -- a three-year-old genuinely cannot
// self-regulate -- but an Explorer child can learn to, so this module only ever decides when to OFFER a
// break, never when to force one. No Firebase, no React, no Date.now() inside these functions:
// `now` always arrives from the caller, the same discipline every other lib/domain/ module holds
// to.

/** How long a stretch of continuous work has to run before a break is worth offering. Matches
 * the 30 minutes the owner and the agent settled on. */
export const BREAK_INTERVAL_MS = 30 * 60 * 1000;

/** Once he says "Not now", how long this module waits before it is willing to offer again --
 * long enough that dismissing it never reads as "it will just ask again in a second" (spec:
 * "does not nag again immediately"), short enough that a break is still meaningfully back on the
 * table this same session rather than gone for the day. */
export const BREAK_SNOOZE_MS = 15 * 60 * 1000;

export type BreakDueInput = {
  /** When this continuous stretch of work began. The caller resets this the moment a break is
   * actually taken (a fresh QuestShell mount already does this for free -- see that component's
   * own comment) or whenever it decides a new stretch has started; this module never guesses. */
  workStartedAt: number;
  /** The last time he was offered a break and chose "Not now", if ever, this stretch. */
  lastDismissedAt?: number;
  now: number;
};

/**
 * Whether a break is worth offering right now. This says nothing about WHEN it is safe to show
 * that offer on screen -- that is a separate, harder rule ("at a natural boundary between steps,
 * never mid-problem") that belongs to the caller, not here: a pure function of elapsed time has
 * no way to know whether he is mid-problem, and folding that knowledge in here would make this
 * untestable without a fake QuestProgress. QuestShell only ever calls this at a step boundary
 * (see its own doc comment), so "due" and "about to be shown" end up meaning the same thing in
 * practice without this function having to know why.
 */
export function breakDue({ workStartedAt, lastDismissedAt, now }: BreakDueInput): boolean {
  if (now - workStartedAt < BREAK_INTERVAL_MS) return false;
  if (lastDismissedAt !== undefined && now - lastDismissedAt < BREAK_SNOOZE_MS) return false;
  return true;
}
