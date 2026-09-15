#!/usr/bin/env node
// polish-screenshots.mjs -- one reusable Playwright script that photographs every main screen of
// the app, full page, for a design polish pass.
//
// Run with the emulators up and `npm run dev` serving port 3000:
//   node --env-file=.env.development.local scripts/polish-screenshots.mjs
//   node --env-file=.env.development.local scripts/polish-screenshots.mjs --only=quest-problem,hill
//   node --env-file=.env.development.local scripts/polish-screenshots.mjs --viewports=1280x900,390x844
//
// Writes to the project-root docs/screenshots/ (not web/docs), as polish-<name>-<WxH>.png. The
// parent screen also gets sequential viewport-height tiles, polish-parent-tileNN-<WxH>.png, so a
// reviewer can read the whole page at a legible size.
//
// Mechanics borrowed on purpose, not reinvented (see docs/ui-styleguide.md section 7):
//   - scripts/verify-ui.mjs: signing in as the seeded owner via a firebase-admin custom token and
//     an esbuild-built sign-in bundle, selecting a profile, waiting for fonts/images, driving the
//     ProblemPlayer to a real correct-answer state.
//   - scripts/shopping-screenshots.mjs: getting past the Parent view PIN gate ("Not now").
//   - scripts/ladder-screenshots.mjs / ladder-round-flow-screenshots.mjs: the Ladder home and its
//     "Switch profile" round trip.
//
// This reads the household the project's own `npm run seed` already wrote (households/home,
// owner seed-parent-uid, profiles explorer/sprout/parent) rather than creating a throwaway one,
// so every screen shows the real seeded content (the finished Build quest, the half-answered
// Think quest, the mistake box) instead of an empty fresh household. The one interactive
// exception is quest-problem: the seeded Think quest already has its puzzle-of-week problem
// answered correctly, but if that ever changes, this answers it for real through the app's own
// Check button rather than assuming.
//
// Every screen is captured behind its own try/catch, so one failed screen never aborts the rest;
// a summary table of every file written (with byte sizes) prints at the end, plus a flag for any
// two captures at the same viewport that came out byte-identical -- a sign the state was never
// actually reached (docs/ui-styleguide.md section 8).

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

// The seeded identity (scripts/seed-emulators.ts), not a throwaway one: every screen here is
// meant to show real seeded content.
const OWNER_UID = "seed-parent-uid";
const HOUSEHOLD_ID = "home";
const OWNER_EMAIL = "polish-screenshots-owner@wonderloop.test";

const QUEST_THINK_ID = "s1-w01-think";
const QUEST_BUILD_ID = "s1-w01-build";
const SPROUT_ACTIVITY_ID = "sprout-w01-a1";

// Read straight from the authored content, not hardcoded, so a content reorder cannot silently
// point this at the wrong step or the wrong "correct" answer (mirrors verify-ui.mjs's own
// GENERATED_CONTENT lookup, and ladder-screenshots.mjs's direct content-file reads).
const thinkQuestPath = path.join(REPO_ROOT, "content", "seasons", "1", "weeks", "01", "think.json");
const thinkQuest = JSON.parse(fs.readFileSync(thinkQuestPath, "utf8"));
const PUZZLE_STEP_INDEX = thinkQuest.steps.findIndex((s) => s.kind === "puzzle-of-week");
if (PUZZLE_STEP_INDEX < 0) {
  throw new Error(`polish-screenshots: ${QUEST_THINK_ID} has no puzzle-of-week step`);
}
const puzzleProblem = thinkQuest.steps[PUZZLE_STEP_INDEX].problem;

const TILE_LABEL = { explorer: "Explorer", sprout: "Sprout", parent: "Parent" };

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// -------------------------------------------------------------------------------------------
// CLI args.
// -------------------------------------------------------------------------------------------

function parseArgs(argv) {
  let only = null;
  let viewports = [
    { name: "1280x900", width: 1280, height: 900 },
    { name: "390x844", width: 390, height: 844 },
  ];
  for (const arg of argv) {
    if (arg.startsWith("--only=")) {
      only = new Set(
        arg
          .slice("--only=".length)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } else if (arg.startsWith("--viewports=")) {
      viewports = arg
        .slice("--viewports=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((spec) => {
          const m = /^(\d+)x(\d+)$/.exec(spec);
          if (!m) throw new Error(`polish-screenshots: bad --viewports entry "${spec}", expected WxH (e.g. 1280x900)`);
          return { name: spec, width: Number(m[1]), height: Number(m[2]) };
        });
    } else {
      throw new Error(`polish-screenshots: unrecognized argument "${arg}"`);
    }
  }
  return { only, viewports };
}

const { only: ONLY, viewports: VIEWPORTS } = parseArgs(process.argv.slice(2));
function included(name) {
  return !ONLY || ONLY.has(name);
}

// -------------------------------------------------------------------------------------------
// Admin / sign-in plumbing, mirrored from scripts/verify-ui.mjs and scripts/shopping-screenshots.mjs.
// -------------------------------------------------------------------------------------------

let adminAppPromise;
async function getAdminApp() {
  if (!adminAppPromise) {
    adminAppPromise = (async () => {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
      const { initializeApp, getApps } = await import("firebase-admin/app");
      return (
        getApps().find((a) => a.name === "polish-screenshots-admin") ??
        initializeApp({ projectId: "wonderloop-dev" }, "polish-screenshots-admin")
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
  await db.doc(`allowedEmails/${email}`).set({ note: "polish-screenshots identity", addedAt: Date.now() });
}

async function mintCustomToken(uid) {
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(await getAdminApp()).createCustomToken(uid);
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
          try {
            connectAuthEmulator(auth, "http://${AUTH_EMULATOR_HOST}", { disableWarnings: true });
          } catch {}
          return auth;
        }
        window.__polishSignIn = async function (token) {
          const cred = await signInWithCustomToken(wonderloopAuth(), token);
          return cred.user.uid;
        };
        window.__polishCheckUid = function () {
          const auth = wonderloopAuth();
          if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
          return new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, (user) => {
              unsubscribe();
              resolve(user ? user.uid : null);
            });
            setTimeout(() => {
              unsubscribe();
              resolve(auth.currentUser ? auth.currentUser.uid : null);
            }, 5000);
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
  return `${DEV_URL}${pathAndQuery}${sep}polishNav=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Waits for real page state, never a guessed duration alone: the page-level loading indicator
// clearing, the "getting your trail ready" splash clearing, web fonts settled, and every <img>
// currently on the page finished loading or failing (mirrors verify-ui.mjs's checkCurrentPage).
async function waitForSettled(page) {
  try {
    await page.waitForSelector(".tr-loading", { state: "detached", timeout: 10000 });
  } catch {
    // ok: this route never rendered .tr-loading in the first place.
  }
  await page.waitForTimeout(300);
  for (let i = 0; i < 40; i++) {
    if ((await page.locator("text=Getting your trail ready").count()) === 0) break;
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page
    .evaluate(() =>
      Promise.all(
        Array.from(document.images).map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.addEventListener("load", resolve, { once: true });
                img.addEventListener("error", resolve, { once: true });
              }),
        ),
      ),
    )
    .catch(() => {});
}

// Waits past ProblemPlayer's own local "Getting this problem ready..." gate (verify-ui.mjs's
// waitForProblemHydrated), a different loading state than the page-level one above.
async function waitForProblemHydrated(page) {
  await page.waitForSelector(".tr-problem__wait", { state: "detached", timeout: 10000 }).catch(() => {});
}

async function signIn(page, bundle, token) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(freshUrl("/"), { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const uid = await page.evaluate((t) => window.__polishSignIn(t), token);
    if (uid !== OWNER_UID) throw new Error(`Signed in as unexpected uid: ${uid} (expected ${OWNER_UID})`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const confirmed = await page.evaluate(() => window.__polishCheckUid());
    if (confirmed === OWNER_UID) return;
    if (attempt === 4) throw new Error(`signIn never confirmed ${OWNER_UID} (last saw ${confirmed})`);
  }
}

async function returnToPicker(page) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await waitForSettled(page);
    await page.evaluate((hid) => window.localStorage.removeItem(`wonderloop:activeProfile:${hid}`), HOUSEHOLD_ID);
    await page.goto(freshUrl("/"), { waitUntil: "load" });
    await waitForSettled(page);
    if ((await page.locator(".tr-picker").count()) > 0) return;
    if (attempt === 4) throw new Error(`returnToPicker: .tr-picker never rendered (stuck on ${page.url()})`);
  }
}

async function selectProfile(page, kind) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await waitForSettled(page);
    const tile = page.getByRole("button", { name: new RegExp(`^${TILE_LABEL[kind]}`) });
    try {
      await tile.click({ timeout: 10000 });
      await page.waitForURL((url) => url.pathname.startsWith(`/${kind}`), { timeout: 10000 });
      await waitForSettled(page);
      return;
    } catch (err) {
      if (attempt === 3) throw err;
      await page.goto(freshUrl("/"), { waitUntil: "load" });
    }
  }
}

// -------------------------------------------------------------------------------------------
// Capture bookkeeping.
// -------------------------------------------------------------------------------------------

const results = []; // { name, viewport, file, bytes, ok, error }

async function shoot(page, name, viewport) {
  const file = path.join(SCREENSHOT_DIR, `polish-${name}-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const bytes = fs.statSync(file).size;
  results.push({ name, viewport: viewport.name, file, bytes, ok: true });
  console.log(`  saved ${file} (${bytes} bytes)`);
  return file;
}

async function attempt(name, viewport, fn) {
  if (!included(name)) return;
  try {
    await fn();
  } catch (err) {
    results.push({ name, viewport: viewport.name, file: null, bytes: null, ok: false, error: err.message });
    console.error(`  [FAILED] ${name} @ ${viewport.name}: ${err.message}`);
  }
}

// -------------------------------------------------------------------------------------------
// Screen groups. Grouped by which profile has to be selected first, so switching profiles only
// happens once per group even when several of that group's screens are requested; a failure to
// reach the group's profile marks every screen in it failed and moves on to the next group
// rather than aborting the whole run.
// -------------------------------------------------------------------------------------------

async function pickerGroup(page, viewport) {
  await attempt("picker", viewport, async () => {
    await returnToPicker(page);
    await shoot(page, "picker", viewport);
  });
}

async function explorerGroup(page, viewport) {
  const names = ["this-week", "quest-step0", "quest-problem", "quest-build", "ladder", "portfolio", "skills", "review"];
  if (!names.some(included)) return;
  try {
    await returnToPicker(page);
    await selectProfile(page, "explorer");
  } catch (err) {
    for (const n of names) {
      if (included(n)) results.push({ name: n, viewport: viewport.name, file: null, bytes: null, ok: false, error: `could not reach explorer profile: ${err.message}` });
    }
    console.error(`  [FAILED] explorer group @ ${viewport.name}: ${err.message}`);
    return;
  }

  await attempt("this-week", viewport, async () => {
    await page.goto(freshUrl("/explorer"), { waitUntil: "load" });
    await waitForSettled(page);
    await shoot(page, "this-week", viewport);
  });

  await attempt("quest-step0", viewport, async () => {
    await page.goto(freshUrl(`/explorer/quest/${QUEST_THINK_ID}?step=0`), { waitUntil: "load" });
    await waitForSettled(page);
    await waitForProblemHydrated(page);
    await shoot(page, "quest-step0", viewport);
  });

  await attempt("quest-problem", viewport, async () => {
    await page.goto(freshUrl(`/explorer/quest/${QUEST_THINK_ID}?step=${PUZZLE_STEP_INDEX}`), { waitUntil: "load" });
    await waitForSettled(page);
    await waitForProblemHydrated(page);
    // The seeded Think quest already has this puzzle answered correctly, so this step normally
    // already lands on the explanation state. If a future reseed ever changes that, answer it
    // for real through the app's own Check button rather than assuming.
    if ((await page.locator(".tr-explanation").count()) === 0) {
      const correctIndex = puzzleProblem.answer.index;
      await page.getByRole("radio").nth(correctIndex).click({ timeout: 15000 });
      const tried = page.locator(".tr-tried input");
      if ((await tried.count()) > 0) {
        await tried.fill("Tried it and worked through it step by step.", { timeout: 5000 }).catch(() => {});
      }
      await page.getByRole("button", { name: "Check", exact: true }).click({ timeout: 15000 });
      await page.waitForSelector(".tr-explanation", { timeout: 15000 });
      await waitForSettled(page);
    }
    await shoot(page, "quest-problem", viewport);
  });

  await attempt("quest-build", viewport, async () => {
    await page.goto(freshUrl(`/explorer/quest/${QUEST_BUILD_ID}?step=0`), { waitUntil: "load" });
    await waitForSettled(page);
    await shoot(page, "quest-build", viewport);
  });

  await attempt("ladder", viewport, async () => {
    await page.goto(freshUrl("/explorer/ladder"), { waitUntil: "load" });
    await waitForSettled(page);
    // The Ladder home has no page-level ".tr-loading" gate of its own, so waitForSettled alone can
    // beat its data (topics/skills) by a render or two on a warm route -- the earlier symptom was
    // a blank .ld-main capture. Wait for real content inside it, the same "wait for the state,
    // never a duration" rule docs/ui-styleguide.md section 8 already applies elsewhere here.
    await page.waitForSelector(".ld-main > *", { timeout: 10000 }).catch(() => {});
    await shoot(page, "ladder", viewport);
  });

  await attempt("portfolio", viewport, async () => {
    await page.goto(freshUrl("/explorer/portfolio"), { waitUntil: "load" });
    await waitForSettled(page);
    await shoot(page, "portfolio", viewport);
  });

  await attempt("skills", viewport, async () => {
    await page.goto(freshUrl("/explorer/skills"), { waitUntil: "load" });
    await waitForSettled(page);
    await shoot(page, "skills", viewport);
  });

  await attempt("review", viewport, async () => {
    await page.goto(freshUrl("/explorer/review"), { waitUntil: "load" });
    await waitForSettled(page);
    await shoot(page, "review", viewport);
  });
}

async function sproutGroup(page, viewport) {
  const names = ["hill", "activity"];
  if (!names.some(included)) return;
  try {
    await returnToPicker(page);
    await selectProfile(page, "sprout");
  } catch (err) {
    for (const n of names) {
      if (included(n)) results.push({ name: n, viewport: viewport.name, file: null, bytes: null, ok: false, error: `could not reach sprout profile: ${err.message}` });
    }
    console.error(`  [FAILED] sprout group @ ${viewport.name}: ${err.message}`);
    return;
  }

  await attempt("hill", viewport, async () => {
    await page.goto(freshUrl("/sprout"), { waitUntil: "load" });
    await waitForSettled(page);
    // The hill has no tap-to-start gate today, but capture the real state and not the gate if
    // one is ever added here (docs/ui-styleguide.md section 8: "a screen behind a gesture is not
    // covered until something performs the gesture").
    const gate = page.locator("button.sp-start");
    if ((await gate.count()) > 0 && (await gate.first().isVisible().catch(() => false))) {
      await gate.first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForSelector(".sp-intro", { state: "detached", timeout: 10000 }).catch(() => {});
      await waitForSettled(page);
    }
    await shoot(page, "hill", viewport);
  });

  await attempt("activity", viewport, async () => {
    await page.goto(freshUrl(`/sprout/activity/${SPROUT_ACTIVITY_ID}`), { waitUntil: "load" });
    await waitForSettled(page);
    const start = page.locator("button.sp-start");
    if ((await start.count()) > 0) {
      await start.first().click();
      // Wait for the intro to actually give way to the round, never a guessed delay: the player
      // speaks the intro first and only then switches to the round.
      await page.waitForSelector(".sp-intro", { state: "detached", timeout: 10000 }).catch(() => {});
      await waitForSettled(page);
    }
    await shoot(page, "activity", viewport);
  });
}

async function parentGroup(page, viewport) {
  if (!included("parent")) return;
  try {
    await returnToPicker(page);
    await selectProfile(page, "parent");
  } catch (err) {
    results.push({ name: "parent", viewport: viewport.name, file: null, bytes: null, ok: false, error: `could not reach parent profile: ${err.message}` });
    console.error(`  [FAILED] parent group @ ${viewport.name}: ${err.message}`);
    return;
  }

  await attempt("parent", viewport, async () => {
    const notNow = page.getByRole("button", { name: "Not now" });
    if ((await notNow.count()) > 0) {
      await notNow.first().click({ timeout: 10000 }).catch(() => {});
      await waitForSettled(page);
    }
    await shoot(page, "parent", viewport);

    // Sequential viewport-height tiles of the same full page, so a reviewer can read the parent
    // view at a legible size instead of a squashed full-page PNG.
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const tileCount = Math.max(1, Math.ceil(scrollHeight / viewport.height));
    for (let i = 0; i < tileCount; i++) {
      const y = i * viewport.height;
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      // Two animation frames, not a fixed sleep: enough for the browser to have painted the new
      // scroll position before the screenshot reads it.
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const num = String(i + 1).padStart(2, "0");
      const file = path.join(SCREENSHOT_DIR, `polish-parent-tile${num}-${viewport.name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      const bytes = fs.statSync(file).size;
      results.push({ name: `parent-tile${num}`, viewport: viewport.name, file, bytes, ok: true });
      console.log(`  saved ${file} (${bytes} bytes)`);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
  });
}

async function styleGroup(page, viewport) {
  await attempt("style", viewport, async () => {
    await page.goto(freshUrl("/style"), { waitUntil: "load" });
    await waitForSettled(page);
    await shoot(page, "style", viewport);
  });
}

// -------------------------------------------------------------------------------------------
// Summary.
// -------------------------------------------------------------------------------------------

function printSummary() {
  console.log("\n=== polish-screenshots: files written ===");
  const nameWidth = Math.max(4, ...results.map((r) => r.name.length));
  for (const r of results) {
    if (r.ok) {
      console.log(`  ${r.name.padEnd(nameWidth)}  ${r.viewport.padEnd(10)}  ${String(r.bytes).padStart(9)} bytes  ${r.file}`);
    } else {
      console.log(`  ${r.name.padEnd(nameWidth)}  ${r.viewport.padEnd(10)}  FAILED: ${r.error}`);
    }
  }

  console.log("\n=== polish-screenshots: duplicate byte-size check ===");
  const byViewport = new Map();
  for (const r of results.filter((r) => r.ok)) {
    if (!byViewport.has(r.viewport)) byViewport.set(r.viewport, []);
    byViewport.get(r.viewport).push(r);
  }
  let flagged = false;
  for (const [vp, list] of byViewport) {
    const bySize = new Map();
    for (const r of list) {
      if (!bySize.has(r.bytes)) bySize.set(r.bytes, []);
      bySize.get(r.bytes).push(r);
    }
    for (const [size, group] of bySize) {
      if (group.length > 1) {
        flagged = true;
        console.log(`  [SUSPECT] ${vp}: ${group.map((g) => g.name).join(", ")} all ${size} bytes -- possible identical/unreached state`);
      }
    }
  }
  if (!flagged) console.log("  none: every capture at each viewport has a distinct byte size.");

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`\n=== polish-screenshots: ${failed.length} capture(s) could not be reached ===`);
    for (const f of failed) console.log(`  ${f.name} @ ${f.viewport}: ${f.error}`);
  }

  return failed.length;
}

// -------------------------------------------------------------------------------------------
// Runner.
// -------------------------------------------------------------------------------------------

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error(
      "polish-screenshots: FIRESTORE_EMULATOR_HOST is not set. Run with " +
        "`node --env-file=.env.development.local scripts/polish-screenshots.mjs` from web/.",
    );
    return 1;
  }

  console.log(`polish-screenshots: allowlisting ${OWNER_UID} (${OWNER_EMAIL})`);
  await ensureAllowlistedIdentity(OWNER_UID, OWNER_EMAIL);
  const token = await mintCustomToken(OWNER_UID);
  const bundle = await buildSignInBundle();

  const browser = await chromium.launch();
  try {
    for (const viewport of VIEWPORTS) {
      console.log(`\n=== viewport ${viewport.name} ===`);
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));
      await signIn(page, bundle, token);

      await pickerGroup(page, viewport);
      await explorerGroup(page, viewport);
      await sproutGroup(page, viewport);
      await parentGroup(page, viewport);
      await styleGroup(page, viewport);

      await context.close();
    }
  } finally {
    await browser.close();
  }

  const failedCount = printSummary();
  return failedCount > 0 ? 1 : 0;
}

run()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    console.error("polish-screenshots: crashed", err);
    process.exit(1);
  });
