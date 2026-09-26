#!/usr/bin/env node
// Photographs B2's first-time mBot and mBlock guides (season 1, weeks 5, 6 and 7) in the real
// running app, at the two laptop viewports the owner's own devices report (1366x768) and iPad
// portrait (820x1180): every new or changed step across s1-w05-build, s1-w06-build and
// s1-w07-build, plus each quest's extras panel (?step=extras) once, since the extras themselves
// were reworded for the mBlock 5 block names and the safe upload sequence.
//
//   node --env-file=.env.development.local scripts/b2-mbot-screenshots.mjs

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

const UID = "b2-mbot-check-uid";
const HID = "b2-mbot-check-household";
const PID = "b2-mbot-check-explorer";
const EMAIL = "b2-mbot-check@wonderloop.test";

function loadQuest(week) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "content", "seasons", "1", "weeks", week, "build.json"), "utf8"));
}
function stepIndexOf(quest, id) {
  const i = quest.steps.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`step ${id} not found in ${quest.id}`);
  return i;
}

const w05 = loadQuest("05");
const w06 = loadQuest("06");
const w07 = loadQuest("07");

const TARGETS = [
  // Week 5: new steps, plus every changed one.
  ["w05-01-ask-imagine-plan", w05.id, stepIndexOf(w05, "s1-w05-build-01")],
  ["w05-11-build-your-mbot", w05.id, stepIndexOf(w05, "s1-w05-build-11")],
  ["w05-08-three-words", w05.id, stepIndexOf(w05, "s1-w05-build-08")],
  ["w05-10-two-kinds-of-loop", w05.id, stepIndexOf(w05, "s1-w05-build-10")],
  ["w05-12-connect", w05.id, stepIndexOf(w05, "s1-w05-build-12")],
  ["w05-14-good-place-to-stop", w05.id, stepIndexOf(w05, "s1-w05-build-14")],
  ["w05-13-upload-and-run", w05.id, stepIndexOf(w05, "s1-w05-build-13")],
  ["w05-04-build-square", w05.id, stepIndexOf(w05, "s1-w05-build-04")],
  ["w05-05-bug-diary", w05.id, stepIndexOf(w05, "s1-w05-build-05")],
  ["w05-extras", w05.id, "extras"],
  // Week 6: new steps, plus every changed one.
  ["w06-01-ask-imagine-plan", w06.id, stepIndexOf(w06, "s1-w06-build-01")],
  ["w06-08-two-kinds-of-reading", w06.id, stepIndexOf(w06, "s1-w06-build-08")],
  ["w06-10-lay-out-the-track", w06.id, stepIndexOf(w06, "s1-w06-build-10")],
  ["w06-04-build-line-follower", w06.id, stepIndexOf(w06, "s1-w06-build-04")],
  ["w06-11-good-place-to-stop", w06.id, stepIndexOf(w06, "s1-w06-build-11")],
  ["w06-09-how-to-find-a-bug", w06.id, stepIndexOf(w06, "s1-w06-build-09")],
  ["w06-05-bug-diary", w06.id, stepIndexOf(w06, "s1-w06-build-05")],
  ["w06-extras", w06.id, "extras"],
  // Week 7: only the changed steps (B2 touched -04 and -05; B3 owns the rest of this week).
  ["w07-04-build-obstacle-avoider", w07.id, stepIndexOf(w07, "s1-w07-build-04")],
  ["w07-05-bug-diary", w07.id, stepIndexOf(w07, "s1-w07-build-05")],
  ["w07-extras", w07.id, "extras"],
];

const VIEWPORTS = [
  { name: "1366x768", width: 1366, height: 768 },
  { name: "820x1180", width: 820, height: 1180 },
];

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let adminAppPromise;
async function getAdminApp() {
  if (!adminAppPromise) {
    adminAppPromise = (async () => {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
      const { initializeApp, getApps } = await import("firebase-admin/app");
      return (
        getApps().find((a) => a.name === "b2-mbot-check-admin") ??
        initializeApp({ projectId: "wonderloop-dev" }, "b2-mbot-check-admin")
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
  await db.doc(`allowedEmails/${email}`).set({ note: "b2 mbot screenshot identity", addedAt: Date.now() });
}

async function mintCustomToken(uid) {
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(await getAdminApp()).createCustomToken(uid);
}

async function teardownHousehold() {
  const db = await getDb();
  await db.recursiveDelete(db.doc(`households/${HID}`));
  await db.doc(`users/${UID}`).delete();
}

async function createHousehold() {
  const db = await getDb();
  await db.doc(`users/${UID}`).set({ displayName: "B2 mBot Check", householdIds: [HID] });
  await db.doc(`households/${HID}`).set({
    name: "B2 mBot Check",
    ownerUid: UID,
    memberUids: [UID],
    inviteCode: "B2MBOT1",
    createdAt: Date.now(),
  });
  await db.doc(`households/${HID}/profiles/${PID}`).set({
    name: "Explorer",
    kind: "explorer",
    avatar: "fox",
    birthYear: 2017,
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
        window.__b2SignIn = async function (token) {
          const cred = await signInWithCustomToken(wonderloopAuth(), token);
          return cred.user.uid;
        };
        window.__b2CheckUid = function () {
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
  return `${DEV_URL}${pathAndQuery}${sep}b2mbotNav=${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    const uid = await page.evaluate((t) => window.__b2SignIn(t), token);
    if (uid !== UID) throw new Error(`Signed in as unexpected uid: ${uid}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const confirmed = await page.evaluate(() => window.__b2CheckUid());
    if (confirmed === UID) return;
    if (attempt === 4) throw new Error(`signIn never confirmed ${UID} (last saw ${confirmed})`);
  }
}

async function selectProfile(page) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await waitForSettled(page);
    if (page.url().includes("/explorer")) return;
    try {
      await page.getByRole("button", { name: /^Explorer/ }).click({ timeout: 20000 });
      await page.waitForURL((url) => url.pathname.startsWith("/explorer"), { timeout: 20000 });
      await waitForSettled(page);
      return;
    } catch (err) {
      if (attempt === 4) throw new Error(`selectProfile: never reached /explorer (stuck on ${page.url()}): ${err.message}`);
      await page.goto(freshUrl("/"), { waitUntil: "load" });
    }
  }
}

async function shoot(page, label, viewport) {
  const file = path.join(SCREENSHOT_DIR, `b2-mbot-${label}-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved ${file} (${fs.statSync(file).size} bytes)`);
}

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("b2-mbot-screenshots: FIRESTORE_EMULATOR_HOST is not set."); return 1; }
  await ensureAllowlistedIdentity(UID, EMAIL);
  const token = await mintCustomToken(UID);
  const bundle = await buildSignInBundle();
  const browser = await chromium.launch();
  try {
    for (const viewport of VIEWPORTS) {
      await teardownHousehold();
      await createHousehold();
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      page.on("console", (msg) => { if (msg.type() === "error") console.log(`  [console:error] ${msg.text()}`); });
      page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));
      await signIn(page, bundle, token);
      await selectProfile(page);

      for (const [label, questId, step] of TARGETS) {
        await page.goto(freshUrl(`/explorer/quest/${questId}?step=${step}`), { waitUntil: "load" });
        await waitForSettled(page);
        await page.waitForTimeout(900);
        await shoot(page, label, viewport);
      }
      await context.close();
    }
  } finally {
    await teardownHousehold();
    await browser.close();
  }
  return 0;
}
run().then((code) => process.exit(code ?? 0)).catch((err) => { console.error(err); process.exit(1); });
