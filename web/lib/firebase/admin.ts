import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";

// This module is for scripts only (seed, ops, tests). The Admin SDK
// bypasses firestore.rules entirely, so app code must never import it;
// components and repositories go through lib/firebase/client.ts instead.

export function resolveProjectId(emulated: boolean): string {
  const explicit =
    process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  if (explicit) return explicit;
  if (emulated) return "wonderloop-dev";
  throw new Error(
    "No Firebase project id. Set FIREBASE_PROJECT_ID, or run somewhere GOOGLE_CLOUD_PROJECT is set.",
  );
}

function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const projectId = resolveProjectId(emulated);
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`;
  // Against emulators (FIRESTORE_EMULATOR_HOST set) no credentials are needed.
  if (emulated) return initializeApp({ projectId, storageBucket });
  // Anywhere that is not Google's own infrastructure (a VPS, a container, another host):
  // FIREBASE_SERVICE_ACCOUNT_JSON carries the service account key, raw JSON or base64, so no
  // key file has to exist on disk. On Firebase Hosting and Cloud Run the default credentials
  // do the job and the variable stays unset.
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inline) {
    const json = inline.trim().startsWith("{") ? inline : Buffer.from(inline, "base64").toString("utf8");
    return initializeApp({ credential: cert(JSON.parse(json)), projectId, storageBucket });
  }
  return initializeApp({ credential: applicationDefault(), projectId, storageBucket });
}

export function getAdminApp(): App {
  return app();
}

export function getAdminDb(): Firestore {
  return getFirestore(app());
}

// The Admin SDK reads FIREBASE_STORAGE_EMULATOR_HOST (set in .env.development.local) itself, the
// same way the Firestore client above reads FIRESTORE_EMULATOR_HOST -- no explicit
// connect-to-emulator call needed, unlike the browser SDK's connectStorageEmulator.
export function getAdminStorage(): Storage {
  return getStorage(app());
}
