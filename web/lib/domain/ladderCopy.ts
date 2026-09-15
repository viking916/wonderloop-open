/**
 * Pure copy helpers for the Ladder screen (docs/superpowers/specs/2026-09-08-math-ladder-design.md,
 * "The week on the Ladder", and its 13 September 2026 addendum on the week no longer being bound
 * to weekdays). No Firebase dependency, no React; `LadderSession` calls these at the moment a
 * session ends and stores the result as the done note, so the child always sees a reason for why
 * the session stopped rather than a generic message.
 */

import { SESSIONS_PER_WEEK } from "./ladder";

export type SessionDoneReason = "session" | "placement" | "stopped" | "fluency";

export interface SessionDoneMessageArgs {
  /** Why the session ended. */
  reason: SessionDoneReason;
  /** How many rounds this session was built from (0 when not meaningful, e.g. placement). */
  roundsToday: number;
  /** The session's position in its week, 0-based (0, 1 or 2). Unused by reasons that do not name
   * a session ("placement", "stopped"). */
  indexInWeek: number;
  /** Whether this was the week's third and last session and it is now complete. */
  weekComplete: boolean;
  /** The topic to name as "next time"; the topic in progress, or placement's first topic. */
  nextTopicTitle?: string;
  /** The mastery/fail note from the last fluency round, when the session ended right after one. */
  note?: string;
}

/**
 * The done screen's description. One reason, one message, so the child always knows why the
 * session stopped: a session's rounds finishing (naming its place in the week, and the week's own
 * completion when this was its last session), placement finishing, stopping early, or the last
 * thing done being a fluency round (its own note is kept and shown, since it already says
 * everything: mastered or not, and what comes next).
 */
export function sessionDoneMessage(args: SessionDoneMessageArgs): string {
  const { reason, roundsToday, indexInWeek, weekComplete, nextTopicTitle, note } = args;
  switch (reason) {
    case "session": {
      const count = `${roundsToday} round${roundsToday === 1 ? "" : "s"}`;
      const base = `Session ${indexInWeek + 1} of ${SESSIONS_PER_WEEK} done: ${count}. Everything you did is saved.`;
      if (weekComplete) return `${base} This Ladder week is complete.`;
      return nextTopicTitle ? `${base} Next time: ${nextTopicTitle}.` : base;
    }
    case "placement":
      return `Placement done. The Ladder starts at ${nextTopicTitle ?? "the top"}. The next session begins the real rounds.`;
    case "stopped":
      return "Stopped for today. Everything you did is saved.";
    case "fluency": {
      const base = note ? `${note} Everything you did is saved.` : "Everything you did is saved.";
      return weekComplete ? `${base} This Ladder week is complete.` : base;
    }
    default:
      return "Everything you did is saved.";
  }
}

/**
 * The Ladder home screen's own summary line (package C item 4, 15 September 2026): "Ladder week
 * N", plus how many topics are mastered and how many skills are due for retrieval, said plainly
 * and only when there is something to say. "0 topics mastered. 0 skills due for retrieval." on a
 * brand new profile read like a debug line to the owner; a zero count adds nothing a parent or
 * child does not already know from the rest of the screen, so it is left out rather than spelled
 * out.
 */
export function ladderHomeFacts(weekNumber: number, masteredCount: number, dueCount: number): string {
  const parts = [`Ladder week ${weekNumber}.`];
  if (masteredCount > 0) parts.push(`${masteredCount} topic${masteredCount === 1 ? "" : "s"} mastered.`);
  if (dueCount > 0) parts.push(`${dueCount} skill${dueCount === 1 ? "" : "s"} due for retrieval.`);
  return parts.join(" ");
}
