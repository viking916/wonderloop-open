// Server-side only (routes and scripts/ai-key.ts); no "server-only" marker because the admin
// script imports this outside Next, where that marker throws.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getAdminDb } from "../firebase/admin";

/**
 * Each family supplies its own Anthropic key (owner decision, 6 September 2026): AI features
 * are off for a household until a parent adds one in the Parent view, and the cost of every
 * call lands on that family's own account. The key lives at households/{hid}/private/ai, a
 * document no client can read or write (firestore.rules denies the `private` subcollection to
 * members; only this server, through the Admin SDK, touches it), encrypted with AES-256-GCM
 * under AI_KEY_SECRET when that secret is present. Nothing here ever returns the key to a
 * browser: the only thing a client learns is whether one is set and its last four characters.
 */

export const AI_KEY_DOC = (hid: string) => `households/${hid}/private/ai`;

type StoredKey =
  | { enc: "aes-256-gcm"; iv: string; ct: string; tag: string; last4: string; addedAt: number; addedByUid: string }
  | { enc: "none"; key: string; last4: string; addedAt: number; addedByUid: string };

function secretBytes(): Buffer | undefined {
  const secret = process.env.AI_KEY_SECRET;
  if (!secret) return undefined;
  return createHash("sha256").update(secret).digest();
}

export function encryptKey(key: string, addedByUid: string, now: number): StoredKey {
  const last4 = key.slice(-4);
  const secret = secretBytes();
  if (!secret) return { enc: "none", key, last4, addedAt: now, addedByUid };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret, iv);
  const ct = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
  return { enc: "aes-256-gcm", iv: iv.toString("base64"), ct: ct.toString("base64"), tag: cipher.getAuthTag().toString("base64"), last4, addedAt: now, addedByUid };
}

export function decryptKey(stored: StoredKey): string | undefined {
  if (stored.enc === "none") return stored.key;
  const secret = secretBytes();
  if (!secret) return undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", secret, Buffer.from(stored.iv, "base64"));
    decipher.setAuthTag(Buffer.from(stored.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(stored.ct, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return undefined;
  }
}

/** True when the string has the shape of an Anthropic API key. Never logged. */
export function looksLikeAnthropicKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim());
}

export async function getHouseholdKey(hid: string): Promise<string | undefined> {
  const snap = await getAdminDb().doc(AI_KEY_DOC(hid)).get();
  if (!snap.exists) return undefined;
  return decryptKey(snap.data() as StoredKey);
}

export async function getHouseholdKeyStatus(hid: string): Promise<{ configured: boolean; last4?: string; addedAt?: number }> {
  const snap = await getAdminDb().doc(AI_KEY_DOC(hid)).get();
  if (!snap.exists) return { configured: false };
  const data = snap.data() as StoredKey;
  return { configured: true, last4: data.last4, addedAt: data.addedAt };
}

export async function setHouseholdKey(hid: string, key: string, addedByUid: string, now = Date.now()): Promise<void> {
  await getAdminDb().doc(AI_KEY_DOC(hid)).set(encryptKey(key.trim(), addedByUid, now));
}

export async function clearHouseholdKey(hid: string): Promise<void> {
  await getAdminDb().doc(AI_KEY_DOC(hid)).delete();
}
