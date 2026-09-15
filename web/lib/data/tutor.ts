// tutor.ts: Ask's saved transcripts (12 September 2026). One document per problem a child has
// ever opened Ask on, at households/{hid}/profiles/{pid}/tutorChats/{questId}__{problemId}
// (lib/data/types.ts's tutorChatRef/tutorChatsCol), so a reload shows the same conversation and
// the Parent view can list every one of them (components/parent/AskTranscripts.tsx). Modelled on
// lib/data/debates.ts: every exchange is saved, never scored, and firestore.rules already covers
// this path under the household's own `match /{document=**}` wildcard, the same way
// attempts/workings/debates already do (see rules.test.ts's own proof for this collection).

import { getDoc, onSnapshot, orderBy, query, setDoc, type Unsubscribe } from "firebase/firestore";
import { getDb } from "../firebase/client";
import { tutorChatRef, tutorChatsCol, type TutorChatDoc } from "./types";

/** The saved chat for one problem, or undefined if Ask has never been opened on it before. */
export async function getTutorChat(hid: string, pid: string, questId: string, problemId: string): Promise<TutorChatDoc | undefined> {
  const db = getDb();
  const snap = await getDoc(tutorChatRef(db, hid, pid, questId, problemId));
  return snap.exists() ? snap.data() : undefined;
}

/** Writes the whole chat down after every exchange, so a closed tab never costs the transcript. */
export async function saveTutorChat(hid: string, pid: string, chat: TutorChatDoc): Promise<void> {
  const db = getDb();
  await setDoc(tutorChatRef(db, hid, pid, chat.questId, chat.problemId), chat);
}

/** Every Ask chat this child has ever had, newest first (components/parent/AskTranscripts.tsx). */
export function watchTutorChats(hid: string, pid: string, cb: (list: Array<{ id: string; chat: TutorChatDoc }>) => void): Unsubscribe {
  const db = getDb();
  const q = query(tutorChatsCol(db, hid, pid), orderBy("updatedAt", "desc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, chat: d.data() }))));
}
