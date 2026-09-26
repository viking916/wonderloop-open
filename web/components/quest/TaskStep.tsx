"use client";

import { useState } from "react";
import type { Step } from "@/lib/content/schema";
import { isStepComplete, type QuestProgress } from "@/lib/domain/completion";
import { useDelayedPending } from "@/lib/pendingTiming";
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
 * isStepComplete and shows whatever it returns.
 *
 * A checkbox has no room for a spinner of its own, and its checked state is only ever a mirror
 * of `progress` -- there is nothing local to flip early. Owner report ("nothing happens
 * instantly so it feels broken") still applies here: savingCount tracks how many ticks are
 * currently mid-write, and the shared anti-flicker timing (lib/pendingTiming.ts, the same module
 * Button.tsx and useAsyncAction use) turns that into one quiet "Saving" line below the list, so a
 * slow connection is never silent. */
export function TaskStep({ step, progress, onUpdate }: TaskStepProps) {
  const items = progress.checklist[step.id] ?? step.checklist.map(() => false);
  const done = isStepComplete(step, progress);
  const [savingCount, setSavingCount] = useState(0);
  const savingVisible = useDelayedPending(savingCount > 0);

  function toggle(i: number, checked: boolean) {
    setSavingCount((c) => c + 1);
    void onUpdate((prev) => {
      const prevItems = prev.checklist[step.id] ? [...prev.checklist[step.id]] : step.checklist.map(() => false);
      prevItems[i] = checked;
      return { ...prev, checklist: { ...prev.checklist, [step.id]: prevItems } };
    }).finally(() => setSavingCount((c) => c - 1));
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
      {savingVisible ? (
        <p className="tr-step__note" aria-live="polite">
          Saving...
        </p>
      ) : null}
      {done ? <p className="tr-step__done">Every box checked.</p> : null}
    </section>
  );
}
