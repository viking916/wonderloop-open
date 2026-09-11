import { describe, expect, test } from "vitest";
import {
  RECORDING_MAX_BYTES,
  extensionForMimeType,
  formatClock,
  isRecordingContentType,
  pickRecordingMimeType,
  recordingFileProblem,
} from "./recording";

describe("pickRecordingMimeType", () => {
  test("prefers MP4 for video when the browser records it (Safari, recent Chrome)", () => {
    expect(pickRecordingMimeType((t) => t === "video/mp4" || t.startsWith("video/webm"), "video")).toBe("video/mp4");
  });

  test("falls back to WebM with codecs when MP4 is not recordable (older Chrome)", () => {
    expect(pickRecordingMimeType((t) => t.startsWith("video/webm"), "video")).toBe("video/webm;codecs=vp8,opus");
  });

  test("audio picks an audio container, never a video one", () => {
    const picked = pickRecordingMimeType((t) => t.startsWith("audio/webm") || t === "video/mp4", "audio");
    expect(picked).toBe("audio/webm;codecs=opus");
  });

  test("undefined when nothing is recordable, so the caller offers the file picker instead", () => {
    expect(pickRecordingMimeType(() => false, "video")).toBeUndefined();
  });

  test("a support check that throws counts as unsupported, never as a crash", () => {
    expect(
      pickRecordingMimeType(() => {
        throw new Error("no MediaRecorder");
      }, "audio"),
    ).toBeUndefined();
  });
});

describe("extensionForMimeType", () => {
  test.each([
    ["video/mp4", "mp4"],
    ["video/webm;codecs=vp8,opus", "webm"],
    ["audio/webm;codecs=opus", "webm"],
    ["audio/mp4", "m4a"],
    ["audio/ogg", "ogg"],
    ["video/quicktime", "mov"],
    ["application/octet-stream", "bin"],
  ])("%s becomes .%s", (type, ext) => {
    expect(extensionForMimeType(type)).toBe(ext);
  });
});

describe("recordingFileProblem", () => {
  test("a small video from the phone is fine", () => {
    expect(recordingFileProblem({ size: 30 * 1024 * 1024, type: "video/quicktime" })).toBeUndefined();
  });

  test("a sound file is fine too", () => {
    expect(recordingFileProblem({ size: 1024, type: "audio/mpeg" })).toBeUndefined();
  });

  test("a photo is refused in words that say what to choose instead", () => {
    expect(recordingFileProblem({ size: 1024, type: "image/jpeg" })).toMatch(/not a video or a sound file/);
  });

  test("a file over the storage cap is refused with the cap in megabytes", () => {
    const problem = recordingFileProblem({ size: RECORDING_MAX_BYTES + 1, type: "video/mp4" });
    expect(problem).toMatch(/too big/);
    expect(problem).toMatch(/200 MB/);
  });

  test("exactly the cap is still allowed", () => {
    expect(recordingFileProblem({ size: RECORDING_MAX_BYTES, type: "video/mp4" })).toBeUndefined();
  });

  test("the type check wins over the size check", () => {
    expect(recordingFileProblem({ size: RECORDING_MAX_BYTES * 2, type: "image/png" })).toMatch(/not a video/);
  });
});

describe("isRecordingContentType", () => {
  test.each([
    ["video/mp4", true],
    ["audio/webm", true],
    ["VIDEO/MP4", true],
    ["image/jpeg", false],
    ["text/plain", false],
    ["", false],
  ])("%s -> %s", (type, ok) => {
    expect(isRecordingContentType(type)).toBe(ok);
  });
});

describe("formatClock", () => {
  test.each([
    [0, "0:00"],
    [7, "0:07"],
    [59.9, "0:59"],
    [60, "1:00"],
    [90, "1:30"],
    [-3, "0:00"],
  ])("%s seconds reads %s", (seconds, text) => {
    expect(formatClock(seconds)).toBe(text);
  });
});
