import { describe, expect, it } from "vitest";
import { EMULATOR_PORTS } from "./emulator-ports.mjs";
// firebase.json cannot import lib/firebase/emulator-ports.mjs -- the Firebase CLI reads it
// directly as static JSON and never executes JavaScript to resolve its values -- so its
// emulator ports are necessarily a second, hand-kept copy of EMULATOR_PORTS. This test is what
// keeps that copy honest: it fails `npm test` the moment firebase.json's numbers drift from the
// single source of truth, instead of the drift going unnoticed until an emulator collision.
import firebaseJson from "../../../firebase.json";

describe("firebase.json emulator ports match lib/firebase/emulator-ports.mjs", () => {
  it("auth", () => {
    expect(firebaseJson.emulators.auth.port).toBe(EMULATOR_PORTS.auth);
  });
  it("firestore", () => {
    expect(firebaseJson.emulators.firestore.port).toBe(EMULATOR_PORTS.firestore);
  });
  it("storage", () => {
    expect(firebaseJson.emulators.storage.port).toBe(EMULATOR_PORTS.storage);
  });
  it("ui", () => {
    expect(firebaseJson.emulators.ui.port).toBe(EMULATOR_PORTS.ui);
  });
  it("hub", () => {
    expect(firebaseJson.emulators.hub.port).toBe(EMULATOR_PORTS.hub);
  });
  it("logging", () => {
    expect(firebaseJson.emulators.logging.port).toBe(EMULATOR_PORTS.logging);
  });
});
