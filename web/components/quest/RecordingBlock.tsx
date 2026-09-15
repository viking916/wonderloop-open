"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/Button";
import { formatClock, recordingFileProblem, type RecordingMedium } from "@/lib/domain/recording";
import { useMediaRecorder } from "./useMediaRecorder";
import { saveFailureMessage } from "./saveFailure";

export type RecordingBlockProps = {
  /** Video for a Speak talk ("whole face in frame"); audio for a spoken explain-back. */
  medium: RecordingMedium;
  /** Prefixes element ids so two blocks on one page never collide. */
  idPrefix: string;
  /** True once a recording is on record for this step; the block then shows what is saved and
   * offers to record again rather than demanding one. */
  saved: boolean;
  /** Persists the recording. Rejecting shows the error line; the recording stays on screen so
   * it can be tried again rather than lost. */
  onSave: (blob: Blob, contentType: string) => Promise<void>;
  /** The last resort: the family recorded on a phone and is keeping the file themselves. Omit
   * to hide that path (an explain-back has typing as its fallback instead). */
  onMarkMade?: () => Promise<void>;
  /** True when the step was completed by marking rather than by a saved file. */
  markedMade?: boolean;
  /** Task 41 (one-primary audit): reports whether this block currently shows a live primary
   * control, so the quest shell can hide its own "Continue" until the step is done. */
  onPrimaryChange?: (visible: boolean) => void;
  /** Replaces the medium's default framing line ("whole face in frame") where the recording is
   * of something else: a Play quest wants the hands on the keys. */
  hint?: string;
};

const COPY: Record<RecordingMedium, { record: string; stop: string; save: string; again: string; pick: string; denied: string; hint: string; unsupported: string }> = {
  video: {
    record: "Record here",
    stop: "Stop recording",
    save: "Save recording",
    again: "Record again",
    pick: "Choose a video from the phone",
    denied: "The camera was not allowed, so recording here is off. You can still choose a video from the phone.",
    hint: "Prop the device up so your whole face is in frame, then press Record.",
    unsupported: "This browser cannot record here. Record on the phone, then choose the video below.",
  },
  audio: {
    record: "Record your answer",
    stop: "Stop recording",
    save: "Save recording",
    again: "Record again",
    pick: "Choose a sound file",
    denied: "The microphone was not allowed, so recording here is off. You can type your answer instead.",
    hint: "Say it the way you would say it to a friend. Press Record when you are ready.",
    unsupported: "This browser cannot record here. Type your answer instead.",
  },
};

/**
 * The recording control every Speak quest ends in (spec 7.2). Three ways in, in order of
 * preference: record in the app through the camera or microphone (components/quest/
 * useMediaRecorder.ts), choose a file the phone's own camera made, or, where nothing else will
 * do, mark the recording made and keep the file elsewhere. The first two put a real file in
 * Storage; the third records only the fact (see ArtifactStep's handleMarkRecording).
 *
 * One primary at a time (docs/ui-styleguide.md section 1): Record, then Stop, then Save. The
 * file picker is a native input beneath it and the mark-made path is a quiet control, so a
 * child always sees one red thing to press.
 */
export function RecordingBlock({ medium, idPrefix, saved, onSave, onMarkMade, markedMade, onPrimaryChange, hint }: RecordingBlockProps) {
  const rec = useMediaRecorder(medium);
  const copy = COPY[medium];
  const [saving, setSaving] = useState(false);
  const [marking, setMarking] = useState(false);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [savedUrl, setSavedUrl] = useState<string | undefined>(undefined);
  // "Record again" while a recording sits unsaved asks first: the recording is minutes of a
  // child's talk, and a stray tap must not throw it away (docs/ui-styleguide.md section 1).
  // Keyed by the blob it was asked about, so a new recording never inherits the question.
  const [discardAskedFor, setDiscardAskedFor] = useState<Blob | undefined>(undefined);
  const discardAsked = rec.blob !== undefined && discardAskedFor === rec.blob;
  const previewRef = useRef<HTMLVideoElement>(null);

  // The live preview is a muted element fed the raw stream; srcObject cannot be set from JSX.
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    el.srcObject = rec.stream ?? null;
    if (rec.stream) el.play?.()?.catch?.(() => undefined);
  }, [rec.stream]);

  // One object URL per recorded blob, revoked when the blob changes or the block unmounts.
  const recordedUrl = useMemo(() => (rec.blob ? URL.createObjectURL(rec.blob) : undefined), [rec.blob]);
  useEffect(() => () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  }, [recordedUrl]);

  useEffect(() => () => {
    if (savedUrl) URL.revokeObjectURL(savedUrl);
  }, [savedUrl]);

  const canRecord = rec.status === "idle" || rec.status === "denied" || rec.status === "error";
  const primaryLive = !saving && (rec.status === "recording" || rec.status === "recorded" || (canRecord && !saved && rec.status !== "denied"));
  useEffect(() => {
    onPrimaryChange?.(primaryLive);
    return () => onPrimaryChange?.(false);
  }, [primaryLive, onPrimaryChange]);

  async function save(blob: Blob, contentType: string) {
    setSaving(true);
    setProblem(undefined);
    try {
      await onSave(blob, contentType);
      setSavedUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      rec.reset();
    } catch (err) {
      setProblem(saveFailureMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const why = recordingFileProblem(file);
    if (why) {
      setProblem(why);
      return;
    }
    await save(file, file.type);
  }

  async function handleMark() {
    if (!onMarkMade) return;
    setMarking(true);
    setProblem(undefined);
    try {
      await onMarkMade();
    } catch (err) {
      setProblem(saveFailureMessage(err));
    } finally {
      setMarking(false);
    }
  }

  const playbackUrl = recordedUrl ?? savedUrl;
  const showPlayback = Boolean(playbackUrl) && rec.status !== "recording";

  return (
    <div className="tr-artifact-block tr-recording">
      <span className="tr-artifact-block__label">Recording</span>

      {problem ? (
        <p role="alert" className="tr-recording__problem">
          {problem}
        </p>
      ) : null}

      {saved && !recordedUrl ? (
        <p className="tr-step__done">
          {markedMade && !savedUrl
            ? "Marked as made. Your recording is kept outside the app."
            : "Saved. You can watch it again in your portfolio."}
        </p>
      ) : null}

      {rec.status === "recording" ? (
        <div className="tr-recording__live">
          {medium === "video" ? (
            <video ref={previewRef} className="tr-recording__preview" muted playsInline autoPlay aria-label="Camera preview" />
          ) : (
            <p className="tr-recording__listening">Listening...</p>
          )}
          <p className="tr-recording__clock" aria-live="polite">
            Recording {formatClock(rec.elapsed)}
          </p>
          <div className="tr-step__actions">
            <Button variant="primary" onClick={rec.stop}>
              {copy.stop}
            </Button>
          </div>
        </div>
      ) : null}

      {showPlayback && playbackUrl ? (
        medium === "video" ? (
          <video className="tr-recording__playback" src={playbackUrl} controls playsInline aria-label="Your recording" />
        ) : (
          <audio className="tr-recording__playback" src={playbackUrl} controls aria-label="Your recording" />
        )
      ) : null}

      {rec.status === "recorded" && rec.blob ? (
        discardAsked ? (
          <div className="tr-recording__discard" role="group" aria-label="Throw this recording away?">
            <p className="tr-step__note">Throw this recording away and record again? It is not saved yet.</p>
            <div className="tr-step__actions">
              <Button variant="secondary" onClick={rec.reset} disabled={saving}>
                Yes, throw it away
              </Button>
              <Button variant="quiet" onClick={() => setDiscardAskedFor(undefined)} disabled={saving}>
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <div className="tr-step__actions">
            <Button variant="primary" onClick={() => rec.blob && void save(rec.blob, rec.mimeType ?? rec.blob.type)} disabled={saving}>
              {saving ? "Saving..." : copy.save}
            </Button>
            <Button variant="quiet" onClick={() => setDiscardAskedFor(rec.blob)} disabled={saving}>
              {copy.again}
            </Button>
          </div>
        )
      ) : null}

      {saving && rec.status !== "recorded" ? <p className="tr-step__note">Saving... a long video can take a minute.</p> : null}

      {rec.status === "requesting" ? <p className="tr-step__note">Waiting for the {medium === "video" ? "camera" : "microphone"}...</p> : null}

      {canRecord && !saving ? (
        <>
          {rec.status === "denied" ? (
            <p className="tr-step__note">{copy.denied}</p>
          ) : rec.status === "error" ? (
            <p className="tr-step__note">Recording here did not start. Try again, or choose a file below.</p>
          ) : saved ? null : (
            <p className="tr-step__note">{hint ?? copy.hint}</p>
          )}
          {rec.status !== "denied" ? (
            <div className="tr-step__actions">
              <Button variant={saved ? "secondary" : "primary"} onClick={() => void rec.start()}>
                {saved ? copy.again : copy.record}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {rec.status === "unsupported" && !saving ? <p className="tr-step__note">{copy.unsupported}</p> : null}

      {rec.status !== "recording" && rec.status !== "recorded" && rec.status !== "checking" && !saving ? (
        <div className="tr-recording__pick">
          {/* The native input is kept for the browser's own file/camera chooser, visually hidden;
              its label wears the secondary button tier so the choice looks pressable
              (docs/ui-styleguide.md section 1) instead of the bare "No file chosen" text. */}
          <input
            id={`${idPrefix}-file`}
            className="tr-recording__pick-input"
            type="file"
            accept={medium === "video" ? "video/*,audio/*" : "audio/*"}
            capture={medium === "video" ? "user" : undefined}
            onChange={(e) => void handleFile(e)}
          />
          <label className="tr-btn tr-btn--secondary tr-recording__pick-label" htmlFor={`${idPrefix}-file`}>
            {copy.pick}
          </label>
        </div>
      ) : null}

      {onMarkMade && !saved && rec.status !== "recording" && rec.status !== "recorded" && !saving ? (
        <div className="tr-step__actions">
          <Button variant="quiet" onClick={() => void handleMark()} disabled={marking}>
            {marking ? "Marking..." : "I recorded it somewhere else"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
