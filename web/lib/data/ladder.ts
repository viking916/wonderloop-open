// Firestore for the Ladder (docs/superpowers/specs/2026-09-08-math-ladder-design.md), under
// households/{hid}/profiles/{pid}/ladder/: `state` (one doc), `topics/{topicId}`,
// `skills/{skillId}` and `sessions/{n}`. Attempts and the progress doc for the player live where
// every other attempt lives, under the synthetic quest id "ladder" (lib/domain/ladder.ts), so
// calibration, the mistake box, the skills map and the portfolio see Ladder work unchanged.
import { collection, doc, onSnapshot, setDoc, type Firestore, type Unsubscribe } from "firebase/firestore";
import { getDb } from "../firebase/client";
import type { LadderState, SkillRetrieval, TopicState } from "../domain/ladder";

function ladderDoc(db: Firestore, hid: string, pid: string, ...segments: string[]) {
  return doc(db, "households", hid, "profiles", pid, "ladder", ...segments);
}
function ladderCol(db: Firestore, hid: string, pid: string, name: string) {
  return collection(db, "households", hid, "profiles", pid, "ladder", "state", name);
}

export type SessionDoc = { number: number; day: string; startedAt: number; endedAt?: number; rounds: number; minutes: number };

export function watchLadderState(hid: string, pid: string, cb: (state: LadderState | undefined) => void): Unsubscribe {
  const db = getDb();
  return onSnapshot(ladderDoc(db, hid, pid, "state"), (snap) => cb(snap.exists() ? (snap.data() as LadderState) : undefined));
}

export function saveLadderState(hid: string, pid: string, patch: Partial<LadderState>): Promise<void> {
  const db = getDb();
  return setDoc(ladderDoc(db, hid, pid, "state"), patch, { merge: true });
}

export function watchTopicStates(hid: string, pid: string, cb: (states: Record<string, TopicState>) => void): Unsubscribe {
  const db = getDb();
  return onSnapshot(ladderCol(db, hid, pid, "topics"), (snap) => {
    const out: Record<string, TopicState> = {};
    for (const d of snap.docs) out[d.id] = d.data() as TopicState;
    cb(out);
  });
}

export function saveTopicState(hid: string, pid: string, topicId: string, state: TopicState): Promise<void> {
  const db = getDb();
  return setDoc(doc(ladderCol(db, hid, pid, "topics"), topicId), state);
}

export function watchRetrieval(hid: string, pid: string, cb: (entries: SkillRetrieval[]) => void): Unsubscribe {
  const db = getDb();
  return onSnapshot(ladderCol(db, hid, pid, "skills"), (snap) => cb(snap.docs.map((d) => d.data() as SkillRetrieval)));
}

export function saveRetrieval(hid: string, pid: string, entry: SkillRetrieval): Promise<void> {
  const db = getDb();
  return setDoc(doc(ladderCol(db, hid, pid, "skills"), entry.skillId.replace(/[^a-z0-9.-]/gi, "_")), entry);
}

export function saveSession(hid: string, pid: string, session: SessionDoc): Promise<void> {
  const db = getDb();
  return setDoc(doc(ladderCol(db, hid, pid, "sessions"), String(session.number).padStart(4, "0")), session, { merge: true });
}

export function watchSessions(hid: string, pid: string, cb: (sessions: SessionDoc[]) => void): Unsubscribe {
  const db = getDb();
  return onSnapshot(ladderCol(db, hid, pid, "sessions"), (snap) => cb(snap.docs.map((d) => d.data() as SessionDoc).sort((a, b) => a.number - b.number)));
}
