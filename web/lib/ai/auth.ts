// Who is calling a live-model route, and are they allowed to act for this profile. Server only.
//
// The browser sends its Firebase ID token as a bearer token. This verifies it with the Admin
// SDK (which needs no key of its own on Cloud Functions, and none against the emulators), then
// checks the same two facts firestore.rules checks for every household write: the address is
// allowlisted and the uid is a member of the household. A route that skipped this would let any
// signed-in stranger spend the family's model budget by guessing a household id.
//
// lib/firebase/admin.ts says app code must never import it because the Admin SDK bypasses the
// rules. A route handler is the one place that is right: it is the server, and this file
// re-applies the rules' own checks by hand before doing anything.

import "server-only";
import { getAuth } from "firebase-admin/auth";
import { getAdminApp, getAdminDb } from "../firebase/admin";
import { EMULATOR_PORTS } from "../firebase/emulator-ports.mjs";

export type Caller = { uid: string; email: string };

export type AuthResult = { ok: true; caller: Caller } | { ok: false; status: 401 | 403; message: string };

function pointAuthAtEmulator(): void {
  // next dev loads .env.development.local, which sets FIRESTORE_EMULATOR_HOST but not the Auth
  // emulator's host (the browser SDK connects to it by port on its own). The Admin SDK needs the
  // variable, so derive it the same way scripts/verify-ui.mjs does.
  if (process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = `localhost:${EMULATOR_PORTS.auth}`;
  }
}

/** The same checks as authorizeForProfile, for routes that act on the household itself (the
 * family's AI key): a signed-in, allowlisted member of the household. */
export async function authorizeForHousehold(authorization: string | null, hid: string): Promise<AuthResult> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  if (!token) return { ok: false, status: 401, message: "Sign in first." };
  pointAuthAtEmulator();
  let uid: string;
  let email: string | undefined;
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email ?? undefined;
  } catch {
    return { ok: false, status: 401, message: "Sign in again." };
  }
  if (!email) return { ok: false, status: 403, message: "This account has no email address." };
  if (!hid) return { ok: false, status: 403, message: "No household given." };
  const db = getAdminDb();
  const [allowed, household] = await Promise.all([db.doc(`allowedEmails/${email.toLowerCase()}`).get(), db.doc(`households/${hid}`).get()]);
  if (!allowed.exists) return { ok: false, status: 403, message: "This account is not on the allowlist." };
  const members = (household.data()?.memberUids as string[] | undefined) ?? [];
  if (!household.exists || !members.includes(uid)) return { ok: false, status: 403, message: "Not a member of this household." };
  return { ok: true, caller: { uid, email } };
}

export async function authorizeForProfile(authorization: string | null, hid: string, pid: string): Promise<AuthResult> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  if (!token) return { ok: false, status: 401, message: "Sign in first." };
  pointAuthAtEmulator();
  let uid: string;
  let email: string | undefined;
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email ?? undefined;
  } catch {
    return { ok: false, status: 401, message: "Sign in again." };
  }
  if (!email) return { ok: false, status: 403, message: "This account has no email address." };
  const db = getAdminDb();
  const [allowed, household, profile] = await Promise.all([
    db.doc(`allowedEmails/${email.toLowerCase()}`).get(),
    db.doc(`households/${hid}`).get(),
    db.doc(`households/${hid}/profiles/${pid}`).get(),
  ]);
  if (!allowed.exists) return { ok: false, status: 403, message: "This account is not on the allowlist." };
  const members = (household.data()?.memberUids as string[] | undefined) ?? [];
  if (!household.exists || !members.includes(uid)) return { ok: false, status: 403, message: "Not a member of this household." };
  if (!profile.exists) return { ok: false, status: 403, message: "No such profile." };
  return { ok: true, caller: { uid, email } };
}
