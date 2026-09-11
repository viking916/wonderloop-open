"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import type { Quest, Step } from "@/lib/content/schema";
import { isStepComplete, type QuestProgress } from "@/lib/domain/completion";
import { saveLog, watchLogs } from "@/lib/data/logs";
import type { LogAnswers } from "@/lib/data/types";

export type LogStepProps = {
  step: Extract<Step, { kind: "log" }>;
  quest: Quest;
  progress: QuestProgress;
  householdId: string;
  profileId: string;
  onUpdate: (updater: (prev: QuestProgress) => QuestProgress) => Promise<void>;
  /** Task 41 (one-primary audit): reports whether "Save my log"/"Save again" is currently the
   * step's own live primary -- true until the first successful save (it stays clickable
   * afterward, exactly like ExplainStep's "Save answer", so its variant demotes to "secondary"
   * once saved rather than disabling), so QuestShell can hide its persistent "Continue" while
   * this step is unfinished. In every quest today this is the LAST step (verified across all 24
   * build/speak weeks), so "Continue" is already disabled by then regardless -- this still
   * reports honestly rather than assuming that stays true forever. */
  onOwnPrimaryChange?: (visible: boolean) => void;
};

// spec 8's five Maker's Log prompts, verbatim.
export const MAKER_PROMPTS = [
  "What did you make?",
  "How did you do it, in steps?",
  "What went wrong?",
  "How did you fix it, or what did you try?",
  "What would you do differently, and which idea did you use?",
];

// spec 8's three Speak prompts, verbatim: what was your claim; the hardest point to answer;
// what you would change. Exactly three, not padded to five -- lib/data/types.ts's LogDoc.answers
// is a 3-to-5-length array precisely so this variant never has to invent content the spec never
// wrote.
export const SPEAK_PROMPTS = ["What was your claim?", "What was the hardest point to answer?", "What would you change?"];

// The Practice log (Play track, 6 September 2026): four prompts. The first names the piece and
// its hard bars, so the week's target is on record; the second is the sittings themselves; the
// third asks for evidence of change, not a feeling; the fourth is the retrieval of an old piece,
// the part of practice that keeps what was learned.
export const PLAY_PROMPTS = [
  "Which piece, and which bars were the hard ones?",
  "What did you do in your sittings this week?",
  "What got easier, and how can you tell?",
  "Which old piece did you play again, and how did it go?",
];

const HARDEST_PART_PROMPT = "What was the hardest part?";
// spec 8: prompts 3 and 4 of the five-prompt Maker's Log cannot be answered "nothing went
// wrong" -- that sentence sits right after the five-prompt list, naming positions ("prompts 3
// and 4") that only exist in that list. The three-prompt Speak variant has no prompt 4 and its
// own prompt 3 ("what would you change") isn't the same question, so the guard only ever
// applies to the maker variant.
const NOTHING_PATTERN = /^(nothing|none|nothing went wrong)\.?$/i;
const GUARD_INDEXES: Record<"maker" | "speak" | "play", number[]> = { maker: [2, 3], speak: [], play: [] };

function promptsFor(variant: "maker" | "speak" | "play"): string[] {
  if (variant === "maker") return MAKER_PROMPTS;
  if (variant === "play") return PLAY_PROMPTS;
  return SPEAK_PROMPTS;
}

function blankAnswers(count: number): string[] {
  return Array.from({ length: count }, () => "");
}

/**
 * The Maker's Log / Speak log (spec 7.1 screen 3, 8). Textareas saved through lib/data/logs.ts's
 * saveLog, which persists the whole history (spec 7.2: "the newest is shown"); this component
 * pre-fills from the most recent log on record for this quest and lets him resave, creating a
 * fresh entry each time rather than editing the old one in place. Prompt count varies by
 * variant: five for "maker", exactly three for "speak" (spec 8) -- MAKER_PROMPTS/SPEAK_PROMPTS
 * above, not a fixed five-slot layout.
 *
 * The guard: on the maker variant only, prompts 3 and 4 (index 2 and 3) cannot be answered
 * "nothing went wrong". Once that pattern is caught, the prompt's own label swaps to "What was
 * the hardest part?" and the field is required to hold a real answer before saving proceeds --
 * typing "nothing" again against the swapped prompt is caught by the same check, so it cannot be
 * gamed by resubmitting the same non-answer.
 *
 * Completion is decided only by lib/domain/completion.ts's isStepComplete (the "log" case reads
 * progress.logs); this component never renders its own opinion of "done".
 */
export function LogStep({ step, quest, progress, householdId, profileId, onUpdate, onOwnPrimaryChange }: LogStepProps) {
  const prompts = promptsFor(step.variant);
  const guardIndexes = GUARD_INDEXES[step.variant];
  const alreadySaved = isStepComplete(step, progress);

  const [answers, setAnswers] = useState<string[]>(() => blankAnswers(prompts.length));
  const [swapped, setSwapped] = useState<boolean[]>(() => prompts.map(() => false));
  const [errors, setErrors] = useState<(string | null)[]>(() => prompts.map(() => null));
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(alreadySaved);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  // Unlike Explain/Debate/Artifact, "Save my log" is never disabled by empty text (handleSubmit
  // validates and shows a per-field error instead, spec 8) -- only `saving` briefly disables it,
  // so that is the only extra condition needed here to match the button's real enabled state.
  useEffect(() => {
    onOwnPrimaryChange?.(!savedOnce && !saving);
    return () => onOwnPrimaryChange?.(false);
  }, [savedOnce, saving, onOwnPrimaryChange]);

  useEffect(() => {
    const unsub = watchLogs(householdId, profileId, (list) => {
      const forQuest = list.filter((l) => l.log.questId === quest.id).sort((a, b) => b.log.at - a.log.at);
      const latest = forQuest[0];
      // Truncate to this variant's own prompt count: a Speak log saved before the Speak
      // variant was trimmed to three prompts can still carry five stored answers, and
      // hydrating all five here would silently re-persist the two invented ones on the next
      // save (see the same truncation just before saveLog below).
      if (latest) setAnswers([...latest.log.answers].slice(0, prompts.length));
    });
    return unsub;
  }, [householdId, profileId, quest.id, prompts.length]);

  function updateAnswer(i: number, value: string) {
    const next = [...answers];
    next[i] = value;
    setAnswers(next);
    if (errors[i]) {
      const nextErrors = [...errors];
      nextErrors[i] = null;
      setErrors(nextErrors);
    }
  }

  async function handleSubmit() {
    // Truncated again here (not just relied on from hydrate): answers can also come from the
    // blankAnswers(prompts.length) initializer or straight typing, so this is the one place
    // that actually gates what saveLog persists, whatever answers' history has been.
    const trimmed = answers.slice(0, prompts.length).map((a) => a.trim());
    const nextSwapped = [...swapped];
    const nextErrors: (string | null)[] = prompts.map(() => null);
    let blocked = false;

    trimmed.forEach((a, i) => {
      if (a.length === 0) {
        nextErrors[i] = "This one needs an answer.";
        blocked = true;
        return;
      }
      if (guardIndexes.includes(i) && NOTHING_PATTERN.test(a)) {
        nextSwapped[i] = true;
        nextErrors[i] = "Tell me something real, even something small.";
        blocked = true;
      }
    });

    setSwapped(nextSwapped);
    setErrors(nextErrors);
    if (blocked) return;

    setSaving(true);
    try {
      setSaveError(undefined);
      await saveLog(householdId, profileId, { questId: quest.id, answers: trimmed as LogAnswers });
      await onUpdate((prev) => ({ ...prev, logs: isStepComplete(step, prev) ? prev.logs : [...prev.logs, step.id] }));
      setSavedOnce(true);
    } catch {
      setSaveError("That did not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="tr-step" aria-labelledby={`${step.id}-title`}>
      <h3 id={`${step.id}-title`} className="tr-step__title">
        {step.variant === "maker" ? "Maker's Log" : step.variant === "play" ? "Practice log" : "Speak log"}
      </h3>
      {saveError ? <Toast tone="hint" message={saveError} onDismiss={() => setSaveError(undefined)} /> : null}
      <div className="tr-log">
        {prompts.map((prompt, i) => {
          const label = guardIndexes.includes(i) && swapped[i] ? HARDEST_PART_PROMPT : prompt;
          return (
            <div className="tr-log__item" key={i}>
              <label htmlFor={`${step.id}-p${i}`}>{label}</label>
              <textarea
                id={`${step.id}-p${i}`}
                className="tr-textarea"
                rows={3}
                value={answers[i]}
                onChange={(e) => updateAnswer(i, e.target.value)}
              />
              {errors[i] ? <p className="tr-log__error">{errors[i]}</p> : null}
            </div>
          );
        })}
      </div>
      <div className="tr-step__actions">
        {/* Task 41: demoted to secondary once already saved once, same reasoning as
            ExplainStep's "Save answer" -- still clickable to save a revision. */}
        <Button variant={savedOnce ? "secondary" : "primary"} onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving..." : savedOnce ? "Save again" : "Save my log"}
        </Button>
      </div>
    </section>
  );
}
