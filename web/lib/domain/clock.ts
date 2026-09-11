// The opt-in clock on a timed problem set (curriculum review 2026-09-05, lever 5). Pure: no
// React, no Firebase, no Date.now(); "now" is always passed in, as calendar.ts does.
//
// House rule, kept on purpose: the clock counts up and records how many minutes a set took. It
// never counts down, never scores, and is never required. A child may decline it and the set is
// exactly the same set. What is recorded is one number, "minutes to finish", which the Parent
// view shows as a fact beside the summit, never as a grade.

import type { Step } from "../content/schema";
import type { QuestProgress, StepClock } from "./completion";

export type { StepClock };

export type TimedStep = Extract<Step, { kind: "problem-set" }> & { timed: true };

export function isTimedStep(step: Step): step is TimedStep {
  return step.kind === "problem-set" && step.timed === true;
}

export function clockFor(progress: QuestProgress, stepId: string): StepClock | undefined {
  return progress.clocks?.[stepId];
}

/** True while the offer should show: a timed step the child has neither started nor declined,
 * and has not already begun answering (a set half done before the feature existed never gets a
 * clock retrofitted onto it). */
export function clockOfferOpen(step: Step, progress: QuestProgress): boolean {
  if (!isTimedStep(step)) return false;
  const clock = clockFor(progress, step.id);
  if (clock?.startedAt !== undefined || clock?.declined) return false;
  return step.problems.every((p) => (progress.problemOutcomes[p.id] ?? "unanswered") === "unanswered");
}

export function startClock(progress: QuestProgress, stepId: string, now: number): QuestProgress {
  const existing = clockFor(progress, stepId);
  if (existing?.startedAt !== undefined || existing?.declined) return progress;
  return { ...progress, clocks: { ...(progress.clocks ?? {}), [stepId]: { startedAt: now } } };
}

export function declineClock(progress: QuestProgress, stepId: string): QuestProgress {
  const existing = clockFor(progress, stepId);
  if (existing?.startedAt !== undefined || existing?.declined) return progress;
  return { ...progress, clocks: { ...(progress.clocks ?? {}), [stepId]: { declined: true } } };
}

/** Every problem in the set has an outcome, whatever the outcome was. */
export function setComplete(step: Extract<Step, { kind: "problem-set" | "warmup" }>, progress: QuestProgress): boolean {
  return step.problems.every((p) => (progress.problemOutcomes[p.id] ?? "unanswered") !== "unanswered");
}

/** Stops a running clock. Ignored when it never started or has already stopped. */
export function finishClock(progress: QuestProgress, stepId: string, now: number): QuestProgress {
  const existing = clockFor(progress, stepId);
  if (existing?.startedAt === undefined || existing.finishedAt !== undefined) return progress;
  return { ...progress, clocks: { ...(progress.clocks ?? {}), [stepId]: { ...existing, finishedAt: Math.max(now, existing.startedAt) } } };
}

/** True when the clock is running: started, not finished, not declined. */
export function clockRunning(clock: StepClock | undefined): boolean {
  return Boolean(clock && clock.startedAt !== undefined && clock.finishedAt === undefined);
}

/** Seconds on the clock right now, or the final figure once it has stopped. */
export function clockSeconds(clock: StepClock, now: number): number {
  if (clock.startedAt === undefined) return 0;
  const end = clock.finishedAt ?? now;
  return Math.max(0, Math.floor((end - clock.startedAt) / 1000));
}

/** "Minutes to finish", whole minutes, never below one: the one number that is kept. */
export function minutesToFinish(clock: StepClock): number | undefined {
  if (clock.startedAt === undefined || clock.finishedAt === undefined) return undefined;
  return Math.max(1, Math.round((clock.finishedAt - clock.startedAt) / 60000));
}

/** "4:07" style running display. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The finished clocks of a quest, for the Parent view: step title and minutes, in step order. */
export function finishedClocks(quest: { steps: Step[] }, progress: QuestProgress): Array<{ stepId: string; title: string; minutes: number }> {
  const out: Array<{ stepId: string; title: string; minutes: number }> = [];
  for (const step of quest.steps) {
    if (!isTimedStep(step)) continue;
    const clock = clockFor(progress, step.id);
    const minutes = clock ? minutesToFinish(clock) : undefined;
    if (minutes !== undefined) out.push({ stepId: step.id, title: step.title, minutes });
  }
  return out;
}
