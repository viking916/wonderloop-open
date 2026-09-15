#!/usr/bin/env node
// Verification script for the debate room (components/quest/DebateRoom.tsx, Plan 3 task 6):
// holds a real three-round debate against the live model through the app's own route, in the
// real running app, and screenshots every stage: side pick, steelman, each round, the coach
// card, then the Parent view's debate list. This spends real API calls (five per viewport) and
// needs ANTHROPIC_API_KEY in .env.development.local; the typed path is what it drives, since
// headless Chromium has no microphone for "Talk".
//
// Writes go to a household this script creates and deletes again, never the seeded "home"
// household. Mirrors scripts/recording-screenshots.mjs, which it was copied from.
//
// Run with the emulators up and `npm run dev` serving port 3000:
//   node --env-file=.env.development.local scripts/debate-screenshots.mjs

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

const SPEAK_UID = "debate-check-uid";
const SPEAK_HID = "debate-check-household";
const SPEAK_PID = "debate-check-explorer";
const SPEAK_EMAIL = "debate-check@wonderloop.test";

const QUEST_ID = "s1-w05-speak";
const speakQuest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "content", "seasons", "1", "weeks", "05", "speak.json"), "utf8"));
const DEBATE_STEP = speakQuest.steps.findIndex((st) => st.kind === "debate");
if (DEBATE_STEP < 0) throw new Error("no debate step in s1-w05-speak");
const DEBATE_STEP_ID = speakQuest.steps[DEBATE_STEP].id;
const VIEWPORTS_ALL = [
  { name: "1280x900", width: 1280, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];

const VIEWPORTS = process.env.DEBATE_ALL_VIEWPORTS ? VIEWPORTS_ALL : [VIEWPORTS_ALL[0]];

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let adminAppPromise;
async function getAdminApp() {
  if (!adminAppPromise) {
    adminAppPromise = (async () => {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
      const { initializeApp, getApps } = await import("firebase-admin/app");
      return (
        getApps().find((a) => a.name === "debate-check-admin") ??
        initializeApp({ projectId: "wonderloop-dev" }, "debate-check-admin")
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
  // Per-family AI keys (6 September 2026): the room only opens for a household with a key on
  // record, so the throwaway household gets the script's own, stored unencrypted (enc "none").
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  await db.doc(`households/${SPEAK_HID}/private/ai`).set({ enc: "none", key: apiKey, last4: apiKey.slice(-4), addedAt: Date.now(), addedByUid: "debate-screenshots" });
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
  now.setDate(now.getDate() - 28);
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
  const file = path.join(SCREENSHOT_DIR, `debate-${label}-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved ${file} (${fs.statSync(file).size} bytes)`);
}

const STEELMAN = "Homework helps you practise what you learned at school, so the ideas stick and you get better at hard things.";
const POINTS = [
  "Homework should be banned because kids already work six hours at school and need time to play, rest and be with family. My cousin does two hours of homework and is too tired to read for fun.",
  "You said practice makes ideas stick, but practice can happen in class with a teacher who can help. At home, if you are stuck, you stay stuck, and that teaches you nothing.",
  "My best point is this: kids learn from playing, building and reading too. Ban homework and school time is for lessons, home time is for the rest of life.",
];

async function typeAndSend(page, text) {
  const box = page.locator("textarea.tr-textarea").first();
  await box.fill(text);
  await page.getByRole("button", { name: "Send to Rebut" }).click({ timeout: 10000 });
}

async function waitForRebutTurns(page, count) {
  await page.waitForFunction((n) => document.querySelectorAll(".tr-debate__turn--rebut:not(.tr-debate__turn--waiting)").length >= n, count, { timeout: 90000 });
  await page.waitForTimeout(400);
}

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error("debate-screenshots: refusing to run -- FIRESTORE_EMULATOR_HOST is not set. Run via node --env-file=.env.development.local.");
    return 1;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("debate-screenshots: ANTHROPIC_API_KEY is not set in .env.development.local, so the dev server has no opponent to offer.");
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
      // A failed route answer carries its cause in development; print it so a 502 is not a mystery.
      page.on("response", async (res) => {
        if (res.url().includes("/api/ai/debate") && !res.ok()) {
          try { console.log(`  [route ${res.status()}] ${await res.text()}`); } catch { /* body gone */ }
        }
      });

      await signIn(page, bundle, token);
      await selectProfile(page);

      // 1. The room as he first meets it.
      await page.goto(freshUrl(`/explorer/quest/${QUEST_ID}?step=${DEBATE_STEP}`), { waitUntil: "load" });
      await waitForSettled(page);
      await page.waitForSelector(".tr-debate__motion", { timeout: 15000 });
      await shoot(page, "start", viewport);

      // 2. Side, if the step asks.
      const pick = page.getByRole("button", { name: "For", exact: true });
      if (await pick.count()) {
        await pick.first().click({ timeout: 10000 });
        await page.waitForSelector("text=Steelman it first", { timeout: 15000 });
      }

      // 3. Steelman, judged by the live model.
      await typeAndSend(page, STEELMAN);
      await page.waitForFunction(() => document.querySelector(".tr-debate__turn--rebut") || document.querySelector("textarea.tr-textarea:not([disabled])"), null, { timeout: 90000 });
      await page.waitForTimeout(400);
      const keep = page.getByRole("button", { name: "Keep it and move on" });
      if (await keep.count()) {
        console.log("  steelman judged not fair; keeping it and moving on");
        await keep.first().click({ timeout: 10000 });
      }
      await page.waitForSelector("text=Round 1: your claim", { timeout: 30000 });
      await shoot(page, "steelman", viewport);

      // 4. Three rounds against the live opponent.
      for (let i = 0; i < 3; i++) {
        await typeAndSend(page, POINTS[i]);
        await waitForRebutTurns(page, i + 2); // steelman note + rounds so far
        await shoot(page, `round${i + 1}`, viewport);
      }

      // 5. The coach card writes itself.
      await page.waitForSelector(".tr-debate__coach", { timeout: 90000 });
      await page.waitForTimeout(400);
      await shoot(page, "coach", viewport);
      const transcript = await page.locator(".tr-debate__log").innerText();
      const coach = await page.locator(".tr-debate__coach").innerText();
      console.log("---- transcript ----\n" + transcript + "\n---- coach card ----\n" + coach + "\n--------------------");

      // 6. The Parent view lists it.
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
      await page.waitForSelector("text=Debates with Rebut", { timeout: 15000 });
      await page.locator(".pr-debates details summary").first().click({ timeout: 10000 });
      await page.waitForTimeout(300);
      await page.locator(".pr-debates").scrollIntoViewIfNeeded();
      await page.locator(".pr-debates").screenshot({ path: path.join(SCREENSHOT_DIR, `debate-parent-list-card-${viewport.name}.png`) });
      console.log("  saved parent list card");

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
