"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import type { Quest, Step } from "@/lib/content/schema";
import type { QuestProgress } from "@/lib/domain/completion";
import { uploadArtifact } from "@/lib/data/artifacts";
import { RecordingBlock } from "./RecordingBlock";
import { StepBody } from "./StepBody";

export type ExplainStepProps = {
  step: Extract<Step, { kind: "explain" }>;
  quest: Quest;
  progress: QuestProgress;
  householdId: string;
  profileId: string;
  onUpdate: (updater: (prev: QuestProgress) => QuestProgress) => Promise<void>;
  /** Task 41 (one-primary audit): reports whether "Save answer" is currently the step's own live
   * primary control -- true until the first successful save (unlike InstructionStep's "Got it",
   * this button stays clickable afterward so he can revise and resave, so its variant demotes to
   * "secondary" once saved rather than disabling; see the `saved` render below), so QuestShell
   * can hide its persistent "Continue" while this step is unfinished. */
  onOwnPrimaryChange?: (visible: boolean) => void;
};

/**
 * Explain step (spec 7.1 screen 3, 10.3). Mode "written" is a textarea saved two places: into
 * QuestProgress.explains (what completion.ts's isStepComplete actually reads) and, once, as a
 * "text" artifact via lib/data/artifacts.ts, so the portfolio has something to show later.
 * Mode "voice" records the answer as audio (RecordingBlock, medium "audio"): the file goes to
 * Storage as a "recording" artifact and the fact into QuestProgress.explains as
 * `recording: true`, which is what isStepComplete reads. The same textarea sits underneath as
 * the typing fallback, always reachable, so a refused microphone never blocks the step.
 */
export function ExplainStep({ step, quest, progress, householdId, profileId, onUpdate, onOwnPrimaryChange }: ExplainStepProps) {
  const existing = progress.explains[step.id]?.text ?? "";
  const recorded = Boolean(progress.explains[step.id]?.recording);
  const [recordingPrimary, setRecordingPrimary] = useState(false);
  const [text, setText] = useState(existing);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(Boolean(existing));
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  // Matches the button's own `disabled` condition below exactly (saving or an empty draft):
  // reporting "own primary visible" while the button is actually disabled/kraft (see
  // app/globals.css) would hide "Continue" with nothing pressable left on screen at all, an
  // empty-textarea dead end this task must not introduce.
  const saveDisabled = saving || !text.trim();
  // In voice mode the typed save is the fallback and never the primary (RecordingBlock's
  // Record/Stop/Save is), so the two can never be red at once (docs/ui-styleguide.md section 1).
  const typedIsPrimary = step.mode === "written" && !saved;
  useEffect(() => {
    onOwnPrimaryChange?.((typedIsPrimary && !saveDisabled) || recordingPrimary);
    return () => onOwnPrimaryChange?.(false);
  }, [typedIsPrimary, saveDisabled, recordingPrimary, onOwnPrimaryChange]);

  async function handleSaveRecording(blob: Blob, contentType: string) {
    await uploadArtifact(householdId, profileId, { kind: "recording", questId: quest.id, week: quest.week, file: blob, contentType });
    await onUpdate((prev) => ({ ...prev, explains: { ...prev.explains, [step.id]: { ...prev.explains[step.id], recording: true } } }));
  }

  async function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      setSaveError(undefined);
      if (step.mode === "written") {
        await uploadArtifact(householdId, profileId, { kind: "text", questId: quest.id, week: quest.week, text: trimmed });
      }
      await onUpdate((prev) => ({ ...prev, explains: { ...prev.explains, [step.id]: { text: trimmed } } }));
      setSaved(true);
    } catch {
      setSaveError("That did not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="tr-step" aria-labelledby={`${step.id}-title`}>
      <h3 id={`${step.id}-title`} className="tr-step__title">
        {step.title}
      </h3>
      <StepBody text={step.prompt} />
      {saveError ? <Toast tone="hint" message={saveError} onDismiss={() => setSaveError(undefined)} /> : null}
      {step.mode === "voice" ? (
        <>
          <RecordingBlock
            medium="audio"
            idPrefix={step.id}
            saved={recorded}
            onSave={handleSaveRecording}
            onPrimaryChange={setRecordingPrimary}
          />
          <label className="tr-artifact-block__label" htmlFor={`${step.id}-typed`}>
            Or type it
          </label>
        </>
      ) : null}
      <textarea
        id={`${step.id}-typed`}
        className="tr-textarea"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        rows={6}
        aria-label="Your answer"
        placeholder="Write your answer here."
      />
      <div className="tr-step__actions">
        {/* Task 41: primary while unsaved (the step's own one CTA); once saved, demoted to
            secondary so it does not sit alongside the footer's "Continue" as a second live
            primary -- it stays clickable (he can revise and resave), just no longer the one
            thing this screen is for. */}
        <Button variant={typedIsPrimary ? "primary" : "secondary"} onClick={handleSave} disabled={saveDisabled}>
          {saving ? "Saving..." : saved ? "Saved" : "Save answer"}
        </Button>
      </div>
    </section>
  );
}
