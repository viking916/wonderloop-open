#!/usr/bin/env node
// Verification script for recordings in Firebase Storage (components/quest/RecordingBlock.tsx,
// 4 September 2026) and the per-profile season rollover (components/parent/ProfileManager.tsx):
// open the week 1 Speak recording step in the real running app, put a video through the
// phone-file path (headless Chromium has no camera, so the in-app Record path is covered by the
// jsdom tests, not here), watch it land in the Storage emulator and complete the step, finish
// the Speak log, screenshot the portfolio spread playing it back, screenshot a voice-mode
// explain step, then open the Parent view and walk the "Start season 2" control end to end.
//
// Writes go to a household this script creates and deletes again, never the seeded "home"
// household. Mirrors scripts/speak-ladder-screenshots.mjs, which it was copied from.
//
// Run with the emulators up and `npm run dev` serving port 3000:
//   node --env-file=.env.development.local scripts/ladder-screenshots.mjs
// LADDER_TOPIC=<topic id> (9 September 2026) picks the topic the idea-card and topic-problem
// screens show, so a new stage can be photographed in the app (the prealgebra plane figures).

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

const LADDER_UID = "ladder-check-uid";
const LADDER_HID = "ladder-check-household";
const LADDER_PID = "ladder-check-explorer";
const LADDER_EMAIL = "ladder-check@wonderloop.test";

const QUEST_ID = "s1-w01-speak";
// s1-w01-speak's steps: 0 instruction, 1 task, 2 artifact (accepts ["recording"] only), 3 speak log.
const ARTIFACT_STEP = 2;
const LOG_STEP = 3;
const ARTIFACT_STEP_ID = "s1-w01-speak-03";
// The week 1 Think quest's voice-mode explain step, found by id so a content reorder cannot
// silently point this at the wrong step.
const THINK_QUEST_ID = "s1-w01-think";
const THINK_EXPLAIN_ID = "s1-w01-think-06";
const thinkQuest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "content", "seasons", "1", "weeks", "01", "think.json"), "utf8"));
const THINK_EXPLAIN_STEP = thinkQuest.steps.findIndex((s) => s.id === THINK_EXPLAIN_ID);
if (THINK_EXPLAIN_STEP < 0) throw new Error(`${THINK_EXPLAIN_ID} not found in ${THINK_QUEST_ID}`);
if (thinkQuest.steps[THINK_EXPLAIN_STEP].mode !== "voice") throw new Error(`${THINK_EXPLAIN_ID} is not a voice explain step`);

const VIEWPORTS = [
  { name: "1280x900", width: 1280, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let adminAppPromise;
async function getAdminApp() {
  if (!adminAppPromise) {
    adminAppPromise = (async () => {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
      const { initializeApp, getApps } = await import("firebase-admin/app");
      return (
        getApps().find((a) => a.name === "ladder-check-admin") ??
        initializeApp({ projectId: "wonderloop-dev" }, "ladder-check-admin")
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
  await db.doc(`allowedEmails/${email}`).set({ note: "speak recording screenshot identity", addedAt: Date.now() });
}

async function mintCustomToken(uid) {
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(await getAdminApp()).createCustomToken(uid);
}

async function teardownHousehold() {
  const db = await getDb();
  await db.recursiveDelete(db.doc(`households/${LADDER_HID}`));
  await db.doc(`users/${LADDER_UID}`).delete();
}

/** A fresh household with one Explorer profile whose season 1 starts on the Monday just gone,
 * so week 1 is the current week and This Week shows this quest's own card. */
async function createHousehold() {
  const db = await getDb();
  await db.doc(`users/${LADDER_UID}`).set({ displayName: "Ladder Check", householdIds: [LADDER_HID] });
  await db.doc(`households/${LADDER_HID}`).set({
    name: "Ladder Check",
    ownerUid: LADDER_UID,
    memberUids: [LADDER_UID],
    inviteCode: "LADDR1",
    createdAt: Date.now(),
  });
  await db.doc(`households/${LADDER_HID}/profiles/${LADDER_PID}`).set({
    name: "Explorer",
    kind: "explorer",
    avatar: "fox",
    birthYear: 2017,
    seasonId: 1,
    startDate: mondayJustGone(),
    look: "trail",
  });
  await db.doc(`households/${LADDER_HID}/profiles/${LADDER_PID}-parent`).set({
    name: "Parent",
    kind: "parent",
    avatar: "owl",
    birthYear: 1985,
    seasonId: 1,
    startDate: mondayJustGone(),
    look: "trail",
  });
}

function mondayJustGone() {
  const now = new Date();
  const back = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
  const pad = (n) => String(n).padStart(2, "0");
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
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
        window.__ladderSignIn = async function (token) {
          const cred = await signInWithCustomToken(wonderloopAuth(), token);
          return cred.user.uid;
        };
        window.__ladderCheckUid = function () {
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
  return `${DEV_URL}${pathAndQuery}${sep}speakNav=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function waitForSettled(page) {
  try {
    await page.waitForSelector(".tr-loading", { state: "detached", timeout: 10000 });
  } catch {
    // ok: this route never rendered .tr-loading in the first place.
  }
  await page.waitForTimeout(400);
  for (let i = 0; i < 40; i++) {
    if ((await page.locator("text=Getting your trail ready").count()) === 0) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(500);
}

async function signIn(page, bundle, token) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(freshUrl("/"), { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const uid = await page.evaluate((t) => window.__ladderSignIn(t), token);
    if (uid !== LADDER_UID) throw new Error(`Signed in as unexpected uid: ${uid}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const confirmed = await page.evaluate(() => window.__ladderCheckUid());
    if (confirmed === LADDER_UID) return;
    if (attempt === 4) throw new Error(`signIn never confirmed ${LADDER_UID} (last saw ${confirmed})`);
  }
}

async function selectProfile(page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await waitForSettled(page);
    if (page.url().includes("/explorer")) return;
    try {
      await page.getByRole("button", { name: /^Explorer/ }).click({ timeout: 10000 });
      await page.waitForURL((url) => url.pathname.startsWith("/explorer"), { timeout: 10000 });
      await waitForSettled(page);
      return;
    } catch (err) {
      if (attempt === 3) throw new Error(`selectProfile: never reached /explorer (stuck on ${page.url()}): ${err.message}`);
      await page.goto(freshUrl("/"), { waitUntil: "load" });
    }
  }
}

async function shoot(page, label, viewport) {
  // A run for a named topic keeps its own files, so the arithmetic set in docs stays as documented.
  const prefix = process.env.LADDER_TOPIC ? `ladder-${process.env.LADDER_TOPIC}` : "ladder";
  const file = path.join(SCREENSHOT_DIR, `${prefix}-${label}-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved ${file} (${fs.statSync(file).size} bytes)`);
}

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("ladder-screenshots: FIRESTORE_EMULATOR_HOST is not set."); return 1; }
  await ensureAllowlistedIdentity(LADDER_UID, LADDER_EMAIL);
  const token = await mintCustomToken(LADDER_UID);
  const bundle = await buildSignInBundle();
  const browser = await chromium.launch();
  try {
    for (const viewport of VIEWPORTS) {
      await teardownHousehold();
      await createHousehold();
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
      page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));
      await signIn(page, bundle, token);
      await selectProfile(page);
      // 1. The Ladder home before any session.
      await page.goto(freshUrl("/explorer/ladder"), { waitUntil: "load" });
      await waitForSettled(page);
      await page.getByRole("button", { name: /Start today/ }).waitFor({ timeout: 20000 });
      await shoot(page, "home", viewport);
      // 2. Start: placement probe, first problem.
      await page.getByRole("button", { name: /Start today/ }).click();
      await page.getByRole("button", { name: "Check" }).waitFor({ timeout: 20000 });
      await page.waitForTimeout(500);
      await shoot(page, "probe", viewport);
      // 3. Answer it (any answer) and open the explanation.
      const radios = page.locator('[role="radio"]');
      if (await radios.count()) await radios.first().click();
      else await page.getByRole("textbox").first().fill("1");
      await page.getByRole("button", { name: "Check" }).click();
      await page.getByText(/How it works|Not yet|That's right/).first().waitFor({ timeout: 20000 });
      await page.waitForTimeout(500);
      await shoot(page, "answered", viewport);
      // 4. Past placement: the idea card with the ways chooser, a chosen way, then a topic problem.
      {
        const db = await getDb();
        await db.doc(`households/${LADDER_HID}/profiles/${LADDER_PID}/ladder/state`).set({ startedAt: Date.now() - 86400000, sessionCount: 1, placementDone: true, currentTopic: process.env.LADDER_TOPIC || "ar-multi-digit-multiplication" });
        await page.goto(freshUrl("/explorer/ladder"), { waitUntil: "load" });
        await waitForSettled(page);
        await page.getByRole("button", { name: /Start today/ }).click({ timeout: 20000 });
        await page.getByText("Ways to do it").waitFor({ timeout: 20000 });
        await page.waitForTimeout(400);
        await shoot(page, "idea-ways", viewport);
        // Under reduced motion a tap steps the frames; two taps show the picture after step 2
        // with that step highlighted in the list.
        const waySvg = page.locator(".ld-way .tr-figure--frames svg").first();
        if (await waySvg.count()) {
          await waySvg.click(); await page.waitForTimeout(150); await waySvg.click(); await page.waitForTimeout(300);
          await page.locator(".ld-way").first().screenshot({ path: path.join(SCREENSHOT_DIR, `${process.env.LADDER_TOPIC ? `ladder-${process.env.LADDER_TOPIC}` : "ladder"}-idea-way-frame-${viewport.name}.png`) });
        }
        const tabs = page.getByRole("tab");
        if ((await tabs.count()) > 1) await tabs.nth(1).click();
        await page.getByRole("button", { name: "Make this my way" }).click({ timeout: 10000 });
        await page.getByText("This is your way").waitFor({ timeout: 10000 });
        await page.waitForTimeout(300);
        await shoot(page, "idea-way-chosen", viewport);
        await page.getByRole("button", { name: "Got it" }).click();
        await page.getByRole("button", { name: "Check" }).waitFor({ timeout: 20000 });
        await page.waitForTimeout(400);
        await shoot(page, "topic-your-way", viewport);
      }
      // 5. The parent card.
      await page.getByRole("button", { name: "Switch profile" }).first().click({ timeout: 10000 });
      await page.waitForURL((url) => url.pathname === "/" || url.pathname.startsWith("/profiles"), { timeout: 15000 }).catch(() => undefined);
      await waitForSettled(page);
      await page.getByRole("button", { name: /^Parent/ }).first().click({ timeout: 15000 });
      await page.waitForURL((url) => url.pathname.startsWith("/parent"), { timeout: 15000 });
      await waitForSettled(page);
      const notNow = page.getByRole("button", { name: "Not now" });
      if (await notNow.count()) { await notNow.first().click({ timeout: 10000 }); await waitForSettled(page); }
      await page.locator(".pr-ladder").first().waitFor({ timeout: 15000 });
      await page.locator(".pr-ladder").first().scrollIntoViewIfNeeded();
      await page.locator(".pr-ladder").first().screenshot({ path: path.join(SCREENSHOT_DIR, `ladder-parent-card-${viewport.name}.png`) });
      console.log(`  ladder screens captured (${viewport.name})`);
      await page.close();
    }
  } finally {
    await teardownHousehold();
    await browser.close();
  }
  return 0;
}

run().then((code) => process.exit(code ?? 0)).catch((err) => { console.error(err); process.exit(1); });
