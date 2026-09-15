"use client";

import type { Step } from "@/lib/content/schema";
import { isStepComplete, type QuestProgress } from "@/lib/domain/completion";
import { ProblemFigure } from "./ProblemFigure";
import { StepBody } from "./StepBody";

export type TaskStepProps = {
  step: Extract<Step, { kind: "task" }>;
  progress: QuestProgress;
  onUpdate: (updater: (prev: QuestProgress) => QuestProgress) => Promise<void>;
};

/** Task step (spec 7.1 screen 3): body with inline code styling, and the checklist as real
 * checkboxes. Per-item state lives in QuestProgress.checklist, keyed by this step's id, one
 * boolean per step.checklist entry in order -- exactly what completion.ts's isStepComplete
 * reads for the "task" case. This component never decides completion itself; it calls
 * isStepComplete and shows whatever it returns. */
export function TaskStep({ step, progress, onUpdate }: TaskStepProps) {
  const items = progress.checklist[step.id] ?? step.checklist.map(() => false);
  const done = isStepComplete(step, progress);

  function toggle(i: number, checked: boolean) {
    void onUpdate((prev) => {
      const prevItems = prev.checklist[step.id] ? [...prev.checklist[step.id]] : step.checklist.map(() => false);
      prevItems[i] = checked;
      return { ...prev, checklist: { ...prev.checklist, [step.id]: prevItems } };
    });
  }

  return (
    <section className="tr-step" aria-labelledby={`${step.id}-title`}>
      <h3 id={`${step.id}-title`} className="tr-step__title">
        {step.title}
      </h3>
      <StepBody text={step.body} />
      {step.figure ? <ProblemFigure figure={step.figure} /> : null}
      <ul className="tr-checklist">
        {step.checklist.map((item, i) => (
          <li key={i}>
            <label>
              <input type="checkbox" checked={items[i] === true} onChange={(e) => toggle(i, e.target.checked)} />
              <span>{item}</span>
            </label>
          </li>
        ))}
      </ul>
      {done ? <p className="tr-step__done">Every box checked.</p> : null}
    </section>
  );
}
