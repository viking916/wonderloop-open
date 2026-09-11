#!/usr/bin/env node
// Photographs Sprout activities in the real running app, past the tap-to-start gate, so
// re-authored weeks can be looked at by eye (docs/ui-styleguide.md section 7): the UI gate only
// ever photographs weeks 1 and 5. Activity ids come on the command line.
//
//   node --env-file=.env.development.local scripts/sprout-screenshots.mjs sprout-w08-a1 sprout-w12-a3

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

const SPEAK_UID = "sprout-check-uid";
const SPEAK_HID = "sprout-check-household";
const SPEAK_PID = "sprout-check-explorer";
const SPEAK_EMAIL = "sprout-check@wonderloop.test";

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
  { name: "1024x1366", width: 1024, height: 1366 },
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
        getApps().find((a) => a.name === "sprout-check-admin") ??
        initializeApp({ projectId: "wonderloop-dev" }, "sprout-check-admin")
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
  await db.doc(`households/${SPEAK_HID}/profiles/${SPEAK_PID}-sprout`).set({
    name: "Sprout",
    kind: "sprout",
    avatar: "rabbit",
    birthYear: 2024,
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
    if (page.url().includes("/sprout")) return;
    try {
      await page.getByRole("button", { name: /^Sprout/ }).click({ timeout: 10000 });
      await page.waitForURL((url) => url.pathname.startsWith("/sprout"), { timeout: 10000 });
      await waitForSettled(page);
      return;
    } catch (err) {
      if (attempt === 3) throw new Error(`selectProfile: never reached /sprout (stuck on ${page.url()}): ${err.message}`);
      await page.goto(freshUrl("/"), { waitUntil: "load" });
    }
  }
}

async function shoot(page, label, viewport) {
  const file = path.join(SCREENSHOT_DIR, `sprout-${label}-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved ${file} (${fs.statSync(file).size} bytes)`);
}

const ACTIVITY_IDS = process.argv.slice(2);
if (ACTIVITY_IDS.length === 0) { console.error("usage: node scripts/sprout-screenshots.mjs <activityId> [...]"); process.exit(2); }

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("sprout-screenshots: FIRESTORE_EMULATOR_HOST is not set."); return 1; }
  await ensureAllowlistedIdentity(SPEAK_UID, SPEAK_EMAIL);
  const token = await mintCustomToken(SPEAK_UID);
  const bundle = await buildSignInBundle();
  const browser = await chromium.launch();
  try {
    for (const viewport of VIEWPORTS) {
      await teardownHousehold();
      await createHousehold();
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
      page.on("console", (msg) => { if (msg.type() === "error") console.log(`  [console:error] ${msg.text()}`); });
      page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));
      await signIn(page, bundle, token);
      await selectProfile(page);
      for (const id of ACTIVITY_IDS) {
        await page.goto(freshUrl(`/sprout/activity/${id}`), { waitUntil: "load" });
        await waitForSettled(page);
        const start = page.locator("button.sp-start");
        if (await start.count()) {
          await start.first().click({ force: true });
          try {
            await page.waitForSelector(".sp-intro", { state: "detached", timeout: 15000 });
          } catch {
            console.log(`  [${id}] never left its intro`);
          }
          await waitForSettled(page);
          await page.waitForTimeout(1500);
        } else {
          console.log(`  [${id}] no start gate found`);
        }
        await shoot(page, id, viewport);
      }
      await page.close();
    }
  } finally {
    await teardownHousehold();
    await browser.close();
  }
  return 0;
}
run().then((code) => process.exit(code ?? 0)).catch((err) => { console.error(err); process.exit(1); });
