// workings.ts (task 43): the per-problem "working space" -- a typed note plus pen strokes he
// works a problem out on, stored at households/{hid}/profiles/{pid}/workings/{problemId} and
// shown back to him later ("Your working from last time" on a mistake-box return). Deliberately
// thin: two functions, no domain rules, because there are none -- a working is never graded,
// never required and never scored, so nothing here needs the pure-domain-module treatment the
// rest of lib/data/*.ts leans on for attempts/skills/review.
//
// getWorking uses a one-shot getDoc, not a live onSnapshot, on purpose: nothing about this
// feature needs to react to a second tab editing the same problem's working mid-session, and a
// one-shot read is exactly what "restored on navigate away and back" and "shown from last time"
// both actually need -- fetched once when a problem becomes current, or once when a mistake-box
// item opens.

import { getDoc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { getDb } from "../firebase/client";
import { workingRef, workingsCol, type Stroke, type WorkingDoc } from "./types";

/** The working for one problem id, or undefined if he has never written or drawn anything on
 * it. Never throws on a missing document -- "no working yet" is the ordinary, expected case for
 * every problem he has not opened the panel on. */
export async function getWorking(hid: string, pid: string, problemId: string): Promise<WorkingDoc | undefined> {
  const db = getDb();
  const snap = await getDoc(workingRef(db, hid, pid, problemId));
  return snap.exists() ? snap.data() : undefined;
}

/**
 * Merges a patch into the working doc, creating it on first write. Called only from an actual
 * edit (a keystroke in the typed area, a completed pen/eraser stroke, Clear) -- never from
 * hydrating the panel open, so a problem he only ever looked at never gets a document at all
 * (see WorkingSpace.tsx's dirty-tracking for where that line is drawn).
 */
export function saveWorking(
  hid: string, pid: string, problemId: string, patch: { text: string; strokes: Stroke[] },
): Promise<void> {
  const db = getDb();
  return setDoc(workingRef(db, hid, pid, problemId), { ...patch, updatedAt: Date.now() }, { merge: true });
}

/** Every working this profile has, live -- the Parent view's log area (LogList.tsx) reads this
 * the same "watch the whole small collection" way it already reads logs/parentActivities,
 * rather than a per-problem read, since a season's worth of workings is small and this needs to
 * stay current the moment a fresh one is auto-saved. */
export function watchAllWorkings(
  hid: string, pid: string, cb: (workings: Array<{ problemId: string; working: WorkingDoc }>) => void,
): Unsubscribe {
  const db = getDb();
  return onSnapshot(workingsCol(db, hid, pid), (snap) => {
    cb(snap.docs.map((d) => ({ problemId: d.id, working: d.data() })));
  });
}
