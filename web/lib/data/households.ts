// households.ts: sign-in, household and profile repository (spec 7.1, spec 9). Everything the
// app writes for a household or a profile goes through this module; no component calls
// firebase/firestore directly.

import { arrayRemove, arrayUnion, deleteField, doc, getDoc, getDocs, onSnapshot, query, runTransaction, setDoc, type Unsubscribe, updateDoc, where, writeBatch } from "firebase/firestore";
import { getDb } from "../firebase/client";
import { mondayOnOrBefore } from "../domain/seasons";
import { dateOnly, resumedStartDate } from "../domain/calendar";
import {
  householdPath,
  householdRef,
  householdsCol,
  profileRef,
  profilesCol,
  userPath,
  userRef,
  type HouseholdDoc,
  type ProfileDoc,
} from "./types";

// Ambiguous characters (0/O, 1/I/L) are left out so a code read aloud or handwritten is never
// misheard or miscopied.
const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomInviteCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * A household is created on first sign-in (spec 7.1): the creator names themselves owner and
 * the sole member, and gets a 6-character invite code others can join with. Also records the
 * household id on the creator's users/{uid} doc.
 *
 * The bootstrap household's id is deterministic (`home-${uid}`), not random. Two tabs signing
 * into the same fresh account both read "no household yet" (getHouseholdForUser does a plain
 * read, with nothing stopping a second read from starting before the first write lands) and
 * both used to call this function -- each minting its own random id, so both writes landed and
 * the family ended up with two households, one of them an orphan getHouseholdForUser could
 * never see again (it only ever reads householdIds[0]).
 *
 * The write is made safe to run twice with a `runTransaction`, but the transaction's read is
 * anchored on users/{uid}, not on households/{hid}. firestore.rules only lets a caller read a
 * households/{hid} document once they are already a member of it (`isMember(hid)`) -- exactly
 * the isolation the rules exist to provide, and not something this fix should punch a hole in.
 * users/{uid} has no such chicken-and-egg problem: it is readable and writable by request.auth
 * .uid == uid unconditionally, whether or not the document exists yet. So the transaction reads
 * users/{uid} first: if it already lists a household, someone (a concurrent tab, or an earlier
 * retry of this same call) already finished bootstrapping and this call is the loser -- it reads
 * that household back (a read that is now allowed, since the winner's transaction already added
 * this same uid to memberUids) rather than writing anything, so it can never clobber the
 * winner's name/memberUids/inviteCode. Only the winner (users/{uid} had no household yet) writes
 * the new households/{hid} doc, classified as a `create` by firestore.rules exactly as before.
 * `created` tells the caller which of the two it was, so the caller can bootstrap the
 * household's first profile exactly once (see session.tsx).
 *
 * Only the bootstrap flow uses this deterministic id. Later households (the invite flow, Plan
 * 4) keep random ids -- a household created there is never "the same household two tabs raced
 * to create," so there is nothing to deduplicate against.
 */
export async function createHousehold(
  uid: string,
  name: string,
  consent?: { termsVersion: string; termsAcceptedAt: number },
): Promise<{ hid: string; inviteCode: string; created: boolean }> {
  const db = getDb();
  const hid = `home-${uid}`;
  const hRef = householdRef(db, hid);
  // Raw (converter-free) ref: arrayUnion() is a FieldValue, not a string[], and a merge write
  // must not require the rest of UserDoc (displayName) to already exist or be supplied here.
  const uRef = doc(db, userPath(uid));
  const inviteCode = randomInviteCode();
  const household: HouseholdDoc = { name, ownerUid: uid, memberUids: [uid], inviteCode, createdAt: Date.now(), ...(consent ?? {}) };

  let created = false;
  let resultHid = hid;
  let resultInviteCode = inviteCode;

  await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(uRef);
    const existingIds: string[] = userSnap.exists() ? ((userSnap.data().householdIds as string[] | undefined) ?? []) : [];

    if (existingIds.length > 0) {
      // Lost the race (or this is a retry after we ourselves already succeeded): a household is
      // already recorded for this uid. Read it back instead of writing -- this uid is already a
      // member of it (adding to memberUids and to householdIds always happens together, in the
      // winner's own transaction below), so the read is allowed.
      resultHid = existingIds[0];
      const existingSnap = await tx.get(householdRef(db, resultHid));
      resultInviteCode = existingSnap.exists() ? existingSnap.data().inviteCode : inviteCode;
      created = false;
      return;
    }

    created = true;
    tx.set(hRef, household);
    tx.set(uRef, { householdIds: arrayUnion(hid) }, { merge: true });
  });

  return { hid: resultHid, inviteCode: resultInviteCode, created };
}

/** The signed-in user's household, or null if they have none yet (first sign-in, before
 * createHousehold or joinByCode). Assumes one household per user (spec 7.1 does not describe
 * multi-household membership); reads the first id on their user doc. */
export async function getHouseholdForUser(uid: string): Promise<{ hid: string; household: HouseholdDoc } | null> {
  const db = getDb();
  const userSnap = await getDoc(userRef(db, uid));
  const householdIds = userSnap.exists() ? userSnap.data().householdIds : [];
  if (householdIds.length === 0) return null;
  const hid = householdIds[0];
  const hSnap = await getDoc(householdRef(db, hid));
  if (!hSnap.exists()) return null;
  return { hid, household: hSnap.data() };
}

/** The Parent view's invite card (spec 7.1 screen 8: "invite link"): a live view of this
 * household's own doc, so a code rotated elsewhere (not built yet, but the read should not go
 * stale) is reflected without a reload. */
export function watchHousehold(hid: string, cb: (household: HouseholdDoc | undefined) => void): Unsubscribe {
  const db = getDb();
  return onSnapshot(householdRef(db, hid), (snap) => cb(snap.exists() ? snap.data() : undefined));
}

export async function listProfiles(hid: string): Promise<Array<{ pid: string; profile: ProfileDoc }>> {
  const db = getDb();
  const snap = await getDocs(profilesCol(db, hid));
  return snap.docs.map((d) => ({ pid: d.id, profile: d.data() }));
}

export type NewProfile = {
  name: string;
  kind: ProfileDoc["kind"];
  avatar: string;
  birthYear: number;
  seasonId: number;
  /** Absent for a new child: the week clock starts on their first saved step (startClock). */
  startDate?: string;
  look?: ProfileDoc["look"];
};

/** look defaults to "trail" (spec 14: Trail is the default; Sprout has no picker and stays on
 * it). Returns the new profile's id. */
export async function createProfile(hid: string, input: NewProfile): Promise<string> {
  const db = getDb();
  const ref = doc(profilesCol(db, hid));
  const profile: ProfileDoc = { ...input, look: input.look ?? "trail" };
  if (profile.startDate === undefined) delete profile.startDate; // Firestore rejects undefined
  await setDoc(ref, profile);
  return ref.id;
}

/**
 * Renames an existing profile (task 9 feature 2: "the two children are currently named
 * 'Explorer' and 'Sprout' and the parent wants real names"). Only `name` changes; every other
 * field on the profile document is untouched.
 */
export async function renameProfile(hid: string, pid: string, name: string): Promise<void> {
  const db = getDb();
  await updateDoc(profileRef(db, hid, pid), { name });
}

/**
 * Pauses one profile's week clock as of today: the current week stops advancing until
 * resumeClock. A profile that has not started (no startDate) has nothing to pause.
 */
export async function pauseClock(hid: string, pid: string, now: number): Promise<void> {
  const db = getDb();
  const ref = profileRef(db, hid, pid);
  const snap = await getDoc(ref);
  if (!snap.exists() || !snap.data().startDate || snap.data().pausedAt) return;
  await updateDoc(ref, { pausedAt: dateOnly(now) });
}

/** Resumes a paused week clock: startDate moves forward by the whole days paused, so the child
 * picks up the same week they left, and pausedAt is cleared. */
export async function resumeClock(hid: string, pid: string, now: number): Promise<void> {
  const db = getDb();
  const ref = profileRef(db, hid, pid);
  const snap = await getDoc(ref);
  const data = snap.data();
  if (!snap.exists() || !data?.pausedAt || !data.startDate) return;
  await updateDoc(ref, { startDate: resumedStartDate(data.startDate, data.pausedAt, now), pausedAt: deleteField() });
}

/** Turns the Play track (instrument practice) on or off for one profile; nothing else changes. */
export async function setPlayTrack(hid: string, pid: string, on: boolean): Promise<void> {
  const db = getDb();
  await updateDoc(profileRef(db, hid, pid), { playTrack: on });
}

/**
 * Moves one profile to its next season (owner decision, 4 September 2026: seasons belong to the
 * profile; a child's next season starts when a parent says that child is done, and never waits
 * on a sibling). Writes exactly the two fields lib/domain/seasons.ts's seasonRollover computed:
 * seasonId and the Monday the new season starts from. Nothing else on the profile changes, and
 * nothing in the old season's progress is touched: it stays in the portfolio.
 */
/**
 * Starts a profile's week clock if it has not started: the Monday of the week of the child's
 * first saved step or round. Idempotent and cheap; every quest and Sprout save path calls it.
 */
export async function startClock(hid: string, pid: string, now: number): Promise<void> {
  const db = getDb();
  const ref = profileRef(db, hid, pid);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().startDate) return;
  await updateDoc(ref, { startDate: mondayOnOrBefore(now) });
}

export async function startSeason(hid: string, pid: string, rollover: { seasonId: number }): Promise<void> {
  const db = getDb();
  await updateDoc(profileRef(db, hid, pid), { seasonId: rollover.seasonId, startDate: deleteField() });
}

/**
 * Sets, changes or clears the household's parent-view PIN (task 9 feature 1). Pass a 4-digit
 * string to set or change it, or `undefined` to turn it off entirely.
 *
 * This is plain text on households/{hid}, not hashed: hashing would not add any real
 * protection here, since the same firestore.rules isMember(hid) grant that lets this function
 * write the field at all already lets any household member (including the child, on the
 * parent's own shared Google account) read or overwrite it directly with devtools. The PIN is
 * a speed bump against an idle tap, not a secret -- see components/parent/ParentPinGate.tsx.
 */
export async function setParentPin(hid: string, pin: string | undefined): Promise<void> {
  const db = getDb();
  await updateDoc(householdRef(db, hid), { parentPin: pin ?? deleteField() });
}

/**
 * Ticks or unticks one season shopping list item as bought (task 14: HouseholdDoc.boughtMaterials).
 * `key` is lib/domain/materials.ts's ShoppingItem.key -- stable across a season, so re-ticking
 * after a reload always targets the same item. arrayUnion/arrayRemove rather than a read-modify-
 * write: two parents ticking different items from two tabs at once can never clobber each
 * other's tick, the same reasoning setParentPin's sibling functions already rely on elsewhere in
 * this file (arrayUnion on memberUids, householdIds).
 */
export async function setMaterialBought(hid: string, key: string, bought: boolean): Promise<void> {
  const db = getDb();
  await updateDoc(householdRef(db, hid), { boughtMaterials: bought ? arrayUnion(key) : arrayRemove(key) });
}

/**
 * Joins the caller's uid to the household whose invite code matches. Known limitation: under
 * firestore.rules as written (Task 2), households/{hid} is readable and writable only by
 * existing members (`isMember(hid)`), which is evaluated against the document's state before
 * this write. A user who is not yet a member cannot list households by inviteCode (the query
 * is denied) or add themselves to memberUids (the update is denied) through the client SDK.
 * This function is implemented against the interface the brief specifies; making it actually
 * work needs either a narrower "read by inviteCode" rule/collection or a server-side (Admin
 * SDK) join route, neither of which is in this task's scope. See task-5-report.md.
 */
export async function joinByCode(uid: string, code: string): Promise<{ hid: string }> {
  const db = getDb();
  const q = query(householdsCol(db), where("inviteCode", "==", code));
  const snap = await getDocs(q);
  const match = snap.docs[0];
  if (!match) throw new Error("No household matches that invite code");
  const hid = match.id;

  const batch = writeBatch(db);
  batch.set(doc(db, householdPath(hid)), { memberUids: arrayUnion(uid) }, { merge: true });
  batch.set(doc(db, userPath(uid)), { householdIds: arrayUnion(hid) }, { merge: true });
  await batch.commit();

  return { hid };
}
