"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingTrail } from "@/components/LoadingTrail";
import { PinEntryForm } from "@/components/parent/PinEntryForm";
import { PinForm } from "@/components/parent/PinForm";
import { setParentPin, watchHousehold } from "@/lib/data/households";
import { useSession } from "@/lib/session";
import type { HouseholdDoc } from "@/lib/data/types";

function declinedStorageKey(hid: string): string {
  return `wonderloop:parentPinDeclined:${hid}`;
}

function readDeclined(hid: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(declinedStorageKey(hid)) === "1";
  } catch {
    return false;
  }
}

function writeDeclined(hid: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(declinedStorageKey(hid), "1");
  } catch {
    // Private browsing / storage disabled: worst case the offer just shows again next visit.
  }
}

type Phase = "loading" | "offer" | "setting" | "enter" | "unlocked";

/**
 * Task 9 feature 1: gates the Parent view's CONTENT behind a parent-set 4-digit PIN.
 *
 * This is friction, not security. Every household member signs in with the same shared Google
 * account (spec 7.1: "the child uses the parent's signed-in browser on his own device"), and
 * firestore.rules' isMember(hid) gives every member of a household full read AND write access
 * to that household's own document, parentPin included, with no extra role check. A child who
 * opens devtools can read households/{hid}.parentPin directly, or simply call the app's own
 * setParentPin() from the console. This gate stops an idle or opportunistic tap on the Parent
 * tile (or a stale bookmark) from a child who has not gone looking for a workaround; it must
 * never be described to a parent as something that keeps a determined child out.
 *
 * Deliberately wraps the Parent view's CONTENT (mounted from inside ParentPage, after
 * RequireProfile has already confirmed the active profile is "parent"), not the tap that
 * selects the Parent tile in the picker. RequireProfile already sends away anyone whose active
 * profile is not "parent" -- including a direct visit to /parent while on Explorer or Sprout.
 * The case this component exists for is the one RequireProfile cannot cover: the browser's
 * *stored* active profile is already "parent" (spec 7.1's persisted picker choice survives a
 * reload), and /parent is opened directly -- a bookmark, a typed URL, a restored tab -- with no
 * tile tap at all. Because ParentPinGate mounts fresh every time ParentPage does, that path
 * asks for the PIN exactly the same as tapping the tile would. "unlocked" lives only in this
 * component's own React state, never persisted, so it resets on every fresh mount (a reload, or
 * leaving through "Switch profile" and coming back).
 *
 * No PIN set: offers to set one, with a plain "Not now" that is remembered per household (in
 * localStorage) so the offer does not ask again on every visit -- and lets the parent straight
 * through either way, since the brief is explicit this must never be forced.
 *
 * Wrong PIN: never written anywhere -- no Firestore document, no console log, nothing that
 * could later read in the Parent view as if the child had done something wrong. Just an inline
 * "That is not the PIN. Try again.", no lockout, no delay, no attempt counter.
 */
export function ParentPinGate({ householdId, children }: { householdId: string; children: ReactNode }) {
  const { setActiveProfile } = useSession();
  const [household, setHousehold] = useState<HouseholdDoc | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => watchHousehold(householdId, setHousehold), [householdId]);

  // Decides the starting phase exactly once per mount, the moment the household doc first
  // arrives (phase stays "loading" until then, so this never fires twice for the same mount).
  // Adjusted during render rather than in an effect (React's own "adjusting state when a prop
  // changes" pattern): the guard on `phase === "loading"` makes this idempotent -- it only ever
  // fires the render right after `household` first lands, same as the effect it replaces, but
  // without waiting an extra commit+effect cycle to do it.
  if (phase === "loading" && household) {
    if (household.parentPin) setPhase("enter");
    else if (readDeclined(householdId)) setPhase("unlocked");
    else setPhase("offer");
  }

  if (phase === "unlocked") return <>{children}</>;
  if (phase === "loading" || !household) return <LoadingTrail />;

  async function saveNewPin(pin: string): Promise<void> {
    await setParentPin(householdId, pin);
    setPhase("unlocked");
  }

  function decline(): void {
    writeDeclined(householdId);
    setPhase("unlocked");
  }

  const switchProfileButton = (
    <Button variant="quiet" type="button" onClick={() => setActiveProfile(undefined)}>
      Switch profile
    </Button>
  );

  return (
    <div className="tr-signin">
      <Card tone="surface" shadow className="tr-signin__card pr-pin-gate">
        <p className="tr-eyebrow">Wonderloop</p>
        {phase === "enter" ? (
          <>
            <h1 className="tr-signin__title">Enter the parent PIN</h1>
            <p className="tr-signin__lede">This keeps the parent view from opening by accident.</p>
            <PinEntryForm storedPin={household.parentPin} onCorrect={() => setPhase("unlocked")} extraActions={switchProfileButton} />
          </>
        ) : phase === "setting" ? (
          <>
            <h1 className="tr-signin__title">Set a parent PIN</h1>
            <p className="tr-signin__lede">
              You will need it to open the parent view next time. This is friction, not a lock:
              anyone signed into this Google account can still find it in the browser&apos;s
              developer tools if they go looking.
            </p>
            <PinForm onSave={saveNewPin} onCancel={() => setPhase("offer")} />
          </>
        ) : (
          <>
            <h1 className="tr-signin__title">Keep the parent view private?</h1>
            <p className="tr-signin__lede">
              You can set a 4-digit PIN so the parent view does not open with a stray tap. This
              is a speed bump, not a lock: anyone signed into this Google account can still find
              it in the browser&apos;s developer tools if they go looking.
            </p>
            <div className="pr-pin__row">
              <Button variant="primary" onClick={() => setPhase("setting")}>
                Set a PIN
              </Button>
              <Button variant="quiet" onClick={decline}>
                Not now
              </Button>
              {switchProfileButton}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
