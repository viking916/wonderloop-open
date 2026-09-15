// parentActivities.ts: parent-entered skill notes (task 13 brief: "add a dated note against a
// skill (chess, piano) which appears in the skills map with source: parent"). Firestore is the
// durable home for lib/domain/skills.ts's ParentSkillEntry {skillId, note, at}; every caller
// that recomputes skills (a fresh attempt in ProblemPlayer.tsx, or a parent reset in
// resets.ts) must fold these back in via getParentEntries, exactly as it already does with
// attempts and logs, so a parent-entered note is never lost or excluded from a later recompute.

import { doc, getDocs, onSnapshot, orderBy, query, setDoc, type Unsubscribe } from "firebase/firestore";
import type { ParentSkillEntry } from "../domain/skills";
import { getDb } from "../firebase/client";
import { parentActivitiesCol, type ParentActivityDoc } from "./types";

export type NewParentActivity = {
  skillId: string;
  note: string;
  at?: number; // defaults to now; a caller may backdate a note ("chess class, last Tuesday")
};

function toEntry(doc: ParentActivityDoc): ParentSkillEntry {
  return { skillId: doc.skillId, note: doc.note, at: doc.at };
}

export async function addParentActivity(hid: string, pid: string, input: NewParentActivity): Promise<string> {
  const db = getDb();
  const ref = doc(parentActivitiesCol(db, hid, pid));
  const activity: ParentActivityDoc = { skillId: input.skillId, note: input.note, at: input.at ?? Date.now() };
  await setDoc(ref, activity);
  return ref.id;
}

export function watchParentActivities(
  hid: string, pid: string, cb: (entries: Array<{ id: string; entry: ParentSkillEntry }>) => void,
): Unsubscribe {
  const db = getDb();
  const q = query(parentActivitiesCol(db, hid, pid), orderBy("at", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, entry: toEntry(d.data()) })));
  });
}

/** A one-shot read of every parent-entered note, in the shape recomputeFromAttempts expects
 * (lib/domain/skills.ts). Used wherever skills are recomputed from scratch: ProblemPlayer.tsx's
 * post-attempt recompute and resets.ts's ResetSkillInputs. */
export async function getParentEntries(hid: string, pid: string): Promise<ParentSkillEntry[]> {
  const db = getDb();
  const snap = await getDocs(parentActivitiesCol(db, hid, pid));
  return snap.docs.map((d) => toEntry(d.data()));
}
