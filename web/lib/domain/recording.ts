// Recording rules shared by the capture control (components/quest/RecordingBlock.tsx), the
// upload path (lib/data/artifacts.ts) and storage.rules. Pure: no browser globals, no Firebase,
// no Date.now(). The browser's MediaRecorder support check arrives as a function so a test, or
// a browser with no MediaRecorder at all, can answer it.

export type RecordingMedium = "video" | "audio";

/** storage.rules allows audio and video artifacts up to this many bytes. Images and text keep
 * the older, smaller cap. A phone's own camera app records a one-minute talk at roughly 60 to
 * 100 MB, so this has to be well above the 20 MB the other kinds live under. */
export const RECORDING_MAX_BYTES = 200 * 1024 * 1024;

/** The longest a single in-app recording may run before it stops itself. Every Speak talk is
 * authored to be short ("Under 60 seconds" in week 1); three minutes leaves room without
 * letting a forgotten camera fill the bucket. */
export const RECORDING_MAX_SECONDS = 180;

/** In-app capture is sized so a whole talk is a few megabytes: 640 by 480 at a modest bitrate
 * rather than the camera's native resolution. A face in frame reads fine at this size; the
 * point of the recording is what he says and how he stands, not the pixels. */
export const VIDEO_CONSTRAINTS = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" } as const;
export const VIDEO_BITS_PER_SECOND = 1_000_000;
export const AUDIO_BITS_PER_SECOND = 64_000;

/**
 * Candidate container types in preference order. Safari (the family's iPad) records MP4 and
 * refuses WebM; Chrome records WebM and, since 2024, MP4 as well. Asking in this order means
 * both browsers land on a file the other can still play back.
 */
const VIDEO_TYPES = ["video/mp4", "video/webm;codecs=vp8,opus", "video/webm"];
const AUDIO_TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];

/** The first container type the browser says it can record, or undefined when it can record
 * none of them (or has no MediaRecorder at all), in which case the caller offers the file picker
 * instead of a broken Record button. */
export function pickRecordingMimeType(isSupported: (type: string) => boolean, medium: RecordingMedium): string | undefined {
  const candidates = medium === "video" ? VIDEO_TYPES : AUDIO_TYPES;
  return candidates.find((type) => {
    try {
      return isSupported(type);
    } catch {
      return false;
    }
  });
}

/** The file extension for a recorded container type, so the Storage object name says what it
 * holds. Codec parameters ("video/webm;codecs=vp8,opus") are ignored. */
export function extensionForMimeType(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  switch (base) {
    case "video/mp4":
      return "mp4";
    case "audio/mp4":
      return "m4a";
    case "video/webm":
    case "audio/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    case "video/quicktime":
      return "mov";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    default:
      return "bin";
  }
}

/** True for a container type storage.rules will accept as a recording. */
export function isRecordingContentType(contentType: string): boolean {
  return /^(audio|video)\//i.test(contentType);
}

/**
 * Why a file chosen from the phone cannot be saved as a recording, in words a child can act on,
 * or undefined when it can. Checks the type before the size so an unreadable answer never
 * mentions megabytes.
 */
export function recordingFileProblem(file: { size: number; type: string }): string | undefined {
  if (!isRecordingContentType(file.type)) return "That is not a video or a sound file. Choose the recording you made.";
  if (file.size > RECORDING_MAX_BYTES) {
    return `That file is too big to save here (over ${formatMegabytes(RECORDING_MAX_BYTES)}). Record it again a little shorter, or record here in the app.`;
  }
  return undefined;
}

export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** "0:07", "1:30": the running clock shown while recording. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
