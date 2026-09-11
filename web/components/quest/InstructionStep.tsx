"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Step } from "@/lib/content/schema";
import { isStepComplete, type QuestProgress } from "@/lib/domain/completion";
import { ProblemFigure } from "./ProblemFigure";
import { StepBody } from "./StepBody";

export type InstructionStepProps = {
  step: Extract<Step, { kind: "instruction" }>;
  progress: QuestProgress;
  onUpdate: (updater: (prev: QuestProgress) => QuestProgress) => Promise<void>;
  /** Task 41 (one-primary audit): reports whether "Got it" is currently the step's own live
   * primary control (i.e. the step is not yet done -- once done, "Got it, done" is disabled and
   * no longer reads as primary, see app/globals.css's disabled-primary fill), so QuestShell can
   * hide its persistent "Continue" for exactly that window instead of showing two primary
   * buttons at once. Left undefined only in tests that do not care about this. */
  onOwnPrimaryChange?: (visible: boolean) => void;
};

/** Instruction step (spec 7.1 screen 3): title and body, paragraph breaks preserved through
 * CSS white-space rather than manual splitting, and a "Got it" tick. Completion is decided
 * only by lib/domain/completion.ts's isStepComplete (the "instruction" case reads this exact
 * ticks array); this component only ever proposes the tick, never renders its own opinion of
 * "done" beyond what the progress it was handed already says. */
export function InstructionStep({ step, progress, onUpdate, onOwnPrimaryChange }: InstructionStepProps) {
  const done = isStepComplete(step, progress);
  const [saving, setSaving] = useState(false);

  // !saving too: mid-save, "Got it" is briefly disabled (see app/globals.css's disabled-primary
  // fill) and is not, for that instant, a real competing primary either.
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
