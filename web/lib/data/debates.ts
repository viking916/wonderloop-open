// debates.ts: the debate room's saved state (spec 9; Plan 3 task 6). One document per debate
// step at households/{hid}/profiles/{pid}/debates/{stepId}, written after every utterance so a
// closed tab or a dropped connection never costs him an argument he already made. The document
// is lib/domain/debate.ts's DebateState plus where it belongs (quest, step, week) and a plain
// transcript for the Parent view. firestore.rules already gives household members this path.

import { doc, onSnapshot, orderBy, query, setDoc, type Unsubscribe } from "firebase/firestore";
import { getDb } from "../firebase/client";
import { transcriptOf, type DebateState } from "../domain/debate";
import { debateRef, debatesCol, type DebateDoc } from "./types";

export type DebateMeta = { questId: string; stepId: string; week: number };

/** The document a state becomes. `at` is the first save, `updatedAt` the latest. */
export function docFromState(state: DebateState, meta: DebateMeta, childName: string, now: number, at?: number): DebateDoc {
  return {
    motionId: state.motionId,
    motion: state.motion,
    side: state.side,
    steelman: state.steelman ?? "",
    steelmanNote: state.steelmanNote,
    rounds: state.rounds,
    pendingChildText: state.pendingChildText,
    coachCard: state.coachCard,
    transcript: transcriptOf(state, childName),
    status: state.coachCard ? "done" : "in_progress",
    questId: meta.questId,
    stepId: meta.stepId,
    week: meta.week,
    at: at ?? now,
    updatedAt: now,
  };
}

/** The state a saved document holds. Empty strings written by docFromState read back as absent. */
export function stateFromDoc(d: DebateDoc): DebateState {
  return {
    motionId: d.motionId,
    motion: d.motion,
    side: d.side,
    steelman: d.steelman ? d.steelman : undefined,
    steelmanNote: d.steelmanNote,
    rounds: d.rounds ?? [],
    pendingChildText: d.pendingChildText,
    coachCard: d.coachCard,
  };
}

/** Writes the whole state down. Undefined fields are dropped rather than written as null, so a
 * cleared pending text really disappears from the document. */
/** Records a debate held out loud, without the AI opponent (the family has no AI key). */
export async function saveOfflineDebate(hid: string, pid: string, meta: DebateMeta, motionId: string, motion: string, now = Date.now()): Promise<void> {
  const db = getDb();
  const d: DebateDoc = {
    motionId,
    motion,
    steelman: "",
    rounds: [],
    transcript: "Debated out loud with a grown-up. The AI opponent was off for this family.",
    status: "done",
    offline: true,
    questId: meta.questId,
    stepId: meta.stepId,
    week: meta.week,
    at: now,
    updatedAt: now,
  };
  await setDoc(debateRef(db, hid, pid, meta.stepId), d);
}

export async function saveDebate(hid: string, pid: string, meta: DebateMeta, state: DebateState, childName: string, at?: number): Promise<void> {
  const db = getDb();
  const d = docFromState(state, meta, childName, Date.now(), at);
  const clean = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) as DebateDoc;
  await setDoc(debateRef(db, hid, pid, meta.stepId), clean);
}

export function watchDebate(hid: string, pid: string, stepId: string, cb: (d: DebateDoc | undefined) => void): Unsubscribe {
  const db = getDb();
  return onSnapshot(doc(debatesCol(db, hid, pid), stepId), (snap) => cb(snap.exists() ? snap.data() : undefined));
}

export function watchDebates(hid: string, pid: string, cb: (list: Array<{ id: string; debate: DebateDoc }>) => void): Unsubscribe {
  const db = getDb();
  const q = query(debatesCol(db, hid, pid), orderBy("updatedAt", "desc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, debate: d.data() }))));
}
