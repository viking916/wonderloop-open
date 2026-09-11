"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ChoiceInput } from "./ChoiceInput";
import { NumberInput } from "./NumberInput";
import { TrueFalseInput } from "./TrueFalseInput";
import { ProblemFigure } from "./ProblemFigure";
import { checkAnswer, type UserInput } from "@/lib/answers";
import type { Lesson, LessonBeat } from "@/lib/content/schema";

export type LessonPlayerProps = {
  lesson: Lesson;
  /**
   * Fired once, after the last beat is answered right. A plain UI signal, nothing more -- this
   * component never decides what a caller does with it. LessonStep.tsx (the quest-step case)
   * turns it into a single progress-doc write marking the step complete, exactly like a log or
   * artifact step already does. The struggle-offer modal (ProblemPlayer.tsx) just closes the
   * overlay: it never persists anything, on purpose (see the module doc below).
   */
  onDone: () => void;
  /**
   * Task 41 (one-primary audit): reports whether this component is currently showing its own
   * primary control ("Check" while unanswered, "Next"/"Done" once a beat is answered right) --
   * true the entire time this component is mounted, since it always has exactly one of those two
   * on screen. LessonStep.tsx forwards this so QuestShell can hide its persistent "Continue" for
   * the whole lesson-step window; ProblemPlayer's struggle-offer overlay usage leaves it
   * undefined on purpose -- that usage is a modal over a problem, not a quest step, and has no
   * "Continue" footer of its own to conflict with.
   */
  onOwnPrimaryChange?: (visible: boolean) => void;
};

/**
 * "Meet the idea" (task 4, concept-first prototype, owner direction 2026-08-31): plays one
 * lesson's beats end to end, one figure plus one small check question per beat, answered from
 * the first screen, never text followed by "got it?". PURE TEACHING by construction, not just by
 * convention: this component has no Firestore import anywhere in it, no tries counter, no
 * cooldown, no hint tiers, and it never calls lib/data/progress.ts's recordAttempt/
 * persistAttempt, lib/domain/review.ts's scheduleOnMiss/clearOnVariantSuccess, or
 * lib/data/skills-recompute.ts. A wrong answer shows the beat's onWrong line and lets him try
 * again immediately, as many times as he wants, with no penalty and nothing written down about
 * it -- getting a beat wrong here can never touch attempts, skills, the mistake box or fast-fail.
 * The only thing that ever leaves this component is onDone, once, after the last beat.
 */
export function LessonPlayer({ lesson, onDone, onOwnPrimaryChange }: LessonPlayerProps) {
  const [index, setIndex] = useState(0);
  const beat = lesson.beats[index];
  const [draft, setDraft] = useState<Draft>(() => freshDraft(beat));
  const [wrong, setWrong] = useState(false);
  const [right, setRight] = useState(false);

  // Task 41: true only while a real, enabled primary is actually on screen -- "Check" while the
  // draft is valid (matches its own `disabled` prop below), or "Next"/"Done" once a beat is
  // answered right (never disabled). Reporting true unconditionally while merely mounted would
  // have hidden "Continue" even on an empty first field, with a disabled/kraft "Check" and
  // nothing pressable left at all -- exactly the dead end this task's other fixes (ExplainStep,
  // DebateStepPlaceholder, ArtifactStep) were careful to avoid.
  const ownPrimaryVisible = right || draftIsValid(draft);
  useEffect(() => {
    onOwnPrimaryChange?.(ownPrimaryVisible);
    return () => onOwnPrimaryChange?.(false);
  }, [ownPrimaryVisible, onOwnPrimaryChange]);

  function updateDraft(next: Draft) {
    setDraft(next);
    if (wrong) setWrong(false);
  }

  function handleCheck() {
    if (!draftIsValid(draft) || right) return;
    const result = checkAnswer(beat.answer, toUserInput(draft));
    if (result.correct) {
      setRight(true);
      setWrong(false);
    } else {
      setWrong(true);
    }
  }

  function handleNext() {
    const isLast = index >= lesson.beats.length - 1;
    if (isLast) {
      onDone();
      return;
    }
    const nextIndex = index + 1;
    setIndex(nextIndex);
    setDraft(freshDraft(lesson.beats[nextIndex]));
    setWrong(false);
    setRight(false);
  }

  function renderInput() {
    switch (draft.kind) {
      case "number":
        return <NumberInput value={draft.text} onChange={(text) => updateDraft({ kind: "number", text })} onEnter={handleCheck} disabled={right} />;
      case "choice":
        return (
          <ChoiceInput
            options={beat.options ?? []}
            value={draft.index}
            onChange={(i) => updateDraft({ kind: "choice", index: i })}
            disabled={right}
          />
        );
      case "boolean":
        return <TrueFalseInput value={draft.value} onChange={(v) => updateDraft({ kind: "boolean", value: v })} disabled={right} />;
    }
  }

  return (
    <section className="tr-step tr-lesson" aria-labelledby="tr-lesson-title">
      <div className="tr-pnum">
        <span className="tr-eyebrow">
          Meet the idea - {index + 1} of {lesson.beats.length}
        </span>
      </div>
      <ProblemFigure figure={beat.figure} />
      <h3 id="tr-lesson-title" className="tr-problem-prompt">
        {beat.prompt}
      </h3>
      {renderInput()}
      {!right ? (
        <div className="tr-answer__row">
          <Button variant="primary" onClick={handleCheck} disabled={!draftIsValid(draft)}>
            Check
          </Button>
        </div>
      ) : null}
      {wrong && !right ? <p className="tr-lesson__wrong">{beat.onWrong}</p> : null}
      {right ? (
        <>
          <p className="tr-lesson__right">{beat.onRight}</p>
          <div className="tr-step__actions">
            <Button variant="primary" onClick={handleNext}>
              {index >= lesson.beats.length - 1 ? "Done" : "Next"}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}

type Draft =
  | { kind: "number"; text: string }
  | { kind: "choice"; index: number | null }
  | { kind: "boolean"; value: boolean | null };

function freshDraft(beat: LessonBeat): Draft {
  switch (beat.answer.kind) {
    case "number":
      return { kind: "number", text: "" };
    case "choice":
      return { kind: "choice", index: null };
    case "boolean":
      return { kind: "boolean", value: null };
  }
}

function draftIsValid(draft: Draft): boolean {
  switch (draft.kind) {
    case "number":
      return draft.text.trim() !== "";
    case "choice":
      return draft.index !== null;
    case "boolean":
      return draft.value !== null;
  }
}

function toUserInput(draft: Draft): UserInput {
  switch (draft.kind) {
    case "number":
      return { kind: "number", text: draft.text };
    case "choice":
      return { kind: "choice", index: draft.index ?? -1 };
    case "boolean":
      return { kind: "boolean", value: draft.value ?? false };
  }
}
