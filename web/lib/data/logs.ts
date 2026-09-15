// logs.ts: Maker's Logs and Speak logs (spec 8, 9). A log's answers (five for maker, three for
// speak, per LogAnswers in types.ts), and any recorded
// transcript/storagePath, are supplied already-uploaded by the caller (voice recording upload
// goes through artifacts.ts's Storage path convention); this module only persists the
// Firestore side and the parent's one-line comment.

import { doc, getDocs, onSnapshot, orderBy, query, setDoc, updateDoc, type Unsubscribe } from "firebase/firestore";
import { getDb } from "../firebase/client";
import { logsCol, type LogAnswers, type LogDoc } from "./types";

export type NewLog = {
  questId: string;
  answers: LogAnswers;
  transcript?: string;
  storagePath?: string;
};

export async function saveLog(hid: string, pid: string, input: NewLog): Promise<string> {
  const db = getDb();
  const ref = doc(logsCol(db, hid, pid));
  const log: LogDoc = { ...input, at: Date.now() };
  await setDoc(ref, log);
  return ref.id;
}

export function watchLogs(
  hid: string, pid: string, cb: (logs: Array<{ id: string; log: LogDoc }>) => void,
): Unsubscribe {
  const db = getDb();
  const q = query(logsCol(db, hid, pid), orderBy("at", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, log: d.data() })));
  });
}

/** Parent view: a one-line comment on a log (spec 7.1's Parent view: "logs with a one-line
 * comment field"). */
export function setParentComment(hid: string, pid: string, logId: string, comment: string): Promise<void> {
  const db = getDb();
  return updateDoc(doc(logsCol(db, hid, pid), logId), { parentComment: comment });
}

/** A one-shot read of every log on record, for a caller (a reset's skill recompute) that needs
 * the full list once rather than a live subscription. */
export async function getLogs(hid: string, pid: string): Promise<Array<{ id: string; log: LogDoc }>> {
  const db = getDb();
  const snap = await getDocs(logsCol(db, hid, pid));
  return snap.docs.map((d) => ({ id: d.id, log: d.data() }));
}
