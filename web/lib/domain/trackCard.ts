// This Week's per-track card model (spec 7.1 screen 2): the status the card renders as, its
// progress percentage, its meta line and its call-to-action label ("Start", "Resume at problem
// 4", "See it in the portfolio"). This is pure composition over completion.ts's already-tested
// questStatus/resumePosition/weekSummary -- nothing here re-derives status, resume position or
// minutes remaining, it only decides how to word them for the card.

import type { Quest, Step } from "../content/schema";
import {
  emptyQuestProgress,
  isStepComplete,
  questStatus,
  resumePosition,
  weekSummary,
  type QuestProgress,
} from "./completion";

export type TrackCardStatus = "done" | "current" | "todo";

export type TrackCardModel = {
  status: TrackCardStatus;
  /** Percent complete, 0 to 100. */
  progress: number;
  ctaLabel: string;
  meta: string;
};

type ProblemStep = Extract<Step, { kind: "warmup" | "problem-set" | "puzzle-of-week" }>;

function isProblemStep(step: Step): step is ProblemStep {
  return step.kind === "warmup" || step.kind === "problem-set" || step.kind === "puzzle-of-week";
}

/** A short, kid-facing name for a non-problem step, used when resuming lands there. Steps that
 * carry their own title (instruction, science, task, problem-set, explain, artifact) use it
 * directly; the rest get a fixed, plain-language name. */
function stepLabel(step: Step): string {
  switch (step.kind) {
    case "instruction":
    case "science":
    case "task":
    case "data":
    case "explain":
    case "artifact":
    case "lesson":
      return step.title;
    case "typing":
      return "Typing practice";
    case "log":
      return step.variant === "maker" ? "Maker's Log" : step.variant === "play" ? "Practice log" : "Speak log";
    case "debate":
      return "The debate";
    case "warmup":
    case "problem-set":
    case "puzzle-of-week":
      // Never reached: callers check PROBLEM_STEP_KINDS first.
      return "the next problem";
  }
}

function doneMeta(quest: Quest): string {
  if (quest.completion === "all-steps") return "All problems and explanations done";
  if (quest.completion === "artifact-and-log") return "Artifact and Maker's Log in the portfolio";
  // A Speak quest's log is a Speak log, not a Maker's Log (see stepLabel above). Its recording
  // lives in the portfolio too since 4 September 2026 (components/quest/RecordingBlock.tsx), or,
  // if the family chose to keep the file outside the app, the portfolio says so in its place.
  if (quest.track === "play") return "Recording and Practice log in the portfolio";
  return "Recording and Speak log in the portfolio";
}

/**
 * Builds the card model for one quest. `progress` is the quest's own QuestProgress (the
 * `.quest` field of its ProgressDoc), never the whole document.
 */
export function trackCardModel(quest: Quest, progress: QuestProgress = emptyQuestProgress()): TrackCardModel {
  const status = questStatus(quest, progress);
  const total = quest.steps.length;
  const remaining = quest.steps.filter((s) => !isStepComplete(s, progress)).length;
  const percent = status === "done" ? 100 : Math.round(((total - remaining) / total) * 100);
  const [summary] = weekSummary([quest], { [quest.id]: progress });
  const minutesLeft = summary.minutesLeft;

  if (status === "done") {
    return { status: "done", progress: 100, ctaLabel: "See it in the portfolio", meta: doneMeta(quest) };
  }

  if (status === "not_started") {
    return { status: "todo", progress: 0, ctaLabel: "Start", meta: "Not started" };
  }

  // in_progress or parked: both resume from the same place; "parked" only changes the wording.
  const pausedPrefix = progress.parked ? "Paused. " : "";
  const resume = resumePosition(quest, progress);
  const step = quest.steps[resume.stepIndex];

  if (!step) {
    // Every step reports complete but the completion rule (artifact-and-log /
    // recording-and-log) still says not done: the artifact or log step itself is missing.
    return { status: "current", progress: percent, ctaLabel: "Resume", meta: `${pausedPrefix}About ${minutesLeft} min left` };
  }

  if (isProblemStep(step)) {
    const n = (resume.problemIndex ?? 0) + 1;
    const totalInStep = step.kind === "puzzle-of-week" ? 1 : step.problems.length;
    return {
      status: "current",
      progress: percent,
      ctaLabel: `Resume at problem ${n}`,
      meta: `${pausedPrefix}Problem ${n} of ${totalInStep} · about ${minutesLeft} min left`,
    };
  }

  const label = stepLabel(step);
  return {
    status: "current",
    progress: percent,
    ctaLabel: `Resume: ${label}`,
    meta: `${pausedPrefix}${label} · about ${minutesLeft} min left`,
  };
}
