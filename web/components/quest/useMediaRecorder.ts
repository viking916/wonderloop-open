"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AUDIO_BITS_PER_SECOND,
  RECORDING_MAX_SECONDS,
  VIDEO_BITS_PER_SECOND,
  VIDEO_CONSTRAINTS,
  pickRecordingMimeType,
  type RecordingMedium,
} from "@/lib/domain/recording";

export type RecorderStatus =
  /** Support not yet known (the server render, before hydration). */
  | "checking"
  /** No MediaRecorder, no getUserMedia, or no recordable container: offer the file picker only. */
  | "unsupported"
  | "idle"
  | "requesting"
  | "recording"
  | "recorded"
  /** The camera or microphone was refused. */
  | "denied"
  | "error";

/** The phases the hook drives itself; "idle" is resolved against browser support on the way out. */
type Phase = "idle" | "requesting" | "recording" | "recorded" | "denied" | "error";

type PhaseState = {
  phase: Phase;
  elapsed: number;
  stream: MediaStream | undefined;
  blob: Blob | undefined;
};

export type MediaRecorderState = {
  status: RecorderStatus;
  /** Seconds recorded so far, ticking while recording. */
  elapsed: number;
  /** The live stream while recording, for a muted preview element. */
  stream: MediaStream | undefined;
  /** The finished recording once status is "recorded". */
  blob: Blob | undefined;
  mimeType: string | undefined;
};

export type MediaRecorderControls = MediaRecorderState & {
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
};

const INITIAL: PhaseState = { phase: "idle", elapsed: 0, stream: undefined, blob: undefined };

/** The recordable container for this medium, undefined when the browser has none. Pure on a
 * given browser, so useSyncExternalStore can read it as a snapshot: a string or undefined is
 * stable across calls, which is all that hook asks. */
function detectSupport(medium: RecordingMedium): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  if (typeof navigator === "undefined" || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    return undefined;
  }
  return pickRecordingMimeType((type) => MediaRecorder.isTypeSupported(type), medium);
}

const subscribeNever = () => () => undefined;
/** null on the server (support unknown), so the first client render can say "checking" rather
 * than guessing wrong in either direction. */
const serverSnapshot = (): string | undefined | null => null;

/**
 * In-browser capture through MediaRecorder, with every browser difference folded into a small
 * status machine so the control that renders it never has to know which browser it is on.
 * Support is read as an external snapshot (never during a server render), the container type
 * is chosen from lib/domain/recording.ts's preference list, and the recording stops itself at
 * RECORDING_MAX_SECONDS. Tracks are always released: on stop, on reset and on unmount.
 */
export function useMediaRecorder(medium: RecordingMedium): MediaRecorderControls {
  const mime = useSyncExternalStore(subscribeNever, () => detectSupport(medium), serverSnapshot);
  const [state, setState] = useState<PhaseState>(INITIAL);
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const startedAtRef = useRef<number>(0);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) clearInterval(timerRef.current);
    timerRef.current = undefined;
  }, []);

  useEffect(
    () => () => {
      clearTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // Already stopped or torn down by the browser; releasing the tracks below is what matters.
        }
      }
      releaseStream();
    },
    [clearTimer, releaseStream],
  );

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    clearTimer();
    recorder.stop();
  }, [clearTimer]);

  const start = useCallback(async () => {
    if (!mime) return;
    setState((prev) => ({ ...prev, phase: "requesting", elapsed: 0, blob: undefined }));
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: medium === "video" ? VIDEO_CONSTRAINTS : false,
        audio: true,
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      setState((prev) => ({ ...prev, phase: name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error" }));
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
        ...(medium === "video" ? { videoBitsPerSecond: VIDEO_BITS_PER_SECOND } : {}),
      });
    } catch {
      releaseStream();
      setState((prev) => ({ ...prev, phase: "error" }));
      return;
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      clearTimer();
      releaseStream();
      const blob = new Blob(chunksRef.current, { type: mime });
      setState((prev) => ({ ...prev, phase: "recorded", stream: undefined, blob }));
    };
    recorder.onerror = () => {
      clearTimer();
      releaseStream();
      setState((prev) => ({ ...prev, phase: "error", stream: undefined }));
    };
    recorder.start(1000);
    startedAtRef.current = Date.now();
    setState((prev) => ({ ...prev, phase: "recording", stream, elapsed: 0 }));
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      setState((prev) => ({ ...prev, elapsed }));
      if (elapsed >= RECORDING_MAX_SECONDS) stop();
    }, 250);
  }, [mime, medium, clearTimer, releaseStream, stop]);

  const reset = useCallback(() => {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      // Drop the in-flight recording without keeping it: onstop would publish a blob, so detach
      // the handlers first.
      recorder.onstop = null;
      recorder.ondataavailable = null;
      try {
        recorder.stop();
      } catch {
        // Nothing to stop.
      }
    }
    recorderRef.current = undefined;
    releaseStream();
    chunksRef.current = [];
    setState(INITIAL);
  }, [clearTimer, releaseStream]);

  const status: RecorderStatus = state.phase !== "idle" ? state.phase : mime === null ? "checking" : mime ? "idle" : "unsupported";

  return { status, elapsed: state.elapsed, stream: state.stream, blob: state.blob, mimeType: mime ?? undefined, start, stop, reset };
}
