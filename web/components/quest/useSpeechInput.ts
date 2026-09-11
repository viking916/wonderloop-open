"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Web Speech API recognition, typed narrowly: the DOM lib has no declaration for it. */
type RecognitionResultList = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: RecognitionResultList; resultIndex: number }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const subscribeNever = () => () => undefined;

export type SpeechStatus = "checking" | "unsupported" | "idle" | "listening" | "denied" | "error";

export type SpeechInput = {
  status: SpeechStatus;
  /** Words heard so far in this listening session, final and interim together. */
  heard: string;
  start: () => void;
  stop: () => void;
};

/**
 * "Talk" for the debate room (Plan 3 task 5, the recognition half): speech into the text box,
 * with typing always underneath. Where the browser has no recognition (Firefox, some WebViews)
 * the status is "unsupported" and the room simply shows no Talk button; a refused microphone
 * becomes "denied" with a note, and the box is still there to type into. Nothing here ever
 * blocks the step. Recognition results are appended to `heard`; the room copies them into its
 * own text state on stop so an edit by hand never fights the microphone.
 */
export function useSpeechInput(lang = "en-US"): SpeechInput {
  const supported = useSyncExternalStore(subscribeNever, () => Boolean(recognitionCtor()), () => null);
  const [phase, setPhase] = useState<"idle" | "listening" | "denied" | "error">("idle");
  const [heard, setHeard] = useState("");
  const recRef = useRef<Recognition | undefined>(undefined);
  const finalRef = useRef("");

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  useEffect(() => () => recRef.current?.abort(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    finalRef.current = "";
    setHeard("");
    rec.onresult = (e) => {
      let interim = "";
      let finals = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) finals += text;
        else interim += text;
      }
      finalRef.current = finals;
      setHeard((finals + " " + interim).trim());
    };
    rec.onerror = (e) => {
      setPhase(e.error === "not-allowed" || e.error === "service-not-allowed" ? "denied" : e.error === "no-speech" || e.error === "aborted" ? "idle" : "error");
    };
    rec.onend = () => {
      setPhase((prev) => (prev === "listening" ? "idle" : prev));
      recRef.current = undefined;
    };
    recRef.current = rec;
    try {
      rec.start();
      setPhase("listening");
    } catch {
      setPhase("error");
    }
  }, [lang]);

  const status: SpeechStatus = supported === null ? "checking" : !supported ? "unsupported" : phase;
  return { status, heard, start, stop };
}
