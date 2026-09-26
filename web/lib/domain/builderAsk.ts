// Build and Make Ask (A4, year refinement 2026-09-24, owner ruling in section 0.1 of
// docs/superpowers/plans/2026-09-24-year-refinement.md): a second AI panel, sibling to Ask
// (lib/domain/tutor.ts, components/quest/AskPanel.tsx) but briefed on a Build or Make step
// itself rather than a Think/Ladder problem. The owner's ruling: available at any step, at any
// time, with no miss required (unlike Ask, which needs at least one miss on record) -- from
// season 1 week 5 on, since s1-w01 to s1-w04 are the child's very first weeks in the app and the
// owner wants those guided by the authored content alone. Every season 2, 3 and 4 Build or Make
// quest already clears the rule with room to spare, since the Make track itself is never
// authored before season 2.
//
// Deliberately its own module, not an extension of lib/domain/tutor.ts: MAX_CHILD_MESSAGES there
// is a per-PROBLEM cap on one Think/Ladder problem's chat; MAX_BUILDER_STEP_MESSAGES here is a
// per-STEP cap on one Build or Make step's chat, a different budget answering a different
// question, and the two must never be read as interchangeable.

import type { Quest, Step } from "../content/schema";

/** After this many child messages on one step's chat, Builder Ask closes the conversation the
 * same way Ask does (lib/domain/tutor.ts's MAX_CHILD_MESSAGES): "try it now, then show a
 * grown-up" rather than opening a new question. The owner's own suggestion in the A4 ruling was
 * 10; raised to 25 (owner feedback, 25 September 2026: "AI is too strict, going in circles, and
 * has limited asks") alongside the prompt fix that stops the circling itself -- see
 * lib/ai/builder.ts's systemPrompt and docs/superpowers/specs/2026-09-25-builder-ask-prompt.md's
 * "2026-09-25 anti-circling revision" section. */
export const MAX_BUILDER_STEP_MESSAGES = 25;

/** Just the Quest fields this rule needs, so a test (or any future caller) can pass a plain
 * object instead of a full authored Quest. */
export type BuilderAskQuestInfo = Pick<Quest, "track" | "season" | "week">;

/**
 * Owner ruling 0.1 (2026-09-24 year refinement, A4): Build and Make Ask appears from season 1
 * week 5 on, at any step, with no miss required. Season 1 weeks 1 to 4 are the only exclusion.
 */
export function builderAskAvailable(quest: BuilderAskQuestInfo): boolean {
  if (quest.track !== "build" && quest.track !== "make") return false;
  if (quest.season === 1 && quest.week < 5) return false;
  return true;
}

/** The step kinds Builder Ask can brief itself on: the four kinds that carry a real title and
 * body a child could be stuck on (instruction, science, task, data). typing, artifact and log
 * steps carry no body to brief the model with (typing has no title; artifact carries a prompt,
 * not a body; log carries neither); warmup, problem-set, puzzle-of-week, explain, debate and
 * lesson steps never appear in a Build or Make quest at all. A step of any other kind simply
 * gets no Builder Ask panel. */
export type BuilderAskStep = Extract<Step, { kind: "instruction" | "science" | "task" | "data" }>;
const BRIEFABLE_KINDS: ReadonlySet<Step["kind"]> = new Set(["instruction", "science", "task", "data"]);

export function isBuilderAskStep(step: Step): step is BuilderAskStep {
  return BRIEFABLE_KINDS.has(step.kind);
}

export type BuilderAskStepBrief = { title: string; body: string; checklist?: string[] };

/** The step brief Builder Ask is given: title, body and (task steps only) the checklist.
 * Undefined for a step kind Builder Ask does not brief itself on (see isBuilderAskStep). */
export function builderAskStepBrief(step: Step): BuilderAskStepBrief | undefined {
  if (!isBuilderAskStep(step)) return undefined;
  return { title: step.title, body: step.body, checklist: step.kind === "task" ? [...step.checklist] : undefined };
}

/**
 * households/{hid}/profiles/{pid}/tutorChats/{id}: the same collection Ask's problem chats
 * already live in (lib/data/types.ts's tutorChatId, `${questId}__${problemId}`), so the Parent
 * view's one listener (watchTutorChats) already picks up a step chat with no second query. A
 * step chat's id carries a literal "__step__" marker so the two id shapes can never be confused
 * for one another, even though a step id (schema.ts's StepId pattern, e.g. "s1-w05-build-11")
 * and a problem id (e.g. "s1-w05-build-11-p01") happen not to collide today.
 */
export function builderChatId(questId: string, stepId: string): string {
  return `${questId}__step__${stepId}`;
}
