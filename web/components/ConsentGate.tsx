"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useSession } from "@/lib/session";

/**
 * The one screen between a first sign-in and a family's space (6 September 2026): a parent or
 * guardian confirms they are one, and accepts the terms and the privacy notice, before the
 * household is created. The household document records which version was accepted and when.
 */
export function ConsentGate() {
  const { user, acceptTerms, signOut, error } = useSession();
  const [ticked, setTicked] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleContinue() {
    setPending(true);
    try {
      await acceptTerms();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="tr-signin">
      <Card tone="surface" shadow className="tr-signin__card tr-consent">
        <p className="tr-eyebrow">Wonderloop</p>
        <h1 className="tr-signin__title">Before we make your family&rsquo;s space</h1>
        <p className="tr-signin__lede">
          You are signed in as {user?.email ?? "your account"}. Wonderloop keeps what your children make here: their
          answers, photos, recordings and, if you switch it on, their debate transcripts. Only your household can see
          them. Please read the short{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer">
            privacy notice
          </a>{" "}
          and the{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer">
            terms of use
          </a>
          .
        </p>
        <label className="tr-consent__tick">
          <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} disabled={pending} />
          <span>I am a parent or guardian of the children who will use this space, and I accept the terms and the privacy notice.</span>
        </label>
        {error ? (
          <p className="tr-signin__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="tr-step__actions">
          <Button variant="primary" onClick={() => void handleContinue()} disabled={!ticked || pending}>
            {pending ? "Setting up..." : "Create our family’s space"}
          </Button>
          <Button variant="quiet" onClick={() => void signOut()} disabled={pending}>
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}
