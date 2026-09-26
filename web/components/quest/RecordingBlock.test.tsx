// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RecordingBlock } from "./RecordingBlock";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // Each test decides for itself whether the browser can record.
  delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
  Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
});

beforeEach(() => {
  // jsdom has neither of these; the block only needs them to hand a playable URL to <video>.
  if (!URL.createObjectURL) {
    Object.defineProperty(URL, "createObjectURL", { value: () => "blob:test", configurable: true, writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: () => undefined, configurable: true, writable: true });
  }
  // jsdom's media elements have no play(); the live preview calls it best-effort.
  Object.defineProperty(HTMLMediaElement.prototype, "play", { value: () => Promise.resolve(), configurable: true, writable: true });
});

/** A MediaRecorder double: start() records, stop() hands back one chunk then fires onstop. */
function installFakeRecorder(supported = ["video/mp4", "audio/mp4"]) {
  const stopTrack = vi.fn();
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] }));
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });

  class FakeRecorder {
    static isTypeSupported(type: string) {
      return supported.includes(type);
    }
    state: "inactive" | "recording" = "inactive";
    mimeType: string;
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(_stream: unknown, options: { mimeType: string }) {
      this.mimeType = options.mimeType;
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["frames"], { type: this.mimeType }) });
      this.onstop?.();
    }
  }
  (globalThis as { MediaRecorder?: unknown }).MediaRecorder = FakeRecorder;
  return { getUserMedia, stopTrack };
}

function chooseFile(input: HTMLElement, file: File) {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

describe("RecordingBlock without in-browser capture (no MediaRecorder)", () => {
  test("offers the file picker and the mark-made path, never a Record button", async () => {
    render(<RecordingBlock medium="video" idPrefix="s" saved={false} onSave={vi.fn()} onMarkMade={vi.fn()} />);
    await screen.findByText(/cannot record here/);
    expect(screen.queryByText("Record here")).toBeNull();
    expect(screen.getByLabelText("Choose a video from the phone")).toBeTruthy();
    expect(screen.getByText("I recorded it somewhere else")).toBeTruthy();
  });

  test("a chosen video is saved with its own content type", async () => {
    const onSave = vi.fn(async () => undefined);
    const { rerender } = render(<RecordingBlock medium="video" idPrefix="s" saved={false} onSave={onSave} />);
    const input = await screen.findByLabelText("Choose a video from the phone");
    const file = new File(["movie"], "talk.mov", { type: "video/quicktime" });
    chooseFile(input, file);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(file, "video/quicktime"));
    // The parent records the save in progress and re-renders with saved: the block then shows
    // the file it just saved, playable, and says where it lives.
    rerender(<RecordingBlock medium="video" idPrefix="s" saved={true} onSave={onSave} />);
    await screen.findByText(/Saved\. You can watch it again/);
    expect(screen.getByLabelText("Your recording")).toBeTruthy();
  });

  test("a photo is refused with a message and nothing is saved", async () => {
    const onSave = vi.fn(async () => undefined);
    render(<RecordingBlock medium="video" idPrefix="s" saved={false} onSave={onSave} />);
    const input = await screen.findByLabelText("Choose a video from the phone");
    chooseFile(input, new File(["px"], "selfie.jpg", { type: "image/jpeg" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toMatch(/not a video or a sound file/);
    expect(onSave).not.toHaveBeenCalled();
  });

  test("a failed save says so and keeps the file picker available", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("offline");
    });
    render(<RecordingBlock medium="video" idPrefix="s" saved={false} onSave={onSave} />);
    const input = await screen.findByLabelText("Choose a video from the phone");
    chooseFile(input, new File(["movie"], "talk.mp4", { type: "video/mp4" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toMatch(/did not save/);
    expect(screen.getByLabelText("Choose a video from the phone")).toBeTruthy();
  });

  test("mark-made calls through and reports the marked state", async () => {
    const onMarkMade = vi.fn(async () => undefined);
    const { rerender } = render(<RecordingBlock medium="video" idPrefix="s" saved={false} onSave={vi.fn()} onMarkMade={onMarkMade} />);
    fireEvent.click(await screen.findByText("I recorded it somewhere else"));
    await waitFor(() => expect(onMarkMade).toHaveBeenCalledOnce());
    rerender(<RecordingBlock medium="video" idPrefix="s" saved={true} markedMade onSave={vi.fn()} onMarkMade={onMarkMade} />);
    expect(screen.getByText(/Marked as made/)).toBeTruthy();
    expect(screen.queryByText("I recorded it somewhere else")).toBeNull();
  });
});

describe("RecordingBlock with in-browser capture", () => {
  test("Record, Stop, Save: one primary at a time, and the saved blob carries the chosen container", async () => {
    const { stopTrack } = installFakeRecorder();
    const onSave = vi.fn(async () => undefined);
    const onPrimaryChange = vi.fn();
    render(<RecordingBlock medium="video" idPrefix="s" saved={false} onSave={onSave} onPrimaryChange={onPrimaryChange} />);

    fireEvent.click(await screen.findByText("Record here"));
    await screen.findByText("Stop recording");
    expect(screen.queryByText("Record here")).toBeNull();
    expect(screen.getByText(/Recording 0:00/)).toBeTruthy();

    fireEvent.click(screen.getByText("Stop recording"));
    await screen.findByText("Save recording");
    expect(stopTrack).toHaveBeenCalled();
    expect(screen.getByLabelText("Your recording")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText("Save recording"));
    });
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const [blob, contentType] = onSave.mock.calls[0] as unknown as [Blob, string];
    expect(contentType).toBe("video/mp4");
    expect(blob.type).toBe("video/mp4");
    expect(onPrimaryChange).toHaveBeenCalledWith(true);
  });

  test("a refused camera explains itself and leaves the file picker", async () => {
    installFakeRecorder();
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(denied);
    render(<RecordingBlock medium="video" idPrefix="s" saved={false} onSave={vi.fn()} />);
    fireEvent.click(await screen.findByText("Record here"));
    await screen.findByText(/camera was not allowed/);
    expect(screen.queryByText("Record here")).toBeNull();
    expect(screen.getByLabelText("Choose a video from the phone")).toBeTruthy();
  });

  test("audio mode records with an audio container and no camera", async () => {
    const { getUserMedia } = installFakeRecorder();
    const onSave = vi.fn(async () => undefined);
    render(<RecordingBlock medium="audio" idPrefix="e" saved={false} onSave={onSave} />);
    fireEvent.click(await screen.findByText("Record your answer"));
    await screen.findByText("Stop recording");
    expect(getUserMedia).toHaveBeenCalledWith({ video: false, audio: true });
    fireEvent.click(screen.getByText("Stop recording"));
    await act(async () => {
      fireEvent.click(await screen.findByText("Save recording"));
    });
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect((onSave.mock.calls[0] as unknown as [Blob, string])[1]).toBe("audio/mp4");
  });

  test("Record again on an unsaved recording asks first, and Keep it keeps it", async () => {
    installFakeRecorder();
    const onSave = vi.fn(async () => undefined);
    render(<RecordingBlock medium="video" idPrefix="s" saved={false} onSave={onSave} />);
    fireEvent.click(await screen.findByText("Record here"));
    fireEvent.click(await screen.findByText("Stop recording"));
    await screen.findByText("Save recording");

    fireEvent.click(screen.getByText("Record again"));
    await screen.findByText(/Throw this recording away and record again/);
    // The recording is still there: nothing was reset by the first tap.
    expect(screen.getByLabelText("Your recording")).toBeTruthy();
    expect(screen.queryByText("Save recording")).toBeNull();

    fireEvent.click(screen.getByText("Keep it"));
    await screen.findByText("Save recording");
    expect(screen.queryByText(/Throw this recording away/)).toBeNull();
    expect(screen.getByLabelText("Your recording")).toBeTruthy();

    fireEvent.click(screen.getByText("Record again"));
    fireEvent.click(await screen.findByText("Yes, throw it away"));
    await screen.findByText("Record here");
    expect(screen.queryByLabelText("Your recording")).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  test("Record again after a save is a secondary control, not a second primary", async () => {
    installFakeRecorder();
    render(<RecordingBlock medium="video" idPrefix="s" saved={true} onSave={vi.fn()} />);
    const again = await screen.findByText("Record again");
    expect(again.closest("button")?.className).toContain("tr-btn--secondary");
    expect(screen.queryByText("Record here")).toBeNull();
  });
});
