import { defineConfig } from "vitest/config";
import path from "node:path";
import { EMULATOR_PORTS } from "./lib/firebase/emulator-ports.mjs";

// Emulator-backed tests only (npm run test:rules): firestore.rules assertions plus the
// data-layer round-trips that can only be proven against a live Firestore -- batch chunking
// in resets.ts and a full ProgressDoc round-trip through progress.ts. Requires
// `npm run emulators` running first (see web/README.md); not part of the default `npm test`
// suite (see vitest.config.ts's exclude).
//
// NEXT_PUBLIC_USE_EMULATORS is set here, in config, rather than relying on a shell-inline env
// var or a loaded .env file: lib/firebase/client.ts reads it at module import time, and Windows
// cmd.exe/PowerShell cannot set an inline env var portably for an npm script (see the README's
// existing Windows note), so the one portable place left to guarantee it is set before any test
// file imports client.ts is here.
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/rules.test.ts", "scripts/storage-rules.test.ts"],
    // FIREBASE_AUTH_EMULATOR_HOST is also required, not just NEXT_PUBLIC_USE_EMULATORS: the
    // Auth JS SDK's getAuth() validates the (fake, "demo-key") apiKey's format before
    // client.ts's own connectAuthEmulator() call ever runs, and only skips that validation when
    // it detects this specific env var itself.
    env: {
      NEXT_PUBLIC_USE_EMULATORS: "true",
      FIREBASE_AUTH_EMULATOR_HOST: `localhost:${EMULATOR_PORTS.auth}`,
    },
  },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
