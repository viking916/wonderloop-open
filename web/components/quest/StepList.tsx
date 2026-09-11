"use client";

import { isStepComplete, type QuestProgress } from "@/lib/domain/completion";
import type { Step } from "@/lib/content/schema";

/** A short, kid-facing name for the sidebar waypoint list. Steps that carry their own title
 * use it directly; the rest get a fixed, plain-language name. Mirrors (but does not import,
 * since it is not exported) lib/domain/trackCard.ts's own stepLabel -- that one names the
 * single step This Week's card should resume at, this one names every step in this quest's
 * sidebar, and the two are allowed to drift in wording without breaking anything. */
function stepLabel(step: Step): string {
  switch (step.kind) {
    case "instruction":
    case "science":
    case "task":
    case "data":
    case "explain":
    case "artifact":
    case "problem-set":
    case "lesson":
      return step.title;
    case "typing":
      return "Typing practice";
    case "log":
      return step.variant === "maker" ? "Maker's Log" : step.variant === "play" ? "Practice log" : "Speak log";
    case "debate":
      return "The debate";
    case "warmup":
      return "Warm-up";
    case "puzzle-of-week":
      return "Puzzle of the week";
  }
}

export type StepListProps = {
  steps: Step[];
  progress: QuestProgress;
  currentIndex: number;
  onSelect: (index: number) => void;
};

/** The waypoint step list (trail-v2.html's Screen 2, .side/.steps/.wpt): done, current, todo,
 * one entry per step, each a real button so it is keyboard reachable and Enter activates it.
 * "Done" comes only from lib/domain/completion.ts's isStepComplete -- this component never
 * decides completion on its own. */
export function StepList({ steps, progress, currentIndex, onSelect }: StepListProps) {
  return (
    <ol className="tr-steps" aria-label="Quest steps">
      {steps.map((step, i) => {
        const done = isStepComplete(step, progress);
        const status = i === currentIndex ? "now" : done ? "ok" : "todo";
        return (
          <li key={step.id} data-status={status}>
            <button
              type="button"
              className="tr-step-btn"
              onClick={() => onSelect(i)}
              aria-current={i === currentIndex ? "step" : undefined}
            >
              <span className="tr-wpt" aria-hidden="true">
                {i + 1}
              </span>
              <span>{stepLabel(step)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
