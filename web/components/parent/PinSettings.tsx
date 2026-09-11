"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PinForm } from "@/components/parent/PinForm";
import { setParentPin } from "@/lib/data/households";
import type { HouseholdDoc } from "@/lib/data/types";

export type PinSettingsProps = {
  householdId: string;
  household: HouseholdDoc | undefined;
};

/**
 * Task 9 feature 1's "the parent view gets a control to set and change it": a persistent card
 * in the parent view (unlike ParentPinGate, which only ever appears before the PIN is entered)
 * so the PIN can be set later by a household that declined at first, or changed or turned off
 * at any time -- not just offered once on the way in.
 */
export function PinSettings({ householdId, household }: PinSettingsProps) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasPin = Boolean(household?.parentPin);

  async function save(pin: string): Promise<void> {
    await setParentPin(householdId, pin);
    setEditing(false);
  }

  async function turnOff(): Promise<void> {
    setBusy(true);
    try {
      await setParentPin(householdId, undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card tone="surface" className="pr-pin-settings" aria-labelledby="pin-settings-heading">
      <p className="tr-eyebrow" id="pin-settings-heading">
        Parent view PIN
      </p>
      {editing ? (
        <PinForm onSave={save} onCancel={() => setEditing(false)} saveLabel={hasPin ? "Change PIN" : "Set PIN"} />
      ) : (
        <>
          <p className="pr-pin-settings__status">
            {hasPin
              ? "A PIN is set. It will be asked for the next time the parent view opens."
              : "No PIN is set. Anyone who taps the Parent tile opens this view."}
          </p>
          <div className="pr-pin__row">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {hasPin ? "Change PIN" : "Set a PIN"}
            </Button>
            {hasPin ? (
              <Button variant="secondary" onClick={() => void turnOff()} disabled={busy}>
                {busy ? "Turning off…" : "Turn off PIN"}
              </Button>
            ) : null}
          </div>
          <p className="pr-pin-settings__note">
            This is friction, not a lock: anyone signed into this Google account can still find
            the PIN in the browser&apos;s developer tools if they go looking.
          </p>
        </>
      )}
    </Card>
  );
}
