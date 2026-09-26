#!/usr/bin/env node
// Ad hoc verification script (not part of the checked-in suite, not verify:ui): drives the real
// running app with Playwright to confirm the Parent view's new pending-indicator work actually
// renders, per the task brief ("verify for real, not by reading code"). Mechanics borrowed from
// scripts/parent-tabs-screenshots.mjs and scripts/pending-verify-screenshots.mjs (sign in as the
// seeded owner via a firebase-admin custom token, throttle the network via CDP so a fast local
// emulator round trip still clears PENDING_SHOW_DELAY_MS -- lib/pendingTiming.ts).
//
// Exercises, on the real seeded household ("home"): Rename, the AI key "Check and save" failure
// path, a reset (Reset this quest, on the Think quest, which is the one seeded quest with real
// attempts and a mistake-box entry -- chosen over the Build quest specifically so this does not
// disturb the "Build done" text scripts/parent-tabs-screenshots.mjs waits for), a double-click
// guard on that same reset, and WeekPlan's "Open as Explorer" hard navigation. Renames the
// Explorer profile back to its seeded name afterward so this script leaves the shared seeded
// household as it found it, aside from the Think quest reset the task itself asks to exercise.
//
//   node --env-file=.env.development.local scripts/pending-verify-parent-screenshots.mjs

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

const HID = "home";
const OWNER_UID = "seed-parent-uid";
const OWNER_EMAIL = "pending-verify-parent-owner@wonderloop.test";

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let adminAppPromise;
async function getAdminApp() {
  if (!adminAppPromise) {
    adminAppPromise = (async () => {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
      const { initializeApp, getApps } = await import("firebase-admin/app");
      return (
        getApps().find((a) => a.name === "pending-verify-parent-admin") ??
        initializeApp({ projectId: "wonderloop-dev" }, "pending-verify-parent-admin")
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
  await db.doc(`allowedEmails/${email}`).set({ note: "pending-verify-parent identity", addedAt: Date.now() });
}
async function mintCustomToken(uid) {
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(await getAdminApp()).createCustomToken(uid);
}
async function resetDocCount() {
  const db = await getDb();
  const snap = await db.collection(`households/${HID}/profiles/explorer/resets`).get();
  return snap.size;
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
          try { connectAuthEmulator(auth, "http://${AUTH_EMULATOR_HOST}", { disableWarnings: true }); } catch {}
          return auth;
        }
        window.__pvpSignIn = async function (token) {
          const cred = await signInWithCustomToken(wonderloopAuth(), token);
          return cred.user.uid;
        };
        window.__pvpCheckUid = function () {
          const auth = wonderloopAuth();
          if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
          return new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, (user) => { unsubscribe(); resolve(user ? user.uid : null); });
            setTimeout(() => { unsubscribe(); resolve(auth.currentUser ? auth.currentUser.uid : null); }, 5000);
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
  return `${DEV_URL}${pathAndQuery}${sep}pvpNav=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function waitForSettled(page) {
  try {
    await page.waitForSelector(".tr-loading", { state: "detached", timeout: 10000 });
  } catch {}
  await page.waitForTimeout(300);
  for (let i = 0; i < 40; i++) {
    if ((await page.locator("text=Getting your trail ready").count()) === 0) break;
    await page.waitForTimeout(500);
  }
}

async function signIn(page, bundle, token) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(freshUrl("/"), { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const uid = await page.evaluate((t) => window.__pvpSignIn(t), token);
    if (uid !== OWNER_UID) throw new Error(`Signed in as unexpected uid: ${uid}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const confirmed = await page.evaluate(() => window.__pvpCheckUid());
    if (confirmed === OWNER_UID) return;
    if (attempt === 4) throw new Error(`signIn never confirmed ${OWNER_UID} (last saw ${confirmed})`);
  }
}

async function shoot(page, label) {
  const file = path.join(SCREENSHOT_DIR, `pending-${label}-1280x900.png`);
  await page.screenshot({ path: file });
  console.log(`  saved ${file} (${fs.statSync(file).size} bytes)`);
}

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error("FIRESTORE_EMULATOR_HOST is not set. Run with --env-file=.env.development.local.");
    return 1;
  }
  await ensureAllowlistedIdentity(OWNER_UID, OWNER_EMAIL);
  const token = await mintCustomToken(OWNER_UID);
  const bundle = await buildSignInBundle();

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));
    page.on("console", (msg) => { if (msg.type() === "error") console.log(`  [console:error] ${msg.text()}`); });

    await signIn(page, bundle, token);
    await page.goto(freshUrl("/"), { waitUntil: "load" });
    await waitForSettled(page);
    await page.getByRole("button", { name: /^Parent/ }).click({ timeout: 10000 });
    await page.waitForURL((url) => url.pathname.startsWith("/parent"), { timeout: 10000 });
    await waitForSettled(page);

    const notNow = page.getByRole("button", { name: "Not now" });
    if ((await notNow.count()) > 0) {
      await notNow.first().click({ timeout: 10000 }).catch(() => {});
      await waitForSettled(page);
    }
    await page.getByRole("tablist", { name: "Parent view sections" }).waitFor({ timeout: 15000 });

    // Throttle AFTER the initial load, so the local emulator's normally-instant round trips
    // (well under PENDING_SHOW_DELAY_MS's 120ms) genuinely clear it for every check below.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 600,
      downloadThroughput: 250 * 1024,
      uploadThroughput: 250 * 1024,
    });

    // ---- 1. Rename ----
    await page.getByRole("tab", { name: "Settings", exact: true }).click({ timeout: 10000 });
    await waitForSettled(page);
    await page.waitForTimeout(150);

    const explorerRow = page.locator(".pr-profiles__item", { hasText: "Explorer" }).first();
    await explorerRow.getByRole("button", { name: "Rename" }).click({ timeout: 10000 });
    const renameInput = page.getByLabel("Rename Explorer", { exact: true });
    await renameInput.waitFor({ state: "visible", timeout: 8000 });
    await renameInput.fill("Explorer Renamed");
    const saveBtn = page.getByRole("button", { name: "Save", exact: true });
    await saveBtn.click();
    await page.waitForTimeout(180);
    const renamePendingCount = await page.locator("button.tr-btn--pending", { hasText: "Save" }).count();
    console.log(`  Rename Save showing pending: ${renamePendingCount > 0}`);
    await shoot(page, "rename-explorer");
    // Wait for the write to actually land (the form closes back to display mode) before moving on.
    await page.getByText("Explorer Renamed", { exact: true }).first().waitFor({ timeout: 10000 });

    // Rename back so the shared seeded household is left as this script found it.
    const renamedRow = page.locator(".pr-profiles__item", { hasText: "Explorer Renamed" }).first();
    await renamedRow.getByRole("button", { name: "Rename" }).click({ timeout: 10000 });
    const revertInput = page.getByLabel("Rename Explorer Renamed", { exact: true });
    await revertInput.waitFor({ state: "visible", timeout: 8000 });
    await revertInput.fill("Explorer");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Explorer Renamed", { exact: true }).waitFor({ state: "detached", timeout: 10000 });
    console.log("  restored the seeded Explorer profile's name");

    // ---- 2. AI key "Check and save" (no real key needed -- the failure path still shows the wait) ----
    const aiInput = page.locator("#aikey-input");
    await aiInput.fill("sk-ant-pending-verify-not-a-real-key-0000000000");
    const checkAndSave = page.getByRole("button", { name: "Check and save" });
    await checkAndSave.click();
    await page.waitForTimeout(180);
    const aiPendingCount = await page.locator("button.tr-btn--pending", { hasText: "Check and save" }).count();
    console.log(`  "Check and save" showing pending: ${aiPendingCount > 0}`);
    await shoot(page, "aikey-check-and-save");
    // Let the (expected-to-fail) real call to Anthropic settle before moving on.
    await page.waitForSelector("button.tr-btn--pending", { state: "detached", timeout: 20000 }).catch(() => {});
    const aiMessage = await page.locator(".pr-confirm__error, .tr-step__done").first().textContent().catch(() => null);
    console.log(`  AI key message after settling: ${aiMessage?.trim()}`);

    // ---- 3. Reset this quest (Think), including a double-click guard ----
    const thinkRow = page.locator(".pr-quest-resets__row", { hasText: "Think" }).first();
    await thinkRow.scrollIntoViewIfNeeded();
    await thinkRow.getByRole("button", { name: "Reset this quest" }).click({ timeout: 10000 });
    const dialog = thinkRow.locator("dialog.pr-confirm");
    await dialog.waitFor({ state: "visible", timeout: 10000 });

    const before = await resetDocCount();
    const yesReset = dialog.getByRole("button", { name: "Yes, reset" });
    // Fire two real, separate clicks back to back (Playwright drives real CDP input events for
    // each, same as two fast taps) -- the second must be ignored while the first is in flight.
    await Promise.all([yesReset.click(), yesReset.click().catch(() => {})]);
    await page.waitForTimeout(180);
    console.log(`  "Yes, reset" showing pending mid-flight: ${(await dialog.locator("button.tr-btn--pending").count()) > 0}`);
    await shoot(page, "reset-quest");
    await dialog.getByText("Done", { exact: true }).waitFor({ timeout: 15000 });
    const after = await resetDocCount();
    console.log(`  reset docs before=${before} after=${after} (expected exactly +1, proving the double click did not fire twice)`);
    await dialog.getByRole("button", { name: "Close" }).click();

    // ---- 4. WeekPlan's "Open as Explorer" (a hard navigation via window.location) ----
    await page.getByRole("tab", { name: "This week", exact: true }).click({ timeout: 10000 });
    await waitForSettled(page);
    await page.waitForTimeout(200);
    // The 600ms/250KB-s throttle above still let this hard navigation's document swap happen
    // inside a single tick (confirmed live: a check at +120ms already showed the destination
    // page's OWN loading state, not the Parent view mid-flight -- Next.js's dev server answers a
    // same-origin document request fast enough even under that throttle). Push CDP's emulated
    // latency hard just for this one check, so there is a real, visible window before the browser
    // finishes the document round trip and unloads the Parent view out from under the button.
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 4000,
      downloadThroughput: 50 * 1024,
      uploadThroughput: 50 * 1024,
    });
    const openBtn = page.locator(".pr-weekplan__open-btn").first();
    await openBtn.scrollIntoViewIfNeeded();
    // noWaitAfter: Playwright's own click() otherwise waits out the navigation this click
    // triggers before resolving, which is exactly the window this check needs to land inside --
    // by the time a normal click() call returns, Chromium has already committed the new document
    // and torn down the Parent view's execution context (confirmed live: page.url() already read
    // the destination immediately after an ordinary click(), before this script's own next line).
    await openBtn.click({ noWaitAfter: true });
    const openPendingCount = await page
      .locator(".pr-weekplan__open-btn.tr-btn--pending")
      .count()
      .catch(() => 0);
    const openAriaBusyCount = await page
      .locator(".pr-weekplan__open-btn[aria-busy='true']")
      .count()
      .catch(() => 0);
    console.log(`  "Open as Explorer" pending immediately after the click: class=${openPendingCount > 0} aria-busy=${openAriaBusyCount > 0}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "pending-open-as-explorer-1280x900.png") }).catch(() => {});
    await page.waitForURL((url) => url.pathname.startsWith("/explorer/quest/"), { timeout: 30000 });
    console.log(`  landed on: ${page.url()}`);

    await page.close();
  } finally {
    await browser.close();
  }
  return 0;
}
run().then((code) => process.exit(code ?? 0)).catch((err) => { console.error(err); process.exit(1); });
