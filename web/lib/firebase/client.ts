"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  type Firestore,
} from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { EMULATOR_PORTS } from "./emulator-ports.mjs";

const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";
// The host the BROWSER reaches the emulators on. localhost when they run on this machine or
// are published from a container; something else only for a remote emulator box.
const emulatorHost = process.env.NEXT_PUBLIC_EMULATOR_HOST || "localhost";

// Mirrors admin.ts's resolveProjectId: the emulator fallback to wonderloop-dev is only safe
// when nothing real is at stake. Outside the emulator, a missing project id must fail loudly
// here, not fall back silently -- that fallback would point a real family's data at the dev
// project with no error at all. Kept as a plain function (not module-top-level state) so it
// only ever runs when a caller actually needs a client (inside an effect or event handler,
// never during Next.js's server-side prerendering of this "use client" module at build time).
export function resolveProjectId(emulated: boolean): string {
  const explicit = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (explicit) return explicit;
  if (emulated) return "wonderloop-dev";
  throw new Error(
    "No Firebase project id. Set NEXT_PUBLIC_FIREBASE_PROJECT_ID in web/.env.production.local.",
  );
}

function resolveConfig() {
  const projectId = resolveProjectId(useEmulators);
  return {
    // || rather than ??: a container build passes unset build args through as empty strings.
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-key",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
  };
}

// A hot reload under React fast refresh re-runs this module, but the
// firebase app registry (getApps()) and the browser's globalThis both
// survive it. The emulator-connected flags live on globalThis rather than
// in a module-scoped variable, which a fresh module instance would reset,
// so a reload never tries to connect an already-connected emulator.
type EmulatorFlags = {
  wonderloopAuthEmulatorConnected?: boolean;
  wonderloopFirestoreEmulatorConnected?: boolean;
  wonderloopStorageEmulatorConnected?: boolean;
};
const flags = globalThis as typeof globalThis & EmulatorFlags;

let firestoreInstance: Firestore | undefined;

// A named app, looked up by name, rather than getApps()[0] ?? initializeApp(config): index 0 is
// whichever app happened to register first in this process, which is not necessarily this
// app's. @firebase/rules-unit-testing (scripts/rules.test.ts) registers its own uniquely-named
// app in the same global registry when a test file imports both that package and this module,
// and that app has no apiKey at all, so picking it up by accident surfaces as an unrelated
// "auth/invalid-api-key" error far from its real cause.
const APP_NAME = "wonderloop";

export function getClientApp(): FirebaseApp {
  return getApps().find((a) => a.name === APP_NAME) ?? initializeApp(resolveConfig(), APP_NAME);
}

export function getClientAuth(): Auth {
  const auth = getAuth(getClientApp());
  if (useEmulators && !flags.wonderloopAuthEmulatorConnected) {
    connectAuthEmulator(auth, `http://${emulatorHost}:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
    flags.wonderloopAuthEmulatorConnected = true;
  }
  return auth;
}

export function getDb(): Firestore {
  if (firestoreInstance) return firestoreInstance;
  const app = getClientApp();
  try {
    // Offline persistence (spec 12): writes queue in IndexedDB while the
    // network is down and replay once it returns.
    firestoreInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
    });
  } catch {
    // initializeFirestore throws if Firestore for this app has already been
    // started, which happens when a fast refresh re-runs this module. Fall
    // back to the instance that is already running instead of crashing.
    firestoreInstance = getFirestore(app);
  }
  if (useEmulators && !flags.wonderloopFirestoreEmulatorConnected) {
    connectFirestoreEmulator(firestoreInstance, emulatorHost, EMULATOR_PORTS.firestore);
    flags.wonderloopFirestoreEmulatorConnected = true;
  }
  return firestoreInstance;
}

export function getStorageBucket(): FirebaseStorage {
  const storage = getStorage(getClientApp());
  if (useEmulators && !flags.wonderloopStorageEmulatorConnected) {
    connectStorageEmulator(storage, emulatorHost, EMULATOR_PORTS.storage);
    flags.wonderloopStorageEmulatorConnected = true;
  }
  return storage;
}
