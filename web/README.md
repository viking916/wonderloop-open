# Wonderloop web app

Next.js app for the Wonderloop family learning app. The repo-root `README.md` describes what
ships; `docs/content-authoring.md` is the authoring guide and `docs/DEPLOYMENT.md` covers
running it on Firebase, in a container, or fully local.

## Running locally against the Firebase emulators

This app talks to Firebase (Auth, Firestore, Storage). Locally it runs
entirely offline against the Firebase emulator suite, no real project or
credentials needed.

1. Install dependencies (from `web/`):

   ```bash
   npm install
   ```

2. Create `web/.env.development.local` (git-ignored, not present in a fresh
   checkout: this repo never commits it, so create it yourself) with:

   ```
   NEXT_PUBLIC_USE_EMULATORS=true
   FIRESTORE_EMULATOR_HOST=localhost:8380
   FIREBASE_STORAGE_EMULATOR_HOST=localhost:9490
   ```

   `NEXT_PUBLIC_USE_EMULATORS` points the app itself (`npm run dev`) at the
   emulators instead of a real Firebase project; `FIRESTORE_EMULATOR_HOST` is
   read by `npm run seed`'s Admin SDK script, and is also its safety check
   (the script refuses to run without it, so it can never seed sample data
   into a real project by mistake). `FIREBASE_STORAGE_EMULATOR_HOST` is what
   lets that same seed script upload the sample portfolio photo to the
   Storage emulator instead of just writing a Firestore doc that points at
   one -- without it, the seeded artifact's own `getDownloadURL` 404s the
   moment the portfolio tries to show it. Skipping this file does not fail
   loudly: `npm run dev` would silently talk to a real Firebase project
   instead of the emulators. See the Windows note below for why this has to
   be a file rather than an inline env var.

3. Start the emulators (from `web/`, runs `firebase` from the repo root
   where `firebase.json` lives):

   ```bash
   npm run emulators
   ```

   This starts Auth on port 9390, Firestore on port 8380, Storage on port
   9490, and the emulator UI (printed in the terminal, normally
   `http://localhost:4300`). These are deliberately not Firebase's own
   defaults (9099/8080/9199/4000): every Firebase project on this machine
   reaches for those same defaults, and a port collision with another
   project's emulator suite is exactly what this whole port block exists to
   avoid -- see `web/lib/firebase/emulator-ports.mjs`, the single source of
   truth these numbers come from.

4. In another terminal, seed the emulators with a household, profiles and a
   little progress:

   ```bash
   npm run seed
   ```

5. In another terminal, run the app:

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000`.

### Windows note on `NEXT_PUBLIC_USE_EMULATORS`

The app only talks to the emulators when `NEXT_PUBLIC_USE_EMULATORS=true` is
set at build time. Inline env vars on the command line (`FOO=bar next dev`)
do not work in `cmd.exe` or PowerShell, so this repo does not put them in an
npm script; instead, step 2 above has you create `web/.env.development.local`
to set it. Next.js loads `.env.development.local` automatically for
`npm run dev`, and `npm run seed`'s `--env-file` flag loads it directly (see
`package.json`), so no extra flags are needed on either command once the
file exists. Delete or edit that file to point `npm run dev` at a real
Firebase project instead (also fill in `web/.env.local` from
`web/.env.local.example` in that case).

## Other commands

- `npm run lint` -- ESLint, including the React Compiler-era `react-hooks` rules (`react-hooks/set-state-in-effect`,
  `react-hooks/purity`, `react-hooks/refs`) that catch setState-in-effect, impure render-phase calls
  (`Date.now()`, `Math.random()`, etc.) and ref reads/writes during render. Zero errors is required;
  it is part of this project's standing gate alongside the four checks below, specifically because
  those three rule families already caught two real, hard-to-find `ProblemPlayer.tsx` race
  conditions on inspection (a two-listener race and a "Next problem" soft-lock) -- see that file's
  own comments for the history. Warnings are not gated; they get triaged case by case.
- `npm run typecheck` (also builds `generated/content.json` first)
- `npm test` (also builds `generated/content.json` first) -- pure unit tests only, no emulators
  needed; `scripts/rules.test.ts` is deliberately excluded from this suite (see
  `vitest.config.ts`'s `exclude`) so a fresh checkout without the emulators running never fails
  with `ECONNREFUSED`.
- `npm run test:rules` -- firestore.rules assertions plus the data-layer round-trips that need a
  live Firestore (batch chunking in `lib/data/resets.ts`, a full `ProgressDoc` round-trip
  through `lib/data/progress.ts`). Requires `npm run emulators` running first (step 3 above);
  runs `scripts/rules.test.ts` under `vitest.emulator.config.ts`, which is the one place
  `NEXT_PUBLIC_USE_EMULATORS` and `FIREBASE_AUTH_EMULATOR_HOST` are set for it.
- `npm run validate:content` and `npm run content:report`
- `npm run build` (runs `validate:content` then `generate:content` first)

## Verifying every screen (`npm run verify:ui`)

`scripts/verify-ui.mjs` is the UI gate (Plan 2 Task 14, hardened in a Task 14 fix pass, extended
with visual regression in Task 25 -- see the block comment at the top of the script): a
headless-Chromium sweep (via Playwright) that visits every route this app has, for every profile
kind, at four viewports (a laptop, a tablet portrait, an iPad-landscape, and a phone -- 1280x900,
820x1180, 1194x834, 390x844) -- including all 12 of the season's weeks on "This Week" (via the
real `<select id="tr-week-select">`, since per-week content, like the monster card that only
exists in week 11, cannot be checked from week 1) and every step of a quest, not just its landing
step, plus two real ProblemPlayer interactions (a wrong answer, then a correct one) that reach the
hint panel, the 45s cooldown timer, and the explanation panel/idea card -- and fails (non-zero
exit, one line per finding) if it finds:

- text below 4.5:1 contrast against its actual *rendered* background -- composited through
  however many ancestor backgrounds sit behind it, not just `document.body`'s;
- a `<button>` with no explicit CSS `color` (inherited color is exactly how a button goes
  invisible the moment it is reused on a differently-coloured surface);
- a link styled to look like a button (`<a class="tr-btn ...">`) that still shows an underline;
- real horizontal overflow past the viewport, measured from element geometry (an element's
  `getBoundingClientRect()` against the viewport, skipping anything a deliberate inner-scroll
  region or a local `overflow: hidden` ancestor already contains) rather than
  `document.scrollingElement.scrollWidth` -- `overflow-x: hidden` on `html`/`body` means that
  comparison can never fire in this app no matter how much real, visible overflow exists;
- a console error or an uncaught page exception;
- a visual regression on one of the screens listed below (new in Task 25 -- see its own section).

Text that is part of a genuinely inactive control is exempt from the contrast check, matching
WCAG 2.x SC 1.4.3's own "inactive user interface component" exception -- this app dims disabled
buttons on purpose (`.tr-btn:disabled { opacity: 0.5 }`). "Genuinely inactive" means the real
`disabled` property, or `aria-disabled="true"` corroborated by `pointer-events: none` -- a bare
`aria-disabled="true"` alone does not stop a real click, so it does not exempt anything on its
own (see `isInactiveControl()`'s comment in the script).

Run it with the dev server and the seeded emulators already up (steps 3-5 above -- it talks to
`http://localhost:3000` and signs in against the Auth emulator on port 9390, using
`firebase-admin` to mint a custom token for the seeded household owner rather than driving the
real Google popup, since the popup would sign in as some other, freshly emulator-minted account
with no seeded data). It refuses to start (fast, before touching anything) if the emulator suite
does not look fully healthy -- see "A note on the emulator suite" below.

```bash
npm run verify:ui
```

It writes one screenshot per route/viewport to `../docs/screenshots/` (repo-root
`docs/screenshots/`, not a `web/`-local copy -- keep every screenshot in that one place) named
`verify-ui-<route>-<viewport>.png`, and prints a route-by-route summary followed by every finding
(rule, route, viewport, selector, detail) before exiting non-zero. The full sweep is 29
routes/states per viewport (116 total) and takes about 4 minutes; there is no separate fast mode
-- `npm run verify:ui` is always the full sweep, deliberately, since a narrower default is exactly
how the route table went stale before.

The seeded emulator persists progress across runs, so the quest-step interaction (the wrong
answer, then the correct one) is written to be idempotent-ish across reruns rather than assuming
a pristine profile: it identifies whatever problem is actually on screen (not by position), uses
the app's own "Try it again" to reset a problem an earlier run already finished, and gives a
control up to 15s to become actionable before giving up on it (long enough to ride out
`ProblemPlayer`'s own post-submit save chain, short enough that a real 45s cooldown left by a
very recent prior run still reliably times out rather than hanging).

### A note on the emulator suite

The emulator suite can partially crash -- one component (the Firestore rules server, in an
incident this gate's own development ran into) throwing can take the emulator UI/hub (port 4300)
and Storage (9490) down with it, while Firestore (8380) and Auth (9390) keep answering requests
completely normally. A sweep run against that half-alive state does not fail cleanly -- it fails
confusingly, deep inside the sweep, in ways that are genuinely indistinguishable from a real
regression by reading the run's own output alone (an auth retry loop giving up, a selector timing
out, a screenshot missing a photo that never loaded). `verify-ui.mjs` now checks the emulator
UI/hub reports the expected project before doing anything else, and refuses to start with a clear
message if it does not -- if you ever see that refusal, do not restart the emulators yourself if
someone else is managing them; ask, then re-run once they report healthy.

### Visual regression (`docs/visual-baselines/`)

The checks above are all real, but every one of them is blind to "this looks wrong": a button that
looks like a text field, a status chip that looks pressable, a sun clipped behind a star row, a
card with a large empty gap -- exactly the class of defect that, in practice, has been found by
looking at the app, not by this gate. Visual regression does not fix that blind spot: it compares
a fresh screenshot against a committed, human-approved baseline, so it was never going to catch a
defect that was already there when the baseline was approved. What it catches is a fix silently
drifting back, or an unrelated change knocking a screen out of shape without anyone noticing.

**What's covered.** Eleven screens, at all four viewports (44 baselines): the profile picker,
This Week (week 1), a quest landing (`quest-resume`), both ProblemPlayer interaction states (the
hint panel after a wrong answer, and the explanation after a correct one -- "the problem player"
has two meaningfully different states worth protecting, not one), the portfolio, the skills map,
the Sprout hill, a Sprout activity, the parent view, and the style gallery. Every *other*
screenshot this sweep takes (all 12 weeks, every quest step) is still captured and still checked
by every rule above -- it is just not baseline-compared pixel-for-pixel; one representative
week/step per screen is enough to catch an unintended visual regression without multiplying the
accept-new-baselines surface for very little extra protection.

**Library: pixelmatch + pngjs.** pixelmatch is the de facto standard for pixel-level PNG
comparison in Node (the same library Playwright's and Jest's own image-snapshot tooling use); it
compares in YIQ colour space with built-in anti-aliased-pixel detection, so ordinary subpixel
rendering noise is already filtered out before threshold logic ever runs. pngjs is its natural
pairing -- a pure-JS PNG decoder/encoder with no native build step, so it adds no new native
dependency risk to a machine that already needs a working Playwright/Chromium install.

**Threshold: 0.1% of the image's pixels (`MAX_DIFF_RATIO` in the script).** pixelmatch's own
per-pixel colour-distance threshold is left at its default (0.1, already tuned to separate real
colour changes from antialiasing). The real lever is what fraction of the image is allowed to
differ before it is a finding: three consecutive full sweeps against an unmodified tree (see the
Task 25 report) produced **0** mismatched pixels on every one of the 44 baselines, all three
times, once the determinism work below was done. 0.1% is comfortably above that observed 0-pixel
noise floor (the tallest full-page captures here are roughly 1280x4000px, ~5.1M px, so 0.1% is
~5,100px of headroom) while still multiple orders of magnitude below what a real one-line CSS
change moves (a padding nudge on the picker tiles moved 2.6-13% of the pixels on that screen, at
every viewport, in the demonstration in the Task 25 report).

**Accepting a new baseline is a separate, deliberate act, never a side effect of a normal run:**

```bash
npm run verify:ui -- --update-baselines
```

Look at the plain screenshots in `docs/screenshots/` (or the failing diffs, if a normal run just
flagged something) *before* running this. It overwrites every one of the 44 committed baselines
in `docs/visual-baselines/` with this run's fresh capture, unconditionally, for every screen in
`VISUAL_TARGETS` -- there is no per-screen accept. A plain `npm run verify:ui` never writes to
`docs/visual-baselines/` under any circumstances.

**Reading a diff.** A visual-regression finding names a PNG under `docs/visual-diffs/` (gitignored
scratch output, wiped and rewritten at the start of every run -- never accumulated, never
committed): pixelmatch's own diff image, the approved baseline faded to near-white with every
differing pixel painted in solid red. A tight red cluster around one element is a local change (a
colour, a padding, a line of text); red that fills a whole region below some point on the page is
a layout shift that pushed everything after it down or sideways -- exactly what a padding change
on the profile picker's tiles looks like (see the Task 25 report's demonstration screenshot). If
the baseline and the fresh capture differ in actual pixel dimensions (a layout that changed height
entirely), no meaningful pixel diff is possible; the "diff" is just the fresh capture itself, so
you are looking at the new screenshot directly.

### Determinism (why this doesn't cry wolf)

A flaky visual-regression suite is worse than none -- it gets `--update-baselines`'d without a
second look, and then it is not protecting anything. Everything below exists to make a clean tree
produce the exact same 44 screenshots every time, proven by three consecutive zero-finding runs
(see the Task 25 report for the actual output):

- **The browser clock is frozen**, not the wall clock: `context.clock.setFixedTime()` (Playwright's
  fixed-time mode -- `Date.now()`/`new Date()` always return the same instant; real timers, and
  this gate's own waits and retries, are untouched). Frozen to local noon on the seeded explorer
  profile's own `startDate` (read fresh from Firestore each run, so this self-corrects after a
  reseed rather than needing a hand-maintained constant), which keeps `currentWeekFor` computing
  week 1 regardless of how much real time has passed since seeding. Every `checkCurrentPage` call
  re-asserts the browser's `Date.now()` still equals the frozen value before trusting a screenshot,
  and crashes loudly if it does not -- added after this exact assumption was violated once for a
  more surprising reason (see the next bullet).
- **Firestore's `serverTimestamp()` is not reachable by a browser clock override.** This app
  deliberately stamps every persisted timestamp (`lib/data/types.ts`'s `converterWithTimestamps`)
  with the *emulator process's own real system clock* on write, never a client-supplied value -- a
  correct choice for the real app, but it means the one attempt this sweep submits through the
  real UI (the ProblemPlayer wrong-answer interaction) gets a real-wall-clock `at`, however
  correctly the page's own clock is frozen. `visitProblemPlayerInteractions` overwrites that one
  attempt's `at` back to the frozen value via `firebase-admin` (raw writes bypass the converter)
  immediately after submitting, and waits for the real UI to reflect it, so the 45s cooldown
  countdown renders through the app's genuine code path at a genuine, stable "0:45" -- not a
  screenshot-time patch. (A DOM-text overwrite and then a synthetic overlay were both tried first
  and abandoned: the DOM patch does not survive React's next re-render, and the overlay does not
  survive the real layout width a much-longer real-time number lays out at, at the 390px viewport.
  Both are still in this file's git history if you want to see why they were not good enough.)
- **Fonts are awaited**: `document.fonts.ready` before every screenshot, since next/font
  self-hosts but still loads asynchronously -- a capture mid font-swap differs from run to run for
  reasons that have nothing to do with the app.
- **Images are awaited**: every `<img>` currently in the DOM (the portfolio's photo artifact is a
  two-stage async load -- a Storage `getDownloadURL` round-trip, then the image bytes -- neither
  gated by the page-level loading indicator this gate already waits for) must finish loading (or
  fail) before the screenshot fires. Found the hard way: the very first repeat-run check this
  gate's own development did caught the portfolio's height varying by exactly this.
- **Reduced motion is honoured** via Playwright's real `prefers-reduced-motion: reduce` media
  emulation, which flips this app's own `@media (prefers-reduced-motion: reduce)` rule
  (`app/globals.css`) that already collapses every animation/transition duration to 0.001ms -- no
  separate CSS override needed, the app's own accessibility affordance does the work.
- **The Next.js dev-mode indicator is hidden**: the `nextjs-portal` custom element (a dev-only
  route/build-activity widget, never present in production) is hidden via a context-level init
  script, so it can never occupy a few pixels of one screenshot and not the next.
- **Seeding was already deterministic**: `scripts/seed-emulators.ts` derives every timestamp it
  writes from a fixed base (the Monday of the seeding week at 09:00), never `Date.now()`, and
  contains no randomness -- verified, not assumed, before relying on it here.

One more thing worth knowing before trusting a confusing result: the emulator suite itself can
partially crash and produce exactly this kind of unexplainable flakiness from the *outside* of
this gate entirely -- see "A note on the emulator suite" above.
