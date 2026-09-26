#!/usr/bin/env node
// One-off verification for the 12 September 2026 Ladder round/break/done fix
// (components/ladder/LadderSession.tsx): screenshots the Ladder home screen (with its new
// "each round is retrieval, then the topic..." line), then answers a real round of topic
// problems correctly (reading each problem's authored answer straight out of
// content/ladder/topics/<topic>.json, keyed by the id the DOM's own h3 carries) so no answer
// is ever wrong and no 45s cooldown is ever hit, until the round actually closes into the break
// screen, and screenshots that too. Not a repeatable gate; a scratch tool for this one check.
//
// Run with the emulators up and `npm run dev` serving port 3000:
//   node --env-file=.env.development.local scripts/ladder-round-flow-screenshots.mjs

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

const UID = "ladder-flow-check-uid";
const HID = "ladder-flow-check-household";
const PID = "ladder-flow-check-explorer";
const EMAIL = "ladder-flow-check@wonderloop.test";
const TOPIC_ID = process.env.LADDER_TOPIC || "ar-multi-digit-multiplication";

const topicJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "content", "ladder", "topics", `${TOPIC_ID}.json`), "utf8"));
const PROBLEMS_BY_ID = new Map();
for (const p of [...topicJson.bank, ...(topicJson.stretch ?? [])]) PROBLEMS_BY_ID.set(p.id, p);

// Laptop-width polish + "skip the break" (15 September 2026): adapted to also capture the break
// screen at 1536x864 before and after pressing "Skip the break", and a round in progress at
// 1920x1080 (both new laptop-width viewports the earlier 1280x900/390x844 pair never covered).
// Responsive audit (23 September 2026): round-progress added at every audited viewport so the
// two-column problem split (docs/ui-styleguide.md section 6) can be checked on a real Ladder
// round, not just a quest problem.
const VIEWPORTS = [
  { name: "390x844", width: 390, height: 844, mode: "round-progress" },
  { name: "820x1180", width: 820, height: 1180, mode: "round-progress" },
  { name: "1180x820", width: 1180, height: 820, mode: "round-progress" },
  { name: "1024x768", width: 1024, height: 768, mode: "round-progress" },
  { name: "1280x720", width: 1280, height: 720, mode: "round-progress" },
  { name: "1366x768", width: 1366, height: 768, mode: "round-progress" },
  { name: "1440x900", width: 1440, height: 900, mode: "round-progress" },
  { name: "1536x864", width: 1536, height: 864, mode: "break-skip" },
  { name: "1920x1080", width: 1920, height: 1080, mode: "round-progress" },
  { name: "2560x1440", width: 2560, height: 1440, mode: "round-progress" },
];

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let adminAppPromise;
async function getAdminApp() {
  if (!adminAppPromise) {
    adminAppPromise = (async () => {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
      const { initializeApp, getApps } = await import("firebase-admin/app");
      return getApps().find((a) => a.name === "ladder-flow-admin") ?? initializeApp({ projectId: "wonderloop-dev" }, "ladder-flow-admin");
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
  await db.doc(`allowedEmails/${email}`).set({ note: "ladder round flow screenshot identity", addedAt: Date.now() });
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
  await db.doc(`users/${UID}`).set({ displayName: "Ladder Flow Check", householdIds: [HID] });
  await db.doc(`households/${HID}`).set({
    name: "Ladder Flow Check",
    ownerUid: UID,
    memberUids: [UID],
    inviteCode: "LFLOW1",
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
  // Placement already done, sat on the topic whose bank this script knows every answer for, so
  // the very first round is real retrieval-free topic practice, not a placement probe.
  await db.doc(`households/${HID}/profiles/${PID}/ladder/state`).set({
    startedAt: Date.now() - 86400000,
    sessionCount: 0,
    placementDone: true,
    currentTopic: TOPIC_ID,
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
        window.__ladderFlowSignIn = async function (token) {
          const cred = await signInWithCustomToken(wonderloopAuth(), token);
          return cred.user.uid;
        };
        window.__ladderFlowCheckUid = function () {
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
  return `${DEV_URL}${pathAndQuery}${sep}flowNav=${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    const uid = await page.evaluate((t) => window.__ladderFlowSignIn(t), token);
    if (uid !== UID) throw new Error(`Signed in as unexpected uid: ${uid}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const confirmed = await page.evaluate(() => window.__ladderFlowCheckUid());
    if (confirmed === UID) return;
    if (attempt === 4) throw new Error(`signIn never confirmed ${UID} (last saw ${confirmed})`);
  }
}

// Responsive audit (23 September 2026): matches polish-screenshots.mjs's own timeout bump -- on a
// loaded shared machine the picker's post-click wait was measured taking up to ~40s here, well
// past the 10s this was tuned for on a quiet machine.
async function selectProfile(page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await waitForSettled(page);
    if (page.url().includes("/explorer")) return;
    try {
      await page.getByRole("button", { name: /^Explorer/ }).click({ timeout: 20000 });
      await page.waitForURL((url) => url.pathname.startsWith("/explorer"), { timeout: 60000 });
      await waitForSettled(page);
      return;
    } catch (err) {
      if (attempt === 3) throw new Error(`selectProfile: never reached /explorer (stuck on ${page.url()}): ${err.message}`);
      await page.goto(freshUrl("/"), { waitUntil: "load" });
    }
  }
}

async function shoot(page, label, viewport) {
  const file = path.join(SCREENSHOT_DIR, `ladder-${label}-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved ${file} (${fs.statSync(file).size} bytes)`);
  return file;
}

/** Bubble-sorts the identity order into `targetOrder` (answer.order: target[pos] = item index
 * that belongs at pos), recording the adjacent-swap "Down" clicks (OrderInput's own swap(pos,+1))
 * needed to get there, each named by the item's own text so it can be replayed against the real
 * aria-labelled Up/Down buttons regardless of how they are laid out. */
function planOrderMoves(items, targetOrder) {
  const current = items.map((_, i) => i);
  const rank = new Map(targetOrder.map((idx, pos) => [idx, pos]));
  const moves = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < current.length - 1; i++) {
      if (rank.get(current[i]) > rank.get(current[i + 1])) {
        moves.push(items[current[i]]);
        [current[i], current[i + 1]] = [current[i + 1], current[i]];
        changed = true;
      }
    }
  }
  return moves;
}

/** Answers the problem currently on screen correctly, straight from its own authored answer, and
 * clicks Check. Returns the problem's kind, for logging. */
async function answerCorrectly(page, problem) {
  switch (problem.kind) {
    case "number": {
      await page.locator('input[name="answer"]').fill(problem.answer.value, { timeout: 5000 });
      break;
    }
    case "choice": {
      const optionText = problem.options[problem.answer.index];
      await page.getByRole("radio", { name: optionText, exact: true }).click();
      break;
    }
    case "truefalse": {
      await page.getByRole("radio", { name: problem.answer.value ? "True" : "False", exact: true }).click();
      break;
    }
    case "order": {
      const moves = planOrderMoves(problem.items, problem.answer.order);
      for (const text of moves) {
        await page.getByRole("button", { name: `Move "${text}" down` }).click();
      }
      break;
    }
    case "grid": {
      for (let r = 0; r < problem.rows.length; r++) {
        for (let c = 0; c < problem.cols.length; c++) {
          if (problem.answer.cells[r]?.[c]) {
            await page.locator(".tr-grid tbody tr").nth(r).locator("td button").nth(c).click();
          }
        }
      }
      break;
    }
    default:
      throw new Error(`answerCorrectly: no handler for problem kind ${problem.kind}`);
  }
  await page.getByRole("button", { name: "Check" }).click();
  return problem.kind;
}

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("ladder-round-flow-screenshots: FIRESTORE_EMULATOR_HOST is not set."); return 1; }
  await ensureAllowlistedIdentity(UID, EMAIL);
  const token = await mintCustomToken(UID);
  const bundle = await buildSignInBundle();
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const viewport of VIEWPORTS) {
      await teardownHousehold();
      await createHousehold();
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
      page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));
      await signIn(page, bundle, token);
      await selectProfile(page);

      // 1. The Ladder home screen, before any session -- the new "each round is retrieval, then
      // the topic, then one stretch problem" line should be on screen here. The primary reads
      // "Start session 1 of 3" (13 September 2026: the week is a plan of three sessions, finished
      // in order, never a weekday-bound "Start today's session").
      await page.goto(freshUrl("/explorer/ladder"), { waitUntil: "load" });
      await waitForSettled(page);
      await page.getByRole("button", { name: /^Start session/ }).waitFor({ timeout: 20000 });
      results.push(await shoot(page, "home-flow", viewport));

      // 2. Start the session. currentTopic is freshly set with no session recorded against it
      // yet, so the idea card opens first (beginRound's firstTimeToday branch).
      await page.getByRole("button", { name: /^Start session/ }).click();
      const ideaGotIt = page.getByRole("button", { name: "Got it" });
      const checkBtn = page.getByRole("button", { name: "Check" });
      await Promise.race([
        ideaGotIt.waitFor({ timeout: 20000 }),
        checkBtn.waitFor({ timeout: 20000 }),
      ]);
      if (await ideaGotIt.count()) {
        await ideaGotIt.click();
      }

      if (viewport.mode === "round-progress") {
        // Round in progress, laptop width (1920x1080): the idea card is answered ("Got it"), and
        // the very first real problem is on screen, unanswered -- ProblemPlayer's own middle
        // (figure/question/answer) plus right column (hint/timer/Ask once tries are used) layout,
        // reached without needing to finish the whole round.
        await waitForSettled(page);
        await page.locator('h3[id$="-title"]').first().waitFor({ timeout: 20000 });
        await waitForSettled(page);
        results.push(await shoot(page, "round-progress", viewport));
        console.log(`  [${viewport.name}] captured a round in progress`);
        await page.close();
        continue;
      }

      // 3. Answer every real problem in the round correctly (topic problems, then the one
      // stretch problem) until the round itself closes -- either into the break screen (rounds
      // remain today) or into the done screen (this was the last round of the day). A bounded
      // loop, not a polling wait: each iteration only proceeds once the next screen has actually
      // rendered. Detected by the break screen's own stable class (.ld-break), not its copy --
      // "skip the break" (15 September 2026) changed that sentence to say the break is optional.
      let reachedBreak = false;
      let reachedDone = false;
      let lastIdAttr = null;
      const MAX_PROBLEMS = 20;
      for (let i = 0; i < MAX_PROBLEMS; i++) {
        await waitForSettled(page);
        // Races three outcomes of clicking "Next step": the break screen, the done screen, or a
        // genuinely fresh problem heading (right after the click the previous problem's own h3
        // can still be briefly attached -- React 19 keeps old and new subtrees mounted for a
        // moment across the key change -- so this waits for the id to actually change, not just
        // for any h3[id$='-title'] to match).
        await Promise.race([
          page.locator(".ld-break").waitFor({ timeout: 20000 }),
          page.getByText("Done for now").waitFor({ timeout: 20000 }),
          page.waitForFunction(
            (prevId) => {
              const el = document.querySelector('h3[id$="-title"]');
              return Boolean(el) && el.id !== prevId;
            },
            lastIdAttr,
            { timeout: 20000 },
          ),
        ]);
        if (await page.locator(".ld-break").count()) { reachedBreak = true; break; }
        if (await page.getByText("Done for now").count()) { reachedDone = true; break; }
        const idAttr = await page.locator('h3[id$="-title"]').first().getAttribute("id");
        lastIdAttr = idAttr;
        const problemId = idAttr.replace(/-title$/, "");
        const problem = PROBLEMS_BY_ID.get(problemId);
        if (!problem) throw new Error(`No authored problem found for id ${problemId} in ${TOPIC_ID}.json`);
        let kind;
        try {
          kind = await answerCorrectly(page, problem);
        } catch (err) {
          const dumpPath = path.join(SCREENSHOT_DIR, `ladder-flow-debug-${viewport.name}-${i}.png`);
          await page.screenshot({ path: dumpPath, fullPage: true });
          console.log(`  DEBUG dump at ${dumpPath}; problemId=${problemId}; expected kind=${problem.kind}`);
          console.log(`  DEBUG body text: ${(await page.locator("body").innerText()).slice(0, 800)}`);
          throw err;
        }
        console.log(`  [${viewport.name}] answered ${problemId} (${kind})`);
        const nextStep = page.getByRole("button", { name: "Next step" });
        await nextStep.waitFor({ timeout: 20000 });
        await nextStep.click();
      }
      if (reachedBreak) {
        await waitForSettled(page);
        results.push(await shoot(page, "break-before-skip", viewport));
        console.log(`  [${viewport.name}] reached the break screen`);

        // "Skip the break" (15 September 2026): a quiet control on the break screen, visible only
        // while the break is still running, that collapses it to over right now without auto-
        // starting the next round -- "Next round" must read enabled afterward, still unclicked.
        const skipButton = page.getByRole("button", { name: "Skip the break" });
        await skipButton.waitFor({ timeout: 10000 });
        await skipButton.click();
        const nextRoundEnabled = page.getByRole("button", { name: "Next round", exact: true });
        await nextRoundEnabled.waitFor({ timeout: 10000 });
        if (await nextRoundEnabled.isDisabled()) throw new Error("Next round is still disabled after Skip the break");
        results.push(await shoot(page, "break-after-skip", viewport));
        console.log(`  [${viewport.name}] skipped the break; Next round reads enabled`);
      } else if (reachedDone) {
        console.log(`  [${viewport.name}] the round closed straight to done (no break today) -- see the note on screen`);
      } else {
        console.log(`  [${viewport.name}] did not reach break or done within ${MAX_PROBLEMS} problems`);
      }
      await page.close();
    }
  } finally {
    await teardownHousehold();
    await browser.close();
  }
  console.log("Saved:");
  for (const f of results) console.log(`  ${f}`);
  return 0;
}

run().then((code) => process.exit(code ?? 0)).catch((err) => { console.error(err); process.exit(1); });
