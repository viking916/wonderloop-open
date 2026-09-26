// artifacts.ts: Build/Speak/Think artifact uploads (spec 7.1, 7.2, 9). Binary or text content
// goes to Storage at households/{hid}/profiles/{pid}/artifacts/{artifactId}[.ext] (storage.rules
// mirrors the Firestore isMember(hid) gate), and a Firestore doc records the metadata (kind,
// questId, week, storagePath, at).

import { doc, onSnapshot, orderBy, query, setDoc, type Unsubscribe } from "firebase/firestore";
import { ref as storageRef, uploadBytes, uploadString } from "firebase/storage";
import { getDb, getStorageBucket } from "../firebase/client";
import { extensionForMimeType } from "../domain/recording";
import { artifactsCol, artifactsPath, type ArtifactDoc, type ArtifactKind } from "./types";

export type NewArtifact =
  | { kind: Extract<ArtifactKind, "photo" | "recording">; questId: string; week: number; file: Blob; contentType: string }
  | { kind: Extract<ArtifactKind, "code" | "text" | "transcript">; questId: string; week: number; text: string };

/** Uploads the artifact's content to Storage, writes the matching Firestore doc, and returns
 * the new artifact's id. Binary content (photo, recording) is a Blob/File from the browser;
 * text content (code, text, transcript) is stored as a small text file at the same path
 * convention, so every artifact kind has a storagePath and the portfolio can treat them
 * uniformly. */
export async function uploadArtifact(hid: string, pid: string, input: NewArtifact): Promise<string> {
  const db = getDb();
  const id = doc(artifactsCol(db, hid, pid)).id;
  // A recording carries its container's extension (mp4, webm, m4a) so the object name says
  // what it holds and a download opens in something that can play it; photos keep the bare id
  // they always had, text kinds their ".txt".
  const ext = "file" in input ? (input.kind === "recording" ? `.${extensionForMimeType(input.contentType)}` : "") : ".txt";
  const path = `${artifactsPath(hid, pid)}/${id}${ext}`;
  const bucket = getStorageBucket();
  const fileRef = storageRef(bucket, path);

  if ("file" in input) {
    await uploadBytes(fileRef, input.file, { contentType: input.contentType });
  } else {
    await uploadString(fileRef, input.text, "raw", { contentType: "text/plain" });
  }

  const artifact: ArtifactDoc = {
    kind: input.kind,
    questId: input.questId,
    week: input.week,
    storagePath: path,
    at: Date.now(),
    ...("file" in input ? { contentType: input.contentType } : {}),
  };
  await setDoc(doc(artifactsCol(db, hid, pid), id), artifact);
  return id;
}

export function watchArtifacts(
  hid: string, pid: string, cb: (artifacts: Array<{ id: string; artifact: ArtifactDoc }>) => void,
): Unsubscribe {
  const db = getDb();
  const q = query(artifactsCol(db, hid, pid), orderBy("at", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, artifact: d.data() })));
  });
}
