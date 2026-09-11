"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Step } from "@/lib/content/schema";
import { isStepComplete, type QuestProgress } from "@/lib/domain/completion";
import { StepBody } from "./StepBody";

export type TypingStepProps = {
  step: Extract<Step, { kind: "typing" }>;
  progress: QuestProgress;
  onUpdate: (updater: (prev: QuestProgress) => QuestProgress) => Promise<void>;
  /** Task 41 (one-primary audit): reports whether "Start the timer"/"Pause"/"Resume" is
   * currently the step's own live primary control (i.e. the step is not yet done -- once done
   * the button is not rendered at all, replaced by "Five minutes done."), so QuestShell can hide
   * its persistent "Continue" for exactly that window instead of showing two primary buttons at
   * once. Left undefined only in tests that do not care about this. */
  onOwnPrimaryChange?: (visible: boolean) => void;
};

const TOTAL_SECONDS = 5 * 60;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** The five-minute typing timer (spec 7.1 screen 3). He starts it, it counts down, he can
 * pause with no penalty (pausing only stops the interval, it never resets secondsLeft), and it
 * ticks the step done the moment it reaches zero. Nothing in lib/domain/completion.ts's
 * QuestProgress shape tracks a partial countdown, so a refresh mid-timer restarts at 5:00 --
 * that is the domain model's own choice, not a bug this component works around. */
export function TypingStep({ step, progress, onUpdate, onOwnPrimaryChange }: TypingStepProps) {
  const done = isStepComplete(step, progress);
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const [running, setRunning] = useState(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    onOwnPrimaryChange?.(!done);
    return () => onOwnPrimaryChange?.(false);
  }, [done, onOwnPrimaryChange]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (secondsLeft > 0 || finishedRef.current || done) return;
    finishedRef.current = true;
    setRunning(false);
    void onUpdate((prev) => {
      if (isStepComplete(step, prev)) return prev;
      return { ...prev, ticks: [...prev.ticks.filter((t) => t.stepId !== step.id), { stepId: step.id, done: true }] };
    });
  }, [secondsLeft, done, onUpdate, step]);

  return (
    <section className="tr-step" aria-labelledby={`${step.id}-title`}>
      <h3 id={`${step.id}-title`} className="tr-step__title">
        Typing practice
      </h3>
      <StepBody text={step.body} />
      {done ? (
        <p className="tr-step__done">Five minutes done.</p>
      ) : (
        <div className="tr-timer">
          <div className="tr-timer__big" aria-live="polite">
            {formatTime(secondsLeft)}
          </div>
          <div className="tr-step__actions">
            <Button variant="primary" onClick={() => setRunning((r) => !r)}>
              {running ? "Pause" : secondsLeft === TOTAL_SECONDS ? "Start the timer" : "Resume"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
