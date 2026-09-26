"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useSession } from "@/lib/session";

/**
 * Spec 7.1 screen 1 (amended 2026-08-29, Task 3b): shown when a signed-in Google account has no
 * allowedEmails document. Authentication itself always succeeds -- this screen exists because
 * authorisation did not, and the copy says exactly that, plainly, to an adult who is not in
 * trouble: which address they signed in as, that it does not have access yet, and a way to sign
 * out. No error styling (nothing is broken), no jargon, no support address, since none exists
 * yet.
 */
export function NotAllowed() {
  const { user, signOut } = useSession();

  return (
    <div className="tr-signin">
      <Card tone="surface" shadow className="tr-signin__card">
        <p className="tr-eyebrow">Wonderloop</p>
        <h1 className="tr-signin__title">This address does not have access yet</h1>
        <p className="tr-signin__lede">
          You signed in as {user?.email ?? "an account with no email address"}. Ask the owner
          for access, then sign in again.
        </p>
        <Button variant="primary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </Card>
    </div>
  );
}
