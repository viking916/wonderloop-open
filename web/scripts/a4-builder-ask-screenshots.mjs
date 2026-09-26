#!/usr/bin/env node
// Photographs A4's "Stuck? Ask" Builder Ask panel (year refinement 2026-09-24, owner ruling
// 0.1) in the real running app, on s1-w05-build (season 1 week 5, the first week the panel is
// available), at the three viewports the brief asked for: 1366x768, 820x1180, 390x844.
//
// Two steps: -12 (instruction, "Connect mBot to mBlock, step by step") shows the closed opener
// only; -04 (task, "Build the square and your letter in mBlock") shows the closed opener, the
// open transcript with the two standing lines, and the honest failure state after a real send
// attempt against this household's unconfigured AI key (the emulator seed never sets one, so
// this is the state most families will actually see until a parent adds a key in the Parent
// view -- see /api/ai/health's "unconfigured" reason, lib/ai/keys.ts).
//
//   node --env-file=.env.development.local scripts/a4-builder-ask-screenshots.mjs

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

const UID = "a4-builder-ask-check-uid";
const HID = "a4-builder-ask-check-household";
const PID = "a4-builder-ask-check-explorer";
const EMAIL = "a4-builder-ask-check@wonderloop.test";

function loadQuest() {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "content", "seasons", "1", "weeks", "05", "build.json"), "utf8"));
}
function stepIndexOf(quest, id) {
  const i = quest.steps.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`step ${id} not found in ${quest.id}`);
  return i;
}

const quest = loadQuest();
const INSTRUCTION_STEP = stepIndexOf(quest, "s1-w05-build-12");
const TASK_STEP = stepIndexOf(quest, "s1-w05-build-04");

const VIEWPORTS = [
  { name: "1366x768", width: 1366, height: 768 },
  { name: "820x1180", width: 820, height: 1180 },
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
        getApps().find((a) => a.name === "a4-builder-ask-check-admin") ??
        initializeApp({ projectId: "wonderloop-dev" }, "a4-builder-ask-check-admin")
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
  await db.doc(`allowedEmails/${email}`).set({ note: "a4 builder ask screenshot identity", addedAt: Date.now() });
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
  await db.doc(`users/${UID}`).set({ displayName: "A4 Builder Ask Check", householdIds: [HID] });
  await db.doc(`households/${HID}`).set({
    name: "A4 Builder Ask Check",
    ownerUid: UID,
    memberUids: [UID],
    inviteCode: "A4BASK1",
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
        window.__a4SignIn = async function (token) {
          const cred = await signInWithCustomToken(wonderloopAuth(), token);
          return cred.user.uid;
        };
        window.__a4CheckUid = function () {
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
  return `${DEV_URL}${pathAndQuery}${sep}a4bAskNav=${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    const uid = await page.evaluate((t) => window.__a4SignIn(t), token);
    if (uid !== UID) throw new Error(`Signed in as unexpected uid: ${uid}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const confirmed = await page.evaluate(() => window.__a4CheckUid());
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
  const file = path.join(SCREENSHOT_DIR, `a4-builder-ask-${label}-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved ${file} (${fs.statSync(file).size} bytes)`);
}

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("a4-builder-ask-screenshots: FIRESTORE_EMULATOR_HOST is not set."); return 1; }
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

      // Instruction step: closed opener only.
      await page.goto(freshUrl(`/explorer/quest/${quest.id}?step=${INSTRUCTION_STEP}`), { waitUntil: "load" });
      await waitForSettled(page);
      await page.waitForTimeout(700);
      await shoot(page, "01-closed-instruction-step", viewport);

      // Task step: closed opener, then opened, then the honest unconfigured-key failure.
      await page.goto(freshUrl(`/explorer/quest/${quest.id}?step=${TASK_STEP}`), { waitUntil: "load" });
      await waitForSettled(page);
      await page.waitForTimeout(700);
      await shoot(page, "02-closed-task-step", viewport);

      const opener = page.getByRole("button", { name: "Stuck? Ask" });
      await opener.click({ timeout: 20000 });
      await page.waitForTimeout(500);
      await shoot(page, "03-open-task-step", viewport);

      // 24 September 2026: the input is now a multi-line textarea, so Enter no longer sends
      // mid-thought. Type a real four-part question (what I am building, what I expected, what
      // happened, what I tried) and screenshot the grown box before sending, to confirm the
      // textarea, not an overflowing single line.
      const fourLineQuestion = [
        "What I am building: the mBot square and letter program.",
        "What I expected: the mBot to draw a square then my letter.",
        "What happened: it turned but never came back to the start.",
        "What I tried: restarting mBlock and reconnecting the cable.",
      ].join("\n");
      await page.getByPlaceholder("Ask about this step").fill(fourLineQuestion);
      await page.waitForTimeout(300);
      await shoot(page, "03b-four-line-question-typed", viewport);

      await page.getByRole("button", { name: "Send" }).click({ timeout: 20000 });
      await page.waitForTimeout(1500);
      await shoot(page, "04-unconfigured-key-response", viewport);

      await context.close();
    }
  } finally {
    await teardownHousehold();
    await browser.close();
  }
  return 0;
}
run().then((code) => process.exit(code ?? 0)).catch((err) => { console.error(err); process.exit(1); });
