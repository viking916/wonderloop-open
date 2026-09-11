"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Step } from "@/lib/content/schema";
import { isStepComplete, type QuestProgress } from "@/lib/domain/completion";
import { ProblemFigure } from "./ProblemFigure";
import { StepBody } from "./StepBody";

export type ScienceStepProps = {
  step: Extract<Step, { kind: "science" }>;
  progress: QuestProgress;
  onUpdate: (updater: (prev: QuestProgress) => QuestProgress) => Promise<void>;
  /** Task 41 (one-primary audit): same shape as InstructionStep's own prop of the same name --
   * reports whether "Got it" is currently the step's own live primary control, so QuestShell can
   * hide its persistent "Continue" while this step is unfinished. */
  onOwnPrimaryChange?: (visible: boolean) => void;
};

/** Science moment (spec 7.1 screen 3): title and body, paragraph breaks preserved, a "Got it"
 * tick. Same shape as InstructionStep -- kept as its own file because the brief lists it as its
 * own step kind and its own component, not because the rendering differs. */
export function ScienceStep({ step, progress, onUpdate, onOwnPrimaryChange }: ScienceStepProps) {
  const done = isStepComplete(step, progress);
  const [saving, setSaving] = useState(false);

  // !saving too: mid-save, "Got it" is briefly disabled and is not, for that instant, a real
  // competing primary either.
  useEffect(() => {
    onOwnPrimaryChange?.(!done && !saving);
    return () => onOwnPrimaryChange?.(false);
  }, [done, saving, onOwnPrimaryChange]);

  async function handleGotIt() {
    setSaving(true);
    try {
      await onUpdate((prev) => {
        if (isStepComplete(step, prev)) return prev;
        return { ...prev, ticks: [...prev.ticks.filter((t) => t.stepId !== step.id), { stepId: step.id, done: true }] };
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="tr-step" aria-labelledby={`${step.id}-title`}>
      <h3 id={`${step.id}-title`} className="tr-step__title">
        {step.title}
      </h3>
      <StepBody text={step.body} />
      {step.figure ? <ProblemFigure figure={step.figure} /> : null}
      <div className="tr-step__actions">
        <Button variant="primary" onClick={handleGotIt} disabled={done || saving}>
          {done ? "Got it, done" : saving ? "Saving..." : "Got it"}
        </Button>
      </div>
    </section>
  );
}
