// storage.rules, exercised against the Storage emulator alongside the Firestore emulator it
// reads membership from (the rules' isMember() does a cross-service firestore.get). Runs under
// vitest.emulator.config.ts (npm run test:rules), never in the plain unit suite.
//
// What this holds: a household member can put a recording (audio or video) up to the recording
// cap in their own profile's artifacts path, the smaller photo/text cap still applies to images,
// and a stranger can put nothing anywhere. The 200 MB upper bound itself is not uploaded here
// (a 200 MB request against the emulator is slow enough to be its own gate), so the cap is
// asserted from the other side: an image just over 20 MB is refused while a video of the same
// size is accepted, which only holds if the two caps are the two the rules file says.
import { afterAll, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { EMULATOR_PORTS } from "../lib/firebase/emulator-ports.mjs";

let env: RulesTestEnvironment;

// The Storage emulator answers storage.rules' firestore.get()/exists() against the project the
// emulator suite was started for (npm run emulators: wonderloop-dev), whatever project id the
// test environment names. So this file seeds its membership documents into that project, under
// ids nothing else uses, and deletes them again in afterAll. rules.test.ts's own throwaway
// project id works there because Firestore rules never look across services.
const PROJECT_ID = "wonderloop-dev";
const HID = "hh-storage-rules-test";
const PID = "pid-storage-rules-test";
const MB = 1024 * 1024;
const ALICE = { uid: "alice-storage-rules-test", email: "alice-storage-rules-test@example.test" };

function bytes(size: number): Uint8Array {
  return new Uint8Array(size);
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("../firestore.rules", "utf8"),
      host: "localhost",
      port: EMULATOR_PORTS.firestore,
    },
    storage: {
      rules: readFileSync("../storage.rules", "utf8"),
      host: "localhost",
      port: EMULATOR_PORTS.storage,
    },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `allowedEmails/${ALICE.email}`), { addedAt: 1 });
    await setDoc(doc(db, `households/${HID}`), {
      name: "Storage House", ownerUid: ALICE.uid, memberUids: [ALICE.uid], inviteCode: "STORAG", createdAt: 1,
    });
  });
});

afterAll(async () => {
  // Remove what beforeAll seeded into the shared dev project, then release the contexts.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await deleteDoc(doc(db, `allowedEmails/${ALICE.email}`));
    await deleteDoc(doc(db, `households/${HID}`));
  });
  await env.cleanup();
});

const artifactPath = (file: string) => `households/${HID}/profiles/${PID}/artifacts/${file}`;

describe("storage.rules: recordings", () => {
  it("a member can save a small video recording in their own profile's artifacts", async () => {
    const storage = env.authenticatedContext(ALICE.uid, { email: ALICE.email }).storage();
    await assertSucceeds(uploadBytes(ref(storage, artifactPath("talk.mp4")), bytes(1 * MB), { contentType: "video/mp4" }));
  });

  it("a member can save an audio recording", async () => {
    const storage = env.authenticatedContext(ALICE.uid, { email: ALICE.email }).storage();
    await assertSucceeds(uploadBytes(ref(storage, artifactPath("answer.m4a")), bytes(512 * 1024), { contentType: "audio/mp4" }));
  });

  it("a video over the old 20 MB cap is accepted, because recordings have the larger cap", async () => {
    const storage = env.authenticatedContext(ALICE.uid, { email: ALICE.email }).storage();
    await assertSucceeds(uploadBytes(ref(storage, artifactPath("long-talk.webm")), bytes(21 * MB), { contentType: "video/webm" }));
  }, 60_000);

  it("an image over 20 MB is still refused: the larger cap is for audio and video only", async () => {
    const storage = env.authenticatedContext(ALICE.uid, { email: ALICE.email }).storage();
    await assertFails(uploadBytes(ref(storage, artifactPath("huge.jpg")), bytes(21 * MB), { contentType: "image/jpeg" }));
  }, 60_000);

  it("a small photo still saves as before", async () => {
    const storage = env.authenticatedContext(ALICE.uid, { email: ALICE.email }).storage();
    await assertSucceeds(uploadBytes(ref(storage, artifactPath("build.jpg")), bytes(200 * 1024), { contentType: "image/jpeg" }));
  });

  it("a content type outside the four families is refused whatever its size", async () => {
    const storage = env.authenticatedContext(ALICE.uid, { email: ALICE.email }).storage();
    await assertFails(uploadBytes(ref(storage, artifactPath("thing.bin")), bytes(1024), { contentType: "application/octet-stream" }));
  });

  it("a signed-in stranger who is not a member can save nothing under the household", async () => {
    const storage = env.authenticatedContext("eve-storage", { email: "eve-storage@example.test" }).storage();
    await assertFails(uploadBytes(ref(storage, artifactPath("intruder.mp4")), bytes(1024), { contentType: "video/mp4" }));
  });

  it("an anonymous request can save nothing", async () => {
    const storage = env.unauthenticatedContext().storage();
    await assertFails(uploadBytes(ref(storage, artifactPath("anon.mp4")), bytes(1024), { contentType: "video/mp4" }));
  });
});
