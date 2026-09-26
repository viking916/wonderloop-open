// A quest's time, in one place (23 September 2026, the sittings field; meaning corrected the
// same day). `minutes` on a Quest is always the per-week figure, checked against TRACK_MINUTES by
// the schema, and it is NEVER multiplied by sittings: a heavy quest that carries `sittings: 2`
// takes two calendar weeks to finish at the SAME weekly pace, not double the weekly minutes in
// one week. questTimeLabel is the one place that turns a quest's minutes and sittings into the
// line a child or a parent reads, so every caller goes through it rather than reading either
// field alone.

export type QuestTime = { minutes: number; sittings?: 1 | 2 };

/** The short line shown wherever a quest's time reaches the child or the parent: "60 min" for an
 * ordinary one-week quest, "2 weeks, about 60 min each" once a quest carries a second week. */
export function questTimeLabel(quest: QuestTime): string {
  if (quest.sittings && quest.sittings > 1) {
    return `${quest.sittings} weeks, about ${quest.minutes} min each`;
  }
  return `${quest.minutes} min`;
}
