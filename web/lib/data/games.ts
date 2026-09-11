// games.ts: the game of the sprint (7 September 2026, owner direction: more games and puzzles
// that teach). A game is content (content/games.json, one per season and sprint); this module
// only records that a family played it. households/{hid}/profiles/{pid}/games/{gameId} holds
// { playedAt }, written once per game per profile and never counted toward anything: a played
// game is evidence on the card, not points.
import { collection, doc, onSnapshot, setDoc, type Firestore, type Unsubscribe } from "firebase/firestore";
import { getDb } from "../firebase/client";

export type GamePlayDoc = { playedAt: number };

function gamesCol(db: Firestore, hid: string, pid: string) {
  return collection(db, "households", hid, "profiles", pid, "games");
}

export function watchGamePlays(hid: string, pid: string, cb: (plays: Record<string, GamePlayDoc>) => void): Unsubscribe {
  const db = getDb();
  return onSnapshot(gamesCol(db, hid, pid), (snap) => {
    cb(Object.fromEntries(snap.docs.map((d) => [d.id, d.data() as GamePlayDoc])));
  });
}

export async function markGamePlayed(hid: string, pid: string, gameId: string, now: number): Promise<void> {
  const db = getDb();
  await setDoc(doc(gamesCol(db, hid, pid), gameId), { playedAt: now });
}
