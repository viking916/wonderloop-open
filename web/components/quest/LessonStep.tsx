"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { LessonPlayer } from "./LessonPlayer";
import { getLesson } from "@/lib/content/app-content";
import type { Step } from "@/lib/content/schema";
import { isStepComplete, type QuestProgress } from "@/lib/domain/completion";

export type LessonStepProps = {
  step: Extract<Step, { kind: "lesson" }>;
  progress: QuestProgress;
  onUpdate: (updater: (prev: QuestProgress) => QuestProgress) => Promise<void>;
  /** Task 41 (one-primary audit): forwarded straight through to LessonPlayer, which is the
   * thing that actually renders an own primary control ("Check", then "Next"/"Done") throughout
   * every beat. Left undefined for the "already done, not replaying" branch below (only "See it
   * again", a quiet control, and lib/domain/completion's own definition of an already-finished
   * lesson step already keeps the quest-level "Continue" as the one primary there). */
  onOwnPrimaryChange?: (visible: boolean) => void;
};

/**
 * Wraps LessonPlayer for the quest-step case (task 4: "Meet the idea" inserted before week 6's
 * skills lane). The ONLY Firestore-touching thing this file does is mark the step complete once
 * LessonPlayer's onDone fires -- a single progress-doc write to `quest.lessons`, exactly the
 * same shape as a log or debate step's own completion write, and nothing else: no attempt, no
 * skill, no reviewQueue entry is ever created here. Completion is read the normal way
 * (isStepComplete), so once he has been through it once, coming back shows a quiet "already
 * done" state with a free, ungated replay -- replaying teaches nothing new to record, so there
 * is nothing to reset.
 */
export function LessonStep({ step, progress, onUpdate, onOwnPrimaryChange }: LessonStepProps) {
  const lesson = getLesson(step.lessonId);
  const alreadyDone = isStepComplete(step, progress);
  const [replaying, setReplaying] = useState(false);

  if (!lesson) {
    // Content validation (lib/content/load.ts) guarantees every lessonId resolves, so this is
    // unreachable with real content -- kept as a plain, honest fallback rather than a crash.
    return (
      <section className="tr-step tr-lesson">
        <p className="tr-step__note">This lesson is not available right now.</p>
      </section>
    );
  }

  async function markDone() {
    await onUpdate((prev) => ({
      ...prev,
      lessons: (prev.lessons ?? []).includes(step.id) ? (prev.lessons ?? []) : [...(prev.lessons ?? []), step.id],
    }));
    setReplaying(false);
  }

  if (alreadyDone && !replaying) {
    return (
      <section className="tr-step tr-lesson" aria-labelledby={`${step.id}-title`}>
        <h3 id={`${step.id}-title`} className="tr-step__title">
          {step.title}
        </h3>
        <p className="tr-step__note">You already met this idea. You can look at it again any time.</p>
        <div className="tr-step__actions">
          <Button variant="quiet" onClick={() => setReplaying(true)}>
            See it again
          </Button>
        </div>
      </section>
    );
  }

  return (
    <LessonPlayer
      key={replaying ? "replay" : "first"}
      lesson={lesson}
      onDone={() => void markDone()}
      onOwnPrimaryChange={onOwnPrimaryChange}
    />
  );
}
