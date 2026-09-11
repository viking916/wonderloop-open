"use client";

import { useCallback, useEffect, useRef } from "react";
import { speechDurationMs } from "@/lib/domain/sprout";

/** One line in a spoken tour (speakSequence below): the text to say, and an optional callback
 * fired the instant that line's audio actually starts, so a caller can highlight whatever the
 * line names (task 42, styleguide 5: "audio synced to visual pointing"). */
export type SpeechStep = { text: string; onStart?: () => void };

/**
 * Browser speech synthesis for Sprout (spec 6, spec 11: "browser speech recognition and speech
 * synthesis" -- Plan 3 owns Explorer's voice features; this is Sprout's own, simpler use: no
 * recognition, spoken prompts only). Returns:
 * - `speak(text, onDone?)`: says one line, tracks it as the "last line" a replay control can
 *   re-say, and (if given) calls `onDone` once that line is truly finished.
 * - `replay()`: re-says the last line spoken.
 * - `stop()`: cancels whatever is speaking or queued, right now, cleanly.
 * - `speakSequence(steps, pauseMs, onDone?)`: says a list of lines one at a time, each starting
 *   only once the previous one has actually finished plus a short pause, honouring a `stop()`
 *   (or a fresh `speak()`/`speakSequence()`) at any point.
 *
 * Task 42 (a real 3-year-old: "voice instructions were said twice quickly and felt
 * overlapping"): the round-open tour added in ccc0e6d chained its lines with
 * `setTimeout(..., speechDurationMs(line))`, guessing how long each line would take rather than
 * waiting to be told. On the real emulator voice this app runs against, actual playback ran
 * roughly *twice* speechDurationMs's estimate (measured: a 13-word prompt estimated at 4200ms
 * played for 8256ms). Every scheduled line started while the one before it was still genuinely
 * speaking, and `speak()`'s own `cancel()` (needed so a fast tap never queues two lines back to
 * back -- see below) then cut the still-playing line off mid-word at the exact moment the next
 * one's audio began: audibly, two lines said "twice quickly" and briefly on top of each other.
 * Every handoff in this file is now driven by the browser's real `end`/`error` event for the
 * line just spoken, never a timer guessing when that will happen -- so a line is only ever
 * followed by silence-then-the-next-line, never cut off. A generous fallback timer (built from
 * speechDurationMs, at roughly double plus a margin) still backs every handoff that has an
 * `onDone`: some browsers, and every headless test runner, never fire `end` at all, and advancing
 * must never depend on that alone (spec 6: nothing may soft-lock).
 *
 * `speechSynthesis.cancel()` runs before every `speak()` and at the start of every
 * `speakSequence()`, so a fresh tap or a fresh tour always wins immediately over whatever was
 * still playing (task 42, styleguide 5: "a tap is always honoured, immediately... cancel the
 * queue cleanly") -- never two lines stacked, only the most recent one ever heard.
 */
export function useSpeak() {
  const lastLine = useRef<string>("");
  // Bumped by every stop() (including the one at the start of every speak()/speakSequence()):
  // invalidates any in-flight sequence step or fallback timer still waiting on an older line, so
  // a cancelled tour can never resurrect itself once the utterance it interrupted reports back
  // (as an "interrupted" error) a moment later.
  const generation = useRef(0);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    },
    [],
  );

  const supported = useCallback(
    () => typeof window !== "undefined" && "speechSynthesis" in window,
    [],
  );

  /** Cancels whatever is speaking or queued, right now, and invalidates every callback still
   * waiting on an older line or sequence. Safe to call when nothing is speaking. */
  const stop = useCallback(() => {
    generation.current += 1;
    if (fallbackTimer.current) {
      clearTimeout(fallbackTimer.current);
      fallbackTimer.current = undefined;
    }
    if (supported()) window.speechSynthesis.cancel();
  }, [supported]);

  // The actual SpeechSynthesisUtterance dance for one line, gated to one specific generation so
  // a stale `end`/`error`/fallback firing after the world has moved on (a tap, a new sequence) is
  // a no-op. Used both by the public `speak()` below (which owns bumping the generation, once,
  // per call) and by speakSequence's own step runner (which must NOT bump it per step -- doing
  // so would invalidate the very sequence issuing the call).
  const speakRaw = useCallback(
    (text: string, gen: number, onDone?: () => void) => {
      lastLine.current = text;
      if (!supported()) {
        onDone?.();
        return;
      }
      // iPadOS Safari can leave the speech engine "paused" the first time a page ever touches
      // it, and simply never speaks anything after that -- silently, no error, nothing shown,
      // which is exactly the failure Task 15's tap-to-start exists to prevent. resume() before
      // every line is cheap insurance against that state on every call, not just the first one
      // from a gesture.
      window.speechSynthesis.resume();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      let settled = false;
      const finish = () => {
        if (settled || generation.current !== gen) return;
        settled = true;
        if (fallbackTimer.current) {
          clearTimeout(fallbackTimer.current);
          fallbackTimer.current = undefined;
        }
        onDone?.();
      };
      utterance.addEventListener("end", finish);
      utterance.addEventListener("error", finish);
      if (onDone) {
        // Safety net only (see the block comment above): real completion wins whenever the
        // browser actually fires it, which is the normal case.
        fallbackTimer.current = setTimeout(finish, speechDurationMs(text) * 2 + 1500);
      }
      window.speechSynthesis.speak(utterance);
    },
    [supported],
  );

  const speak = useCallback(
    (text: string, onDone?: () => void) => {
      stop();
      speakRaw(text, generation.current, onDone);
    },
    [stop, speakRaw],
  );

  const replay = useCallback(() => {
    if (lastLine.current) speak(lastLine.current);
  }, [speak]);

  /**
   * Says `steps` one at a time -- prompt, then each card's sound, in the styleguide's words
   * "unhurried, then quiet" -- each one starting only once the previous line has genuinely
   * finished, plus `pauseMs` of real silence (the "beat of silence" styleguide 5 asks for).
   * `onDone` fires once after the last step. Begins with `stop()`, so this always wins cleanly
   * over anything already speaking, the same guarantee a direct `speak()` gives a tap.
   */
  const speakSequence = useCallback(
    (steps: readonly SpeechStep[], pauseMs: number, onDone?: () => void) => {
      stop();
      const myGen = generation.current;
      const run = (i: number) => {
        if (generation.current !== myGen) return; // cancelled or superseded mid-sequence
        if (i >= steps.length) {
          onDone?.();
          return;
        }
        const step = steps[i]!;
        step.onStart?.();
        speakRaw(step.text, myGen, () => {
          if (generation.current !== myGen) return;
          setTimeout(() => {
            if (generation.current === myGen) run(i + 1);
          }, pauseMs);
        });
      };
      run(0);
    },
    [stop, speakRaw],
  );

  return { speak, replay, stop, speakSequence };
}
