"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { isFourDigitPin } from "@/lib/domain/pin";

export type PinFormProps = {
  onSave: (pin: string) => Promise<void>;
  onCancel?: () => void;
  saveLabel?: string;
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

/**
 * The shared "type a 4-digit PIN twice" form (task 9 feature 1), used both by ParentPinGate's
 * first-time "set a PIN?" offer and by PinSettings' "set / change PIN" control in the parent
 * view, so both entry points validate and submit identically. Validates locally (exactly 4
 * digits, both entries match) before ever calling onSave, which is expected to persist the PIN
 * (lib/data/households.ts's setParentPin) and is the only place a real save failure can come
 * from.
 */
export function PinForm({ onSave, onCancel, saveLabel = "Save PIN" }: PinFormProps) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isFourDigitPin(pin)) {
      setError("Use exactly 4 digits.");
      return;
    }
    if (pin !== confirm) {
      setError("Those two do not match.");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await onSave(pin);
    } catch {
      setError("Could not save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="pr-pin__form" onSubmit={(e) => void submit(e)}>
      <label>
        New 4-digit PIN
        <input
          className="tr-answer__input pr-pin__input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(digitsOnly(e.target.value))}
        />
      </label>
      <label>
        Confirm PIN
        <input
          className="tr-answer__input pr-pin__input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={confirm}
          onChange={(e) => setConfirm(digitsOnly(e.target.value))}
        />
      </label>
      {error ? (
        <p role="alert" className="pr-confirm__error">
          {error}
        </p>
      ) : null}
      <div className="pr-pin__row">
        <Button variant="primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : saveLabel}
        </Button>
        {onCancel ? (
          <Button variant="quiet" type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
