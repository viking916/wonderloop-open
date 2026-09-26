#!/usr/bin/env node
// quest-pending-screenshots.mjs: drives the real running app with Playwright to verify the
// loading-indicator work on the quest and Ladder screens (ProblemPlayer's Check, AskPanel's
// Send, PhotoCapture's "Use this photo", and LadderSession's "Start/Continue session" and its
// own round Check) against a scratch household seeded here, not against the developer's own
// data. Not part of the checked-in suite and not verify:ui -- an ad hoc, re-runnable check for
// this area of the app, kept (not deleted) because the same drive-and-screenshot shape is useful
// again whenever this area's pending behaviour changes.
//
// Throttles the network via CDP so a fast local emulator round trip still clears
// PENDING_SHOW_DELAY_MS (lib/pendingTiming.ts) and a spinner genuinely shows on screen, and maps
// the actual timeline around ProblemPlayer's Check button (see "1. Check an answer" below) to
// confirm the spinner and the think-time cooldown label never show at the same time -- a spinner
// on a cooldown would claim the app is working when it is deliberately waiting out the child's
// think time.
//
//   npx tsx --env-file=.env.development.local scripts/quest-pending-screenshots.mjs
// (tsx, not plain node: this script imports lib/ai/keys.ts directly to configure a real
// household AI key for the Ask verification below.)

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

const UID = "pending-quest-check-uid";
const HID = "pending-quest-check-household";
const PID = "pending-quest-check-explorer";
const EMAIL = "pending-quest-check@wonderloop.test";

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let adminAppPromise;
async function getAdminApp() {
  if (!adminAppPromise) {
    adminAppPromise = (async () => {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
      const { initializeApp, getApps } = await import("firebase-admin/app");
      return (
        getApps().find((a) => a.name === "pending-quest-check-admin") ??
        initializeApp({ projectId: "wonderloop-dev" }, "pending-quest-check-admin")
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
  await db.doc(`allowedEmails/${email}`).set({ note: "pending-verify screenshot identity", addedAt: Date.now() });
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
  await db.doc(`users/${UID}`).set({ displayName: "Pending Quest Check", householdIds: [HID] });
  await db.doc(`households/${HID}`).set({
    name: "Pending Quest Check",
    ownerUid: UID,
    memberUids: [UID],
    inviteCode: "PENDQ1",
    createdAt: Date.now(),
  });
  await db.doc(`households/${HID}/profiles/${PID}`).set({
    name: "Explorer",
    kind: "explorer",
    avatar: "fox",
    birthYear: 2016,
    seasonId: 1,
    startDate: mondayJustGone(),
    look: "trail",
  });
}

async function maybeConfigureAiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return false;
  const keys = await import("../lib/ai/keys.ts");
  if (!keys.looksLikeAnthropicKey(key)) return false;
  await keys.setHouseholdKey(HID, key, UID);
  return true;
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
        window.__pendingSignIn = async function (token) {
          const cred = await signInWithCustomToken(wonderloopAuth(), token);
          return cred.user.uid;
        };
        window.__pendingCheckUid = function () {
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
  return `${DEV_URL}${pathAndQuery}${sep}pendNav=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function waitForSettled(page) {
  try {
    await page.waitForSelector(".tr-loading", { state: "detached", timeout: 10000 });
  } catch {}
  await page.waitForTimeout(400);
}

async function signIn(page, bundle, token) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(freshUrl("/"), { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const uid = await page.evaluate((t) => window.__pendingSignIn(t), token);
    if (uid !== UID) throw new Error(`Signed in as unexpected uid: ${uid}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const confirmed = await page.evaluate(() => window.__pendingCheckUid());
    if (confirmed === UID) return;
    if (attempt === 4) throw new Error(`signIn never confirmed ${UID} (last saw ${confirmed})`);
  }
}

async function shoot(page, label, viewport) {
  const file = path.join(SCREENSHOT_DIR, `pending-${label}-${viewport}.png`);
  await page.screenshot({ path: file });
  console.log(`  saved ${file} (${fs.statSync(file).size} bytes)`);
}

async function throttle(page, latency = 700) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency,
    downloadThroughput: 200 * 1024,
    uploadThroughput: 200 * 1024,
  });
}

async function countAttempts(questId, problemId) {
  const db = await getDb();
  const snap = await db
    .collection(`households/${HID}/profiles/${PID}/attempts`)
    .where("questId", "==", questId)
    .where("problemId", "==", problemId)
    .get();
  return snap.size;
}

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("FIRESTORE_EMULATOR_HOST is not set."); return 1; }
  await teardownHousehold().catch(() => {});
  await ensureAllowlistedIdentity(UID, EMAIL);
  await createHousehold();
  const aiConfigured = await maybeConfigureAiKey();
  console.log(`AI key configured for this test household: ${aiConfigured}`);
  const token = await mintCustomToken(UID);
  const bundle = await buildSignInBundle();
  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  try {
    // ---- 1. Check an answer (ProblemPlayer), including a double-click no-double-submit check ----
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      page.on("console", (msg) => { if (msg.type() === "error") console.log(`  [console:error] ${msg.text()}`); });
      page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));
      await signIn(page, bundle, token);
      await page.goto(freshUrl("/"), { waitUntil: "load" });
      await waitForSettled(page);
      await page.getByRole("button", { name: /^Explorer/ }).click({ timeout: 10000 });
      await page.waitForURL((url) => url.pathname.startsWith("/explorer") && !url.pathname.includes("/quest"), { timeout: 10000 });
      await page.goto(freshUrl("/explorer/quest/s1-w01-think?step=0"), { waitUntil: "load" });
      await waitForSettled(page);
      try {
        await page.waitForSelector("text=What is 96 x 104?", { timeout: 15000 });
      } catch (err) {
        await shoot(page, "DEBUG-quest-load-fail", "1280x900");
        console.log("  DEBUG url:", page.url());
        console.log("  DEBUG body text:", (await page.locator("body").innerText()).slice(0, 1000));
        throw err;
      }
      await throttle(page, 1500);

      const input = page.locator("input").first();
      await input.fill("1");
      const checkBtn = page.getByRole("button", { name: /^Check$/ });
      // Double-click quickly: only one attempt must be recorded.
      const clickedAt = Date.now();
      await Promise.all([checkBtn.click(), checkBtn.click()]);

      // Map the actual timeline: when does the VISIBLE spinner render (isPending true for the
      // full PENDING_SHOW_DELAY_MS, per lib/pendingTiming.ts's useDelayedPending -- checked via
      // the .tr-btn__spinner node itself, not the tr-btn--pending class, since that class is set
      // the instant isPending flips true, well before the spinner is actually shown) versus when
      // the label flips to the cooldown wording ("Try again in ..."), the moment the attempts
      // listener has delivered the just-written attempt and the outcome -- and so the timed lock
      // -- is known. Firestore's web SDK applies a write to its local cache, and notifies any
      // listener watching an affected query, before that write's own Promise resolves (i.e.
      // before the server has acknowledged it) -- see lib/data/progress.ts's watchAttemptsForQuest
      // and ProblemPlayer.tsx's handleSubmit doc comment on exactly this gap. That local echo is
      // therefore not network-bound and cannot be slowed by the throttle above, while `busy`
      // (which keeps the button click-blocked and would drive the spinner) stays true only until
      // the REST of handleSubmit's awaited chain -- which is network-bound -- finishes. If the
      // cooldown wins that race before PENDING_SHOW_DELAY_MS elapses, no frame of "primary Check
      // with a visible spinner" can exist, on any network, and this script must say so rather
      // than fake one.
      const samples = [];
      for (let i = 0; i < 60; i++) {
        const btn = page.getByRole("button", { name: /^(Check|Try again in)/ }).first();
        const label = (await btn.textContent().catch(() => null))?.trim() ?? null;
        const spinnerVisible = (await btn.locator(".tr-btn__spinner").count().catch(() => 0)) > 0;
        samples.push({ t: Date.now() - clickedAt, label, spinnerVisible });
        if (label && label.startsWith("Try again in")) break;
        await page.waitForTimeout(15);
      }
      const firstSpinner = samples.find((s) => s.spinnerVisible);
      const firstCooldown = samples.find((s) => s.label && s.label.startsWith("Try again in"));
      console.log(`  timeline: visible spinner first seen at ${firstSpinner ? firstSpinner.t + "ms" : "never"}; cooldown label first seen at ${firstCooldown ? firstCooldown.t + "ms" : "never"} (spinner needs PENDING_SHOW_DELAY_MS = 120ms of continuous pending to render at all)`);
      const overlapSample = samples.find((s) => s.spinnerVisible && s.label === "Check");
      if (overlapSample) {
        console.log(`  a genuine "Check + visible spinner, no cooldown yet" frame exists (seen at ${overlapSample.t}ms) -- capturing it`);
        await shoot(page, "check-answer-midflight", "1280x900");
      } else {
        console.log(
          "  CONCLUSION: no frame exists where the primary Check button shows a visible spinner. " +
          "The wrong-answer outcome (and so the cooldown) is known via Firestore's local write echo " +
          `at ~${firstCooldown ? firstCooldown.t : "?"}ms, before the spinner's own ${120}ms anti-flicker delay could ` +
          "ever let it render -- this holds regardless of network speed, since only the server " +
          "acknowledgement (not the local echo) is throttled. No screenshot of this claim is produced; " +
          "see check-cooldown-no-spinner below for the (correct) evidence that the cooldown itself never " +
          "shows a spinner.",
        );
      }
      await page.waitForTimeout(3000);
      await waitForSettled(page);

      const attempts = await countAttempts("s1-w01-think", "s1-w01-think-01-p01");
      console.log(`  attempts recorded for the double-clicked problem: ${attempts} (must be 1)`);

      // The cooldown itself must never show a spinner or aria-busy (point 1 of the coordinator's
      // review): re-check once settled into the cooldown state.
      const cooldownBtn = page.getByRole("button", { name: /^Try again in/ });
      if (await cooldownBtn.count()) {
        const cls = await cooldownBtn.getAttribute("class");
        const ariaBusy = await cooldownBtn.getAttribute("aria-busy");
        console.log(`  cooldown control: has tr-btn--pending class = ${cls?.includes("tr-btn--pending")}, aria-busy = ${ariaBusy}`);
        await shoot(page, "check-cooldown-no-spinner", "1280x900");
      }

      // ---- 2. Ask (if this household has a real AI key) ----
      if (aiConfigured) {
        const askOpener = page.getByRole("button", { name: /Still stuck\? Ask/ });
        if (await askOpener.count()) {
          await askOpener.click();
          const askInput = page.getByPlaceholder("Ask about this problem");
          await askInput.fill("Why do we square 100 and 4 separately?");
          const sendBtn = page.getByRole("button", { name: /^Send$/ });
          await sendBtn.click();
          await page.waitForTimeout(200);
          const askPending = await page.locator("button.tr-btn--pending", { hasText: "Send" }).count();
          const thinking = await page.locator("text=Ask is thinking").count();
          console.log(`  Ask Send showing pending mid-flight: ${askPending > 0}; transcript "thinking" line: ${thinking > 0}`);
          await shoot(page, "ask-send-midflight", "1280x900");
          await page.waitForTimeout(8000);
          const reply = await page.locator(".tr-ask__bubble--tutor").count();
          console.log(`  Ask got a tutor reply after send: ${reply > 0}`);
        } else {
          console.log("  Ask opener not present (no miss recorded, or hints not authored) -- skipping Ask verification");
        }
      } else {
        console.log("  Skipping Ask verification: no ANTHROPIC_API_KEY available to configure a real household key.");
      }
      await page.close();
    }

    // ---- 3. Photo save (ArtifactStep + PhotoCapture), camera capture path via fake device ----
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      page.on("console", (msg) => { if (msg.type() === "error") console.log(`  [console:error] ${msg.text()}`); });
      page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));
      await signIn(page, bundle, token);
      await page.goto(freshUrl("/"), { waitUntil: "load" });
      await waitForSettled(page);
      await page.getByRole("button", { name: /^Explorer/ }).click({ timeout: 10000 });
      await page.waitForURL((url) => url.pathname.startsWith("/explorer") && !url.pathname.includes("/quest"), { timeout: 10000 });
      await page.goto(freshUrl("/explorer/quest/s1-w01-build?step=4"), { waitUntil: "load" });
      await waitForSettled(page);
      await throttle(page, 900);

      const takePhoto = page.getByRole("button", { name: "Take a photo" });
      await takePhoto.click();
      await page.waitForSelector("video.tr-photo__preview", { timeout: 10000 });
      await page.waitForTimeout(300);
      const snap = page.getByRole("button", { name: "Snap" });
      await snap.click();
      const useThisPhoto = page.getByRole("button", { name: "Use this photo" });
      await useThisPhoto.waitFor({ timeout: 5000 });
      await useThisPhoto.click();
      await page.waitForTimeout(200);
      const photoPending = await page.locator("button.tr-btn--pending", { hasText: "Use this photo" }).count();
      console.log(`  "Use this photo" showing pending mid-flight: ${photoPending > 0}`);
      await shoot(page, "photo-save-midflight", "1280x900");
      let saved = 0;
      try {
        await page.waitForSelector("text=/Saved: photo/", { timeout: 8000 });
        saved = 1;
      } catch {
        saved = await page.locator("text=/Saved: photo/").count();
      }
      console.log(`  photo recorded as saved after upload: ${saved > 0}`);
      await page.close();
    }

    // ---- 4. Ladder: Continue/Start session, and a round's Check ----
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      page.on("console", (msg) => { if (msg.type() === "error") console.log(`  [console:error] ${msg.text()}`); });
      page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));
      await signIn(page, bundle, token);
      await page.goto(freshUrl("/"), { waitUntil: "load" });
      await waitForSettled(page);
      await page.getByRole("button", { name: /^Explorer/ }).click({ timeout: 10000 });
      await page.waitForURL((url) => url.pathname.startsWith("/explorer") && !url.pathname.includes("/quest"), { timeout: 10000 });
      await page.goto(freshUrl("/explorer/ladder"), { waitUntil: "load" });
      await waitForSettled(page);
      await throttle(page, 900);

      const startBtn = page.getByRole("button", { name: /Start session|Continue session/ });
      await startBtn.waitFor({ timeout: 10000 });
      await startBtn.click();
      await page.waitForTimeout(150);
      const startPending = await page.locator("button.tr-btn--pending").count();
      console.log(`  Ladder start/continue button showing pending mid-flight: ${startPending > 0}`);
      await shoot(page, "ladder-start-midflight", "1280x900");
      await page.waitForTimeout(4000);
      await waitForSettled(page);
      try {
        await page.waitForSelector("text=Rendering...", { state: "detached", timeout: 8000 });
      } catch {}
      await page.waitForTimeout(500);

      // Placement (a fresh profile) shows a probe problem through the ordinary ProblemPlayer;
      // exercise its own Check the same way, whatever the problem's input kind turns out to be.
      const textInput = page.locator('input[type="text"], input:not([type])').first();
      const numberIsh = page.locator("input").first();
      const radio = page.getByRole("radio").first();
      const trueFalse = page.getByRole("button", { name: /^(True|False)$/ }).first();
      if (await radio.count()) {
        await radio.click();
      } else if (await trueFalse.count()) {
        await trueFalse.click();
      } else if (await textInput.count()) {
        await textInput.fill("1");
      } else if (await numberIsh.count()) {
        await numberIsh.fill("1");
      } else {
        console.log("  Ladder round: no recognizable input control found (order/grid kind) -- skipping this problem's Check");
        const buttons = await page.getByRole("button").allTextContents();
        console.log("  DEBUG buttons on screen:", JSON.stringify(buttons));
      }
      const roundCheck = page.getByRole("button", { name: /^Check$/ });
      if (await roundCheck.count()) {
        await roundCheck.click();
        await page.waitForTimeout(150);
        // Same ProblemPlayer component as section 1 above, so the same race applies: check for
        // the actual spinner node, not just the tr-btn--pending class, and name the screenshot
        // for what it actually shows rather than assuming "pending" happened to still be visible.
        const cooldownNow = page.getByRole("button", { name: /^Try again in/ });
        const stillCheck = page.getByRole("button", { name: /^Check$/ });
        const spinnerVisible = (await page.locator("button .tr-btn__spinner").count()) > 0;
        if (await cooldownNow.count()) {
          const ariaBusy = await cooldownNow.getAttribute("aria-busy");
          console.log(`  Ladder round: already in cooldown ("${(await cooldownNow.textContent())?.trim()}"), spinner visible = ${spinnerVisible}, aria-busy = ${ariaBusy}`);
          await shoot(page, "ladder-round-check-cooldown-no-spinner", "1280x900");
        } else if (await stillCheck.count()) {
          console.log(`  Ladder round: still reads "Check", spinner visible = ${spinnerVisible}`);
          await shoot(page, spinnerVisible ? "ladder-round-check-midflight" : "ladder-round-check-cooldown-no-spinner", "1280x900");
        } else {
          console.log("  Ladder round: moved on before either state could be captured");
        }
      } else {
        console.log("  Ladder round: no Check button found to exercise");
      }
      await page.close();
    }
  } finally {
    await teardownHousehold().catch(() => {});
    await browser.close();
  }
  return 0;
}
run().then((code) => process.exit(code ?? 0)).catch((err) => { console.error(err); process.exit(1); });
