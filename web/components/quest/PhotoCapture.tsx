"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { Button } from "@/components/ui/Button";

export type PhotoCaptureProps = {
  /** Prefixes element ids so two blocks on one page never collide. */
  idPrefix: string;
  disabled?: boolean;
  /** Called with the photo to save, whether snapped here or chosen from the device. */
  onPhoto: (file: File) => Promise<void> | void;
};

const cameraStore = {
  subscribe() {
    return () => undefined;
  },
  get() {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  },
  server() {
    return false;
  },
};

type Phase = "idle" | "requesting" | "live" | "snapped" | "denied";

/**
 * Two ways to put a photo on record, both always offered where they can work: take one with
 * the device's own camera right here (laptop webcam or tablet camera, through getUserMedia), or
 * choose one already taken. Before this, the single file input carried `capture`, which on a
 * phone jumps straight to the camera and on a laptop offers only the file picker, so the family
 * saw one door and it was the wrong one for the device in hand (owner's catch, first real
 * session, 5 September 2026).
 */
export function PhotoCapture({ idPrefix, disabled, onPhoto }: PhotoCaptureProps) {
  const hasCamera = useSyncExternalStore(cameraStore.subscribe, cameraStore.get, cameraStore.server);
  const [phase, setPhase] = useState<Phase>("idle");
  const [snapUrl, setSnapUrl] = useState<string | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const videoRef = useRef<HTMLVideoElement>(null);
  const blobRef = useRef<Blob | undefined>(undefined);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = undefined;
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);
  useEffect(() => () => {
    if (snapUrl) URL.revokeObjectURL(snapUrl);
  }, [snapUrl]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || phase !== "live") return;
    el.srcObject = streamRef.current ?? null;
    el.play?.()?.catch?.(() => undefined);
  }, [phase]);

  async function open() {
    setPhase("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      setPhase("live");
    } catch {
      stopStream();
      setPhase("denied");
    }
  }

  function snap() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        blobRef.current = blob;
        setSnapUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        stopStream();
        setPhase("snapped");
      },
      "image/jpeg",
      0.9,
    );
  }

  function cancel() {
    stopStream();
    blobRef.current = undefined;
    setPhase("idle");
  }

  async function use() {
    const blob = blobRef.current;
    if (!blob) return;
    await onPhoto(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
    blobRef.current = undefined;
    setPhase("idle");
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await onPhoto(file);
  }

  return (
    <div className="tr-photo">
      {phase === "live" ? (
        <div className="tr-photo__live">
          <video ref={videoRef} className="tr-photo__preview" muted playsInline autoPlay aria-label="Camera preview" />
          <div className="tr-step__actions">
            <Button variant="primary" onClick={snap} disabled={disabled}>
              Snap
            </Button>
            <Button variant="quiet" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {phase === "snapped" && snapUrl ? (
        <div className="tr-photo__live">
          {/* eslint-disable-next-line @next/next/no-img-element -- a just-snapped blob, not a static asset */}
          <img className="tr-photo__preview" src={snapUrl} alt="The photo you just took" />
          <div className="tr-step__actions">
            <Button variant="primary" onClick={() => void use()} disabled={disabled}>
              Use this photo
            </Button>
            <Button variant="quiet" onClick={() => void open()} disabled={disabled}>
              Retake
            </Button>
          </div>
        </div>
      ) : null}
      {phase === "requesting" ? <p className="tr-step__note">Waiting for the camera...</p> : null}
      {phase === "denied" ? <p className="tr-step__note">The camera was not allowed, so choose a photo instead.</p> : null}
      {phase === "idle" || phase === "denied" ? (
        <div className="tr-step__actions tr-photo__ways">
          {hasCamera && phase !== "denied" ? (
            <Button variant="secondary" onClick={() => void open()} disabled={disabled}>
              Take a photo
            </Button>
          ) : null}
          <div className="tr-recording__pick">
            <input
              id={`${idPrefix}-photo`}
              className="tr-recording__pick-input"
              type="file"
              accept="image/*"
              onChange={(e) => void handleFile(e)}
              disabled={disabled}
            />
            <label className="tr-btn tr-btn--secondary tr-recording__pick-label" htmlFor={`${idPrefix}-photo`}>
              Choose a photo
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
