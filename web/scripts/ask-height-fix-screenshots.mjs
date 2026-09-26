#!/usr/bin/env node
// Photographs the 26 September 2026 height fix on Ask (maths, components/quest/AskPanel.tsx)
// and Builder Ask (Build/Make, components/quest/BuilderAskPanel.tsx) with a genuinely long,
// 14-message saved transcript on each (owner feedback: "AI chat keeps growing, making the screen
// appear weird height-wise"). Seeds the transcripts directly into the Firestore emulator (a
// dev-only shortcut; no real Anthropic call is ever made) at the same tutorChats/{...} documents
// AskPanel.tsx/BuilderAskPanel.tsx read on open, then opens each panel for real in the running
// app and screenshots it at the three viewports the brief asked for: 1366x768, 820x1180, 390x844.
//
// Also measures, for each screenshot: the page's own scrollHeight before and after opening the
// panel (must barely move, confirming the transcript no longer grows the page), and the
// .tr-ask__log element's own scrollHeight vs clientHeight vs scrollTop (confirming the transcript
// itself scrolls internally and is scrolled to its newest message).
//
//   node --env-file=.env.development.local scripts/ask-height-fix-screenshots.mjs

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

const UID = "ask-height-fix-check-uid";
const HID = "ask-height-fix-check-household";
const PID = "ask-height-fix-check-explorer";
const EMAIL = "ask-height-fix-check@wonderloop.test";

const THINK_QUEST_ID = "s1-w01-think";
const THINK_PROBLEM_ID = "s1-w01-think-01-p01";
const THINK_STEP_INDEX = 0;

const BUILD_QUEST_ID = "s1-w05-build";
const BUILD_STEP_ID = "s1-w05-build-04";

function loadQuest(relPath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "content", relPath), "utf8"));
}
const buildQuest = loadQuest(path.join("seasons", "1", "weeks", "05", "build.json"));
const BUILD_STEP_INDEX = buildQuest.steps.findIndex((s) => s.id === BUILD_STEP_ID);
if (BUILD_STEP_INDEX < 0) throw new Error(`step ${BUILD_STEP_ID} not found in ${BUILD_QUEST_ID}`);

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
        getApps().find((a) => a.name === "ask-height-fix-check-admin") ??
        initializeApp({ projectId: "wonderloop-dev" }, "ask-height-fix-check-admin")
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
  await db.doc(`allowedEmails/${email}`).set({ note: "ask height fix screenshot identity", addedAt: Date.now() });
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
function mondayJustGone() {
  const now = new Date();
  const back = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
  const pad = (n) => String(n).padStart(2, "0");
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

async function createHousehold() {
  const db = await getDb();
  await db.doc(`users/${UID}`).set({ displayName: "Ask Height Fix Check", householdIds: [HID] });
  await db.doc(`households/${HID}`).set({
    name: "Ask Height Fix Check",
    ownerUid: UID,
    memberUids: [UID],
    inviteCode: "ASKHFX1",
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
  // A fake, never-dialled key (StoredKey's enc:"none" shape, lib/ai/keys.ts): this only needs to
  // make getHouseholdKeyStatus report configured:true so AskPanel's aiOn gate opens and
  // /api/ai/health reads "on" -- nothing here ever calls the real Anthropic API, since this
  // script never presses Send, only opens a panel onto an already-seeded saved transcript.
  await db.doc(`households/${HID}/private/ai`).set({
    enc: "none",
    key: "sk-ant-fake-key-for-screenshot-only-0000000000",
    last4: "0000",
    addedAt: Date.now(),
    addedByUid: UID,
  });
  // A persisted firstSeenAt well in the past, so ProblemPlayer's "current cycle" filter
  // (lib/domain/attempts.ts's currentCycleProblemState) does not throw out the seeded attempt
  // below for having an `at` earlier than a freshly-created, this-instant fallback firstSeenAt.
  const firstSeenAt = Date.now() - 60 * 60 * 1000;
  await db.doc(`households/${HID}/profiles/${PID}/progress/${THINK_QUEST_ID}`).set({
    quest: { ticks: [], checklist: {}, problemOutcomes: {}, explains: {}, artifacts: {}, logs: [], debates: [] },
    problems: { [THINK_PROBLEM_ID]: { firstSeenAt } },
  });
  // One recorded wrong try on the Think problem, so AskPanel's own gate (hintsAuthored, at least
  // one miss, AI on) opens the "Still stuck? Ask" button at all.
  await db.collection(`households/${HID}/profiles/${PID}/attempts`).add({
    problemId: THINK_PROBLEM_ID,
    questId: THINK_QUEST_ID,
    answer: "1",
    correct: false,
    tryNumber: 1,
    hintTier: 0,
    ideaIds: [],
    revealed: false,
    retry: false,
    at: firstSeenAt + 60_000,
  });
}

/** A plausible, fake 14-message transcript (7 child, 7 tutor), long enough to prove the
 * transcript scrolls internally instead of growing the page. Content is illustrative only -- no
 * model was called to produce it. */
function fakeTranscript(childLine, tutorLine) {
  const messages = [];
  const now = Date.now() - 14 * 60_000;
  for (let i = 1; i <= 7; i++) {
    messages.push({ role: "child", text: `${childLine} (message ${i} of 7)`, at: now + i * 60_000 * 2 });
    messages.push({ role: "tutor", text: `${tutorLine} (reply ${i} of 7, this is the newest message once i = 7)`, at: now + i * 60_000 * 2 + 30_000 });
  }
  return messages;
}

async function seedTranscripts() {
  const db = await getDb();
  const askMessages = fakeTranscript(
    "I tried 96 times 100 but I am not sure what to do with the extra 4",
    "Good start. What does 96 times 4 come from in this problem",
  );
  await db.doc(`households/${HID}/profiles/${PID}/tutorChats/${THINK_QUEST_ID}__${THINK_PROBLEM_ID}`).set({
    questId: THINK_QUEST_ID,
    stepId: `${THINK_QUEST_ID}-01`,
    problemId: THINK_PROBLEM_ID,
    prompt: "What is 96 x 104?",
    messages: askMessages,
    updatedAt: Date.now(),
  });

  const builderMessages = fakeTranscript(
    "My square does not close, it ends up a bit short of where it started",
    "That is a turn amount problem. What turn time are you using right now",
  );
  await db.doc(`households/${HID}/profiles/${PID}/tutorChats/${BUILD_QUEST_ID}__step__${BUILD_STEP_ID}`).set({
    questId: BUILD_QUEST_ID,
    stepId: BUILD_STEP_ID,
    problemId: BUILD_STEP_ID,
    prompt: "Build the square and your letter in mBlock",
    kind: "step",
    messages: builderMessages,
    updatedAt: Date.now(),
  });
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
        window.__askHfSignIn = async function (token) {
          const cred = await signInWithCustomToken(wonderloopAuth(), token);
          return cred.user.uid;
        };
        window.__askHfCheckUid = function () {
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
  return `${DEV_URL}${pathAndQuery}${sep}askHfNav=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function waitForSettled(page) {
  try {
    await page.waitForSelector(".tr-loading", { state: "detached", timeout: 10000 });
  } catch {
    // ok: this route never rendered .tr-loading in the first place.
  }
  await page.waitForTimeout(400);
}

async function signIn(page, bundle, token) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(freshUrl("/"), { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const uid = await page.evaluate((t) => window.__askHfSignIn(t), token);
    if (uid !== UID) throw new Error(`Signed in as unexpected uid: ${uid}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const confirmed = await page.evaluate(() => window.__askHfCheckUid());
    if (confirmed === UID) return;
    if (attempt === 4) throw new Error(`signIn never confirmed ${UID} (last saw ${confirmed})`);
  }
}

/** Picks the (only) Explorer profile once, the same way a4-builder-ask-screenshots.mjs's own
 * selectProfile does -- a fresh sign-in lands on the profile picker, not directly on /explorer,
 * so every quest URL visited before this has ever run redirects straight back to the picker. */
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
  const file = path.join(SCREENSHOT_DIR, `ask-height-fix-${label}-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved ${file} (${fs.statSync(file).size} bytes)`);
}

/** Measures the page's own total height, and the transcript's own scroll state, so the console
 * log carries hard numbers alongside the screenshot rather than asking a reader to eyeball it. */
async function measure(page, label) {
  const result = await page.evaluate(() => {
    const log = document.querySelector(".tr-ask__log");
    const send = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Send");
    const sendRect = send ? send.getBoundingClientRect() : null;
    return {
      pageScrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      log: log
        ? {
            scrollHeight: log.scrollHeight,
            clientHeight: log.clientHeight,
            scrollTop: log.scrollTop,
            atBottom: log.scrollHeight - log.clientHeight - log.scrollTop <= 2,
          }
        : null,
      sendVisibleInViewport: sendRect ? sendRect.top >= 0 && sendRect.bottom <= window.innerHeight : null,
    };
  });
  console.log(`  [${label}] page scrollHeight=${result.pageScrollHeight}px (viewport ${result.viewportHeight}px)`);
  if (result.log) {
    console.log(
      `  [${label}] .tr-ask__log scrollHeight=${result.log.scrollHeight}px clientHeight=${result.log.clientHeight}px ` +
        `scrollTop=${result.log.scrollTop}px scrolledToNewest=${result.log.atBottom} ` +
        `(internal scroll engaged: ${result.log.scrollHeight > result.log.clientHeight})`,
    );
  } else {
    console.log(`  [${label}] .tr-ask__log not found (panel not open?)`);
  }
  console.log(`  [${label}] Send button fully visible without scrolling the page: ${result.sendVisibleInViewport}`);
  return result;
}

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("ask-height-fix-screenshots: FIRESTORE_EMULATOR_HOST is not set."); return 1; }
  await teardownHousehold().catch(() => {});
  await ensureAllowlistedIdentity(UID, EMAIL);
  await createHousehold();
  await seedTranscripts();
  const token = await mintCustomToken(UID);
  const bundle = await buildSignInBundle();
  const browser = await chromium.launch();
  try {
    for (const viewport of VIEWPORTS) {
      console.log(`== ${viewport.name} ==`);
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      page.on("console", (msg) => { if (msg.type() === "error") console.log(`  [console:error] ${msg.text()}`); });
      page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));
      await signIn(page, bundle, token);
      await selectProfile(page);

      // ---- Ask (maths), on the Think problem with a recorded miss ----
      await page.goto(freshUrl(`/explorer/quest/${THINK_QUEST_ID}?step=${THINK_STEP_INDEX}`), { waitUntil: "load" });
      await waitForSettled(page);
      const askOpener = page.getByRole("button", { name: "Still stuck? Ask" });
      try {
        await askOpener.waitFor({ state: "visible", timeout: 20000 });
      } catch (err) {
        await shoot(page, "DEBUG-ask-not-visible", viewport);
        console.log("  DEBUG url:", page.url());
        console.log("  DEBUG body text:", (await page.locator("body").innerText()).slice(0, 2000));
        throw err;
      }
      await measure(page, `ask-closed-${viewport.name}`);
      await askOpener.click();
      await page.waitForTimeout(1500);
      await measure(page, `ask-open-${viewport.name}`);
      await shoot(page, "01-ask-long-transcript", viewport);

      // ---- Builder Ask (Build/Make), on the mBlock task step ----
      await page.goto(freshUrl(`/explorer/quest/${BUILD_QUEST_ID}?step=${BUILD_STEP_INDEX}`), { waitUntil: "load" });
      await waitForSettled(page);
      const builderOpener = page.getByRole("button", { name: "Stuck? Ask" });
      await builderOpener.waitFor({ state: "visible", timeout: 20000 });
      await measure(page, `builder-closed-${viewport.name}`);
      await builderOpener.click();
      await page.waitForTimeout(1500);
      await measure(page, `builder-open-${viewport.name}`);
      await shoot(page, "02-builder-ask-long-transcript", viewport);

      await context.close();
    }
  } finally {
    await teardownHousehold().catch(() => {});
    await browser.close();
  }
  return 0;
}
run().then((code) => process.exit(code ?? 0)).catch((err) => { console.error(err); process.exit(1); });
