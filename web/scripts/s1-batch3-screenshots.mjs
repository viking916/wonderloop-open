#!/usr/bin/env node
// Photographs every new or changed step in the s1-batch3 package (G1 s1-w05, the s1-w05-build-11
// figure redraw, B3's s1-w07 fix, B4's s1-w09/s1-w10 fix (trinket.io replaced by Thonny), and
// B5's s1-w11, plus the s1-w02 gravity fix and the s1-w10/s1-w11 "sister" fixes) in the real
// running app, at the owner's two devices, 1366x768 and iPad portrait 820x1180. Modelled on
// scripts/b2-mbot-screenshots.mjs.
//
//   node --env-file=.env.development.local scripts/s1-batch3-screenshots.mjs

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

const UID = "s1b3-check-uid";
const HID = "s1b3-check-household";
const PID = "s1b3-check-explorer";
const EMAIL = "s1b3-check@wonderloop.test";

function loadQuest(week, track) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "content", "seasons", "1", "weeks", week, `${track}.json`), "utf8"));
}
function stepIndexOf(quest, id) {
  const i = quest.steps.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`step ${id} not found in ${quest.id}`);
  return i;
}

const w02b = loadQuest("02", "build");
const w05b = loadQuest("05", "build");
const w06b = loadQuest("06", "build");
const w07b = loadQuest("07", "build");
const w09b = loadQuest("09", "build");
const w10b = loadQuest("10", "build");
const w10t = loadQuest("10", "think");
const w11b = loadQuest("11", "build");
const w11t = loadQuest("11", "think");
const w12b = loadQuest("12", "build");

const TARGETS = [
  // Week 2: the gravity-sign fix (defect 7).
  ["w02-02-accelerometers", w02b.id, stepIndexOf(w02b, "s1-w02-build-02")],
  // Week 5: the new Ask step (G1) and the redrawn mBot figure.
  ["w05-11-build-your-mbot-redraw", w05b.id, stepIndexOf(w05b, "s1-w05-build-11")],
  ["w05-15-how-to-ask-ai", w05b.id, stepIndexOf(w05b, "s1-w05-build-15")],
  // Week 6: only the extras panel changed (x01 and x02, play note category and LED block).
  ["w06-extras", w06b.id, "extras"],
  // Week 7: B3's ultrasonic-block guide-first fix, all new/changed steps, plus extras.
  ["w07-08-meet-ultrasonic-block", w07b.id, stepIndexOf(w07b, "s1-w07-build-08")],
  ["w07-04-build-obstacle-avoider", w07b.id, stepIndexOf(w07b, "s1-w07-build-04")],
  ["w07-09-finished-program", w07b.id, stepIndexOf(w07b, "s1-w07-build-09")],
  ["w07-10-your-turn", w07b.id, stepIndexOf(w07b, "s1-w07-build-10")],
  ["w07-extras", w07b.id, "extras"],
  // Week 9: camera permission guide and the three-headings fix.
  ["w09-08-camera-permission", w09b.id, stepIndexOf(w09b, "s1-w09-build-08")],
  ["w09-04-train-teachable-machine", w09b.id, stepIndexOf(w09b, "s1-w09-build-04")],
  // Week 10: the whole Thonny replacement for trinket.io.
  ["w10-01-ask-imagine-plan", w10b.id, stepIndexOf(w10b, "s1-w10-build-01")],
  ["w10-08-install-thonny", w10b.id, stepIndexOf(w10b, "s1-w10-build-08")],
  ["w10-04-draw-shapes", w10b.id, stepIndexOf(w10b, "s1-w10-build-04")],
  ["w10-extras", w10b.id, "extras"],
  ["w10-think-06-explain-back", w10t.id, stepIndexOf(w10t, "s1-w10-think-06")],
  // Week 11: B5's python.microbit.org fix, plus the gravity idea and sittings: 2.
  ["w11-04-type-badge-python", w11b.id, stepIndexOf(w11b, "s1-w11-build-04")],
  ["w11-10-good-place-to-stop", w11b.id, stepIndexOf(w11b, "s1-w11-build-10")],
  ["w11-08-find-the-answer", w11b.id, stepIndexOf(w11b, "s1-w11-build-08")],
  ["w11-09-your-turn-button-b", w11b.id, stepIndexOf(w11b, "s1-w11-build-09")],
  ["w11-extras", w11b.id, "extras"],
  ["w11-think-07-explain-back", w11t.id, stepIndexOf(w11t, "s1-w11-think-07")],
  // Week 12: the showcase retention spec, Thonny replacing trinket.io.
  ["w12-04-build-it-again", w12b.id, stepIndexOf(w12b, "s1-w12-build-04")],
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
        getApps().find((a) => a.name === "s1b3-check-admin") ??
        initializeApp({ projectId: "wonderloop-dev" }, "s1b3-check-admin")
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
  await db.doc(`allowedEmails/${email}`).set({ note: "s1-batch3 screenshot identity", addedAt: Date.now() });
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
  await db.doc(`users/${UID}`).set({ displayName: "S1 Batch3 Check", householdIds: [HID] });
  await db.doc(`households/${HID}`).set({
    name: "S1 Batch3 Check",
    ownerUid: UID,
    memberUids: [UID],
    inviteCode: "S1B3CHK1",
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
        window.__s1b3SignIn = async function (token) {
          const cred = await signInWithCustomToken(wonderloopAuth(), token);
          return cred.user.uid;
        };
        window.__s1b3CheckUid = function () {
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
  return `${DEV_URL}${pathAndQuery}${sep}s1b3Nav=${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    const uid = await page.evaluate((t) => window.__s1b3SignIn(t), token);
    if (uid !== UID) throw new Error(`Signed in as unexpected uid: ${uid}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const confirmed = await page.evaluate(() => window.__s1b3CheckUid());
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
  const file = path.join(SCREENSHOT_DIR, `s1b3-${label}-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved ${file} (${fs.statSync(file).size} bytes)`);
}

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("s1-batch3-screenshots: FIRESTORE_EMULATOR_HOST is not set."); return 1; }
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
