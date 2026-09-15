import type { Quest } from "../content/schema";
import type { QuestProgress } from "./completion";

/**
 * Extras (6 September 2026): the bonus tracks and make-your-own briefs a quest carries beside
 * its steps. They never count toward completion (completion.ts reads only step ids), so adding
 * them to a quest a child is mid-way through changes nothing about that child's record; a
 * finished extra is recorded as a tick under the extra's own id, the same shape a ticked
 * instruction step uses.
 */
export type Extra = NonNullable<Quest["extras"]>[number];

export function extrasOf(quest: Pick<Quest, "extras">): Extra[] {
  return quest.extras ?? [];
}

export function extraDone(progress: Pick<QuestProgress, "ticks">, extraId: string): boolean {
  return progress.ticks.some((t) => t.stepId === extraId && t.done);
}

export function withExtraTick(progress: QuestProgress, extraId: string, done: boolean): QuestProgress {
  const rest = progress.ticks.filter((t) => t.stepId !== extraId);
  return { ...progress, ticks: done ? [...rest, { stepId: extraId, done: true }] : rest };
}

export function extrasSummary(quest: Pick<Quest, "extras">, progress: Pick<QuestProgress, "ticks">): { done: number; total: number } {
  const list = extrasOf(quest);
  return { done: list.filter((e) => extraDone(progress, e.id)).length, total: list.length };
}

export const EXTRA_KIND_LABEL: Record<Extra["kind"], string> = { bonus: "Bonus track", invent: "Make your own" };
