#!/usr/bin/env node
// Photographs an explanation figure (7 September 2026, the owner's week-one catch: fractions
// need a picture in the explanation): answers season 1 week 1's first skills-lane problem
// correctly so the worked explanation opens with its bars underneath.
//
//   node --env-file=.env.development.local scripts/expfig-screenshots.mjs

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

const SPEAK_UID = "expfig-check-uid";
const SPEAK_HID = "expfig-check-household";
const SPEAK_PID = "expfig-check-explorer";
const SPEAK_EMAIL = "expfig-check@wonderloop.test";

const QUEST_ID = "s1-w01-think";
const SEASON = 1;
const WEEK = 1;

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
      return getApps().find((a) => a.name === "expfig-check-admin") ?? initializeApp({ projectId: "wonderloop-dev" }, "expfig-check-admin");
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
    await auth.getUser(uid);
  } catch (err) {
    if (err?.code === "auth/user-not-found") await auth.createUser({ uid, email });
    else throw err;
  }
  const db = await getDb();
  await db.doc(`allowedEmails/${email}`).set({ note: "explanation figure screenshot identity", addedAt: Date.now() });
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

/** A fresh household: an Explorer with the Play track on, placed in the wanted week, and a parent. */
async function createHousehold() {
  const db = await getDb();
  await db.doc(`users/${SPEAK_UID}`).set({ displayName: "Explanation Figure Check", householdIds: [SPEAK_HID] });
  await db.doc(`households/${SPEAK_HID}`).set({
    name: "Explanation Figure Check",
    ownerUid: SPEAK_UID,
    memberUids: [SPEAK_UID],
    inviteCode: "EXPFG1",
    createdAt: Date.now(),
  });
  await db.doc(`households/${SPEAK_HID}/profiles/${SPEAK_PID}`).set({
    name: "Explorer",
    kind: "explorer",
    avatar: "fox",
    birthYear: 2017,
    seasonId: SEASON,
    startDate: mondayWeeksAgo(WEEK - 1),
    look: "trail",
    playTrack: true,
  });
  await db.doc(`households/${SPEAK_HID}/profiles/${SPEAK_PID}-parent`).set({
    name: "Parent",
    kind: "parent",
    avatar: "owl",
    birthYear: 1985,
    seasonId: SEASON,
    startDate: mondayWeeksAgo(WEEK - 1),
    look: "trail",
  });
}

function mondayWeeksAgo(weeks) {
  const now = new Date();
  const back = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back - 7 * weeks);
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

async function pickProfile(page, name) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await waitForSettled(page);
    const wanted = name === "Parent" ? "/parent" : "/explorer";
    if (page.url().includes(wanted)) return;
    if (/\/(explorer|parent)/.test(page.url())) {
      await page.getByRole("button", { name: "Switch profile" }).click({ timeout: 15000 });
      await waitForSettled(page);
    }
    try {
      await page.getByRole("button", { name: new RegExp(`^${name}`) }).click({ timeout: 10000 });
      await page.waitForURL((url) => url.pathname.startsWith(wanted), { timeout: 10000 });
      await waitForSettled(page);
      return;
    } catch (err) {
      if (attempt === 3) throw new Error(`pickProfile(${name}): stuck on ${page.url()}: ${err.message}`);
      await page.goto(freshUrl("/"), { waitUntil: "load" });
    }
  }
}

async function shoot(page, label, viewport) {
  const file = path.join(SCREENSHOT_DIR, `expfig-${label}-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved ${file} (${fs.statSync(file).size} bytes)`);
}

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("expfig-screenshots: FIRESTORE_EMULATOR_HOST is not set."); return 1; }
  const quest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "content", "seasons", "1", "weeks", "01", "think.json"), "utf8"));
  const stepIndex = quest.steps.findIndex((s) => s.kind === "problem-set" && s.lane === "skills");
  const problems = quest.steps[stepIndex].problems;
  const figureAt = problems.findIndex((p) => p.explanationFigure);
  if (figureAt < 0) throw new Error("expfig-screenshots: no problem in the skills lane carries an explanationFigure");
  await ensureAllowlistedIdentity(SPEAK_UID, SPEAK_EMAIL);
  const token = await mintCustomToken(SPEAK_UID);
  const bundle = await buildSignInBundle();
  const browser = await chromium.launch();
  try {
    for (const viewport of VIEWPORTS) {
      await teardownHousehold();
      await createHousehold();
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
      page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));
      await signIn(page, bundle, token);
      await pickProfile(page, "Explorer");
      await page.goto(freshUrl(`/explorer/quest/${QUEST_ID}?step=${stepIndex}`), { waitUntil: "load" });
      await waitForSettled(page);
      // Walk to the first problem that carries an explanation figure, answering each one
      // correctly on the way (choice problems by option index, number problems by value).
      for (let i = 0; i <= figureAt; i++) {
        const p = problems[i];
        await page.getByRole("button", { name: "Check" }).waitFor({ timeout: 20000 });
        if (p.kind === "choice") await page.locator('[role="radio"]').nth(p.answer.index).click();
        else if (p.kind === "number") await page.getByRole("textbox").first().fill(String(p.answer.value));
        else throw new Error(`expfig-screenshots: cannot answer a ${p.kind} problem (${p.id})`);
        await page.getByRole("button", { name: "Check" }).click();
        await page.getByText("How it works").waitFor({ timeout: 20000 });
        if (i < figureAt) {
          await page.getByRole("button", { name: "Next problem" }).click();
          await page.waitForTimeout(300);
        }
      }
      await page.locator(".tr-explanation .tr-figure").first().waitFor({ timeout: 15000 });
      await page.waitForTimeout(400);
      await shoot(page, "explained", viewport);
      console.log(`  explanation figure on screen (${viewport.name})`);
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
