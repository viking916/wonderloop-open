"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { pinMatches } from "@/lib/domain/pin";

export type PinEntryFormProps = {
  /** The household's real PIN, or undefined if none is set. Passed straight to pinMatches --
   * this component never decides on its own what "no PIN configured" should mean, exactly like
   * that helper's own contract. */
  storedPin: string | undefined;
  /** Called once, the moment a correct PIN is submitted -- what happens next (unlock a view,
   * reveal a card) is entirely the caller's business. */
  onCorrect: () => void;
  autoFocus?: boolean;
  submitLabel?: string;
  /** Extra buttons rendered alongside Submit (a "Switch profile", a "Back to the hill") -- kept
   * as a slot rather than a prop per caller, since the two current callers each want a different
   * one. */
  extraActions?: ReactNode;
};

/**
 * The one PIN-entry form in this app (task 16): a 4-digit field, pinMatches (lib/domain/pin.ts)
 * as the one and only validator, and a wrong guess that is refused kindly -- no lockout, no
 * timer, no attempt counter, nothing written anywhere a child (or the parent) could later read as
 * evidence of a wrong guess. Originally lived only inside ParentPinGate (task 9 feature 1, the
 * gate in front of the Parent view's own content); task 16 pulled it out here so Sprout's own
 * grown-ups gate (components/sprout/ParentGate.tsx) can ask for the same real PIN instead of
 * carrying a second, separately-typed copy of this same form. One PIN, one validator, one mental
 * model, one place a fix or a copy edit has to land.
 */
export function PinEntryForm({ storedPin, onCorrect, autoFocus = true, submitLabel = "Enter", extraActions }: PinEntryFormProps) {
  const [entered, setEntered] = useState("");
  const [wrong, setWrong] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pinMatches(entered, storedPin)) {
      setWrong(false);
      setEntered("");
      onCorrect();
    } else {
      // Deliberately no logging, no Firestore write, no counter: a wrong guess here leaves no
      // trace anywhere a child (or the parent, later) could see it -- same contract
      // ParentPinGate's own "enter" phase always carried.
      setWrong(true);
      setEntered("");
    }
  }

  return (
    <form className="pr-pin__form" onSubmit={submit}>
      <label>
        4-digit PIN
        <input
          className="tr-answer__input pr-pin__input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          value={entered}
          onChange={(e) => {
            setWrong(false);
            setEntered(e.target.value.replace(/\D/g, "").slice(0, 4));
          }}
        />
      </label>
      {wrong ? (
        <p role="alert" className="pr-confirm__error">
          That is not the PIN. Try again.
        </p>
      ) : null}
      <div className="pr-pin__row">
        <Button variant="primary" type="submit">
          {submitLabel}
        </Button>
        {extraActions}
      </div>
    </form>
  );
}
