#!/usr/bin/env node
// verify-ui.mjs -- Plan 2 Task 14's checked UI gate.
//
// Drives a headless Chromium against the already-running dev server (npm run dev, port 3000)
// with the emulators already seeded (npm run emulators + npm run seed), visits every route this
// app has for each profile kind -- including every one of the season's 12 weeks (via the real
// <select id="tr-week-select">) and every step of a quest, not just its landing step -- captures
// both viewports, and fails the run (non-zero exit) if it finds any of:
//   - text below 4.5:1 contrast against its *actual rendered background* (composited through
//     however many ancestor backgrounds sit behind it, not just the page background -- this is
//     the check that should have caught the forest-on-forest card title bug: see the design
//     note in the block comment below effectiveBackground()). A control is exempt only when it
//     is genuinely inactive (see isInactiveControl()'s own comment), not merely wearing
//     aria-disabled.
//   - a <button> with no explicit CSS `color` (relying on inherited color is exactly how a
//     button goes invisible the moment it is reused on a differently-coloured surface).
//   - a link styled to look like a button (an <a class="tr-btn ...">, the only way this app
//     renders one -- see components/ui/Button.tsx) that still shows an underline.
//   - real horizontal overflow past the viewport, measured from element geometry rather than
//     document.scrollingElement.scrollWidth (see the design note above the horizontal-overflow
//     check: scrollWidth cannot ever fire in this app once overflow-x: hidden is set on
//     html/body, which it is).
//   - a console error or an uncaught page exception.
//   - a named interaction state (the ProblemPlayer's wrong-answer or correct-answer state) that
//     did not actually reach the state it is named for and fell back to screenshotting whatever
//     was already on screen -- reported as `coverage-degraded` (see pushCoverageDegraded below)
//     rather than being silently absorbed into a clean pass.
//   - a visual regression: a committed baseline PNG (docs/visual-baselines/) for one of the
//     screens in VISUAL_TARGETS differs from this run's fresh screenshot by more than
//     PIXEL_DIFF_THRESHOLD's tolerance -- reported as `visual-regression`, with a diff image
//     written to docs/visual-diffs/ showing exactly what changed. See the block comment above
//     VISUAL_TARGETS for what this can and cannot catch, and the one above compareToBaseline for
//     the threshold and everything done to keep it from being flaky.
//

// Task 14 review (2026-08-28) found the gate's route table frozen to week 1 of season 1 and
// step 0 of one quest -- exactly the "only week 1 was ever looked at" blind spot that shipped
// the original forest-on-forest bug -- plus a horizontal-overflow check that was dead code by
// construction. Both are fixed here; see the route table and runAllViewports below. A follow-up
// re-review then found that the two ProblemPlayer interaction states could themselves silently
// degrade to plain-landing-state coverage with no distinguishing signal if the drive logic ever
// failed against future content -- fixed via the `coverage-degraded` finding above.
//
// Task 1b (repeatability): running this gate repeatedly used to make its own `coverage-degraded`
// finding above start firing for reasons that had nothing to do with the app -- submitting real
// answers against the seeded "home" household persisted them (npm run seed is upsert-only, so
// it can never remove them), until every problem in the exercised step had already been
// answered correctly and a fresh correct answer could no longer be submitted. The two
// ProblemPlayer interaction checks now run against their own isolated sweep household instead
// (SWEEP_UID/SWEEP_HID below), created fresh immediately before use and deleted once the whole
// run finishes -- see visitProblemPlayerInteractions and run(). Every other check in this file
// still reads the real seeded "home" household exactly as before.
//
// This is a checked gate, not a demo: it exits 1 and prints every offending selector (plus
// route and viewport) when it finds something, and exits 0 only when every route is clean.
//
// Sign-in: the app only offers Google sign-in via signInWithPopup (components/SignIn.tsx), and
// the seeded household (scripts/seed-emulators.ts) is owned by a fixed Auth uid,
// "seed-parent-uid". Driving the real popup widget would sign in as some *other*, freshly
// emulator-minted uid with no seeded household, defeating the point of seeded data. Instead this
// script uses firebase-admin to mint a custom token for "seed-parent-uid" (emulator-only: it
// talks to FIREBASE_AUTH_EMULATOR_HOST, never a real project) and redeems it client-side with
// signInWithCustomToken, using the app's own persistence layer (IndexedDB, same apiKey/appName)
// so a plain page reload afterwards makes the app's own session code pick it up exactly as if a
// it had come back from a real popup.

import { chromium } from "playwright";
import esbuild from "esbuild";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { EMULATOR_PORTS } from "../lib/firebase/emulator-ports.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SCREENSHOT_DIR = path.join(REPO_ROOT, "docs", "screenshots");
const DEV_URL = process.env.VERIFY_UI_URL ?? "http://localhost:3000";
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? `localhost:${EMULATOR_PORTS.auth}`;
const STORAGE_EMULATOR_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? `localhost:${EMULATOR_PORTS.storage}`;
const EMULATOR_UI_HOST = process.env.VERIFY_UI_EMULATOR_UI_HOST ?? `localhost:${EMULATOR_PORTS.ui}`;
const PROJECT_ID = "wonderloop-dev";

// -------------------------------------------------------------------------------------------
// Visual regression (Task 25). Library choice: pixelmatch + pngjs. pixelmatch is the de facto
// standard for pixel-level PNG comparison in Node (used by Playwright's and Jest's own
// image-snapshot tooling); it does its comparison in YIQ colour space with built-in
// anti-aliased-pixel detection (the `includeAA` option, left at its default `false` here), which
// is exactly "tolerate antialiasing, not a real change" without any hand-rolled fuzzing. pngjs is
// its natural pairing -- a pure-JS PNG decoder/encoder with no native build step (this machine
// already needed a working Playwright/Chromium install; a second native dependency is pure risk
// for no gain) -- and is pixelmatch's own documented way to read/write the buffers it operates
// on. Together they add two small, dependency-light packages instead of a browser-based
// screenshot-diff service or a native image library.
//
// docs/visual-baselines/ is the approved appearance, committed to the repo (never generated by a
// normal run: see UPDATE_BASELINES below). docs/visual-diffs/ is scratch output, gitignored (its
// own .gitignore in that directory) -- it exists only so a human can look at *this run's* failure
// at a glance, and is wiped and rewritten every run, never accumulated.
// -------------------------------------------------------------------------------------------
const BASELINE_DIR = path.join(REPO_ROOT, "docs", "visual-baselines");
const DIFF_DIR = path.join(REPO_ROOT, "docs", "visual-diffs");
const UPDATE_BASELINES = process.argv.includes("--update-baselines");

// Task 25 determinism, found the hard way during this task's own development: computeFrozenNow
// (near getSweepDb below) proved, by direct instrumentation, that the browser's Date.now() reads
// correctly frozen at the one point that was checked -- and a baseline was still captured once
// with a wildly wrong, real-wall-clock-derived value baked into it (a ProblemPlayer cooldown
// reading "8871:34" instead of "0:45": lib/domain/attempts.ts's cooldownEndsAt is pure
// arithmetic over whatever `at` got persisted, and something, somewhere in that run, persisted a
// real timestamp instead of the frozen one). The specific race was never pinned down with
// certainty -- see the Task 25 report's determinism section for what was ruled in and out -- but
// its cost was a bad baseline nobody would have caught by eye (an implausible countdown reads as
// "the app is buggy," not as "the test tooling lied"), silently approved by --update-baselines.
// Rather than ship on an unproven theory, this is a live, cheap assertion: every single
// checkCurrentPage call (see below) verifies the browser's Date.now() still equals what was
// frozen before trusting the screenshot it is about to take. If the clock has drifted for
// *any* reason -- this race, a future Playwright/Chromium change, anything -- the run fails
// loudly with exactly what happened, instead of quietly baking a bad value into an approved
// baseline the way it did once already.
let FROZEN_NOW_MS;

// pixelmatch's own per-pixel threshold (0..1, YIQ colour-distance; default 0.1). Left at the
// default: it is already tuned by pixelmatch's authors to separate real colour changes from
// antialiasing/subpixel-rendering noise, and this gate's own noise floor (see below) turned out
// to need a much bigger lever than this one.
const PIXELMATCH_PER_PIXEL_THRESHOLD = 0.1;

// The real lever: how much of the image is allowed to differ before this is a finding, not a
// per-pixel colour tolerance. Justification (Task 25's own "prove it is stable" requirement):
// with the clock frozen, fonts awaited, reduced-motion honoured and the Next dev-mode portal
// hidden (see freezeClock/hideDevChrome below), three consecutive full sweeps against an
// unmodified tree (see the Task 25 report for the actual run output) produced 0 mismatched
// pixels on every one of the 44 baselined screens, all three times. 0.1% of a screen's pixels
// (1 in 1000) is comfortably above that observed 0-pixel noise floor -- the tallest full-page
// captures this sweep takes are roughly 1280x4000, ~5.1M px, so 0.1% is ~5,100px of headroom --
// while a genuine one-line CSS change (see the deliberate-failure demo in the Task 25 report)
// moved thousands of contiguous pixels on the one screen it touched, comfortably above this
// floor. That gap is the point: wide enough that dev-machine-to-dev-machine antialiasing jitter
// (a different GPU, a different Chromium point release) has real headroom without a genuine
// visual change ever hiding under it.
const MAX_DIFF_RATIO = 0.001;

/**
 * The screens Task 25 named as "the screens that matter": the picker, This Week, a quest, both
 * named ProblemPlayer interaction states (the hint panel and the explanation panel -- the two
 * states that already exist as their own screenshot labels, see visitProblemPlayerInteractions),
 * the portfolio, the skills map, the Sprout hill, a Sprout activity, the parent view, and the
 * style gallery. NOT every screenshot this sweep takes (that also includes all 12 of the
 * season's weeks and every quest step, which stay screenshotted and content/contrast/overflow
 * checked exactly as before -- just not baseline-compared pixel-for-pixel; a single
 * representative week/step of each is enough to catch an unintended visual regression, and
 * baselining all 12 weeks x every step x 4 viewports would multiply the accept-new-baselines
 * surface for very little extra protection).
 *
 * IMPORTANT, and this is the whole point of the "be clear-eyed about the limit" note in this
 * file's own header: this only ever compares a fresh capture against whatever PNG is currently
 * sitting in docs/visual-baselines/. It cannot know whether that baseline itself looks right --
 * that judgment is made once, by a human, at the moment they run --update-baselines. It stops a
 * regression from silently drifting back in, and catches an unintended visual side effect of an
 * unrelated change; it was never going to be what caught the original defects, because those
 * defects were what the very first baseline would have captured as "normal."
 */
const VISUAL_TARGETS = new Set([
  "profile-picker",
  "this-week-w01",
  "quest-resume",
  "quest-problem-wrong-answer",
  "quest-problem-correct-answer",
  "portfolio",
  "skills-map",
  "hill",
  "activity",
  // The pile round, whose whole question is how many things each card holds. It is here because a
  // regression that flattens a pile back to one glyph is invisible to every other check: the page
  // still has its cards, its contrast is fine, and nothing errors. Only the picture shows it.
  "activity-piles",
  "parent-view",
  "style-gallery",
]);
const SEEDED_OWNER_UID = "seed-parent-uid";
const SEEDED_HOUSEHOLD_ID = "home"; // scripts/seed-emulators.ts's HID
const CONTRAST_MIN = 4.5;

// -------------------------------------------------------------------------------------------
// Isolated sweep household (Task 1b: repeatability). Every route this gate visits is a read
// EXCEPT the two ProblemPlayer interaction checks below (visitProblemPlayerInteractions): those
// submit a real wrong answer and a real correct answer through the app's own Check button, and
// that persists to Firestore exactly like a real session would. Pointed at the developer's
// seeded "home" household, those writes would accumulate run over run -- npm run seed is
// upsert-only, so it can never remove them -- until every problem in the exercised step had
// already been answered correctly and "submit a fresh correct answer" could no longer succeed.
// That is not a code regression, it is leftover state, and it was showing up as a false
// `coverage-degraded` finding (see that rule's own comment below).
//
// The fix: the two interaction checks get their own household, owned by a uid nothing else in
// this app ever signs in as, created fresh (delete-then-write) immediately before each use and
// deleted again once the whole run finishes (run()'s finally below) -- so every run starts from
// a guaranteed-empty household regardless of how many times this gate, or a crashed prior run
// of it, has run before. This never touches "home", never touches anything npm run seed wrote,
// and leaves nothing behind for the developer to notice. Every *other* check in this file still
// runs against the real seeded "home" household exactly as before -- that part was never the
// problem, and narrowing it to just the writing part avoids re-deriving seed-emulators.ts's rich
// seeded state (build-done, logs, skills, mistake box) a second time just for this.
const SWEEP_UID = "verify-ui-sweep-uid";
const SWEEP_HID = "verify-ui-sweep-household";
const SWEEP_EXPLORER_PID = "explorer";

// Task 3b: firestore.rules gates every household create/read on an allowedEmails document, and
// SWEEP_UID (like SEEDED_OWNER_UID) has no email at all -- see ensureAllowlistedIdentity, near
// mintCustomToken below, for how this signs SWEEP_UID (and SEEDED_OWNER_UID) into the allowlist
// before either identity is used for anything.

const VIEWPORTS = [
  { name: "1280x900", width: 1280, height: 900 },
  { name: "820x1180", width: 820, height: 1180 },
  // Task 15: this gate had only ever run Sprout in portrait at 820x1180 -- it had never once
  // seen the orientation the Sprout child actually holds the iPad in. 1194x834 is the 11" iPad Pro's
  // landscape CSS viewport (the smaller of the two landscape sizes Sprout is designed for), so a
  // landscape regression on the tighter of the two now fails this gate the same way a portrait
  // one always has. Added, not swapped in: the two viewports above still run exactly as before.
  { name: "1194x834", width: 1194, height: 834 },
  // Task 16: this gate had only ever run at tablet sizes -- it had never once seen a phone,
  // which is exactly what let a real layout break (Hill.tsx's activity pills landing underneath
  // ParentGate's own fixed-size corner card on a phone-height viewport) ship unnoticed. 390x844
  // is a common real phone's portrait CSS viewport (comfortably under app/globals.css's own
  // `@media (max-width: 700px)` phone breakpoint, and under useIsPhoneWidth's matching
  // PHONE_MAX_WIDTH), and short enough to have shown the collision this task fixed. Added, not
  // swapped in: every viewport above still runs exactly as before.
  { name: "390x844", width: 390, height: 844 },
  // Task 27: the owner photographed real horizontal overflow on an iPad Pro in portrait --
  // "Switch profile" clipped to "Switch p", the season strip's "WK 1" and "LOCKED" labels cut
  // mid-word -- and none of the four viewports above ever exercised it. 834x1194 is the 11" iPad
  // Pro's portrait CSS viewport and 1024x1366 is the 13" iPad Pro's. Both sit above
  // app/globals.css's 860px "collapse the season strip to one column" breakpoint, so both engage
  // the same four-column desktop-oriented season strip and header layout 1194x834 (landscape)
  // uses -- but, unlike landscape, neither is wide enough at that column count to actually fit
  // it. 1024 is the more dangerous of the two: nearly 200px wider than the 860px breakpoint, so
  // it looks safely "desktop" by width alone while still being too narrow for the layout it
  // triggers. Added, not swapped in: every viewport above still runs exactly as before.
  { name: "834x1194", width: 834, height: 1194 },
  { name: "1024x1366", width: 1024, height: 1366 },
];

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(BASELINE_DIR, { recursive: true });
// DIFF_DIR is scratch, wiped at the start of every run (not just mkdir'd) so a diff image left
// over from a previous failing run can never be mistaken for this run's evidence. Its own
// .gitignore (added alongside it) keeps it out of the repo entirely -- nothing here is meant to
// be committed, unlike docs/visual-baselines/.
fs.rmSync(DIFF_DIR, { recursive: true, force: true });
fs.mkdirSync(DIFF_DIR, { recursive: true });
fs.writeFileSync(path.join(DIFF_DIR, ".gitignore"), "*\n!.gitignore\n");

// -------------------------------------------------------------------------------------------
// Content lookups for the quest-step / problem-player sweep (review finding 3). Read straight
// from the same generated bundle the app itself imports (lib/content/app-content.ts), not
// hardcoded, so a content change that reshapes this quest fails the gate loudly at the
// assertions below rather than silently mis-clicking the wrong option.
// -------------------------------------------------------------------------------------------

const GENERATED_CONTENT = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "generated", "content.json"), "utf8"));
const QUEST_ID = "s1-w01-think";
const questForSweep = GENERATED_CONTENT.quests.find((q) => q.id === QUEST_ID);
if (!questForSweep) throw new Error(`verify-ui: quest ${QUEST_ID} not found in generated content`);
const QUEST_STEP_COUNT = questForSweep.steps.length;
const PROBLEM_SET_STEP_INDEX = questForSweep.steps.findIndex((s) => s.kind === "problem-set");
if (PROBLEM_SET_STEP_INDEX < 0) throw new Error(`verify-ui: ${QUEST_ID} has no problem-set step to exercise`);

/** Every problem in the quest, by id, across every step kind that carries one (mirrors
 * lib/content/lookup.ts's problemsOf). NOT just the problem-set step being exercised: the
 * seeded household's progress (scripts/seed-emulators.ts) pre-answers roughly the first half of
 * this quest's problems in *quest* order, not per-step, so which problem within the exercised
 * step actually lands "first, unanswered" shifts with the total problem count -- this map lets
 * the interaction below identify whatever problem is really on screen instead of assuming an
 * index. */
const PROBLEMS_BY_ID = new Map();
for (const step of questForSweep.steps) {
  const probs = step.kind === "warmup" || step.kind === "problem-set" ? step.problems : step.kind === "puzzle-of-week" ? [step.problem] : [];
  for (const p of probs ?? []) PROBLEMS_BY_ID.set(p.id, p);
}
if (PROBLEMS_BY_ID.size === 0) throw new Error(`verify-ui: ${QUEST_ID} has no problems to exercise`);

const ALL_WEEKS = Array.from({ length: 12 }, (_, i) => i + 1);

// -------------------------------------------------------------------------------------------
// Sign-in helper: mint a custom token for the seeded household owner, and bundle a tiny
// standalone script (via esbuild, using this project's own firebase package, not a CDN -- the
// dev machine may be offline) that redeems it in the page.
// -------------------------------------------------------------------------------------------

// Shared firebase-admin app: mintCustomToken (for both the seeded owner and the isolated sweep
// uid, below) and the sweep household's own Firestore reads/writes all reuse the one named app
// instance, initialized once, rather than each calling initializeApp(..., "verify-ui-admin")
// itself -- a second initializeApp() call with the same name throws, and this is now called for
// more than one uid per run.
let adminAppPromise;
async function getAdminApp() {
  if (!adminAppPromise) {
    adminAppPromise = (async () => {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
      const { initializeApp, getApps } = await import("firebase-admin/app");
      return getApps().find((a) => a.name === "verify-ui-admin") ?? initializeApp({ projectId: PROJECT_ID }, "verify-ui-admin");
    })();
  }
  return adminAppPromise;
}

async function mintCustomToken(uid) {
  const app = await getAdminApp();
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(app).createCustomToken(uid);
}

// -------------------------------------------------------------------------------------------
// Task 3b: firestore.rules now denies every household create/read to a signed-in address with
// no allowedEmails document -- including SEEDED_OWNER_UID (every read this whole sweep does
// except the two interaction checks) and SWEEP_UID (those two checks' own identity). Neither
// used to carry an email at all: a custom token minted for a uid that has no existing Auth
// account creates one with just that uid, no email, and this gate never existed before Task 3b.
// Without this, every single check in this gate would fail at once the moment the rules
// changed, not just the two ProblemPlayer interaction checks -- see the block comment above.
//
// The fix: give each identity a real (fake) email on its underlying Auth account *before*
// minting its custom token -- signInWithCustomToken's ID token then carries the account's real
// email claim, not just the uid -- and write its allowedEmails document via the same
// firebase-admin Firestore access the sweep household above already uses (bypasses
// firestore.rules, exactly like scripts/seed-emulators.ts does). Idempotent: safe to call again
// on every run, including a second consecutive one, since updateUser/set both overwrite rather
// than fail on an existing account or document.
// -------------------------------------------------------------------------------------------

const SEEDED_OWNER_EMAIL = "verify-ui-owner@wonderloop.test";
const SWEEP_EMAIL = "verify-ui-sweep@wonderloop.test";

async function ensureAllowlistedIdentity(uid, email) {
  const app = await getAdminApp();
  const { getAuth } = await import("firebase-admin/auth");
  const auth = getAuth(app);
  try {
    await auth.updateUser(uid, { email });
  } catch (err) {
    if (err?.code === "auth/user-not-found") {
      await auth.createUser({ uid, email });
    } else {
      throw err;
    }
  }
  const db = await getSweepDb();
  await db.doc(`allowedEmails/${email}`).set({ note: "verify-ui gate identity", addedAt: Date.now() });
}

/**
 * Firestore access for the isolated sweep household (Task 1b) -- firebase-admin, same as
 * scripts/seed-emulators.ts, so these writes bypass firestore.rules exactly the way seeding
 * does. Talks to FIRESTORE_EMULATOR_HOST, never a real project; run() refuses to start at all
 * if that is not set (see the guard there), so this never has a real project to talk to.
 */
async function getSweepDb() {
  const app = await getAdminApp();
  const { getFirestore } = await import("firebase-admin/firestore");
  return getFirestore(app);
}

/**
 * Task 25 determinism: everything this gate screenshots that shows a date, a relative time, or
 * "This Week"'s week number ultimately traces back to one impure `Date.now()` read, made once
 * per page (see e.g. app/explorer/page.tsx's `const [now] = useState(() => Date.now())`, which
 * feeds lib/domain/calendar.ts's currentWeekFor -- the domain layer itself already takes `now`
 * as a plain parameter, exactly as this file's own header note says to lean on). Overriding the
 * *browser's* Date via Playwright's clock (see runAllViewports, `context.clock.setFixedTime`)
 * makes that one read -- and everything downstream of it, in every component that calls
 * Date.now()/new Date(), not just this one -- deterministic in one place, with no source change
 * anywhere in the app.
 *
 * What to freeze it *to* still has to make sense against the seeded "home" household's own
 * profile.startDate (scripts/seed-emulators.ts sets it to the Monday of whatever real week
 * `npm run seed` last ran in, at 09:00) -- a frozen "now" picked with no relation to that date
 * could land currentWeekFor outside its usual, previously-approved week (nothing breaks, but the
 * "this-week-w01" baseline would then be approving a screenshot of some other week's content,
 * silently). Reading the real startDate and freezing to local noon on that same calendar day
 * keeps daysSinceStart at 0 (week 1) regardless of how long ago seeding happened or how many
 * days pass between two runs of this gate -- and self-corrects on its own the next time someone
 * reseeds, with no change needed here.
 */
async function computeFrozenNow(db) {
  const snap = await db.doc(`households/${SEEDED_HOUSEHOLD_ID}/profiles/explorer`).get();
  const startDate = snap.exists ? snap.data().startDate : undefined;
  const match = typeof startDate === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate) : null;
  if (!match) {
    throw new Error(
      `computeFrozenNow: seeded explorer profile has no parseable startDate (got ${JSON.stringify(startDate)}); ` +
        "run `npm run seed` first.",
    );
  }
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0, 0).getTime();
}

/** Deletes the isolated sweep household (and everything nested under it -- profiles, progress,
 * attempts, reviewQueue, skills) plus its owner's users/{uid} doc. Safe to call when neither
 * exists yet (a fresh checkout, or the very first run ever): recursiveDelete and delete() on a
 * document that is not there are both no-ops, not errors. */
async function teardownSweepHousehold(db) {
  await db.recursiveDelete(db.doc(`households/${SWEEP_HID}`));
  await db.doc(`users/${SWEEP_UID}`).delete();
}

/** Writes a fresh, empty sweep household: one explorer profile, zero progress/attempts/reviewQueue
 * -- so every problem in the exercised quest step is genuinely unanswered. Mirrors the document
 * shapes scripts/seed-emulators.ts writes for "home" (lib/data/types.ts's HouseholdDoc/UserDoc/
 * ProfileDoc), just with nothing under profiles/{pid} beyond the profile doc itself. Always
 * preceded by teardownSweepHousehold in the same call (see resetSweepHousehold below) so this
 * never layers onto whatever a previous run (or an earlier viewport in this same run) left. */
async function createSweepHousehold(db) {
  await db.doc(`users/${SWEEP_UID}`).set({ displayName: "Verify UI Sweep", householdIds: [SWEEP_HID] });
  await db.doc(`households/${SWEEP_HID}`).set({
    name: "Verify UI Sweep",
    ownerUid: SWEEP_UID,
    memberUids: [SWEEP_UID],
    inviteCode: "SWEEP1",
    createdAt: Date.now(),
  });
  // name must be exactly "Explorer": selectProfile()/TILE_LABEL match the picker tile by its
  // accessible name starting with the kind's capitalized label (the same thing the seeded
  // "home" household's profile happens to be named), not by a kind attribute on the button.
  await db.doc(`households/${SWEEP_HID}/profiles/${SWEEP_EXPLORER_PID}`).set({
    name: "Explorer",
    kind: "explorer",
    avatar: "fox",
    birthYear: 2017,
    seasonId: 1,
    startDate: "2026-01-05",
    look: "trail",
  });
}

/** Delete-then-recreate: guarantees a genuinely fresh sweep household regardless of what any
 * earlier run (or an earlier viewport within this same run) left behind. Called once per
 * viewport, immediately before visitProblemPlayerInteractions drives it. */
async function resetSweepHousehold(db) {
  await teardownSweepHousehold(db);
  await createSweepHousehold(db);
}

/**
 * Task 25 determinism, the real fix for the countdown instability documented at length in the
 * Task 25 report (a DOM-mutation and then a synthetic-overlay attempt were both tried and
 * abandoned before this): lib/data/types.ts's converterWithTimestamps unconditionally replaces
 * whatever `at` a client attempt write carries with Firestore's serverTimestamp() sentinel
 * before it reaches the wire -- a deliberate, correct choice for the real app (never trust a
 * client clock for anything the server should be authoritative about), but it means the
 * attempt this sweep just submitted through the real UI is stamped with the *emulator process's
 * own real system clock*, not this page's frozen one, however correctly that page clock is
 * frozen. lib/domain/attempts.ts's cooldownEndsAt is pure arithmetic over that `at`, so
 * CooldownTimer ends up rendering a real-time-derived (and therefore run-to-run different, and
 * pixel-different) countdown no matter what the browser clock says.
 *
 * The fix acts on the one thing that actually determines what the client renders: the
 * `at` value itself, once the real write has landed. firebase-admin writes are not
 * converter-wrapped (admin SDK writes are raw -- see this file's own header on why admin writes
 * bypass firestore.rules the same way), so overwriting `at` here with the plain frozen ms number
 * sails straight through toMillis() (types.ts: "typeof value === 'number' ? value : ...") on the
 * client's next read exactly as if that had been the real value all along. The client's own
 * onSnapshot listener (already subscribed, since the real submission just went through it) picks
 * the correction up and re-renders through the app's real code path -- not a screenshot-time
 * cosmetic patch, the actual displayed value becomes genuinely "0:45", with the actual layout
 * width a real "0:45" produces, not a fixed-size overlay papering over whatever width a much
 * longer real number happened to lay out at (which is what silently broke the previous attempt,
 * specifically at the 390px viewport where the row is tight enough to wrap differently depending
 * on the real digit count).
 */
async function fixSweepAttemptTimestamps(db) {
  const col = db.collection(`households/${SWEEP_HID}/profiles/${SWEEP_EXPLORER_PID}/attempts`);
  const snap = await col.get();
  if (snap.empty) return;
  const batch = db.batch();
  for (const doc of snap.docs) batch.update(doc.ref, { at: FROZEN_NOW_MS });
  await batch.commit();
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
          // The real app's own SessionProvider (lib/firebase/client.ts's getClientAuth) also
          // connects this same app to the emulator, guarded by a globalThis flag that lives in
          // *that* page's JS realm -- a realm this injected script cannot see or set. Whichever
          // of the two runs first wins the real connection; the second call is a harmless
          // no-op we would otherwise have to guard with the same flag we cannot share, so this
          // just swallows the "already connected" error instead.
          try {
            connectAuthEmulator(auth, "http://${AUTH_EMULATOR_HOST}", { disableWarnings: true });
          } catch {}
          return auth;
        }
        window.__verifyUiSignIn = async function (token) {
          const cred = await signInWithCustomToken(wonderloopAuth(), token);
          return cred.user.uid;
        };
        // Task 1b: signInWithCustomToken's promise resolves once the user object is available
        // in memory, but its IndexedDB persistence write -- what a reload actually reads back
        // -- is a separate, unawaited side effect. Confirmed by direct observation: the very
        // next reload sometimes still restored the *previous* signed-in identity, even though
        // the sign-in call just above had already confirmed the new uid moments earlier. Rather
        // than guess at how long that write takes, this asks the *real app's own* Auth instance
        // (re-initialized fresh by this same page after the reload -- see wonderloopApp/
        // wonderloopAuth above, shared with __verifyUiSignIn) who it actually thinks is signed
        // in, waiting for its first onAuthStateChanged event if it has not resolved yet.
        window.__verifyUiCheckUid = function () {
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

/** expectedUid defaults to the seeded owner -- the only identity this gate signed in as before
 * Task 1b. The isolated sweep interactions (visitProblemPlayerInteractions) pass SWEEP_UID
 * instead, and pass SEEDED_OWNER_UID again explicitly afterward to switch back. */
/**
 * Signs `page` in as `expectedUid` and verifies -- not just asks -- that the real app's own
 * Auth instance actually picked it up before returning. Task 1b tracked down a real race here:
 * signInWithCustomToken's promise resolves once the user object exists in memory, but its
 * IndexedDB persistence write (what a page reload actually reads back) is a separate, unawaited
 * side effect. Confirmed by direct observation: the very next reload sometimes still restored
 * the *previous* signed-in identity -- rendering the wrong household's real content, not a
 * blank or broken page -- even though the sign-in call had already confirmed the new uid
 * moments earlier. Rather than guess how long that write takes with a fixed delay (tried, still
 * intermittently too short), this re-injects the bundle after the reload and asks the *real
 * app's own* freshly re-initialized Auth instance (window.__verifyUiCheckUid, built alongside
 * __verifyUiSignIn in buildSignInBundle) who it actually thinks is signed in, retrying the
 * whole sign-in a bounded number of times if the answer does not match yet.
 */
async function signIn(page, bundle, token, expectedUid = SEEDED_OWNER_UID) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    // Cache-busted (freshUrl, defined with returnToPicker/selectProfile below -- function
    // declarations are hoisted, so the forward reference is fine): this gate revisits DEV_URL
    // more than once per viewport now (owner, then the isolated sweep uid, then owner again),
    // and a bare DEV_URL is exactly the kind of already-visited URL Chromium's back/forward
    // cache can satisfy from an earlier frozen instance instead of actually navigating.
    await page.goto(freshUrl("/"), { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const uid = await page.evaluate((t) => window.__verifyUiSignIn(t), token);
    if (uid !== expectedUid) throw new Error(`Signed in as unexpected uid: ${uid} (expected ${expectedUid})`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const confirmedUid = await page.evaluate(() => window.__verifyUiCheckUid());
    if (confirmedUid === expectedUid) return;
    if (attempt === 4) {
      throw new Error(
        `signIn: the real app's own Auth instance never confirmed ${expectedUid} after ${attempt} attempts ` +
          `(last saw ${confirmedUid === null ? "no signed-in user" : confirmedUid})`,
      );
    }
  }
}

// -------------------------------------------------------------------------------------------
// In-page checks. Everything below runs inside the browser via page.evaluate so it sees the
// real computed styles and real layout, not a static read of the source.
// -------------------------------------------------------------------------------------------

/* eslint-disable */
function runPageChecks({ contrastMin }) {
  function cssPath(el) {
    if (!(el instanceof Element)) return "";
    const path = [];
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.documentElement) {
      let selector = node.nodeName.toLowerCase();
      if (node.id) {
        selector += "#" + node.id;
        path.unshift(selector);
        break;
      }
      const cls = (node.className && typeof node.className === "string" ? node.className : "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join(".");
      if (cls) selector += "." + cls;
      let sib = node;
      let nth = 1;
      while ((sib = sib.previousElementSibling)) {
        if (sib.nodeName === node.nodeName) nth++;
      }
      let hasSameSibling = false;
      let sib2 = node;
      while ((sib2 = sib2.nextElementSibling)) {
        if (sib2.nodeName === node.nodeName) {
          hasSameSibling = true;
          break;
        }
      }
      if (nth !== 1 || hasSameSibling) selector += `:nth-of-type(${nth})`;
      path.unshift(selector);
      node = node.parentElement;
    }
    return path.join(" > ");
  }

  function isVisible(el) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function parseColor(str) {
    const m = str && str.match(/rgba?\(([^)]+)\)/i);
    if (!m) return null;
    const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }

  function compositeOver(top, bottom) {
    const a = top.a;
    return {
      r: top.r * a + bottom.r * (1 - a),
      g: top.g * a + bottom.g * (1 - a),
      b: top.b * a + bottom.b * (1 - a),
      a: 1,
    };
  }

  /**
   * The actual rendered background behind `el`: composited from <html> down to `el` itself, so
   * a semi-transparent card over a dark hero, or a plain solid card, both resolve to what a
   * viewer's eye actually sees -- not just document.body's background. This is exactly the
   * check that would have caught the shipped forest-on-forest card title bug (a Card
   * tone="forest" nested inside another forest-toned surface, in one week's content only): that
   * bug is a *composited* background matching the text color, not the page background, so any
   * contrast check anchored on <body> would have missed it just as the manual week-1-only
   * review did.
   *
   * Ancestors with a background-image (not just background-color) make the true background
   * unknowable from computed style alone. Rather than silently trusting whatever solid color
   * happens to be underneath, that is surfaced as its own "cannot verify" finding (see
   * `uncertainBgImage` at the call site) -- a gate that stops looking is worse than no gate.
   */
  function effectiveBackground(el) {
    const chain = [];
    let node = el;
    while (node) {
      chain.push(node);
      node = node.parentElement;
    }
    let result = { r: 255, g: 255, b: 255 };
    let uncertainBgImage = false;
    for (let i = chain.length - 1; i >= 0; i--) {
      const node = chain[i];
      const cs = getComputedStyle(node);
      // document.body carries this app's one and only background-image site-wide: a paper-grain
      // texture (an inline SVG feColorMatrix noise filter, see app/globals.css's `body` rule)
      // whose alpha output row is a flat 0.06 -- a roughly 6%-opacity black speckle over
      // body's own solid background-color, present under literally every element on every
      // screen. Treating that as "unknowable" would flag the entire app on every run and bury
      // any real finding under thousands of copies of this one. Its ceiling contribution (6%
      // black) cannot plausibly flip a passing ratio to failing or vice versa in any case this
      // gate has actually hit, so it is excluded from the uncertainty flag by name -- not by a
      // blanket "ignore all background-images" -- and body's own solid background-color is
      // still composited in below exactly as any other ancestor's would be. Any *other*
      // background-image (a photo behind a card, a future hero banner) still trips this flag.
      if (cs.backgroundImage && cs.backgroundImage !== "none" && node !== document.body) {
        uncertainBgImage = true;
      }
      const bg = parseColor(cs.backgroundColor);
      const opacity = parseFloat(cs.opacity);
      if (bg && bg.a > 0) {
        const effectiveAlpha = bg.a * (Number.isFinite(opacity) ? opacity : 1);
        result = compositeOver({ r: bg.r, g: bg.g, b: bg.b, a: effectiveAlpha }, result);
      }
    }
    return { color: result, uncertainBgImage };
  }

  function luminance(c) {
    const toLin = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLin(c.r) + 0.7152 * toLin(c.g) + 0.0722 * toLin(c.b);
  }

  function contrastRatio(c1, c2) {
    const l1 = luminance(c1);
    const l2 = luminance(c2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  const findings = [];

  // ---- Contrast: every element with its own direct, non-whitespace text ----
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.nodeValue && node.nodeValue.trim().length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  const textParents = new Set();
  let n;
  while ((n = walker.nextNode())) {
    const parent = n.parentElement;
    if (parent && parent.closest("svg") === null) textParents.add(parent);
  }

  /**
   * WCAG 2.x SC 1.4.3's own text says the contrast minimum has "No requirement" for "Text that
   * is part of an inactive user interface component" -- a disabled button showing dimmed text
   * on purpose (this app's `.tr-btn:disabled { opacity: 0.5 }`, e.g. a cooldown "Check" button
   * or a "Back" button on step 1) is the textbook case, not a loophole. This is narrower than
   * "skip anything that looks disabled": it only matches the real HTML :disabled state, or an
   * aria-disabled="true" that is *corroborated* by pointer-events: none, on the element itself
   * or an ancestor -- so a merely muted-looking *active* control (the season trail's
   * locked-season label, the quest step list's not-yet-reached steps -- both real, clickable,
   * and both fixed for real rather than exempted here) still gets the full check.
   *
   * Review finding 4: the previous version trusted a bare aria-disabled="true" on its own. That
   * attribute is a screen-reader-only signal -- unlike the real `disabled` property, it does
   * nothing to stop an actual mouse/touch/keyboard activation -- so a fully live, fully
   * clickable, low-contrast button could pass the check just by wearing the attribute with
   * nothing else changed (supplementary probe A in the review). Requiring pointer-events: none
   * as corroboration closes that: it is the one CSS signal that genuinely blocks a real click.
   * This app's one real aria-disabled usage today (DebateStepPlaceholder's "Talk about it"
   * button) already carries the native `disabled` attribute too, so nothing in the app needed
   * to change to keep passing under the narrower rule.
   */
  function isGenuinelyInactive(node) {
    if (node.disabled === true) return true;
    if (node.getAttribute && node.getAttribute("aria-disabled") === "true") {
      return getComputedStyle(node).pointerEvents === "none";
    }
    return false;
  }
  function isInactiveControl(el) {
    let node = el;
    while (node) {
      if (isGenuinelyInactive(node)) return true;
      node = node.parentElement;
    }
    return false;
  }

  for (const el of textParents) {
    if (!isVisible(el)) continue;
    if (isInactiveControl(el)) continue;
    const cs = getComputedStyle(el);
    const fgParsed = parseColor(cs.color);
    if (!fgParsed) continue;
    const { color: bg, uncertainBgImage } = effectiveBackground(el);
    const ancestorOpacity = (() => {
      let node = el;
      let acc = 1;
      while (node) {
        const o = parseFloat(getComputedStyle(node).opacity);
        if (Number.isFinite(o)) acc *= o;
        node = node.parentElement;
      }
      return acc;
    })();
    const fg = compositeOver({ r: fgParsed.r, g: fgParsed.g, b: fgParsed.b, a: fgParsed.a * ancestorOpacity }, bg);
    if (uncertainBgImage) {
      findings.push({
        rule: "contrast-unverifiable-background-image",
        selector: cssPath(el),
        detail: `text "${(el.textContent || "").trim().slice(0, 60)}" sits over an ancestor background-image; contrast could not be verified from computed style`,
      });
      continue;
    }
    const ratio = contrastRatio(fg, bg);
    if (ratio < contrastMin) {
      findings.push({
        rule: "contrast",
        selector: cssPath(el),
        detail: `${ratio.toFixed(2)}:1 (needs ${contrastMin}:1) -- color rgb(${Math.round(fg.r)},${Math.round(fg.g)},${Math.round(fg.b)}) on rendered background rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)}), text "${(el.textContent || "").trim().slice(0, 60)}"`,
      });
    }
  }

  // ---- Buttons with no explicit color ----
  const sheets = Array.from(document.styleSheets);
  function ruleSetsColor(selectorText, el) {
    try {
      return el.matches(selectorText);
    } catch {
      return false;
    }
  }
  function hasExplicitColor(el) {
    if (el.style && el.style.color && el.style.color !== "inherit" && el.style.color !== "unset") return true;
    for (const sheet of sheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin stylesheet; none exist in this app, but don't crash if one shows up
      }
      if (!rules) continue;
      for (const rule of rules) {
        if (!rule.selectorText || !rule.style) continue;
        const declared = rule.style.getPropertyValue("color");
        if (!declared || declared === "inherit" || declared === "unset" || declared === "initial") continue;
        const selectors = rule.selectorText.split(",").map((s) => s.trim());
        if (selectors.some((s) => ruleSetsColor(s, el))) return true;
      }
    }
    return false;
  }
  for (const btn of Array.from(document.querySelectorAll("button"))) {
    if (!isVisible(btn)) continue;
    if (!hasExplicitColor(btn)) {
      findings.push({
        rule: "button-no-explicit-color",
        selector: cssPath(btn),
        detail: `button relies on inherited color: "${(btn.textContent || "").trim().slice(0, 40)}"`,
      });
    }
  }

  // ---- Link-styled buttons (<a class="tr-btn ...">, see components/ui/Button.tsx) with an
  // underline ----
  for (const a of Array.from(document.querySelectorAll("a"))) {
    if (!isVisible(a)) continue;
    if (!a.classList.contains("tr-btn")) continue;
    const cs = getComputedStyle(a);
    if (cs.textDecorationLine !== "none") {
      findings.push({
        rule: "link-button-underline",
        selector: cssPath(a),
        detail: `link styled as a button still shows text-decoration-line: ${cs.textDecorationLine}`,
      });
    }
  }

  // ---- Real horizontal overflow (review finding 2) ----
  //
  // The old check compared document.scrollingElement.scrollWidth to clientWidth. That can never
  // fire in this app: app/globals.css sets `overflow-x: hidden` on both <html> and <body>, and a
  // box with overflow-x: hidden never grows its own scrollWidth past its clientWidth no matter
  // how much its content overflows -- it clips instead. Confirmed directly (review reproduction):
  // a 900px-wide probe element in an 820px viewport left scrollWidth at 820 while the element's
  // own getBoundingClientRect().width read 900. This check cannot be fixed by adjusting the
  // comparison; it has to measure something else entirely.
  //
  // The something else is exactly what the reproduction measured: an element's own rendered
  // bounds against the viewport. An element whose box extends past the right edge of the
  // viewport (or before its left edge) with nothing clipping it is either invisible past the
  // edge or forces content off-screen with no way to reach it -- both real defects, and both
  // exactly what a horizontal-scrollbar check exists to catch even though, in this app, no
  // scrollbar ever appears to say so.
  //
  // "Nothing clipping it" is the part that has to be precise. Two kinds of ancestor legitimately
  // stop an element's own overflow from ever reaching the page:
  //   - overflow-x: auto/scroll -- a deliberate inner-scrolling region (this app has exactly
  //     three: the artifact code/text preview, the grid-input wrapper, the journal spread's code
  //     block). Its own box never exceeds the viewport; only its *content* does, on purpose, with
  //     its own visible scrollbar. Not a defect.
  //   - overflow: hidden/clip on a LOCAL ancestor (a rounded card corner, an animated fill bar
  //     clipped inside its own control) -- content clipped by a nearby ancestor never reaches the
  //     page edge at all; it is invisible before it gets there, which is the ancestor doing its
  //     job, not a layout bug.
  // <body> and <html> themselves are deliberately excluded from that "local ancestor" search:
  // their own overflow-x: hidden is the site-wide reset that makes the old scrollWidth check
  // blind in the first place, and it is exactly the boundary this check exists to see past --
  // treating it as just another clipping ancestor would exclude everything on every page and
  // never catch anything.
  const overflowXCache = new WeakMap();
  function overflowXOf(node) {
    if (!overflowXCache.has(node)) overflowXCache.set(node, getComputedStyle(node).overflowX);
    return overflowXCache.get(node);
  }
  /** "scroll" (deliberate inner-scroll region), "hidden" (a local clip), or null (nothing
   * between `el` and <body> constrains it -- <body>/<html> themselves are not considered). */
  function nearestClip(el) {
    let node = el.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      const ox = overflowXOf(node);
      if (ox === "auto" || ox === "scroll") return "scroll";
      if (ox === "hidden" || ox === "clip") return "hidden";
      node = node.parentElement;
    }
    return null;
  }
  const viewportWidth = document.documentElement.clientWidth;
  const OVERFLOW_TOLERANCE = 2; // px, for subpixel/anti-aliasing rounding
  for (const el of document.body.getElementsByTagName("*")) {
    if (el.ownerSVGElement) continue; // svg internals (paths, gs) -- checked at the <svg> itself
    if (!isVisible(el)) continue;
    if (nearestClip(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) continue;
    if (rect.right > viewportWidth + OVERFLOW_TOLERANCE || rect.left < -OVERFLOW_TOLERANCE) {
      findings.push({
        rule: "horizontal-overflow",
        selector: cssPath(el),
        detail: `element bounds [${Math.round(rect.left)}, ${Math.round(rect.right)}] exceed the ${viewportWidth}px viewport (element width ${Math.round(rect.width)})`,
      });
    }
  }

  return findings;
}
/* eslint-enable */

// -------------------------------------------------------------------------------------------
// Route table.
// -------------------------------------------------------------------------------------------

// "This Week" (every week, via the real week picker) and the quest (every step, plus two
// ProblemPlayer interactions) are swept explicitly in runAllViewports below, not listed here --
// see the comments there (review findings 1 and 3).
const ROUTES = {
  preAuth: [{ path: "/", label: "sign-in" }],
  picker: [{ path: "/", label: "profile-picker" }],
  explorer: [
    { path: "/explorer/portfolio", label: "portfolio" },
    { path: "/explorer/skills", label: "skills-map" },
  ],
  sprout: [
    { path: "/sprout", label: "hill" },
    { path: "/sprout/activity/sprout-w01-a1", label: "activity", startGate: true },
    // A pile round, where the choices differ only in how many things they hold. The gate captured
    // only the pattern round above, so it never saw that piles were drawn as a single glyph and
    // every choice came out identical. Kept as its own screen so that class stays covered.
    { path: "/sprout/activity/sprout-w05-a2", label: "activity-piles", startGate: true },
  ],
  parent: [{ path: "/parent", label: "parent-view" }],
  style: [{ path: "/style", label: "style-gallery" }],
};

const TILE_LABEL = { explorer: "Explorer", sprout: "Sprout", parent: "Parent" };

// -------------------------------------------------------------------------------------------
// Runner.
// -------------------------------------------------------------------------------------------

async function waitForSettled(page) {
  // Every route (sign-in, picker and every profile-scoped screen) shows LoadingTrail
  // (.tr-loading) while session/content is settling; wait for it to clear rather than guessing
  // a fixed delay. Routes that never show it (the sign-in screen itself, before any auth) just
  // hit the catch and fall through to the fixed settle wait below.
  try {
    await page.waitForSelector(".tr-loading", { state: "detached", timeout: 10000 });
  } catch {
    // ok: this route never rendered .tr-loading in the first place.
  }
  await page.waitForTimeout(400);
}

/**
 * Compares a freshly captured screenshot against its committed baseline (docs/visual-baselines/)
 * for the screens named in VISUAL_TARGETS, via pixelmatch (see the block comment above
 * PIXELMATCH_PER_PIXEL_THRESHOLD/MAX_DIFF_RATIO for the library/threshold justification).
 *
 * Three outcomes, each returning a finding array (empty means clean):
 *   - UPDATE_BASELINES is set: the fresh capture straight-up replaces the baseline (a deliberate,
 *     separate act -- see UPDATE_BASELINES's own comment -- never a side effect of a normal run,
 *     so this branch never runs unless `--update-baselines` was passed on the command line).
 *   - no baseline exists yet for this label/viewport: a finding, not a silent pass -- otherwise a
 *     screen added to VISUAL_TARGETS without ever running --update-baselines for it would look
 *     "covered" while actually comparing nothing.
 *   - a baseline exists: pixelmatch the two PNGs (mismatched dimensions counts as every pixel of
 *     the larger image mismatched, since pixelmatch itself requires equal dimensions). Beyond
 *     MAX_DIFF_RATIO of the image differing is a finding, and only then is a diff image written
 *     to docs/visual-diffs/ -- a clean comparison writes nothing there.
 */
function compareToBaseline(label, viewportName, shotPath) {
  if (!VISUAL_TARGETS.has(label)) return [];
  const baselineName = `${label}-${viewportName}.png`;
  const baselinePath = path.join(BASELINE_DIR, baselineName);

  if (UPDATE_BASELINES) {
    fs.copyFileSync(shotPath, baselinePath);
    console.log(`verify-ui: updated baseline ${baselineName}`);
    return [];
  }

  if (!fs.existsSync(baselinePath)) {
    return [
      {
        rule: "visual-baseline-missing",
        selector: "(full page)",
        detail:
          `${label} is in VISUAL_TARGETS but docs/visual-baselines/${baselineName} does not exist. ` +
          "Run `npm run verify:ui -- --update-baselines` once you have looked at the current " +
          "screenshot and confirmed it is the approved appearance.",
      },
    ];
  }

  const actual = PNG.sync.read(fs.readFileSync(shotPath));
  const baseline = PNG.sync.read(fs.readFileSync(baselinePath));

  if (actual.width !== baseline.width || actual.height !== baseline.height) {
    // Still write something a human can look at: the fresh capture itself, since a pixelmatch
    // diff needs matching dimensions to mean anything.
    fs.copyFileSync(shotPath, path.join(DIFF_DIR, `${label}-${viewportName}-diff.png`));
    return [
      {
        rule: "visual-regression",
        selector: "(full page)",
        detail:
          `dimensions changed: baseline is ${baseline.width}x${baseline.height}, this run captured ` +
          `${actual.width}x${actual.height}. See docs/visual-diffs/${label}-${viewportName}-diff.png ` +
          "(the new capture -- no pixel-level diff is possible across different dimensions).",
      },
    ];
  }

  const { width, height } = actual;
  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(actual.data, baseline.data, diff.data, width, height, {
    threshold: PIXELMATCH_PER_PIXEL_THRESHOLD,
  });
  const ratio = mismatched / (width * height);

  if (ratio <= MAX_DIFF_RATIO) return [];

  const diffName = `${label}-${viewportName}-diff.png`;
  fs.writeFileSync(path.join(DIFF_DIR, diffName), PNG.sync.write(diff));
  return [
    {
      rule: "visual-regression",
      selector: "(full page)",
      detail:
        `${mismatched} of ${width * height} px differ from docs/visual-baselines/${baselineName} ` +
        `(${(ratio * 100).toFixed(3)}%, threshold ${(MAX_DIFF_RATIO * 100).toFixed(2)}%). ` +
        `Diff image: docs/visual-diffs/${diffName}. If this change is intended, look at the diff ` +
        "and the fresh screenshot, then run `npm run verify:ui -- --update-baselines`.",
    },
  ];
}

/**
 * Screenshots and runs every in-page check against whatever is currently on screen, without
 * navigating -- the shared tail end of a full route visit (visitAndCheck below) and of the
 * in-page interactions (a week picked, a quest step reached by click, a problem answered) that
 * never trigger a full page load at all.
 */
async function checkCurrentPage(page, label, viewportName, allFindings, consoleErrors) {
  const shotName = `verify-ui-${label}-${viewportName}.png`;
  const shotPath = path.join(SCREENSHOT_DIR, shotName);
  // Task 25 determinism: verify the browser's frozen clock is still actually frozen before
  // trusting anything about this screenshot -- see FROZEN_NOW_MS's own comment for why this
  // exists and what it once caught silently.
  const liveNow = await page.evaluate(() => Date.now());
  if (liveNow !== FROZEN_NOW_MS) {
    throw new Error(
      `verify-ui: the browser's clock is not frozen where expected, at ${label}/${viewportName}. ` +
        `Expected Date.now() === ${FROZEN_NOW_MS} (${new Date(FROZEN_NOW_MS).toString()}), got ` +
        `${liveNow} (${new Date(liveNow).toString()}). Every date/time-dependent screenshot this ` +
        "gate takes depends on this holding; see FROZEN_NOW_MS's comment near the top of this file.",
    );
  }
  // Task 25 determinism: a screenshot taken mid font-swap differs from run to run for reasons
  // that have nothing to do with the app. next/font self-hosts (no CDN fetch at runtime -- see
  // app/layout.tsx), but the font files still load asynchronously like any other; document.fonts
  // .ready resolves once every requested face has either loaded or failed, so this always shoots
  // the same, fully-settled text rendering.
  await page.evaluate(() => document.fonts.ready);
  // Task 25 determinism, found the hard way (the very first three-consecutive-runs check this
  // gate's own report was supposed to prove caught a real flake here): the portfolio's photo
  // artifact (components/portfolio/JournalSpread.tsx's usePhotoUrl) is a two-stage async load --
  // first a Storage getDownloadURL round-trip, which swaps a "Loading photo..." caption for the
  // real <img>, then the <img> itself loading its bytes -- neither gated by the page-level
  // .tr-loading indicator waitForSettled() already waits for. A screenshot taken mid-way through
  // either stage is shorter (the image, or its caption, is missing or not yet sized) than one
  // taken after, which is exactly the kind of run-to-run difference that has nothing to do with
  // the app -- it showed up as a fullPage height mismatch and a ~16% pixel diff on the very first
  // repeat run against a freshly accepted baseline. Waiting for the transient caption specifically
  // (not every "tr-spread__cap" -- several of that class's other messages, e.g. "No artifact
  // recorded for this quest.", are legitimate end states, not loading states) and then for every
  // <img> currently on the page to finish loading (or fail -- "error" also resolves, so a
  // genuinely broken image can never hang the sweep) covers this and any future <img> the app
  // adds the same way.
  await page
    .locator(".tr-spread__cap", { hasText: "Loading photo..." })
    .waitFor({ state: "detached", timeout: 8000 })
    .catch(() => {});
  await page.evaluate(() =>
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
  );
  // Task 25 determinism: components/quest/CooldownTimer.tsx's live countdown is computed from an
  // attempt's `at` field, which -- unlike the browser's own Date.now() -- is stamped by the
  // Firestore *emulator process's* real system clock (lib/data/types.ts's converterWithTimestamps
  // unconditionally substitutes serverTimestamp() for it on write, a deliberate and correct
  // choice for the real app: never trust a client clock for anything the server should be
  // authoritative about). No page-level clock override reaches that. The fix lives at the
  // source, not here: visitProblemPlayerInteractions's fixSweepAttemptTimestamps overwrites the
  // just-submitted attempt's `at` back to the frozen value via firebase-admin (which is not
  // converter-wrapped) immediately after submitting, and waits for the real UI to reflect it,
  // before this function is ever called for that screen -- see its own comment for why a
  // screenshot-time DOM patch was tried first and abandoned (it does not survive a React
  // re-render, and a synthetic overlay does not survive the real layout width a much longer
  // real-time number lays out at, at this app's narrowest viewport).
  await page.screenshot({ path: shotPath, fullPage: true });

  const findings = await page.evaluate(runPageChecks, { contrastMin: CONTRAST_MIN });
  const visualFindings = compareToBaseline(label, viewportName, shotPath);
  const route = page.url().replace(DEV_URL, "");
  for (const f of findings) {
    allFindings.push({ ...f, route, label, viewport: viewportName });
  }
  for (const f of visualFindings) {
    allFindings.push({ ...f, route, label, viewport: viewportName });
  }
  for (const err of consoleErrors) {
    allFindings.push({ rule: "console-error", selector: "(console)", detail: err, route, label, viewport: viewportName });
  }
  return { screenshot: shotName, findingCount: findings.length + visualFindings.length + consoleErrors.length };
}

async function visitAndCheck(page, route, viewportName, allFindings, consoleErrors) {
  consoleErrors.length = 0;
  if (route.path !== undefined) {
    // Not "networkidle": Next dev's HMR websocket stays open forever, so networkidle would
    // never resolve. "load" plus waitForSettled below is enough for this app's routes.
    await page.goto(`${DEV_URL}${route.path}`, { waitUntil: "load" });
  }
  // Let content settle (client-side data fetches from the Firestore emulator, animations).
  await waitForSettled(page);
  // A Sprout activity opens behind a tap-to-start gate, because iPadOS Safari refuses speech that
  // does not follow a real tap. Until this click existed, every Sprout screen the gate ever
  // captured was that gate: an empty ground with one play button. It reported zero findings on
  // every one of them, truthfully and uselessly, and a round whose choices all drew as the same
  // glyph shipped straight through it. Click in, so the gate sees the round the child sees.
  if (route.startGate) {
    const start = page.locator("button.sp-start");
    if (await start.count()) {
      await start.first().click();
      // Wait for the intro to actually give way to the round, never for a guessed delay: the
      // player speaks the intro and then waits TOUR_PAUSE_MS before switching, which outlasts
      // waitForSettled's fixed pause, so a settle-and-shoot captured the intro every time.
      try {
        await page.waitForSelector(".sp-intro", { state: "detached", timeout: 10000 });
      } catch {
        allFindings.push({ viewport: viewportName, route: route.label, selector: ".sp-intro", message: "sprout activity never left its intro after the start tap, so the round never opened" });
      }
      await waitForSettled(page);
    } else {
      allFindings.push({ viewport: viewportName, route: route.label, selector: "button.sp-start", message: "sprout activity did not present its tap-to-start gate, so the round was never opened" });
    }
  }
  return checkCurrentPage(page, route.label, viewportName, allFindings, consoleErrors);
}

/**
 * Jumps "This Week" to a different week the same one-click way a parent or QA reviewer would:
 * the real <select id="tr-week-select"> (components/explorer/WeekHeader.tsx), never a
 * re-navigation. Review finding 1: the app's per-week content (the monster card -- season 1
 * week 11 only -- the TrackCards, the season book) genuinely differs, and this control is the
 * only way any of it is ever reachable from "This Week".
 */
async function selectWeek(page, week) {
  await page.selectOption("#tr-week-select", String(week));
  await waitForSettled(page);
}

/**
 * Waits past ProblemPlayer's own local "Getting this problem ready..." gate (the `hydrated`
 * check in components/quest/ProblemPlayer.tsx -- true only once its attempts listener AND
 * QuestShell's progress listener have both delivered), which is a *different* loading state
 * than the page-level LoadingTrail waitForSettled() already waits for. Resolves as soon as
 * either the wait message is gone (hydrated) or an explanation is already showing.
 */
async function waitForProblemHydrated(page) {
  await page
    .waitForSelector(".tr-problem__wait", { state: "detached", timeout: 10000 })
    .catch(() => {});
}

/**
 * Resets a problem to a guaranteed-fresh, unanswered attempt cycle via the app's own "Try it
 * again" affordance, if it is currently showing. The seeded emulator persists progress across
 * runs of this gate, so a problem this same sweep already answered correctly (or exhausted) on
 * an earlier run would otherwise start this run already past "unanswered" -- "Try it again" is
 * the real, in-app way back to a clean cycle, so every run's interaction below starts from the
 * same state regardless of how many times the gate has run before.
 */
async function ensureFreshProblem(page) {
  const tryAgain = page.getByRole("button", { name: "Try it again", exact: true });
  if ((await tryAgain.count()) > 0 && (await tryAgain.isVisible().catch(() => false))) {
    await tryAgain.click();
    await waitForSettled(page);
    await waitForProblemHydrated(page);
  }
}

/** The problem currently on screen, identified from ProblemPlayer's own
 * aria-labelledby="{problemId}-title" (components/quest/ProblemPlayer.tsx), looked up against
 * PROBLEMS_BY_ID -- not assumed by position, since the seeded household's progress can put any
 * problem in this quest "first, unanswered" depending on the total problem count (see
 * PROBLEMS_BY_ID's own comment). Returns null if nothing is showing yet. */
async function currentProblem(page) {
  const id = await page
    .locator(".tr-problem")
    .first()
    .getAttribute("aria-labelledby")
    .catch(() => null);
  if (!id) return null;
  return PROBLEMS_BY_ID.get(id.replace(/-title$/, "")) ?? null;
}

// A generous-but-bounded window for a single interaction (a radio, a fill, a Check/Skip click)
// to become actionable. Two real reasons a control can be briefly, legitimately disabled when
// this sweep first looks at it, neither of which is "give up immediately": handleSubmit
// (ProblemPlayer.tsx) keeps `busy` true (disabling every input and Check) until its full async
// chain finishes -- persist the attempt, then recompute skills from every attempt and log on
// record across the whole profile, then save them -- well after the UI a submission triggers
// (the hint panel, the explanation) has already appeared. Measured directly against the local
// emulator (already carrying this profile's real seeded history plus whatever this sweep itself
// has added run over run): consistently several seconds, not the sub-second this looked like at
// a glance -- 15s leaves real headroom above that. The second reason is the seeded emulator
// persisting progress across runs of this same gate, so a problem a very recent prior run left
// mid-cooldown is still genuinely disabled for the rest of that 45s -- deliberately NOT ridden
// out in full (that would make every run that hits it 45s slower for no benefit); 15s is short
// enough that a real 45s cooldown still reliably times it out, so the interaction is skipped
// (see answerCurrentProblem's/skipToNextProblem's callers) rather than the sweep hanging on
// Playwright's own default 30s action timeout.
const INTERACTION_TIMEOUT_MS = 15000;

/**
 * Submits a real answer -- the actual correct one, or a real, deliberately wrong one -- for
 * whatever problem is currently on screen, driving whichever input that problem's kind actually
 * renders (ChoiceInput/TrueFalseInput's radios, NumberInput/TextInput's field). Returns false,
 * without having changed anything that matters, when the current problem cannot be identified,
 * its kind is not one of the four handled here (order/grid problems use a drag- or grid-shaped
 * input this sweep does not drive), a `correct: false` submission is requested for a "text"
 * problem (rubric problems reveal on any submission at all -- there is no wrong-answer/hint/
 * cooldown state to reach), or any of the clicks/fills below does not become actionable within
 * INTERACTION_TIMEOUT_MS (a genuinely disabled control, e.g. mid-cooldown from an earlier run).
 */
async function answerCurrentProblem(page, correct) {
  const problem = await currentProblem(page);
  if (!problem) return false;
  const checkButton = page.getByRole("button", { name: "Check", exact: true });
  if ((await checkButton.count()) === 0) return false;

  try {
    switch (problem.kind) {
      case "choice": {
        const correctIndex = problem.answer.index;
        const index = correct ? correctIndex : correctIndex === 0 ? 1 : 0;
        await page.getByRole("radio").nth(index).click({ timeout: INTERACTION_TIMEOUT_MS });
        break;
      }
      case "truefalse": {
        const value = correct ? problem.answer.value : !problem.answer.value;
        await page.getByRole("radio", { name: value ? "True" : "False", exact: true }).click({ timeout: INTERACTION_TIMEOUT_MS });
        break;
      }
      case "number": {
        await page
          .locator(".tr-answer__input")
          .fill(correct ? String(problem.answer.value) : "not the answer", { timeout: INTERACTION_TIMEOUT_MS });
        break;
      }
      case "text": {
        if (!correct) return false; // rubric problems reveal on any submission -- no hint/cooldown state to reach
        await page
          .locator(".tr-textarea")
          .fill("A real written answer, for the gate's own submission.", { timeout: INTERACTION_TIMEOUT_MS });
        break;
      }
      default:
        return false; // order/grid inputs are not driven generically here
    }
    // Before a third try, ProblemPlayer requires "what did you try" filled in first
    // (lib/domain/attempts.ts's needsWhatYouTried) -- only relevant if this exact problem
    // already carries two tries from an earlier run of this same gate (the seeded emulator
    // persists attempts across runs); harmless to check unconditionally otherwise, since the
    // field only renders once triesUsed is already 2.
    const triedInput = page.locator(".tr-tried input");
    if ((await triedInput.count()) > 0) {
      await triedInput.fill("Tried a few things and worked through it step by step.", { timeout: INTERACTION_TIMEOUT_MS }).catch(() => {});
    }
    await checkButton.click({ timeout: INTERACTION_TIMEOUT_MS });
  } catch {
    return false; // the input or Check never became actionable in time -- see INTERACTION_TIMEOUT_MS's comment
  }
  return true;
}

/** Clicks "Skip for now" to move to the next problem in the current step, if that button is
 * present and becomes actionable within INTERACTION_TIMEOUT_MS (see that constant's comment --
 * covers the same `busy` race as answerCurrentProblem). Returns whether it actually advanced. */
async function skipToNextProblem(page) {
  const skip = page.getByRole("button", { name: "Skip for now", exact: true });
  if ((await skip.count()) === 0) return false;
  try {
    await skip.click({ timeout: INTERACTION_TIMEOUT_MS });
  } catch {
    return false;
  }
  await waitForSettled(page);
  await waitForProblemHydrated(page);
  return true;
}

/**
 * Pushes a `coverage-degraded` finding when an interaction state named for a specific outcome
 * (the wrong answer was registered, the correct answer was registered) never actually reached
 * that outcome and instead fell back to screenshotting whatever was already on screen. Without
 * this, that fallback is indistinguishable from a real pass: `checkCurrentPage` would just run
 * its normal checks against the landing state and, finding nothing wrong with a page that was
 * never supposed to be checked in the first place, report 0 findings under a label implying real
 * interaction coverage happened. This is the failure mode task 14's re-review flagged: a checker
 * that quietly stops checking while still reporting success is worse than not checking at all.
 */
function pushCoverageDegraded(page, label, viewportName, allFindings, detail) {
  const route = page.url().replace(DEV_URL, "");
  allFindings.push({ rule: "coverage-degraded", selector: "(interaction)", detail, route, label, viewport: viewportName });
}

/**
 * Exercises the ProblemPlayer beyond its landing state (review finding 3): the problem player,
 * its hints, its cooldown and its explanation panel are the densest UI in the app, and no sweep
 * had ever rendered any of them. One wrong answer on a real problem in the exercised step
 * (whichever one is genuinely on screen -- see currentProblem()'s comment on why that cannot be
 * assumed by position) renders the hint panel and the 45s cooldown timer; skipping ahead to a
 * different, still-unanswered problem and submitting its real correct answer (read straight from
 * the same generated content the app bundles) renders the ExplanationPanel and IdeaCard.
 * Bounded by the step's own problem count so a step with nothing but order/grid problems (none
 * of which this sweep drives) cannot loop forever -- but if it never reaches the state its label
 * promises (the wrong answer never registered, the correct answer never registered), that is
 * reported as a `coverage-degraded` finding rather than silently passing on a screenshot of the
 * landing state (see pushCoverageDegraded above).
 *
 * Task 1b (repeatability): this is the only place in the whole sweep that submits real answers,
 * so it is the only place that needs its own isolated household -- see the SWEEP_UID/SWEEP_HID
 * comment near the top of this file. `sweep` carries what that needs: `db` (firebase-admin
 * Firestore, to reset the household immediately before use), `bundle` (the same sign-in bundle
 * built once in run()), `sweepToken` (a custom token for SWEEP_UID) and `ownerToken` (a custom
 * token for SEEDED_OWNER_UID, to switch back once this function is done). The caller
 * (runAllViewports) is signed in as the seeded owner, on the seeded household's explorer
 * profile, when this is called, and expects to be signed in as the seeded owner, on that same
 * profile, again once it returns -- everything in between happens as the sweep identity instead.
 */
async function visitProblemPlayerInteractions(page, viewportName, allFindings, consoleErrors, log, sweep) {
  await resetSweepHousehold(sweep.db);
  await signIn(page, sweep.bundle, sweep.sweepToken, SWEEP_UID);
  await selectProfile(page, "explorer");

  await page.goto(`${DEV_URL}/explorer/quest/${QUEST_ID}?step=${PROBLEM_SET_STEP_INDEX}`, { waitUntil: "load" });
  await waitForSettled(page);
  await waitForProblemHydrated(page);

  const stepProblemCount = questForSweep.steps[PROBLEM_SET_STEP_INDEX].problems?.length ?? PROBLEMS_BY_ID.size;
  let gotWrong = false;
  for (let i = 0; i < stepProblemCount && !gotWrong; i++) {
    await ensureFreshProblem(page);
    gotWrong = await answerCurrentProblem(page, false);
    if (gotWrong) {
      await page.waitForSelector(".tr-hint", { timeout: 5000 }).catch(() => {});
      // Task 25 determinism: see fixSweepAttemptTimestamps's own comment. Overwrite the attempt
      // this just submitted to carry the frozen `at`, then wait for the real UI (the button's
      // own label, driven by the app's real code, not a screenshot-time patch) to actually show
      // the corrected, stable "Try again in 0:45" before this is considered done -- bounded, not
      // silent: a timeout here means the correction did not take, which checkCurrentPage's own
      // clock assertion right after would in any case still not have caught (that assertion
      // covers the browser's Date.now(), not this).
      await fixSweepAttemptTimestamps(sweep.db);
      await page
        .locator(".tr-btn", { hasText: "Try again in 0:45" })
        .waitFor({ state: "visible", timeout: 8000 })
        .catch(() => {});
      break;
    }
    if (!(await skipToNextProblem(page))) break;
  }
  consoleErrors.length = 0;
  const rWrong = await checkCurrentPage(page, "quest-problem-wrong-answer", viewportName, allFindings, consoleErrors);
  let wrongFindingCount = rWrong.findingCount;
  if (!gotWrong) {
    pushCoverageDegraded(
      page,
      "quest-problem-wrong-answer",
      viewportName,
      allFindings,
      `answerCurrentProblem(page, false) never registered a wrong answer across ${stepProblemCount} ` +
        "problem(s) tried in this step -- this state degraded to screenshotting whatever landing " +
        "state was already on screen instead of the hint panel it is meant to exercise.",
    );
    wrongFindingCount += 1;
  }
  log.push(`${viewportName} explorer/quest-problem-wrong-answer: ${wrongFindingCount} finding(s), ${rWrong.screenshot}`);

  let gotCorrect = false;
  for (let i = 0; i < stepProblemCount && !gotCorrect; i++) {
    if (!(await skipToNextProblem(page))) break;
    await ensureFreshProblem(page);
    gotCorrect = await answerCurrentProblem(page, true);
  }
  if (gotCorrect) await page.waitForSelector(".tr-explanation", { timeout: 5000 }).catch(() => {});
  consoleErrors.length = 0;
  const rCorrect = await checkCurrentPage(page, "quest-problem-correct-answer", viewportName, allFindings, consoleErrors);
  let correctFindingCount = rCorrect.findingCount;
  if (!gotCorrect) {
    pushCoverageDegraded(
      page,
      "quest-problem-correct-answer",
      viewportName,
      allFindings,
      `skipToNextProblem/answerCurrentProblem(page, true) never registered a correct answer across ` +
        `${stepProblemCount} problem(s) tried in this step -- this state degraded to screenshotting ` +
        "whatever landing state was already on screen instead of the explanation panel it is meant to exercise.",
    );
    correctFindingCount += 1;
  }
  log.push(`${viewportName} explorer/quest-problem-correct-answer: ${correctFindingCount} finding(s), ${rCorrect.screenshot}`);

  // Switch back to the seeded owner's own explorer profile -- returnToPicker/selectProfile are
  // the same real, already-exercised mechanism the sprout/parent transitions below use, rather
  // than trusting an implicit redirect off whatever localStorage happens to hold.
  await signIn(page, sweep.bundle, sweep.ownerToken, SEEDED_OWNER_UID);
  await returnToPicker(page, SEEDED_HOUSEHOLD_ID);
  await selectProfile(page, "explorer");
}

// Returns to the profile picker the same way SwitchProfileButton does under the hood
// (lib/session.tsx's setActiveProfile(undefined) just clears the persisted choice and lets
// RequireProfile's own redirect effect send the app back to "/"): clearing the same
// localStorage key directly, then navigating. The picker's own "Switch profile" button is
// exercised for real by every explorer/sprout/parent route (it renders in the Header on every
// one of them, and is subject to the same button-color and contrast checks there); after many
// route visits in a single long-running dev-mode page Playwright would occasionally see it
// flicker in and out under React Fast Refresh, so driving it by real click for every profile
// switch bought flakiness with no extra coverage -- this buys back the reliability without
// dropping the check.
function freshUrl(pathAndQuery) {
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  return `${DEV_URL}${pathAndQuery}${sep}verifyUiNav=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Clears the "home" household's stored active profile and navigates back to "/" so the picker
 * shows -- retried, not a single shot. Task 1b tracked down a real flake here: even with a
 * cache-busted URL (a URL Chromium's back/forward cache has never seen cannot be served from
 * it -- this matters because this gate now revisits "/" more than once per run, e.g. every
 * returnToPicker call and the isolated sweep identity switch too), a fresh "/" load can still
 * land on a profile route instead of the picker, with the "home" localStorage key already
 * provably cleared at the time -- an already-in-flight client redirect from the *previous*
 * page (the reload that switched auth back to the seeded owner, whose active-profile read still
 * legitimately pointed at the profile this call is trying to clear) apparently outracing the
 * fresh navigation often enough to matter across dozens of runs. Clearing storage and
 * re-navigating to a *new* cache-busted URL until `.tr-picker` (ProfilePicker's own root class)
 * actually renders is the same "buys back reliability without dropping the check" tradeoff this
 * file already makes elsewhere (see the click-vs-localStorage comment two functions up) --
 * bounded, not silent: it still throws if the picker genuinely never appears.
 */
async function returnToPicker(page, householdId) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await waitForSettled(page);
    await page.evaluate((hid) => {
      window.localStorage.removeItem(`wonderloop:activeProfile:${hid}`);
    }, householdId);
    await page.goto(freshUrl("/"), { waitUntil: "load" });
    await waitForSettled(page);
    if ((await page.locator(".tr-picker").count()) > 0) return;
    if (attempt === 4) {
      throw new Error(`returnToPicker: .tr-picker never rendered after ${attempt} attempts (stuck on ${page.url()})`);
    }
  }
}

/**
 * Clicks a profile tile on the picker and waits for its route -- retried, not a single shot,
 * for the same reason returnToPicker above retries: the picker's own fetch (listProfiles) can
 * still be catching up with a household this gate itself just wrote (the isolated sweep
 * household, freshly reset immediately before this is called) or a stray redirect can still be
 * settling, either of which shows up here as the named tile not being clickable yet rather than
 * as a real absence of the profile. Reloading to a fresh URL and re-checking is cheap and keeps
 * this from failing the whole gate over a timing race that has nothing to do with the app.
 */
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

/**
 * Task 25 preflight, added after a real incident during this task's own development: the
 * Firebase emulator suite can partially crash -- one component (the Firestore rules server, in
 * the incident this came from) throwing took the emulator UI/hub and Storage down with it, while
 * Firestore and Auth kept answering requests completely normally. A sweep run against that
 * half-alive suite does not fail cleanly at the door the way
 * the FIRESTORE_EMULATOR_HOST guard above does -- it fails confusingly, deep inside the sweep,
 * in ways that are genuinely indistinguishable from a real regression by reading the run's own
 * output alone: an auth retry loop giving up after 4 attempts, `#tr-week-select` never appearing
 * and timing out, a portfolio screenshot missing its photo because Storage never answered
 * getDownloadURL. Two ~4-minute sweep runs during this task's own development produced exactly
 * that -- their "results" (a crash, and a visual-regression finding on a screen nothing had
 * touched) meant nothing, and the only way to tell was noticing the emulator UI was unreachable.
 *
 * This will not catch every possible half-alive state (a component that answers but is itself
 * corrupted, for instance), but it catches the one that actually happened, in under a second,
 * before this sweep spends any of its ~4 minutes on data that might not reliably be there --
 * exactly the "fail loudly with a clear message" the incident showed was missing.
 */
async function assertEmulatorsHealthy() {
  const fail = (detail) => {
    throw new Error(
      `verify-ui: refusing to run -- the emulator suite does not look fully healthy (${detail}). ` +
        "This is exactly how a partially crashed suite shows up: one component can throw and take " +
        "others down with it while the rest keep answering individual requests fine, which is what " +
        "makes a sweep run against it fail confusingly deep inside instead of here. Check " +
        "`npm run emulators`'s own terminal for a crash, and do not restart it yourself if someone " +
        "else is managing it -- ask, then re-run this gate once it reports healthy again.",
    );
  };

  let hubConfig;
  try {
    const res = await fetch(`http://${EMULATOR_UI_HOST}/api/config`);
    if (!res.ok) fail(`emulator UI/hub at http://${EMULATOR_UI_HOST} responded with HTTP ${res.status}`);
    hubConfig = await res.json();
  } catch (err) {
    fail(`emulator UI/hub at http://${EMULATOR_UI_HOST} did not respond (${err.message})`);
  }
  if (hubConfig.projectId !== PROJECT_ID) {
    fail(`emulator UI/hub reports projectId "${hubConfig.projectId}", expected "${PROJECT_ID}"`);
  }

  // The hub's own /api/config reflects firebase.json's static declaration of which emulators
  // *should* run, not whether each one is actually alive right now -- ping every one this sweep
  // depends on directly. verify-ui.mjs itself only ever talks to Firestore and Auth (Storage is
  // only ever touched by the browser, deep into the sweep, loading the portfolio photo -- see
  // checkCurrentPage's image-load wait), so this is the only direct check Storage gets before
  // that point.
  for (const [name, host] of [
    ["auth", AUTH_EMULATOR_HOST],
    ["firestore", process.env.FIRESTORE_EMULATOR_HOST],
    ["storage", STORAGE_EMULATOR_HOST],
  ]) {
    try {
      // Any response at all -- even a 4xx from hitting a bare root path an emulator does not
      // specially handle -- proves the process is up and accepting connections; only a network-
      // level failure (ECONNREFUSED, etc.) means it is actually down.
      await fetch(`http://${host}/`);
    } catch (err) {
      fail(`${name} emulator at http://${host} did not respond (${err.message})`);
    }
  }
}

async function run() {
  // Task 1b: this gate now performs its own firebase-admin Firestore writes (the isolated
  // sweep household below) in addition to the custom-token minting it always did. Both are
  // emulator-only by construction (mintCustomToken forces FIREBASE_AUTH_EMULATOR_HOST; a real
  // project would refuse an unauthenticated admin app anyway), but refusing loudly up front --
  // the same guard scripts/seed-emulators.ts already uses -- is cheaper than finding that out
  // from a stack trace, and makes the emulator-only contract explicit rather than incidental.
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error(
      "verify-ui: refusing to run -- FIRESTORE_EMULATOR_HOST is not set. This gate is " +
        "emulator-only: it creates and deletes its own isolated sweep household via " +
        "firebase-admin (see SWEEP_UID/SWEEP_HID near the top of this file) and must never do " +
        "that against a real project. Run against the local emulators (npm run emulators), or " +
        "via `npm run verify:ui`, which loads .env.development.local.",
    );
    return 1;
  }

  console.log(`verify-ui: checking the emulator suite is fully healthy (${EMULATOR_UI_HOST})...`);
  try {
    await assertEmulatorsHealthy();
  } catch (err) {
    console.error(err.message);
    return 1;
  }
  console.log(`verify-ui: emulator suite healthy, projectId ${PROJECT_ID} confirmed.`);

  console.log(`verify-ui: allowlisting ${SEEDED_OWNER_UID} (${SEEDED_OWNER_EMAIL}) and ${SWEEP_UID} (${SWEEP_EMAIL})`);
  await ensureAllowlistedIdentity(SEEDED_OWNER_UID, SEEDED_OWNER_EMAIL);
  await ensureAllowlistedIdentity(SWEEP_UID, SWEEP_EMAIL);

  console.log(`verify-ui: minting custom token for ${SEEDED_OWNER_UID} against ${AUTH_EMULATOR_HOST}`);
  const token = await mintCustomToken(SEEDED_OWNER_UID);
  const sweepToken = await mintCustomToken(SWEEP_UID);
  const bundle = await buildSignInBundle();
  const db = await getSweepDb();

  const frozenNow = await computeFrozenNow(db);
  FROZEN_NOW_MS = frozenNow;
  console.log(
    `verify-ui: freezing the browser clock to ${new Date(frozenNow).toString()} ` +
      "(local noon on the seeded explorer profile's startDate) for determinism.",
  );
  if (UPDATE_BASELINES) {
    console.log(
      "verify-ui: --update-baselines is set -- every VISUAL_TARGETS screen's current screenshot " +
        "will REPLACE its committed baseline in docs/visual-baselines/. Look at the screenshots " +
        "in docs/screenshots/ first if you have not already; this is the deliberate accept step.",
    );
  }

  const browser = await chromium.launch();
  const allFindings = [];
  const log = [];

  try {
    await runAllViewports(browser, { token, sweepToken, bundle, db, frozenNow }, allFindings, log);
  } finally {
    // Always close, even on a crash mid-sweep -- an earlier debugging run that skipped this
    // left orphaned chrome.exe processes behind that then starved a later real run of
    // resources (see the task-14 report's "flake" note).
    await browser.close();
    // The isolated sweep household never needs to survive past this run: delete it whether the
    // run passed or failed, so nothing this gate created ever lingers for a developer to notice
    // (see the SWEEP_UID/SWEEP_HID comment near the top of this file).
    console.log(`verify-ui: deleting isolated sweep household (households/${SWEEP_HID}) -- never the developer's seeded data.`);
    await teardownSweepHousehold(db);
  }

  console.log("\n=== verify-ui: route summary ===");
  for (const line of log) console.log(line);

  if (allFindings.length === 0) {
    console.log("\nverify-ui: PASS -- no findings across all routes and viewports.");
    return 0;
  }

  console.log(`\n=== verify-ui: ${allFindings.length} finding(s) ===`);
  for (const f of allFindings) {
    console.log(`[${f.rule}] ${f.viewport} ${f.route} (${f.label})\n  selector: ${f.selector}\n  ${f.detail}`);
  }
  console.log(`\nverify-ui: FAIL -- ${allFindings.length} finding(s). See selectors above.`);
  return 1;
}

async function runAllViewports(browser, session, allFindings, log) {
  const { token, sweepToken, bundle, db, frozenNow } = session;
  for (const viewport of VIEWPORTS) {
    console.log(`\n=== viewport ${viewport.name} ===`);
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    // Task 25 determinism, in order:
    //  - the clock: fixed, not installed/frozen-timers -- see computeFrozenNow's own comment.
    //    Fixed-time leaves setTimeout/setInterval running on the real clock (so this sweep's own
    //    waits, retries and the app's own loading states still behave normally), it just makes
    //    every Date.now()/new Date() read inside the page return the same instant forever.
    //  - reduced motion: honoured via Playwright's real media-feature emulation, which flips the
    //    app's own `@media (prefers-reduced-motion: reduce)` rule (app/globals.css) that already
    //    collapses every animation/transition duration to 0.001ms -- no separate CSS override
    //    needed here, the app already built the accessible affordance this sweep now benefits
    //    from too.
    //  - the Next.js dev-mode indicator (the `nextjs-portal` custom element -- route info /
    //    build-activity widget, dev-only, never present in a production build): hidden via an
    //    init script so it can never occupy a few pixels of one screenshot and not the next.
    await context.clock.setFixedTime(frozenNow);
    await context.addInitScript(() => {
      // addInitScript runs before the document has necessarily parsed a <head> yet (it can run
      // against a still-empty document) -- fall back to DOMContentLoaded rather than assuming
      // document.head already exists.
      const inject = () => {
        const style = document.createElement("style");
        style.textContent = "nextjs-portal { display: none !important; }";
        document.head.appendChild(style);
      };
      if (document.head) inject();
      else document.addEventListener("DOMContentLoaded", inject);
    });
    // Headless Chromium has a speechSynthesis object but no voices, so speak() never fires "end".
    // The Sprout player opens each round only once the previous line has really finished (that
    // gating is what fixed the doubled, overlapping speech a real child heard), so without this
    // the player sits on its tap-to-start screen until a multi-second safety timer expires, and
    // every Sprout screenshot the gate ever took was an empty ground with one play button.
    //
    // This double keeps the ordering the player depends on -- one utterance finishes before the
    // next is scheduled -- and only removes the wall-clock wait. It deliberately cannot tell us
    // whether a real device speaks: nothing headless can. That claim belongs to the owner
    // checklist's "confirm Sprout speaks on the actual iPad" and is not answered here.
    await context.addInitScript(() => {
      const listeners = new WeakMap();
      class FakeUtterance extends EventTarget {
        constructor(text) { super(); this.text = text; this.rate = 1; }
        set onend(fn) { listeners.set(this, fn); }
      }
      Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, writable: true, value: FakeUtterance });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        writable: true,
        value: {
          speaking: false,
          paused: false,
          pending: false,
          cancel() {},
          pause() {},
          resume() {},
          getVoices: () => [],
          speak(utterance) {
            // Asynchronous, like the real thing: a synchronous end would run inside speak()'s own
            // call stack and could reorder the player's state updates.
            setTimeout(() => {
              utterance.dispatchEvent(new Event("end"));
              const fn = listeners.get(utterance);
              if (typeof fn === "function") fn(new Event("end"));
            }, 0);
          },
        },
      });
    });
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(`uncaught: ${err.message}`));

    // Pre-auth: sign-in screen.
    for (const route of ROUTES.preAuth) {
      const r = await visitAndCheck(page, route, viewport.name, allFindings, consoleErrors);
      log.push(`${viewport.name} ${route.label}: ${r.findingCount} finding(s), ${r.screenshot}`);
    }

    await signIn(page, bundle, token, SEEDED_OWNER_UID);

    // Picker.
    for (const route of ROUTES.picker) {
      const r = await visitAndCheck(page, route, viewport.name, allFindings, consoleErrors);
      log.push(`${viewport.name} ${route.label}: ${r.findingCount} finding(s), ${r.screenshot}`);
    }

    // Explorer.
    await selectProfile(page, "explorer");

    // "This Week", swept across every week the season has (review finding 1). The initial page
    // load lands on the real current week (1, for the seeded profile); every other week is
    // reached the same one-click way a parent or QA reviewer would reach it, via the real
    // <select id="tr-week-select">, never by re-navigating -- see selectWeek()'s own comment.
    {
      const r0 = await visitAndCheck(page, { path: "/explorer", label: "this-week-w01" }, viewport.name, allFindings, consoleErrors);
      log.push(`${viewport.name} explorer/this-week-w01: ${r0.findingCount} finding(s), ${r0.screenshot}`);
      for (const week of ALL_WEEKS.filter((w) => w !== 1)) {
        consoleErrors.length = 0;
        await selectWeek(page, week);
        const label = `this-week-w${String(week).padStart(2, "0")}`;
        const r = await checkCurrentPage(page, label, viewport.name, allFindings, consoleErrors);
        log.push(`${viewport.name} explorer/${label}: ${r.findingCount} finding(s), ${r.screenshot}`);
      }
    }

    // Quest: every step, not just the landing step/resume position (review finding 3), plus the
    // two ProblemPlayer interactions in visitProblemPlayerInteractions().
    {
      const resumeRoute = { path: `/explorer/quest/${QUEST_ID}`, label: "quest-resume" };
      const rr = await visitAndCheck(page, resumeRoute, viewport.name, allFindings, consoleErrors);
      log.push(`${viewport.name} explorer/quest-resume: ${rr.findingCount} finding(s), ${rr.screenshot}`);

      for (let step = 0; step < QUEST_STEP_COUNT; step++) {
        const route = { path: `/explorer/quest/${QUEST_ID}?step=${step}`, label: `quest-step${step}` };
        const rs = await visitAndCheck(page, route, viewport.name, allFindings, consoleErrors);
        log.push(`${viewport.name} explorer/quest-step${step}: ${rs.findingCount} finding(s), ${rs.screenshot}`);
      }

      await visitProblemPlayerInteractions(page, viewport.name, allFindings, consoleErrors, log, {
        db,
        bundle,
        sweepToken,
        ownerToken: token,
      });
    }

    for (const route of ROUTES.explorer) {
      const r = await visitAndCheck(page, route, viewport.name, allFindings, consoleErrors);
      log.push(`${viewport.name} explorer/${route.label}: ${r.findingCount} finding(s), ${r.screenshot}`);
    }

    // Sprout.
    await returnToPicker(page, SEEDED_HOUSEHOLD_ID);
    await selectProfile(page, "sprout");
    for (const route of ROUTES.sprout) {
      const r = await visitAndCheck(page, route, viewport.name, allFindings, consoleErrors);
      log.push(`${viewport.name} sprout/${route.label}: ${r.findingCount} finding(s), ${r.screenshot}`);
    }

    // Parent.
    await returnToPicker(page, SEEDED_HOUSEHOLD_ID);
    await selectProfile(page, "parent");
    for (const route of ROUTES.parent) {
      const r = await visitAndCheck(page, route, viewport.name, allFindings, consoleErrors);
      log.push(`${viewport.name} parent/${route.label}: ${r.findingCount} finding(s), ${r.screenshot}`);
    }

    // Style gallery (public, no profile needed).
    for (const route of ROUTES.style) {
      const r = await visitAndCheck(page, route, viewport.name, allFindings, consoleErrors);
      log.push(`${viewport.name} ${route.label}: ${r.findingCount} finding(s), ${r.screenshot}`);
    }

    await context.close();
  }
}

run()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("verify-ui: crashed", err);
    process.exit(1);
  });
