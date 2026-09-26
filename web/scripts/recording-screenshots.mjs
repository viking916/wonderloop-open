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
// household. Mirrors scripts/speak-recording-screenshots.mjs, which it was copied from.
//
// Run with the emulators up and `npm run dev` serving port 3000:
//   node --env-file=.env.development.local scripts/recording-screenshots.mjs

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

const SPEAK_UID = "recording-check-uid";
const SPEAK_HID = "recording-check-household";
const SPEAK_PID = "recording-check-explorer";
const SPEAK_EMAIL = "recording-check@wonderloop.test";

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
        getApps().find((a) => a.name === "recording-check-admin") ??
        initializeApp({ projectId: "wonderloop-dev" }, "recording-check-admin")
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
  await db.recursiveDelete(db.doc(`households/${SPEAK_HID}`));
  await db.doc(`users/${SPEAK_UID}`).delete();
}

/** A fresh household with one Explorer profile whose season 1 starts on the Monday just gone,
 * so week 1 is the current week and This Week shows this quest's own card. */
async function createHousehold() {
  const db = await getDb();
  await db.doc(`users/${SPEAK_UID}`).set({ displayName: "Speak Recording Check", householdIds: [SPEAK_HID] });
  await db.doc(`households/${SPEAK_HID}`).set({
    name: "Speak Recording Check",
    ownerUid: SPEAK_UID,
    memberUids: [SPEAK_UID],
    inviteCode: "SPEAK1",
    createdAt: Date.now(),
  });
  await db.doc(`households/${SPEAK_HID}/profiles/${SPEAK_PID}`).set({
    name: "Explorer",
    kind: "explorer",
    avatar: "fox",
    birthYear: 2017,
    seasonId: 1,
    startDate: mondayJustGone(),
    look: "trail",
  });
  await db.doc(`households/${SPEAK_HID}/profiles/${SPEAK_PID}-parent`).set({
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
        window.__speakSignIn = async function (token) {
          const cred = await signInWithCustomToken(wonderloopAuth(), token);
          return cred.user.uid;
        };
        window.__speakCheckUid = function () {
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
    const uid = await page.evaluate((t) => window.__speakSignIn(t), token);
    if (uid !== SPEAK_UID) throw new Error(`Signed in as unexpected uid: ${uid}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const confirmed = await page.evaluate(() => window.__speakCheckUid());
    if (confirmed === SPEAK_UID) return;
    if (attempt === 4) throw new Error(`signIn never confirmed ${SPEAK_UID} (last saw ${confirmed})`);
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
  const file = path.join(SCREENSHOT_DIR, `recording-${label}-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved ${file} (${fs.statSync(file).size} bytes)`);
}

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error("recording-screenshots: refusing to run -- FIRESTORE_EMULATOR_HOST is not set. Run via node --env-file=.env.development.local.");
    return 1;
  }
  await ensureAllowlistedIdentity(SPEAK_UID, SPEAK_EMAIL);
  const token = await mintCustomToken(SPEAK_UID);
  const bundle = await buildSignInBundle();

  const browser = await chromium.launch();
  try {
    for (const viewport of VIEWPORTS) {
      await teardownHousehold();
      await createHousehold();

      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      page.on("console", (msg) => { if (msg.type() === "error") console.log(`  [console:error] ${msg.text()}`); });
      page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));

      await signIn(page, bundle, token);
      await selectProfile(page);

      // 1. The recording step as he first meets it.
      await page.goto(freshUrl(`/explorer/quest/${QUEST_ID}?step=${ARTIFACT_STEP}`), { waitUntil: "load" });
      await waitForSettled(page);
      await shoot(page, "step-before", viewport);

      // 2. A video from the phone, through the real upload path into the Storage emulator. The
      //    bytes are synthetic (no camera here), which is fine for the upload, the rules and the
      //    portfolio's <video> element; nothing here claims to prove playback of real footage.
      await page.setInputFiles(`#${ARTIFACT_STEP_ID}-file`, {
        name: "talk.mp4",
        mimeType: "video/mp4",
        buffer: Buffer.alloc(256 * 1024, 1),
      });
      await page.waitForSelector("text=Saved. You can watch it again", { timeout: 20000 });
      await page.waitForTimeout(400);
      await shoot(page, "step-saved", viewport);

      // 3. The Speak log, so the quest can reach done.
      await page.goto(freshUrl(`/explorer/quest/${QUEST_ID}?step=${LOG_STEP}`), { waitUntil: "load" });
      await waitForSettled(page);
      const boxes = page.locator(".tr-step textarea, .tr-step input[type='text']");
      const count = await boxes.count();
      for (let i = 0; i < count; i++) {
        await boxes.nth(i).fill(`Answer ${i + 1} for the check run.`);
      }
      await page.getByRole("button", { name: /Save|Finish|Done/ }).first().click({ timeout: 10000 });
      await page.waitForTimeout(1500);

      // 4. The portfolio spread, playing the recording back from Storage.
      await page.goto(freshUrl("/explorer/portfolio"), { waitUntil: "load" });
      await waitForSettled(page);
      await page.waitForSelector("video.tr-spread__video", { timeout: 15000 });
      await page.waitForTimeout(800);
      await shoot(page, "portfolio", viewport);

      // 5. A voice-mode explain step: audio recording above, typing beneath.
      await page.goto(freshUrl(`/explorer/quest/${THINK_QUEST_ID}?step=${THINK_EXPLAIN_STEP}`), { waitUntil: "load" });
      await waitForSettled(page);
      await shoot(page, "explain-voice", viewport);

      // 6. The Parent view: switch to the parent profile, past the PIN offer, to the season row.
      // "/" bounces straight back to the active profile's home, so go through the header's own
      // Switch profile control to reach the picker.
      await page.getByRole("button", { name: "Switch profile" }).first().click({ timeout: 10000 });
      await page.waitForURL((url) => url.pathname === "/" || url.pathname.startsWith("/profiles"), { timeout: 15000 }).catch(() => undefined);
      await waitForSettled(page);
      await page.getByRole("button", { name: /^Parent/ }).first().click({ timeout: 15000 });
      await page.waitForURL((url) => url.pathname.startsWith("/parent"), { timeout: 15000 });
      await waitForSettled(page);
      const notNow = page.getByRole("button", { name: "Not now" });
      if (await notNow.count()) {
        await notNow.first().click({ timeout: 10000 });
        await waitForSettled(page);
      }
      await page.waitForSelector("text=Season 1", { timeout: 15000 });
      await page.locator(".pr-profiles").scrollIntoViewIfNeeded();
      await shoot(page, "parent-season-row", viewport);
      await page.locator(".pr-profiles").screenshot({ path: path.join(SCREENSHOT_DIR, `recording-parent-season-row-card-${viewport.name}.png`) });

      // 7. The rollover confirm, then the season actually moved.
      await page.getByRole("button", { name: "Start season 2" }).first().click({ timeout: 10000 });
      await page.waitForSelector("text=Anything unfinished in season 1", { timeout: 10000 });
      await page.waitForTimeout(300);
      await shoot(page, "parent-rollover-confirm", viewport);
      await page.locator(".pr-profiles").screenshot({ path: path.join(SCREENSHOT_DIR, `recording-parent-rollover-confirm-card-${viewport.name}.png`) });
      await page.locator(".pr-profiles__rollover").getByRole("button", { name: "Start season 2" }).click({ timeout: 10000 });
      await page.waitForSelector("text=Season 2, from", { timeout: 15000 });
      await page.waitForTimeout(400);
      await shoot(page, "parent-season-rolled", viewport);
      await page.locator(".pr-profiles").screenshot({ path: path.join(SCREENSHOT_DIR, `recording-parent-season-rolled-card-${viewport.name}.png`) });

      await page.close();
    }
  } finally {
    await teardownHousehold();
    await browser.close();
  }
  return 0;
}

run().then((code) => process.exit(code ?? 0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
