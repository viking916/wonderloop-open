// practice.ts: the piano and chess practice checkboxes' Firestore layer (23 September 2026).
// households/{hid}/profiles/{pid}/practice/{docId}, one document per profile per week
// (lib/domain/practice.ts's practiceDocId). This module only watches and writes the raw
// document; every decision about which rows a profile gets and how to summarize it lives in
// lib/domain/practice.ts, which stays Firebase-free.

import { onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { getDb } from "../firebase/client";
import { practiceRef, type PracticeDoc } from "./types";

/** Live subscription to one profile's one week of practice; `undefined` until a box has ever
 * been ticked for that week (the document need not exist before then). */
export function watchPractice(
  hid: string, pid: string, docId: string, cb: (doc: PracticeDoc | undefined) => void,
): Unsubscribe {
  const db = getDb();
  return onSnapshot(practiceRef(db, hid, pid, docId), (snap) => cb(snap.exists() ? snap.data() : undefined));
}

/** Ticks or unticks one or more boxes on a week's practice doc. setDoc with merge, not a full
 * overwrite: two boxes ticked in quick succession (or a parent and a child ticking from two
 * different sessions) never clobber each other. */
export async function setPractice(
  hid: string, pid: string, docId: string,
  patch: Partial<Pick<PracticeDoc, "piano" | "chessSat" | "chessSun">>,
): Promise<void> {
  const db = getDb();
  await setDoc(practiceRef(db, hid, pid, docId), { ...patch, updatedAt: Date.now() }, { merge: true });
}
