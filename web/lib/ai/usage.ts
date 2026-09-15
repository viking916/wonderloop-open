// Per-profile call accounting for the live-model routes, stored server-side where no client can
// reset it: aiUsage/{hid}__{pid} at the root of Firestore, which firestore.rules gives no client
// access to at all ("Everything else: no client access"). The decision itself is
// lib/domain/rateLimit.ts; this only keeps the timestamps.

import "server-only";
import { getAdminDb } from "../firebase/admin";
import { checkRateLimit, pruneCalls, type RateLimitDecision } from "../domain/rateLimit";

const usageDoc = (hid: string, pid: string) => `aiUsage/${hid}__${pid}`;

/**
 * Decides whether this call may go ahead and, if so, records it in the same transaction, so two
 * simultaneous requests cannot both squeeze through the last slot.
 */
export async function reserveCall(hid: string, pid: string, now: number): Promise<RateLimitDecision> {
  const db = getAdminDb();
  const ref = db.doc(usageDoc(hid, pid));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const calls = ((snap.data()?.calls as number[] | undefined) ?? []).filter((t) => typeof t === "number");
    const decision = checkRateLimit(calls, now);
    if (decision.allowed) {
      tx.set(ref, { calls: [...pruneCalls(calls, now), now], updatedAt: now }, { merge: true });
    }
    return decision;
  });
}
