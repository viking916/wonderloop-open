"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PinEntryForm } from "@/components/parent/PinEntryForm";
import { watchHousehold } from "@/lib/data/households";
import type { HouseholdDoc } from "@/lib/data/types";
import type { SproutWeek } from "@/lib/content/schema";

const HOLD_MS = 5000;

type Phase = "idle" | "holding" | "pin" | "challenge" | "revealed";

function randomFactor(): number {
  return 2 + Math.floor(Math.random() * 8); // 2..9
}

/**
 * Spec 6's exit gate: "Exit and the parent card sit behind a long-press gate with a simple
 * arithmetic question." Owner feedback (task 13): he used the live app and could not find this
 * control at all -- it used to be a tiny, low-contrast, unlabelled corner tag. The fix keeps the
 * gate itself (a five-second hold, up from three, is now the barrier) but makes the control a
 * genuine, labelled affordance: an icon, a two-line "Grown-ups / Hold 5 seconds" label a parent
 * can read at a glance, and a visible fill meter while holding so a press is never left
 * wondering whether it registered. None of that is reachable by a quick tap or a brief touch --
 * a 3-year-old's normal tapping (and a curious poke-and-release) still never lands here by
 * accident, and releasing early snaps the meter back with no error, sound, or message.
 *
 * Task 16: once the household has a parent-set PIN (task 9 feature 1, set from the Parent view's
 * own PinSettings), the five-second hold opens onto that same PIN instead of the arithmetic
 * question -- two different "prove you're a grown-up" checks for one job was confusing, and
 * mental arithmetic to get out of your own child's tablet was the owner's own complaint. Reuses
 * PinEntryForm and pinMatches (lib/domain/pin.ts) verbatim -- the same component and validator
 * ParentPinGate uses to gate the Parent view's content -- rather than a second, separately-typed
 * copy of "check a 4-digit string against the stored one." A household that never set a PIN
 * falls back to the original arithmetic challenge below (household.parentPin undefined), so
 * nobody is ever locked out of their own exit for not having opted into a PIN.
 */
export function ParentGate({
  parentCard,
  householdId,
  onExit,
}: {
  parentCard: SproutWeek["parentCard"];
  householdId: string;
  onExit: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [question, setQuestion] = useState(() => ({ a: randomFactor(), b: randomFactor() }));
  const [answer, setAnswer] = useState("");
  const [wrong, setWrong] = useState(false);
  // Seconds remaining in the current hold, for the "Keep holding: Ns" label. Recomputed from
  // real elapsed time (not just decremented) so a slow tab/frame drop never drifts it out of
  // sync with the CSS meter fill, which is driven by the same HOLD_MS on a real timer.
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(HOLD_MS / 1000));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ticker = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Watched continuously from mount (like ParentPinGate does), well before any hold could ever
  // complete, so the PIN is already known the moment the five-second hold finishes. Also mirrored
  // into a ref: startHold below is memoized with a stable identity (deps: [stopTicker], which
  // never changes), so its setTimeout closure would otherwise keep reading whatever `household`
  // was on the very first render (almost always still undefined) rather than the real, current
  // value -- the ref sidesteps that without giving startHold an identity that changes on every
  // household update.
  const [household, setHousehold] = useState<HouseholdDoc | undefined>(undefined);
  const householdRef = useRef<HouseholdDoc | undefined>(undefined);
  useEffect(() => {
    householdRef.current = household;
  }, [household]);
  useEffect(() => watchHousehold(householdId, setHousehold), [householdId]);

  const stopTicker = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = undefined;
  }, []);

  const startHold = useCallback(() => {
    setPhase("holding");
    // A fresh question per hold attempt, picked once here (not on every render of the
    // challenge dialog that follows), so typing an answer never shuffles the numbers underneath.
    // Generated unconditionally even when a PIN is set and this question will never be shown --
    // cheap, and it means the fallback path never has to special-case "already have a question
    // from before a PIN was set".
    setQuestion({ a: randomFactor(), b: randomFactor() });
    const startedAt = Date.now();
    setSecondsLeft(Math.ceil(HOLD_MS / 1000));
    ticker.current = setInterval(() => {
      setSecondsLeft(Math.max(1, Math.ceil((HOLD_MS - (Date.now() - startedAt)) / 1000)));
    }, 100);
    timer.current = setTimeout(() => {
      stopTicker();
      setPhase(householdRef.current?.parentPin ? "pin" : "challenge");
    }, HOLD_MS);
  }, [stopTicker]);

  const cancelHold = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    stopTicker();
    setSecondsLeft(Math.ceil(HOLD_MS / 1000));
    setPhase((p) => (p === "holding" ? "idle" : p));
  }, [stopTicker]);

  function checkAnswer() {
    if (Number(answer) === question.a * question.b) {
      setWrong(false);
      setAnswer("");
      setPhase("revealed");
    } else {
      setWrong(true);
    }
  }

  function close() {
    if (timer.current) clearTimeout(timer.current);
    stopTicker();
    setPhase("idle");
    setAnswer("");
    setWrong(false);
  }

  const holding = phase === "holding";

  return (
    <>
      <button
        type="button"
        className="sp-gate"
        aria-label="Grown-ups: hold for 5 seconds to open the parent card and the way out"
        data-holding={holding ? "true" : undefined}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
      >
        <svg
          className="sp-gate__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        <span className="sp-gate__text">
          <span className="sp-gate__eyebrow">Grown-ups</span>
          <span className="sp-gate__label">{holding ? `Keep holding: ${secondsLeft}s` : "Hold 5 seconds to open"}</span>
        </span>
        <span className="sp-gate__meter" aria-hidden="true">
          <span className="sp-gate__meter-fill" />
        </span>
      </button>

      {phase === "pin" || phase === "challenge" || phase === "revealed" ? (
        <div className="sp-gate-overlay" role="dialog" aria-label="Grown-up area">
          <div className="sp-gate-card">
            {phase === "pin" ? (
              <>
                <p className="tr-eyebrow">Grown-ups</p>
                <h2 className="sp-gate-card__q">Enter the parent PIN</h2>
                <PinEntryForm
                  storedPin={household?.parentPin}
                  onCorrect={() => setPhase("revealed")}
                  extraActions={
                    <Button variant="quiet" onClick={close}>
                      Back to the hill
                    </Button>
                  }
                />
              </>
            ) : phase === "challenge" ? (
              <>
                <p className="tr-eyebrow">Quick check</p>
                <h2 className="sp-gate-card__q">
                  {question.a} &times; {question.b} = ?
                </h2>
                <div className="sp-gate-card__row">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    aria-label="Answer"
                    className="tr-answer__input"
                    autoFocus
                  />
                  <Button variant="primary" onClick={checkAnswer}>
                    Check
                  </Button>
                </div>
                {wrong ? (
                  <p role="alert" className="sp-gate-card__wrong">
                    Not quite. Try again.
                  </p>
                ) : null}
                <Button variant="quiet" onClick={close}>
                  Back to the hill
                </Button>
              </>
            ) : (
              <>
                <p className="tr-eyebrow">This week&apos;s parent card</p>
                <h2 className="sp-gate-card__q">{parentCard.title}</h2>
                <p className="sp-gate-card__minutes">{parentCard.minutes} minutes together</p>
                <ol className="sp-gate-card__steps">
                  {parentCard.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                <p className="sp-gate-card__notice-label">Notice</p>
                <ul className="sp-gate-card__notice">
                  {parentCard.notice.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
                <div className="sp-gate-card__row">
                  <Button variant="quiet" onClick={close}>
                    Back to the hill
                  </Button>
                  <Button variant="primary" onClick={onExit}>
                    Exit to profile picker
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
