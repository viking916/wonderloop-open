"use client";

import { useEffect, useState } from "react";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import type { Quest, Step } from "@/lib/content/schema";
import { isStepComplete, savableArtifactKinds, type ArtifactKind, type QuestProgress } from "@/lib/domain/completion";
import { uploadArtifact, watchArtifacts } from "@/lib/data/artifacts";
import { getStorageBucket } from "@/lib/firebase/client";
import { RecordingBlock } from "./RecordingBlock";
import { saveFailureMessage } from "./saveFailure";
import { PhotoCapture } from "./PhotoCapture";
import { StepBody } from "./StepBody";

export type ArtifactStepProps = {
  step: Extract<Step, { kind: "artifact" }>;
  quest: Quest;
  progress: QuestProgress;
  householdId: string;
  profileId: string;
  onUpdate: (updater: (prev: QuestProgress) => QuestProgress) => Promise<void>;
  /** Task 41 (one-primary audit): reports whether this step's own "Save code"/"Save text"/"Mark
   * the recording made" control is currently the step's live primary -- true until isStepComplete
   * (an accepted artifact kind on record), matching photo's own save-on-choose path too, so
   * QuestShell can hide its persistent "Continue" while this step is unfinished. */
  onOwnPrimaryChange?: (visible: boolean) => void;
};

function dedupe(kinds: ArtifactKind[]): ArtifactKind[] {
  return Array.from(new Set(kinds));
}

function addKind(step: ArtifactStepProps["step"], progress: QuestProgress, kind: ArtifactKind): QuestProgress {
  return { ...progress, artifacts: { ...progress.artifacts, [step.id]: dedupe([...(progress.artifacts[step.id] ?? []), kind]) } };
}

/**
 * Artifact step (spec 7.1 screen 3, 7.2). Photo (file picker, camera where the browser offers
 * it via the `capture` attribute), code paste, or plain text, gated by step.accepts; uploads go
 * through lib/data/artifacts.ts's uploadArtifact, which is the only place that writes to
 * Storage.
 *
 * "recording" is a real upload since 4 September 2026 (owner: recordings live in Firebase
 * Storage). RecordingBlock records in the app, or takes a video the phone made, and both land
 * in Storage through uploadArtifact like a photo does. Its last resort, marking the recording
 * made with the file kept elsewhere, writes no artifact doc, only the fact into
 * QuestProgress.artifacts (the field isStepComplete reads), because an artifact doc with no
 * file behind it would put an empty entry in the portfolio. Which blocks render is
 * lib/domain/completion.ts's savableArtifactKinds, shared with the test that holds every
 * landed quest to being completable.
 *
 * The photo preview re-fetches its download URL from Storage on mount (best-effort: the most
 * recent "photo" artifact recorded against this quest), so it survives a refresh. Code and text
 * previews only echo back the exact value just saved in this session -- lib/data/types.ts's
 * ArtifactDoc has no stepId field to look one up precisely by step after a reload, and
 * completion itself never depends on the preview redisplaying, only on QuestProgress.artifacts.
 */
export function ArtifactStep({ step, quest, progress, householdId, profileId, onUpdate, onOwnPrimaryChange }: ArtifactStepProps) {
  const submitted = progress.artifacts[step.id] ?? [];
  const done = isStepComplete(step, progress);
  // The kinds this step can actually put on record, not merely the kinds its content accepts
  // (see savableArtifactKinds): every block below renders off this one list.
  const savable = savableArtifactKinds(step);
  // A marked recording is a fact on record, never a stored file, so it is deliberately kept out
  // of the "Saved:" line at the bottom -- the recording block below says what is true of it.
  const savedFiles = submitted.filter((kind) => kind !== "recording");
  const recordingMarked = submitted.includes("recording");

  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | undefined>(undefined);
  const [hydratedPhotoUrl, setHydratedPhotoUrl] = useState<string | undefined>(undefined);
  const [photoSaving, setPhotoSaving] = useState(false);

  const [codeText, setCodeText] = useState("");
  const [savedCode, setSavedCode] = useState("");
  const [codeSaving, setCodeSaving] = useState(false);

  const [textText, setTextText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [textSaving, setTextSaving] = useState(false);

  // True once a recording file for this quest exists in Storage (hydrated below), which is how
  // "saved here" is told apart from "marked made, kept elsewhere": progress records only the kind.
  const [hasRecordingFile, setHasRecordingFile] = useState(false);
  // RecordingBlock reports its own live primary (Record, Stop or Save) through this.
  const [recordingPrimary, setRecordingPrimary] = useState(false);

  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  // Task 41: mirrors each block's own `disabled` condition (photo has no button of its own --
  // it saves straight from the file picker's onChange, never sitting disabled-and-visible) so
  // "own primary visible" is only ever reported while a real, enabled red button is on screen --
  // never while every block is empty/kraft, which would hide "Continue" with nothing pressable
  // left at all.
  const codeReady = savable.includes("code") && !codeSaving && Boolean(codeText.trim());
  const textReady = savable.includes("text") && !textSaving && Boolean(textText.trim());
  useEffect(() => {
    onOwnPrimaryChange?.(!done && (codeReady || textReady || recordingPrimary));
    return () => onOwnPrimaryChange?.(false);
  }, [done, codeReady, textReady, recordingPrimary, onOwnPrimaryChange]);

  useEffect(() => {
    if (!step.accepts.includes("photo") && !step.accepts.includes("recording")) return;
    const unsub = watchArtifacts(householdId, profileId, (list) => {
      const mine = list.filter((a) => a.artifact.questId === quest.id);
      setHasRecordingFile(mine.some((a) => a.artifact.kind === "recording"));
      const photos = mine.filter((a) => a.artifact.kind === "photo").sort((a, b) => b.artifact.at - a.artifact.at);
      const latest = photos[0];
      if (!latest) {
        setHydratedPhotoUrl(undefined);
        return;
      }
      getDownloadURL(storageRef(getStorageBucket(), latest.artifact.storagePath))
        .then(setHydratedPhotoUrl)
        .catch(() => setHydratedPhotoUrl(undefined));
    });
    return unsub;
    // step.accepts is fixed per step in content; not worth a deep-equality dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, profileId, quest.id]);

  async function savePhoto(file: File) {
    setPhotoSaving(true);
    try {
      setSaveError(undefined);
      await uploadArtifact(householdId, profileId, {
        kind: "photo",
        questId: quest.id,
        week: quest.week,
        file,
        contentType: file.type || "image/jpeg",
      });
      setPhotoPreviewUrl(URL.createObjectURL(file));
      await onUpdate((prev) => addKind(step, prev, "photo"));
    } catch (err) {
      setSaveError(saveFailureMessage(err));
    } finally {
      setPhotoSaving(false);
    }
  }

  async function handleSaveCode() {
    const trimmed = codeText.trim();
    if (!trimmed) return;
    setCodeSaving(true);
    try {
      setSaveError(undefined);
      await uploadArtifact(householdId, profileId, { kind: "code", questId: quest.id, week: quest.week, text: trimmed });
      setSavedCode(trimmed);
      await onUpdate((prev) => addKind(step, prev, "code"));
    } catch (err) {
      setSaveError(saveFailureMessage(err));
    } finally {
      setCodeSaving(false);
    }
  }

  async function handleSaveText() {
    const trimmed = textText.trim();
    if (!trimmed) return;
    setTextSaving(true);
    try {
      setSaveError(undefined);
      await uploadArtifact(householdId, profileId, { kind: "text", questId: quest.id, week: quest.week, text: trimmed });
      setSavedText(trimmed);
      await onUpdate((prev) => addKind(step, prev, "text"));
    } catch (err) {
      setSaveError(saveFailureMessage(err));
    } finally {
      setTextSaving(false);
    }
  }

  /** Saves a recording made in the app or chosen from the phone: the file to Storage, then the
   * kind into progress, exactly the photo path. RecordingBlock shows any failure itself. */
  async function handleSaveRecording(blob: Blob, contentType: string) {
    await uploadArtifact(householdId, profileId, { kind: "recording", questId: quest.id, week: quest.week, file: blob, contentType });
    await onUpdate((prev) => addKind(step, prev, "recording"));
  }

  /**
   * Marks the recording made with the file kept elsewhere. Deliberately no uploadArtifact call:
   * there is no file in the browser to upload, and writing an artifact doc with no file behind
   * it would put an empty entry in the portfolio and claim a recording is stored here when it
   * is not. The only thing written is the fact itself, into QuestProgress.artifacts, which is
   * what completes the step.
   */
  async function handleMarkRecording() {
    await onUpdate((prev) => addKind(step, prev, "recording"));
  }

  return (
    <section className="tr-step" aria-labelledby={`${step.id}-title`}>
      <h3 id={`${step.id}-title`} className="tr-step__title">
        {step.title}
      </h3>
      <StepBody text={step.prompt} />
      {saveError ? <Toast tone="hint" message={saveError} onDismiss={() => setSaveError(undefined)} /> : null}

      {savable.includes("photo") ? (
        <div className="tr-artifact-block">
          <span className="tr-artifact-block__label">Photo</span>
          <PhotoCapture idPrefix={step.id} disabled={photoSaving} onPhoto={savePhoto} />
          {photoPreviewUrl || hydratedPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a Storage-hosted photo, not a static asset Next can optimize
            <img className="tr-artifact-preview" src={photoPreviewUrl ?? hydratedPhotoUrl} alt="Your uploaded photo" />
          ) : null}
          {photoSaving ? <p className="tr-step__note">Saving...</p> : null}
        </div>
      ) : null}

      {savable.includes("code") ? (
        <div className="tr-artifact-block">
          <label className="tr-artifact-block__label" htmlFor={`${step.id}-code`}>
            Code
          </label>
          <textarea
            id={`${step.id}-code`}
            className="tr-textarea tr-textarea--code"
            rows={6}
            value={codeText}
            onChange={(e) => setCodeText(e.target.value)}
            placeholder="Paste your MakeCode share link or the JavaScript."
          />
          <div className="tr-step__actions">
            {/* Task 41: demoted to secondary once this step is already done (submitted has an
                accepted kind) so it never sits alongside the footer's "Continue" as a second
                live primary -- still clickable, so a fresh paste can still be saved again. */}
            <Button variant={done ? "secondary" : "primary"} onClick={handleSaveCode} disabled={codeSaving || !codeText.trim()}>
              {codeSaving ? "Saving..." : "Save code"}
            </Button>
          </div>
          {savedCode ? (
            <pre className="tr-artifact-preview tr-artifact-preview--code">
              <code>{savedCode}</code>
            </pre>
          ) : null}
        </div>
      ) : null}

      {savable.includes("text") ? (
        <div className="tr-artifact-block">
          <label className="tr-artifact-block__label" htmlFor={`${step.id}-text`}>
            Text
          </label>
          <textarea
            id={`${step.id}-text`}
            className="tr-textarea"
            rows={6}
            value={textText}
            onChange={(e) => setTextText(e.target.value)}
            placeholder="Write it out here."
          />
          <div className="tr-step__actions">
            {/* Task 41: same demotion as "Save code" above. */}
            <Button variant={done ? "secondary" : "primary"} onClick={handleSaveText} disabled={textSaving || !textText.trim()}>
              {textSaving ? "Saving..." : "Save text"}
            </Button>
          </div>
          {savedText ? <p className="tr-artifact-preview">{savedText}</p> : null}
        </div>
      ) : null}

      {savable.includes("recording") ? (
        <RecordingBlock
          medium="video"
          hint={quest.track === "play" ? "Prop the phone where it sees your hands on the keys, then press Record." : undefined}
          idPrefix={step.id}
          saved={recordingMarked}
          markedMade={recordingMarked && !hasRecordingFile}
          onSave={handleSaveRecording}
          onMarkMade={handleMarkRecording}
          onPrimaryChange={setRecordingPrimary}
        />
      ) : null}

      {savedFiles.length > 0 ? <p className="tr-step__done">Saved: {savedFiles.join(", ")}.</p> : null}
    </section>
  );
}
