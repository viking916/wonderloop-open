#!/usr/bin/env node
// parent-tabs-screenshots.mjs -- photographs every tab of the restructured Parent view (15
// September 2026: a title area plus a role="tablist" of This week / Season plan / To review /
// Shopping / Settings, replacing one long stacked column) for the UI review pass.
//
// Run with the emulators up and `npm run dev` serving port 3000:
//   node --env-file=.env.development.local scripts/parent-tabs-screenshots.mjs
//
// Writes to the project-root docs/screenshots/ as parent-<tab>-<WxH>.png, at 1280x900, 1024x1366
// and 390x844. Season plan is shot twice, once per child (parent-plan-explorer /
// parent-plan-sprout), since the tab is child-scoped and the seeded household has one of each.
//
// Mechanics borrowed on purpose from scripts/polish-screenshots.mjs (signing in as the seeded
// owner via a firebase-admin custom token, selecting the parent profile, dismissing the PIN
// gate's "Not now") rather than reinvented, per docs/ui-styleguide.md section 7. Reads the
// household `npm run seed` already wrote (households/home, owner seed-parent-uid, profiles
// explorer/sprout/parent), so every tab shows real seeded content.

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

const OWNER_UID = "seed-parent-uid";
const OWNER_EMAIL = "parent-tabs-screenshots-owner@wonderloop.test";

// Responsive audit (23 September 2026): the laptop viewports the owner actually reported ("tablet
// style" at laptop widths), plus the iPad landscape/portrait pair and the phone, alongside the
// original 1280x900/1024x1366 set.
const VIEWPORTS = [
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1536x864", width: 1536, height: 864 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1280x900", width: 1280, height: 900 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1180x820", width: 1180, height: 820 },
  { name: "820x1180", width: 820, height: 1180 },
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
        getApps().find((a) => a.name === "parent-tabs-screenshots-admin") ??
        initializeApp({ projectId: "wonderloop-dev" }, "parent-tabs-screenshots-admin")
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
  await db.doc(`allowedEmails/${email}`).set({ note: "parent-tabs-screenshots identity", addedAt: Date.now() });
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
        window.__ptSignIn = async function (token) {
          const cred = await signInWithCustomToken(wonderloopAuth(), token);
          return cred.user.uid;
        };
        window.__ptCheckUid = function () {
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
  return `${DEV_URL}${pathAndQuery}${sep}ptNav=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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
}

async function signIn(page, bundle, token) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(freshUrl("/"), { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const uid = await page.evaluate((t) => window.__ptSignIn(t), token);
    if (uid !== OWNER_UID) throw new Error(`Signed in as unexpected uid: ${uid} (expected ${OWNER_UID})`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const confirmed = await page.evaluate(() => window.__ptCheckUid());
    if (confirmed === OWNER_UID) return;
    if (attempt === 4) throw new Error(`signIn never confirmed ${OWNER_UID} (last saw ${confirmed})`);
  }
}

// Responsive audit (23 September 2026): matches polish-screenshots.mjs's own timeout bump -- on a
// loaded shared machine the picker's post-click wait was measured taking up to ~40s here, well
// past the 10s this was tuned for on a quiet machine.
async function selectParentProfile(page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await waitForSettled(page);
    const tile = page.getByRole("button", { name: /^Parent/ });
    try {
      await tile.click({ timeout: 20000 });
      await page.waitForURL((url) => url.pathname.startsWith("/parent"), { timeout: 60000 });
      await waitForSettled(page);
      return;
    } catch (err) {
      if (attempt === 3) throw err;
      await page.goto(freshUrl("/"), { waitUntil: "load" });
    }
  }
}

async function shoot(page, name, viewport) {
  const file = path.join(SCREENSHOT_DIR, `parent-${name}-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved ${file} (${fs.statSync(file).size} bytes)`);
}

async function clickTab(page, label) {
  await page.getByRole("tab", { name: label, exact: true }).click({ timeout: 10000 });
  await waitForSettled(page);
  await page.waitForTimeout(150);
}

// Debugged 15 September 2026: a capture once showed "Nothing done yet" and every quest "Not
// started" for the seeded Explorer, while the Explorer's own This Week screen for the same
// household correctly showed Build done. Proved with a fine-grained sample loop (100ms ticks)
// that this is a race, not a page bug: waitForSettled only waits for the loading spinner and
// route-ready markers, but the Parent view's progress comes from a separate Firestore onSnapshot
// (lib/data/progress.ts's watchProgress) that starts only after ParentHome mounts and can resolve
// tens to a couple hundred ms after the tab already looks "settled". Reproduced the flip from
// "Nothing done yet" to "Build done" 3 of 4 runs, in the +100ms to +120ms window right after the
// moment this script used to shoot. The fix waits for the actual seeded text, not a duration
// (styleguide 8: "wait for the state, never for a duration").
async function waitForSeededWeekData(page) {
  await page.getByText("Build done", { exact: true }).waitFor({ timeout: 15000 });
}

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error(
      "parent-tabs-screenshots: FIRESTORE_EMULATOR_HOST is not set. Run with " +
        "`node --env-file=.env.development.local scripts/parent-tabs-screenshots.mjs` from web/.",
    );
    return 1;
  }

  console.log(`parent-tabs-screenshots: allowlisting ${OWNER_UID} (${OWNER_EMAIL})`);
  await ensureAllowlistedIdentity(OWNER_UID, OWNER_EMAIL);
  const token = await mintCustomToken(OWNER_UID);
  const bundle = await buildSignInBundle();

  const browser = await chromium.launch();
  try {
    for (const viewport of VIEWPORTS) {
      console.log(`\n=== viewport ${viewport.name} ===`);
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
      const page = await context.newPage();
      page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));
      await signIn(page, bundle, token);
      await selectParentProfile(page);

      const notNow = page.getByRole("button", { name: "Not now" });
      if ((await notNow.count()) > 0) {
        await notNow.first().click({ timeout: 10000 }).catch(() => {});
        await waitForSettled(page);
      }
      await page.getByRole("tablist", { name: "Parent view sections" }).waitFor({ timeout: 15000 });

      // "This week" is the default active tab on a fresh load. Progress arrives over a separate
      // Firestore listener that can still be in flight once the tab looks settled (see
      // waitForSeededWeekData's own comment), so wait for the real seeded content before
      // shooting -- every later shot in this run reuses the same already-mounted child sections,
      // so their progress is already in state by the time each tab is reached.
      await waitForSettled(page);
      await waitForSeededWeekData(page);
      await shoot(page, "week", viewport);

      // "Season plan" is child-scoped: the seeded household has one Explorer and one Sprout, so
      // this is shot once per child, switching with the real child-switcher buttons.
      await clickTab(page, "Season plan");
      await shoot(page, "plan-explorer", viewport);
      const sproutSwitch = page.getByRole("button", { name: "Sprout", exact: true });
      if ((await sproutSwitch.count()) > 0) {
        await sproutSwitch.first().click({ timeout: 10000 });
        await waitForSettled(page);
        await page.waitForTimeout(150);
        await shoot(page, "plan-sprout", viewport);
        // back to Explorer for the remaining child-scoped tabs, so "To review" shows the richer
        // Explorer content (mistake box, logs, debates, Ask transcripts).
        await page.getByRole("button", { name: "Explorer", exact: true }).click({ timeout: 10000 });
        await waitForSettled(page);
      }

      await clickTab(page, "To review");
      await shoot(page, "review", viewport);

      await clickTab(page, "Shopping");
      await shoot(page, "shopping", viewport);

      await clickTab(page, "Settings");
      await shoot(page, "settings", viewport);

      await context.close();
    }
  } finally {
    await browser.close();
  }
  return 0;
}

run()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    console.error("parent-tabs-screenshots: crashed", err);
    process.exit(1);
  });
