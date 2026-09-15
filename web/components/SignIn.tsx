"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useSession } from "@/lib/session";

function CompassMark() {
  return (
    <svg
      viewBox="0 0 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      aria-hidden="true"
      className="tr-signin__mark"
    >
      <path d="M13 3.5a9.5 9.5 0 1 1-8.2 4.7" />
      <path d="M3.2 3.6l1.6 4.6 4.6-1.6" />
    </svg>
  );
}

/** Spec 7.1 screen 1: Google sign-in, the front door of the app. */
export function SignIn() {
  const { signInWithGoogle, error: bootstrapError } = useSession();
  const [pending, setPending] = useState(false);
  const [popupError, setPopupError] = useState<string | null>(null);

  async function handleSignIn() {
    setPopupError(null);
    setPending(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error("Wonderloop: sign-in did not complete", err);
      setPopupError("Sign-in did not go through. Please try again.");
    } finally {
      setPending(false);
    }
  }

  // The popup itself failing (closed early, network blip) and the household bootstrap failing
  // after a successful sign-in (Important bug: this used to fail silently, dropping the user
  // back to a bare sign-in screen with no explanation) are different failures with different
  // family-facing messages; a fresh popup attempt's own error takes precedence once there is
  // one, since it is the more recent thing that happened.
  const error = popupError ?? bootstrapError ?? null;

  return (
    <div className="tr-signin">
      <Card tone="surface" shadow className="tr-signin__card">
        <CompassMark />
        <p className="tr-eyebrow">Wonderloop</p>
        <h1 className="tr-signin__title">Make it. Prove it. Say it.</h1>
        <p className="tr-signin__lede">
          A weekly trail of quests for your family. Sign in to find your household.
        </p>
        <Button variant="primary" onClick={handleSignIn} disabled={pending}>
          {pending ? "Signing in…" : "Sign in with Google"}
        </Button>
        <p className="tr-signin__legal">
          Invitation only. By signing in you agree to the <a href="/terms">terms of use</a> and the{" "}
          <a href="/privacy">privacy notice</a>.
        </p>
        {error ? (
          <p className="tr-signin__error" role="alert">
            {error}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
