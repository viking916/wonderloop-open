#!/usr/bin/env node
// Verification script for the opt-in clock on a timed summit set (lib/domain/clock.ts,
// components/quest/ProblemPlayer.tsx; curriculum review 2026-09-05, lever 5): opens season 1
// week 4's summit set in the real running app, screenshots the offer, starts the clock and
// screenshots it running, seeds nine of the ten outcomes through the Admin SDK, answers the
// tenth for real so the clock stops itself, screenshots the finished note, then opens the
// Parent view and screenshots the week plan line that records the minutes.
//
// Writes go to a household this script creates and deletes again, never the seeded "home"
// household. Mirrors scripts/recording-screenshots.mjs, which it was copied from.
//
// Run with the emulators up and `npm run dev` serving port 3000:
//   node --env-file=.env.development.local scripts/clock-screenshots.mjs

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

const SPEAK_UID = "clock-check-uid";
const SPEAK_HID = "clock-check-household";
const SPEAK_PID = "clock-check-explorer";
const SPEAK_EMAIL = "clock-check@wonderloop.test";

const QUEST_ID = "s1-w04-think";
const summitQuest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "content", "seasons", "1", "weeks", "04", "think.json"), "utf8"));
const SET_STEP = summitQuest.steps.findIndex((st) => st.kind === "problem-set" && st.timed === true);
if (SET_STEP < 0) throw new Error("no timed problem-set in s1-w04-think");
const SET = summitQuest.steps[SET_STEP];
const LAST = SET.problems[SET.problems.length - 1];
if (LAST.kind !== "number") throw new Error("this script answers the last problem by typing; the last problem is not a number problem");

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
        getApps().find((a) => a.name === "clock-check-admin") ??
        initializeApp({ projectId: "wonderloop-dev" }, "clock-check-admin")
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
  now.setDate(now.getDate() - 21);
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
  const file = path.join(SCREENSHOT_DIR, `clock-${label}-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved ${file} (${fs.statSync(file).size} bytes)`);
}

async function seedAllButLast() {
  const db = await getDb();
  const ref = db.doc(`households/${SPEAK_HID}/profiles/${SPEAK_PID}/progress/${QUEST_ID}`);
  const update = {};
  for (const pr of SET.problems.slice(0, -1)) update[`quest.problemOutcomes.${pr.id}`] = "correct";
  await ref.update(update);
}

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error("clock-screenshots: refusing to run -- FIRESTORE_EMULATOR_HOST is not set. Run via node --env-file=.env.development.local.");
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

      // 1. The offer, in place of the first problem.
      await page.goto(freshUrl(`/explorer/quest/${QUEST_ID}?step=${SET_STEP}`), { waitUntil: "load" });
      await waitForSettled(page);
      await page.waitForSelector("text=This set can run with a clock", { timeout: 15000 });
      await shoot(page, "offer", viewport);

      // 2. Running.
      await page.getByRole("button", { name: "Start the clock" }).click({ timeout: 10000 });
      await page.waitForSelector("text=/Clock 0:0/", { timeout: 15000 });
      await page.waitForTimeout(1600);
      await shoot(page, "running", viewport);

      // 3. Nine outcomes seeded, the tenth answered for real: the clock stops itself.
      await seedAllButLast();
      await page.goto(freshUrl(`/explorer/quest/${QUEST_ID}?step=${SET_STEP}`), { waitUntil: "load" });
      await waitForSettled(page);
      await page.waitForSelector(`text=Problem ${SET.problems.length} of ${SET.problems.length}`, { timeout: 15000 });
      await page.getByLabel("Your answer").fill(LAST.answer.value);
      await page.getByRole("button", { name: "Check", exact: true }).click({ timeout: 10000 });
      await page.waitForSelector("text=/Finished in \\d+ minutes? with the clock/", { timeout: 20000 });
      await page.waitForTimeout(400);
      await shoot(page, "finished", viewport);

      // 4. The Parent view's week plan line.
      await page.getByRole("button", { name: "Switch profile" }).first().click({ timeout: 10000 });
      await waitForSettled(page);
      await page.getByRole("button", { name: /^Parent/ }).first().click({ timeout: 15000 });
      await page.waitForURL((url) => url.pathname.startsWith("/parent"), { timeout: 15000 });
      await waitForSettled(page);
      const notNow = page.getByRole("button", { name: "Not now" });
      if (await notNow.count()) {
        await notNow.first().click({ timeout: 10000 });
        await waitForSettled(page);
      }
      await page.waitForSelector("text=/with the clock/", { timeout: 15000 });
      await page.locator(".pr-weekplan__list").scrollIntoViewIfNeeded();
      await page.locator(".pr-weekplan__list").screenshot({ path: path.join(SCREENSHOT_DIR, `clock-parent-weekplan-${viewport.name}.png`) });
      console.log("  saved parent week plan");

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
