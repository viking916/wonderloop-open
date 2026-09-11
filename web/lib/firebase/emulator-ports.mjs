// Single source of truth for Wonderloop's local Firebase emulator ports.
//
// Deliberately NOT Firebase's defaults (auth 9099, firestore 8080, storage 9199, ui 4000,
// hub 4400, logging 4500). Every Firebase project on this machine reaches for those same
// defaults, and the owner runs several -- on 2026-08-27 that collision let another project's
// emulator suite (phi-store-dev) silently take over Wonderloop's ports and serve its security
// rules for hours before anyone noticed. These ports are chosen to sit clear of the defaults
// and of every other project's own emulator block.
//
// Plain dependency-free JavaScript (not TypeScript, not JSON) on purpose, so every runtime that
// needs a port can import this one file unmodified:
//   - lib/firebase/client.ts (browser code, bundled by Next.js/webpack)
//   - scripts run through tsx (seed-emulators.ts, rules.test.ts via Vitest, allowlist.ts)
//   - scripts run through plain `node` (verify-ui.mjs, task19/21/22-screenshots.mjs) -- these
//     cannot import a .ts file without Node's experimental type-stripping warning, and cannot
//     import JSON without an import-attribute that varies by Node version, but a plain .mjs
//     import needs neither.
//
// firebase.json is the one place these numbers are necessarily duplicated: the Firebase CLI
// reads firebase.json directly as static JSON and cannot execute JavaScript to pull values from
// here. That duplication is guarded, not just hoped-for -- lib/firebase/emulator-ports.test.ts
// imports both this file and firebase.json and fails `npm test` the moment they disagree.
export const EMULATOR_PORTS = {
  auth: 9390,
  firestore: 8380,
  storage: 9490,
  ui: 4300,
  hub: 4390,
  logging: 4490,
};
