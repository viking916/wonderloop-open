// resets.ts (domain): pure rule for whether a stored reset covers a given quest.
//
// Spec 7.2 asks only that resets are logged and that the mistake box and skills recompute from
// remaining attempts; it never asks for a quest/week/season reset to delete logs or artifacts,
// and lib/data/resets.ts's performReset never touches those two collections at any scope (task
// 13 fix 1, controller ruling: fix the copy and the presentation, not the deletion). A Maker's
// Log or artifact can therefore outlive a reset that returns its quest to "Not started" -- this
// module decides only whether that survivor should read as belonging to a run *before* the most
// recent reset that covers it, so a Parent view component never has to invent that judgement
// itself.

export type ResetRecord = { scope: "problem" | "quest" | "week" | "season"; targetId: string; at: number };

export type QuestIdentity = { questId: string; season: number; week: number };

function weekTargetId(season: number, week: number): string {
  return `s${season}-w${String(week).padStart(2, "0")}`;
}

function seasonTargetId(season: number): string {
  return `s${season}`;
}

/** Whether `reset` is scoped widely enough to cover `quest`: its own quest id, its week, or its
 * whole season. A problem-scoped reset never covers a whole quest's log or artifact -- it names
 * one problem, not the quest -- and matches nothing here regardless of targetId. */
function covers(reset: ResetRecord, quest: QuestIdentity): boolean {
  if (reset.scope === "quest") return reset.targetId === quest.questId;
  if (reset.scope === "week") return reset.targetId === weekTargetId(quest.season, quest.week);
  if (reset.scope === "season") return reset.targetId === seasonTargetId(quest.season);
  return false;
}

/**
 * The timestamp of the most recent reset that both covers `quest` and happened at or after `at`
 * (a log's or artifact's own timestamp) -- i.e. the reset that makes this item read as belonging
 * to a run from before that reset, rather than as live work against the quest's current,
 * post-reset status. Returns undefined when no such reset exists, meaning the item is current.
 */
export function coveringResetAt(at: number, quest: QuestIdentity, resets: readonly ResetRecord[]): number | undefined {
  let latest: number | undefined;
  for (const reset of resets) {
    if (reset.at >= at && covers(reset, quest) && (latest === undefined || reset.at > latest)) latest = reset.at;
  }
  return latest;
}
