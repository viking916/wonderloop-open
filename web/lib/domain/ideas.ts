// Pure idea-box rules (spec 7.4, docs/superpowers/plan-2-notes-from-content.md's Plan 1
// ruling: "the idea box records an idea from its first use in any problem, not from the
// introducesIdea flag"). No Firebase, no React, no Date.now(): every event the caller supplies
// already carries its own "at", the same convention lib/domain/badges.ts uses.
//
// An idea is "met" the moment any attempt is recorded against a problem tagged with it,
// whether or not that attempt was correct: lib/data/types.ts's AttemptDoc.ideaIds is written on
// every submitted try (see components/quest/ProblemPlayer.tsx), never only on a correct one, so
// an attempt event here already carries the same "he has seen this idea in use" meaning the
// spec asks the box to record.

export type IdeaEvent = { ideaId: string; problemId: string; at: number };

export type MetIdea = {
  ideaId: string;
  /** Distinct problems where this idea was used, earliest first. */
  problemIds: string[];
  /** When this idea was first met, across every problem tagged with it. */
  firstAt: number;
};

/**
 * Reduces a profile's idea-tagged attempt events to one entry per idea actually met, ordered by
 * first meeting. A problem attempted more than once (a retry, a mistake-box variant) still
 * contributes only one entry to that idea's problemIds, in the order first attempted -- "the
 * problems where he used it" is a set of problems, not a count of attempts.
 */
/**
 * Ideas met outside problems (6 September 2026, the physics thread): a science step or an extra
 * that names an `ideaId` counts as met once its tick is on record. The event's problemId is the
 * step or extra id; `at` is the quest's completion or start time, the nearest honest timestamp
 * a tick has (ticks carry none of their own).
 */
export function ideaEventsFromProgress(
  quests: Array<{ id: string; steps: Array<{ id: string; kind: string; ideaId?: string }>; extras?: Array<{ id: string; ideaId?: string }> }>,
  progress: Array<{ questId: string; progress: { startedAt?: number; completedAt?: number; quest: { ticks: Array<{ stepId: string; done: boolean }>; data?: Record<string, { at: number; answer: string }> } } }>,
): IdeaEvent[] {
  const byQuest = new Map(quests.map((q) => [q.id, q] as const));
  const events: IdeaEvent[] = [];
  for (const { questId, progress: doc } of progress) {
    const quest = byQuest.get(questId);
    if (!quest) continue;
    const at = doc.completedAt ?? doc.startedAt ?? 0;
    for (const tick of doc.quest.ticks) {
      if (!tick.done) continue;
      const step = quest.steps.find((s) => s.id === tick.stepId);
      const ideaId = step?.kind === "science" ? step.ideaId : quest.extras?.find((e) => e.id === tick.stepId)?.ideaId;
      if (ideaId) events.push({ ideaId, problemId: tick.stepId, at });
    }
    // A data step meets its idea once the table and the answer are saved (the answer is what
    // shows the idea was used, so an empty one does not count).
    for (const [stepId, entry] of Object.entries(doc.quest.data ?? {})) {
      const step = quest.steps.find((s) => s.id === stepId);
      if (step?.kind === "data" && step.ideaId && entry.answer.trim().length > 0) events.push({ ideaId: step.ideaId, problemId: stepId, at: entry.at || at });
    }
  }
  return events;
}

export function metIdeas(events: IdeaEvent[]): MetIdea[] {
  const byIdea = new Map<string, { problemOrder: string[]; problemSeen: Set<string>; firstAt: number }>();

  for (const event of [...events].sort((a, b) => a.at - b.at)) {
    const entry = byIdea.get(event.ideaId) ?? { problemOrder: [], problemSeen: new Set<string>(), firstAt: event.at };
    if (!entry.problemSeen.has(event.problemId)) {
      entry.problemSeen.add(event.problemId);
      entry.problemOrder.push(event.problemId);
    }
    entry.firstAt = Math.min(entry.firstAt, event.at);
    byIdea.set(event.ideaId, entry);
  }

  return [...byIdea.entries()]
    .sort((a, b) => a[1].firstAt - b[1].firstAt)
    .map(([ideaId, entry]) => ({ ideaId, problemIds: entry.problemOrder, firstAt: entry.firstAt }));
}
