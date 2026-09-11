// allowlist.ts: the client's only touchpoint with allowedEmails (spec 9, Task 3b). Read-only --
// firestore.rules forbids every client write to this collection (owner-managed via
// scripts/allowlist.ts or the console), and a signed-in user may only ever get() their own
// (lowercased) document. In practice this is called with exactly one email: lib/session.tsx's
// own signed-in user, right after Google sign-in and before any household read or write is
// attempted.

import { doc, getDoc } from "firebase/firestore";
import { getDb } from "../firebase/client";

/** True if `email` (any case; Google returns whatever the user typed) has an allowedEmails
 * document. False for a missing or empty email rather than throwing -- Google sign-in can in
 * principle return an account with no email set, and that account has nothing to look up. */
export async function isEmailAllowed(email: string | null | undefined): Promise<boolean> {
  const lowered = (email ?? "").trim().toLowerCase();
  if (!lowered) return false;
  const db = getDb();
  const snap = await getDoc(doc(db, "allowedEmails", lowered));
  return snap.exists();
}
