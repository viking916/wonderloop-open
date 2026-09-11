#!/usr/bin/env node
// Photographs what a new family meets (6 September 2026): the consent gate before a household
// exists, the privacy notice and terms, the Parent view's AI key card off and then on (the
// key is checked against Anthropic for real, so ANTHROPIC_API_KEY must be set), and the debate
// room for a household with no key.
//
//   node --env-file=.env.development.local scripts/families-screenshots.mjs

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

const SPEAK_UID = "families-check-uid";
const SPEAK_HID = "families-check-household";
const SPEAK_PID = "families-check-explorer";
const SPEAK_EMAIL = "families-check@wonderloop.test";

// The first Speak quest with a debate step, for the offline room.
const seasonDir = path.join(REPO_ROOT, "content", "seasons", "1", "weeks");
let DEBATE_QUEST_ID = "";
let DEBATE_STEP = -1;
for (const w of fs.readdirSync(seasonDir).sort()) {
  const q = JSON.parse(fs.readFileSync(path.join(seasonDir, w, "speak.json"), "utf8"));
  const i = q.steps.findIndex((st) => st.kind === "debate");
  if (i >= 0) { DEBATE_QUEST_ID = q.id; DEBATE_STEP = i; break; }
}
if (!DEBATE_QUEST_ID) throw new Error("no debate step in season 1");

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
        getApps().find((a) => a.name === "families-check-admin") ??
        initializeApp({ projectId: "wonderloop-dev" }, "families-check-admin")
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
  const file = path.join(SCREENSHOT_DIR, `families-${label}-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved ${file} (${fs.statSync(file).size} bytes)`);
}

async function deleteUserDoc() {
  const db = await getDb();
  await db.doc(`users/${SPEAK_UID}`).delete().catch(() => undefined);
  await db.recursiveDelete(db.doc(`households/home-${SPEAK_UID}`)).catch(() => undefined);
}

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("families-screenshots: FIRESTORE_EMULATOR_HOST is not set."); return 1; }
  if (!process.env.ANTHROPIC_API_KEY) { console.error("families-screenshots: ANTHROPIC_API_KEY is not set (the key card check is real)."); return 1; }
  await ensureAllowlistedIdentity(SPEAK_UID, SPEAK_EMAIL);
  const token = await mintCustomToken(SPEAK_UID);
  const bundle = await buildSignInBundle();
  const browser = await chromium.launch();
  try {
    for (const viewport of VIEWPORTS) {
      // 1. A brand-new allowlisted account: no household yet, so the consent gate shows.
      await teardownHousehold();
      await deleteUserDoc();
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
      page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));
      await signIn(page, bundle, token);
      await page.getByText("Before we make your family").waitFor({ timeout: 20000 });
      await shoot(page, "consent", viewport);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: /Create our family/ }).click();
      await page.getByRole("button", { name: /^Parent/ }).waitFor({ timeout: 20000 });
      console.log(`  household created after consent (${viewport.name})`);

      // 2. The legal pages.
      await page.goto(freshUrl("/privacy"), { waitUntil: "load" });
      await page.waitForSelector(".tr-legal", { timeout: 15000 });
      await shoot(page, "privacy", viewport);
      await page.goto(freshUrl("/terms"), { waitUntil: "load" });
      await page.waitForSelector(".tr-legal", { timeout: 15000 });
      await shoot(page, "terms", viewport);

      // 3. Parent view: the key card off, then on.
      await page.goto(freshUrl("/"), { waitUntil: "load" });
      await waitForSettled(page);
      await page.getByRole("button", { name: /^Parent/ }).click({ timeout: 15000 });
      await page.waitForURL((url) => url.pathname.startsWith("/parent"), { timeout: 15000 });
      await waitForSettled(page);
      // A new household has no PIN: the gate offers to set one; Not now is remembered.
      const notNow = page.getByRole("button", { name: "Not now" });
      if (await notNow.count()) await notNow.first().click();
      await waitForSettled(page);
      const pin = page.locator("input[inputmode='numeric'], input[type='password']").first();
      await page.getByText("AI features").waitFor({ timeout: 20000 });
      await page.getByText("No key yet").waitFor({ timeout: 20000 });
      await shoot(page, "parent-key-off", viewport);
      await page.locator("#aikey-input").fill(process.env.ANTHROPIC_API_KEY);
      await page.getByRole("button", { name: "Check and save" }).click();
      await page.getByText(/Key ending in/).waitFor({ timeout: 30000 });
      console.log(`  key checked and saved (${viewport.name})`);
      await shoot(page, "parent-key-on", viewport);
      void pin;

      // 4. The debate room without a key: remove it, add an explorer, open the debate step.
      await page.getByRole("button", { name: "Remove key" }).click();
      await page.getByText("No key yet").waitFor({ timeout: 20000 });
      const db = await getDb();
      const hids = (await db.doc(`users/${SPEAK_UID}`).get()).data()?.householdIds ?? [];
      const hid = hids[0];
      await db.doc(`households/${hid}/profiles/${SPEAK_PID}`).set({ name: "Explorer", kind: "explorer", avatar: "fox", birthYear: 2017, seasonId: 1, look: "trail" });
      await page.goto(freshUrl("/"), { waitUntil: "load" });
      await waitForSettled(page);
      // The parent profile is still the stored active one, so the app lands on /parent; switch.
      if (page.url().includes("/parent")) {
        await page.getByRole("button", { name: "Switch profile" }).click({ timeout: 15000 });
        await waitForSettled(page);
      }
      await page.getByRole("button", { name: /^Explorer/ }).click({ timeout: 15000 });
      await page.waitForURL((url) => url.pathname.startsWith("/explorer"), { timeout: 15000 });
      await page.goto(freshUrl(`/explorer/quest/${DEBATE_QUEST_ID}?step=${DEBATE_STEP}`), { waitUntil: "load" });
      await waitForSettled(page);
      await page.getByRole("button", { name: "We debated it out loud" }).waitFor({ timeout: 20000 });
      await shoot(page, "debate-offline", viewport);
      await page.getByRole("button", { name: "We debated it out loud" }).click();
      await page.getByText("Done. You debated it out loud.").waitFor({ timeout: 20000 });
      console.log(`  offline debate recorded (${viewport.name})`);
      await page.waitForTimeout(2000);
      // The child's clock started on that first saved step.
      const started = (await db.doc(`households/${hid}/profiles/${SPEAK_PID}`).get()).data()?.startDate;
      console.log(`  profile startDate after first step: ${started}`);
      await page.close();
      // Clean up this run's household so the next viewport starts fresh.
      await db.recursiveDelete(db.doc(`households/${hid}`)).catch(() => undefined);
      await deleteUserDoc();
    }
  } finally {
    await teardownHousehold();
    await deleteUserDoc();
    await browser.close();
  }
  return 0;
}
run().then((code) => process.exit(code ?? 0)).catch((err) => { console.error(err); process.exit(1); });
