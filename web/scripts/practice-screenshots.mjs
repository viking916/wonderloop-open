#!/usr/bin/env node
// practice-screenshots.mjs -- photographs the new Practice this week card (23 September 2026:
// piano and chess checkboxes replacing the Play quest) on This Week, the Parent view's This week
// tab, and the Parent view's Settings profile rows (the new piano/chess toggle copy).
//
// Run with the emulators up and `npm run dev` serving port 3000:
//   node --env-file=.env.development.local scripts/practice-screenshots.mjs
//
// Writes to the project-root docs/screenshots/ as practice-<screen>-<state>-<WxH>.png, at
// 390x844, 820x1180, 1366x768 and 1920x1080. "before" and "after" bracket a real click on the
// piano and one chess checkbox through the app's own UI (never written directly to Firestore);
// "reload" re-navigates the page from scratch afterward, to prove the ticks actually persisted
// rather than only living in React state.
//
// Mechanics borrowed on purpose from scripts/polish-screenshots.mjs and
// scripts/parent-tabs-screenshots.mjs (signing in as the seeded owner via a firebase-admin custom
// token, selecting a profile, dismissing the Parent view's PIN gate, waiting for real seeded
// content rather than a guessed duration) rather than reinvented, per docs/ui-styleguide.md
// section 7. Reads the household `npm run seed` already wrote (households/home, owner
// seed-parent-uid, profiles explorer/sprout/parent); the seeded Explorer has playTrack:true and
// no chessPractice override (chess defaults on), so both rows show. Resets the seeded Explorer's
// own week-1 practice document (households/home/profiles/explorer/practice/s1w01 -- season 1,
// week 1, the same id lib/domain/practice.ts's practiceDocId(1, 1) computes, and the seeded
// Explorer's real current week since Build is done but Think is only half answered) before each
// "before" capture, via the Admin SDK, so every run's "before" state is genuinely unticked.

import { chromium } from "playwright";
import esbuild from "esbuild";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { EMULATOR_PORTS } from "../lib/firebase/emulator-ports.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SCREENSHOT_DIR = path.join(REPO_ROOT, "docs", "screenshots");
const DEV_URL = process.env.VERIFY_UI_URL ?? "http://localhost:3000";
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? `localhost:${EMULATOR_PORTS.auth}`;

const OWNER_UID = "seed-parent-uid";
const HOUSEHOLD_ID = "home";
const EXPLORER_PID = "explorer";
const OWNER_EMAIL = "practice-screenshots-owner@wonderloop.test";
const PRACTICE_DOC_ID = "s1w01"; // season 1, week 1 -- the seeded Explorer's real current week

const VIEWPORTS = [
  { name: "390x844", width: 390, height: 844 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1920x1080", width: 1920, height: 1080 },
];

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// -------------------------------------------------------------------------------------------
// Admin / sign-in plumbing.
// -------------------------------------------------------------------------------------------

let adminAppPromise;
async function getAdminApp() {
  if (!adminAppPromise) {
    adminAppPromise = (async () => {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
      const { initializeApp, getApps } = await import("firebase-admin/app");
      return (
        getApps().find((a) => a.name === "practice-screenshots-admin") ??
        initializeApp({ projectId: "wonderloop-dev" }, "practice-screenshots-admin")
      );
    })();
  }
  return adminAppPromise;
}

async function getDb() {
  const { getFirestore } = await import("firebase-admin/firestore");
  return getFirestore(await getAdminApp());
}

async function ensureAllowlistedIdentity(uid, email) {
  const { getAuth } = await import("firebase-admin/auth");
  const auth = getAuth(await getAdminApp());
  try {
    await auth.updateUser(uid, { email });
  } catch (err) {
    if (err?.code === "auth/user-not-found") await auth.createUser({ uid, email });
    else throw err;
  }
  const db = await getDb();
  await db.doc(`allowedEmails/${email}`).set({ note: "practice-screenshots identity", addedAt: Date.now() });
}

async function mintCustomToken(uid) {
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(await getAdminApp()).createCustomToken(uid);
}

/** Deletes the seeded Explorer's week-1 practice document, so the next "before" capture starts
 * from a genuinely unticked state regardless of what an earlier viewport's run left behind. */
async function resetPracticeDoc() {
  const db = await getDb();
  await db.doc(`households/${HOUSEHOLD_ID}/profiles/${EXPLORER_PID}/practice/${PRACTICE_DOC_ID}`).delete();
}

async function buildSignInBundle() {
  const result = await esbuild.build({
    stdin: {
      contents: `
        import { getApps, initializeApp } from "firebase/app";
        import { getAuth, connectAuthEmulator, signInWithCustomToken, onAuthStateChanged } from "firebase/auth";
        function wonderloopApp() {
          const existing = getApps().find((a) => a.name === "wonderloop");
          if (existing) return existing;
          return initializeApp({
            apiKey: "demo-key",
            authDomain: "wonderloop-dev.firebaseapp.com",
            projectId: "wonderloop-dev",
            storageBucket: "wonderloop-dev.appspot.com",
          }, "wonderloop");
        }
        function wonderloopAuth() {
          const auth = getAuth(wonderloopApp());
          try {
            connectAuthEmulator(auth, "http://${AUTH_EMULATOR_HOST}", { disableWarnings: true });
          } catch {}
          return auth;
        }
        window.__practiceSignIn = async function (token) {
          const cred = await signInWithCustomToken(wonderloopAuth(), token);
          return cred.user.uid;
        };
        window.__practiceCheckUid = function () {
          const auth = wonderloopAuth();
          if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
          return new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, (user) => {
              unsubscribe();
              resolve(user ? user.uid : null);
            });
            setTimeout(() => {
              unsubscribe();
              resolve(auth.currentUser ? auth.currentUser.uid : null);
            }, 5000);
          });
        };
      `,
      resolveDir: __dirname,
      loader: "js",
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    write: false,
  });
  return result.outputFiles[0].text;
}

function freshUrl(pathAndQuery) {
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  return `${DEV_URL}${pathAndQuery}${sep}practiceNav=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function waitForSettled(page) {
  try {
    await page.waitForSelector(".tr-loading", { state: "detached", timeout: 10000 });
  } catch {
    // ok: this route never rendered .tr-loading in the first place.
  }
  await page.waitForTimeout(300);
  for (let i = 0; i < 40; i++) {
    if ((await page.locator("text=Getting your trail ready").count()) === 0) break;
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => document.fonts.ready).catch(() => {});
}

async function signIn(page, bundle, token) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(freshUrl("/"), { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const uid = await page.evaluate((t) => window.__practiceSignIn(t), token);
    if (uid !== OWNER_UID) throw new Error(`Signed in as unexpected uid: ${uid} (expected ${OWNER_UID})`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const confirmed = await page.evaluate(() => window.__practiceCheckUid());
    if (confirmed === OWNER_UID) return;
    if (attempt === 4) throw new Error(`signIn never confirmed ${OWNER_UID} (last saw ${confirmed})`);
  }
}

async function returnToPicker(page) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await waitForSettled(page);
    await page.evaluate((hid) => window.localStorage.removeItem(`wonderloop:activeProfile:${hid}`), HOUSEHOLD_ID);
    await page.goto(freshUrl("/"), { waitUntil: "load" });
    await waitForSettled(page);
    if ((await page.locator(".tr-picker").count()) > 0) return;
    if (attempt === 4) throw new Error(`returnToPicker: .tr-picker never rendered (stuck on ${page.url()})`);
  }
}

// Timeouts here are generous (45s) rather than the usual 10s: another agent is concurrently
// running its own Playwright-driven screenshot scripts against this same dev server for a
// responsive-layout audit, and Next dev's on-demand compilation queue backs up under that
// concurrent load, so a first hit to a route can take much longer than it would alone.
async function selectProfile(page, label, routePrefix) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await waitForSettled(page);
    const tile = page.getByRole("button", { name: new RegExp(`^${label}`) });
    try {
      await tile.click({ timeout: 45000 });
      await page.waitForURL((url) => url.pathname.startsWith(routePrefix), { timeout: 45000 });
      await waitForSettled(page);
      return;
    } catch (err) {
      if (attempt === 4) throw err;
      await page.goto(freshUrl("/"), { waitUntil: "load" });
    }
  }
}

/** Polls a checkbox locator's real DOM checked state (not just "the click resolved") up to
 * `timeout`ms -- the same "wait for the state, never a duration" rule docs/ui-styleguide.md
 * section 8 requires everywhere else in this repo's screenshot scripts. */
async function waitForChecked(locator, checked, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if ((await locator.isChecked()) === checked) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`checkbox never reached checked=${checked} within ${timeout}ms`);
}

async function shoot(page, name, viewport) {
  const file = path.join(SCREENSHOT_DIR, `practice-${name}-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved ${file} (${fs.statSync(file).size} bytes)`);
}

// -------------------------------------------------------------------------------------------
// This Week: before / after / reload.
// -------------------------------------------------------------------------------------------

async function explorerFlow(page, viewport) {
  await resetPracticeDoc();
  await returnToPicker(page);
  await selectProfile(page, "Explorer", "/explorer");

  await page.goto(freshUrl("/explorer"), { waitUntil: "load" });
  await waitForSettled(page);
  await page.locator(".tr-practice-card").waitFor({ timeout: 10000 });
  await shoot(page, "this-week-before", viewport);

  const piano = page.getByRole("checkbox", { name: "30 minutes of piano practice this week" });
  const chessSat = page.getByRole("checkbox", { name: "Chess game on Saturday" });
  await piano.click({ timeout: 10000 });
  await waitForChecked(piano, true);
  await chessSat.click({ timeout: 10000 });
  await waitForChecked(chessSat, true);
  await shoot(page, "this-week-after", viewport);

  await page.reload({ waitUntil: "load" });
  await waitForSettled(page);
  await page.locator(".tr-practice-card").waitFor({ timeout: 10000 });
  const pianoAfterReload = page.getByRole("checkbox", { name: "30 minutes of piano practice this week" });
  const chessSatAfterReload = page.getByRole("checkbox", { name: "Chess game on Saturday" });
  await waitForChecked(pianoAfterReload, true);
  await waitForChecked(chessSatAfterReload, true);
  await shoot(page, "this-week-reload", viewport);
}

// -------------------------------------------------------------------------------------------
// Parent view: This week tab (before / after / reload) and Settings.
// -------------------------------------------------------------------------------------------

async function waitForSeededWeekData(page) {
  await page.getByText("Build done", { exact: true }).waitFor({ timeout: 15000 });
}

async function parentFlow(page, viewport) {
  await resetPracticeDoc();
  await returnToPicker(page);
  await selectProfile(page, "Parent", "/parent");

  const notNow = page.getByRole("button", { name: "Not now" });
  if ((await notNow.count()) > 0) {
    await notNow.first().click({ timeout: 10000 }).catch(() => {});
    await waitForSettled(page);
  }
  await page.getByRole("tablist", { name: "Parent view sections" }).waitFor({ timeout: 15000 });
  await waitForSettled(page);
  await waitForSeededWeekData(page);
  await page.locator(".pr-practice").waitFor({ timeout: 10000 });
  await shoot(page, "parent-week-before", viewport);

  const piano = page.getByRole("checkbox", { name: "30 minutes of piano practice this week" });
  const chessSun = page.getByRole("checkbox", { name: "Chess game on Sunday" });
  await piano.click({ timeout: 10000 });
  await waitForChecked(piano, true);
  await chessSun.click({ timeout: 10000 });
  await waitForChecked(chessSun, true);
  // The summary line (lib/domain/practice.ts's practiceSummary) updates from the same watched
  // doc; give it a moment to reflect both ticks before shooting.
  await page.getByText("Chess 1 of 2, piano done", { exact: true }).waitFor({ timeout: 5000 });
  await shoot(page, "parent-week-after", viewport);

  await page.reload({ waitUntil: "load" });
  await waitForSettled(page);
  await page.getByRole("tablist", { name: "Parent view sections" }).waitFor({ timeout: 15000 });
  await waitForSeededWeekData(page);
  await page.locator(".pr-practice").waitFor({ timeout: 10000 });
  await page.getByText("Chess 1 of 2, piano done", { exact: true }).waitFor({ timeout: 10000 });
  await shoot(page, "parent-week-reload", viewport);

  // Settings tab: the new piano/chess toggle copy on each Explorer profile row.
  await page.getByRole("tab", { name: "Settings", exact: true }).click({ timeout: 10000 });
  await waitForSettled(page);
  await page.waitForTimeout(150);
  await page.locator(".pr-profiles").waitFor({ timeout: 10000 });
  await shoot(page, "settings", viewport);
}

// -------------------------------------------------------------------------------------------
// Runner.
// -------------------------------------------------------------------------------------------

const ONLY_ARG = process.argv.find((a) => a.startsWith("--only="));
const ONLY = ONLY_ARG ? new Set(ONLY_ARG.slice("--only=".length).split(",")) : null;

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error(
      "practice-screenshots: FIRESTORE_EMULATOR_HOST is not set. Run with " +
        "`node --env-file=.env.development.local scripts/practice-screenshots.mjs` from web/.",
    );
    return 1;
  }

  console.log(`practice-screenshots: allowlisting ${OWNER_UID} (${OWNER_EMAIL})`);
  await ensureAllowlistedIdentity(OWNER_UID, OWNER_EMAIL);
  const token = await mintCustomToken(OWNER_UID);
  const bundle = await buildSignInBundle();

  const browser = await chromium.launch();
  let failures = 0;
  try {
    for (const viewport of VIEWPORTS) {
      console.log(`\n=== viewport ${viewport.name} ===`);
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
      const page = await context.newPage();
      page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));
      await signIn(page, bundle, token);

      if (!ONLY || ONLY.has("explorer")) {
        try {
          await explorerFlow(page, viewport);
        } catch (err) {
          failures++;
          console.error(`  [FAILED] explorer flow @ ${viewport.name}: ${err.message}`);
        }
      }

      if (!ONLY || ONLY.has("parent")) {
        try {
          await parentFlow(page, viewport);
        } catch (err) {
          failures++;
          console.error(`  [FAILED] parent flow @ ${viewport.name}: ${err.message}`);
        }
      }

      await context.close();
    }
  } finally {
    await browser.close();
    // Leave the practice doc reset so a later real run of the app (or verify:ui) starts clean.
    await resetPracticeDoc().catch(() => {});
  }

  return failures > 0 ? 1 : 0;
}

run()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    console.error("practice-screenshots: crashed", err);
    process.exit(1);
  });
