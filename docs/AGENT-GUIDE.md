# Agent guide: Wonderloop (ai-teaches)

This is the onboarding document for any agent, or any human, picking up this repository with no
prior context. Read it once at the start of a session. If anything in it turns out to be wrong or
out of date, fix it in the same session you find the problem, per the last section.

## 1. What this project is

Wonderloop is a home curriculum for children, delivered as a small web app one family runs for
itself. It packages a twelve-week season at a time, one week at a time, and every week ends with
a real product: a program, a built thing, a talk, a written proof, or a recording. Nothing counts
as done without a checked answer, a photo, a recording, or a written log; there are no points,
streaks, or daily guilt anywhere in it. The curriculum is the actual product; the Next.js app
is the container that runs it, tracks progress, and keeps a portfolio.

There are three kinds of user:

- **The Explorer**, roughly ages 8 to 11. Gets four or five quests a week across five tracks
  (Build, Make, Think, Speak, and the optional Play track for an instrument), each about an hour,
  plus access to a separate mastery-based math sequence called the Ladder.
- **The Sprout**, roughly ages 2 to 4. Gets three short tap-and-listen activities a day (pre-math
  and pre-coding: patterns, sorting, sequencing, counting, shapes) plus one hands-on card a week
  for a grown-up to run. Nothing is readable, nothing is failable, everything is spoken.
- **The parent**, about an hour a week: the Showcase, the Sprout card, the logs, the shopping
  list, and the Parent view's controls (profiles, season starts, resets, the family's AI key).

Several families can run the same deployment, each in its own household with its own children,
its own week clock, and its own data. One household never sees another; this is enforced by
Firestore and Storage security rules, not by the application code.

## 2. Repo map

This folder is its own standalone git repository, since 2026-09-13: its own `.git`, remote
`origin` at `https://github.com/viking916/wonderloop.git`, branch `main`. Run git from inside this
folder; `git rev-parse --show-toplevel` prints this folder. The parent folder `C:\Work` holds an
older repository, on a different branch, that no longer tracks any file here; it must never be
used for Wonderloop work. See section 4 for how to push, and section 7's 2026-09-13 entry for why
the split happened and what it means for commit hashes quoted in older docs.

Top level of the repo:

- `web/`: the Next.js 16 app. Everything below is inside here unless noted.
- `content/`: the curriculum as plain JSON, validated by the app's own schema. This is data, not
  code; it never imports anything from `web/`.
- `docs/`: this guide, the authoring contract, the UI styleguide, the deployment guide, the
  deploy runbook, owner-facing checklists and questions, review write-ups, and the
  `superpowers/` subtree of specs, plans, and the season authoring status log.
- `firestore.rules`, `storage.rules`, `firestore.indexes.json`: the security rules that keep one
  household's data invisible to every other household, and keep a family's AI key readable by
  nothing but the server.
- `firebase.json`, `firebase.docker.json`, `.firebaserc`: Firebase project wiring. `.firebaserc`
  maps the alias `prod` to the real Firebase project id, `wonderloop-3d9d5`, and `default` to the
  local emulator project id, `wonderloop-dev`.
- `docker-compose.yml`, `Dockerfile`, `.dockerignore`: the fully-local and container run paths.
- `scripts/` (repo root, not `web/scripts/`): `export-public.mjs` and `publish-public.sh` build
  and force-push the scrubbed public snapshot; `push-github.sh` pushes this project's own history
  to its private GitHub repo.
- `design-demos/`, `screenshots/`: design references and a screenshot archive at the repo root
  (distinct from `docs/screenshots/`, which is what `verify:ui` writes to).
- `.claude/skills/ui-review/SKILL.md`: the project-local skill that points any UI work at
  `docs/ui-styleguide.md` before it can be called done.
- `LICENSE` (code, MIT) and `LICENSE-CONTENT.md` (curriculum content, CC BY-NC-SA 4.0).

Inside `web/app` (Next.js App Router routes), one line each:

- `app/page.tsx`: entry point, handles sign-in and profile routing.
- `app/layout.tsx`: root layout.
- `app/explorer/page.tsx`: This Week, the Explorer's home screen (season strip, week's cards,
  monster problem, season book, mistake box).
- `app/explorer/quest/[questId]/page.tsx`: a single quest, one step at a time.
- `app/explorer/portfolio/page.tsx`: the growing field-journal portfolio (photos, code,
  recordings, proofs, logs).
- `app/explorer/skills/page.tsx`: the skills map and the idea box.
- `app/explorer/review/page.tsx`: the mistake box / explain-it review queue.
- `app/explorer/ladder/page.tsx`: the Ladder, the separate mastery-based math sequence.
- `app/sprout/page.tsx`: the Sprout hill (activity picker for the toddler track).
- `app/sprout/activity/[activityId]/page.tsx`: a single Sprout activity.
- `app/parent/page.tsx`: the Parent view, a title area, a child switcher when there is more than
  one child, and five tabs kept in the URL hash: This week (`#week`: the child's card, weekly
  paragraph, quests, Ladder summary, calibration), Season plan (`#plan`: `SeasonIndex`, every week
  of a season with its quest titles, skills, ideas, kit and the sprint's game), To review
  (`#review`: mistake box, logs, debates, Ask transcripts, parent activities), Shopping
  (`#shopping`) and Settings (`#settings`: invite, profiles, PIN, AI key, device checks, then every
  reset including the per-quest ones). Each child's section stays mounted whatever the tab, because
  it owns the Firestore subscriptions and reports the child's current week upward.
- `app/privacy/page.tsx`, `app/terms/page.tsx`: the consent-gate legal pages.
- `app/style/page.tsx`: the style gallery, a reference page for every UI primitive and figure
  kind, used as one of the visual regression baselines.
- `app/api/ai/debate`, `app/api/ai/tutor`, `app/api/ai/health`, `app/api/ai/key`: the server-side
  AI routes. All calls to Anthropic happen here, never in client code, and are billed to the
  family's own key. `tutor` is Ask (12 September 2026), the Socratic tutor a child can open
  beyond the authored hints; it never states a final answer.

Inside `web/components`: `quest/` holds the ProblemPlayer and every step and figure component
(problem kinds, hints, explanations, Ask's panel, the working space, recording and photo capture,
all the figure kinds like LedMatrix, ProblemFigure, AnimatedDiagram, SceneFigure); `parent/` holds
every Parent view card, including Ask's saved transcripts; `explorer/` holds the nav, side strip,
and track cards; `sprout/` holds the toddler-track player and its speech and orientation hooks;
`portfolio/`, `skills/`, `ladder/` hold those screens' pieces; `ui/` holds shared primitives
(Button, Card, Chip, Header, Toast, and so on); a handful of top-level components handle sign-in,
consent, and profile switching.

Inside `web/lib`: `content/` loads, validates against Zod schemas, and bundles the curriculum
(`load.ts`, `schema.ts`, `app-content.ts`); `domain/` is pure, unit-tested business logic with no
Firebase dependency (calendar and week math, completion rules, skills leveling, the Ladder engine,
badges, debate rules, the review/mistake-box logic, Ask's shared child-message cap, the Parent
view's season index `seasonIndex.ts`, and so on, each with its own `.test.ts`); `data/` is the Firestore and Storage read/write layer (households,
progress, artifacts, logs, resets, Ask's saved transcripts, the allowlist); `ai/` is the
server-only Anthropic integration (`client.ts`, `debate.ts`, `tutor.ts`,
`auth.ts`, `usage.ts`, `keys.ts`); `firebase/` holds the client and admin SDK setup and the single
source of truth for emulator port numbers, `emulator-ports.mjs`.

Inside `web/scripts`: the gates (`validate-content.ts`, `generate-content.ts`, `content-report.ts`,
`verify-ui.mjs`), operational scripts (`seed-emulators.ts`, `allowlist.ts`, `bootstrap-household.ts`,
`ai-key.ts`, `check-externals.mjs`), and a long tail of one-off `*-screenshots.mjs` files, each
written for a specific task or content landing to drive the real app and capture proof. Most of
these are historical records of a specific change, not reusable tooling; `verify-ui.mjs` and
`figure-gallery.tsx` are the ones meant for repeated use, along with `polish-screenshots.mjs`
(every main screen at chosen viewports, `--only=` and `--viewports=`, Parent view past its PIN
prompt, tall pages also as viewport tiles) and `parent-tabs-screenshots.mjs` (every Parent tab,
both Season plans), both added 15 September 2026 and both waiting for real data rather than a
duration. `figure-lint.py` checks authored figures
for label collisions and off-canvas content before they land.

**Content location and how it becomes the app.** All curriculum content lives in `content/` at
the repo root, as plain JSON: `content/seasons/{1..4}/weeks/{01..12}/{build,make,think,speak,play}.json`
one file per track per week (`play.json` only where a Play track is authored for that week),
`content/sprout/weeks/{01..12}.json` for season 1's Sprout weeks and `content/sprout/seasons/{2,3,4}/`
for the other three, `content/ladder/graph.json` (the topic DAG for all six math stages) and
`content/ladder/topics/<topic-id>.json` (one file per authored topic, with its idea card, worked
example, problem bank, and ways), and the registries `content/ideas.json`, `content/skills.json`,
`content/motions.json`, `content/books.json`, `content/games.json`, `content/lessons.json`,
`content/materials.json` (plus a per-season `materials.json` under `content/seasons/{2,3,4}/`,
since season 1's materials sit in the root file).

None of this reaches the running app directly. `npm run validate:content` (`web/scripts/validate-content.ts`)
runs every file through the Zod schemas in `web/lib/content/schema.ts` and the cross-reference and
authoring-rule checks in `web/lib/content/load.ts`, and fails loudly on any violation.
`npm run generate:content` (`web/scripts/generate-content.ts`) then loads the whole validated tree
and writes it to a single bundle, `web/generated/content.json`, which the app imports at build and
test time. This is why `typecheck`, `test`, and `build` all run `generate:content` first (see their
`pre*` npm hooks below): the generated bundle can silently go stale if content changes and nothing
regenerates it, which is exactly the season 3 incident recorded in `docs/content-authoring.md`
("run the tests through npm, not vitest directly"). `web/generated/` is build output, not something
to hand-edit. Changing a JSON file under `content/` and rebuilding is the entire content deploy;
there is no separate content pipeline or CMS.

## 3. Running it locally

Requirements: Node 22 (pinned in `web/package.json`'s `engines`), the Firebase CLI, and (for
anything beyond the emulators) a Firebase project of your own on the Blaze plan.

Standard local loop, from `web/`:

```
npm install
```

Create `web/.env.development.local` (git-ignored, not present in a fresh checkout, create it
yourself) with:

```
NEXT_PUBLIC_USE_EMULATORS=true
FIRESTORE_EMULATOR_HOST=localhost:8380
FIREBASE_STORAGE_EMULATOR_HOST=localhost:9490
```

Then, in separate terminals:

```
npm run emulators     # Auth 9390, Firestore 8380, Storage 9490, emulator UI ~4300
npm run seed          # a demo household with sample progress, needs the emulators up
npm run dev           # http://localhost:3000
```

**Windows specifics, from `web/README.md`:** inline environment variables on the command line
(`FOO=bar next dev`) do not work in `cmd.exe` or PowerShell, which is why `NEXT_PUBLIC_USE_EMULATORS`
must be set through the `.env.development.local` file rather than an npm script flag; Next.js
loads that file automatically for `npm run dev`, and `npm run seed` loads it via its own
`--env-file` flag, so no extra flags are needed once the file exists. The emulator ports
(9390/8380/9490/4300) are deliberately not Firebase's own defaults (9099/8080/9199/4000), because
every Firebase project on this machine reaches for the defaults and this repo's own emulator
suite needs to coexist with other projects' emulators in the same shared `C:\Work` tree without a
port collision. The single source of truth for these numbers is `web/lib/firebase/emulator-ports.mjs`.

Gates, run from `web/`:

- `npm run lint`: ESLint, including React Compiler-era `react-hooks` rules; zero errors required,
  warnings triaged case by case.
- `npm run typecheck`: `tsc --noEmit`, after regenerating the content bundle.
- `npm test`: `vitest run`, pure unit tests, no emulators needed; also regenerates the content
  bundle first. Deliberately excludes `scripts/rules.test.ts`.
- `npm run test:rules`: Firestore rules assertions and data-layer round-trip tests that need a
  live Firestore; requires `npm run emulators` running first.
- `npm run validate:content` and `npm run content:report`: the content gate and a human-readable
  report of it.
- `npm run build`: runs `validate:content` then `generate:content` first, via its `prebuild` hook.

**`npm run verify:ui`** is the visual gate (`web/scripts/verify-ui.mjs`). It needs the dev server
and the seeded emulators already running, then drives headless Chromium (Playwright) across every
route, every profile kind, at six viewports, including all 12 weeks of This Week, every step of a
quest, two real ProblemPlayer interactions (a wrong answer, then a correct one), and the Parent
view's PIN prompt plus its This week/Season plan/Settings tabs (reached for real, by pressing
"Not now" on the PIN prompt and clicking each tab). It fails on low text contrast against the
actual rendered background, a button with no explicit CSS color, a link styled as a button that
still shows an underline, real horizontal overflow, any console error or uncaught exception, and a
visual regression against one of 90 committed baselines in `docs/visual-baselines/` (15 screens
times 6 viewports). It writes one screenshot per route and viewport to `docs/screenshots/` at the
repo root (not a `web/`-local copy) and takes about 4-5 minutes; there is no fast mode. Accepting
new baselines is a separate, deliberate command,
`npm run verify:ui -- --update-baselines`, and should only follow looking at the fresh screenshots
or the failing diffs first. See `web/README.md`'s "Verifying every screen" section for the full
mechanics (why the browser clock is frozen, why fonts and images are awaited, and so on) if this
gate ever needs debugging.

## 4. How to deploy

The Firebase project id is **`wonderloop-3d9d5`** (alias `prod` in `.firebaserc`). There are three
supported ways to run the app, all described in `docs/DEPLOYMENT.md`:

**A. Fully local, nothing in the cloud.** `docker compose up --build`, optionally
`docker compose run --rm seed`. Data lives only in the emulators.

**B. Your own Firebase project, Firebase Hosting (the way the real deployment runs).** One-time
setup: create a Blaze-plan project, enable Auth (Google provider), Firestore, and Storage; put the
web config in `web/.env.production.local` plus a long random `AI_KEY_SECRET`; point `.firebaserc`
at the project id; create the secret with
`firebase functions:secrets:set AI_KEY_SECRET --project <id>`. Then, from `web/`:

```
npm run build
npx firebase deploy --project <id> --only hosting,firestore:rules,storage
```

`npm run build` ends with `scripts/check-externals.mjs`, which fails the build if a Turbopack
hashed external alias appears that `package.json` does not declare (see the firebase-admin note
below). Allowlist the first parent with
`npx tsx scripts/allowlist.ts add you@example.com --project=<id> --i-mean-it`.

**C. Your own Firebase project, the app anywhere else** (a VPS, Fly, Render, Vercel, a home
server): the `Dockerfile`, or `npm run build && npm start` on a plain Node host, with the Firebase
project as the backend and a service account key in `FIREBASE_SERVICE_ACCOUNT_JSON`.

**The firebase-admin trap** (`docs/deploy-runbook.md`): Turbopack externalizes `firebase-admin`
under a hashed alias, `firebase-admin-a14c8a5423a75469`, satisfied locally by a symlink that does
not survive the upload to Cloud Run. The fix already in `web/package.json` is an npm alias
dependency of the same name pointing at the real package; if a dependency change ever makes
`/api/ai` routes 500 in production while working locally, this is the first thing to check, and
`npm run build`'s own `check-externals.mjs` step should already have caught it.

**Opening the app to a new family:** allowlist their email
(`npx tsx scripts/allowlist.ts add <email> --project=wonderloop-3d9d5 --i-mean-it`), send them the
link. First sign-in shows the consent screen, creates their household, and they add children as
profiles in the Parent view.

**The public repository:** `https://github.com/viking916/wonderloop-open` is a public snapshot,
not a mirror, one commit, no history. `bash scripts/publish-public.sh` (repo root) rebuilds it via
`scripts/export-public.mjs` and force-pushes. The export deliberately leaves out owner-facing docs
(owner questions, owner checklist, reviews, the authoring status log, deferred items), plans and
specs, design mockups, the local skill file, `web/AGENTS.md` and `web/CLAUDE.md`, task-numbered
screenshot scripts, the screenshot archive, and the two publish scripts, and it refuses to export
if any family-identifying detail survives. **`scripts/push-github.sh`** (also repo root) pushes
this project's own private repo (`origin`, `viking916/wonderloop`) with a plain
`git push origin main` run from the project root, then runs `publish-public.sh` automatically
afterward, so the private and public repos never drift apart. Since this folder became its own
repository on 2026-09-13 there is no subtree split and no shared history to extract: the whole
repository is this project, and `origin` already points at `viking916/wonderloop`.

**What plainly needs the owner, not an agent, per `docs/deploy-runbook.md` and `docs/owner-checklist.md`:**
turning on daily Firestore backups and delete protection (both are billing-account or
project-administration actions no service account key should hold); setting a Cloud Billing
budget alert; cleaning up stale Cloud Build images in Artifact Registry; doing a real restore
drill once a real backup exists; any device-specific check that needs a real iPad or phone
(camera capture, recording playback, Safari speech recognition, the on-screen keyboard, Sprout's
spoken audio) because headless Chromium cannot exercise a camera, a microphone, or Safari's real
behavior; deciding season start dates and children's names; buying physical kit; and creating any
account that legally must belong to an adult (for instance, the GitHub account season 3 week 3
publishes a child's project under). As of 2026-08-30 daily backups and the billing alert were
still not turned on; check `docs/owner-checklist.md` for current status before assuming either is
done.

## 5. Content model

The full contract lives in `docs/content-authoring.md`; this is the map, not a substitute for
reading it before authoring anything.

**Structure.** A season is 12 weeks, three sprints of three quest weeks each closed by a Showcase
week. An Explorer week is built from up to five quests, one per track: **Build** (a real
micro:bit, breadboard, robot, or Python project, with a science moment and a Maker's Log),
**Make** (from season 2 on: mechanical, electrical, and aerospace engineering toward robotics
built from parts, with a data step wherever the week has a genuine measurement), **Think** (a
number-sense warm-up, a spatial puzzle, a skills lane, a geometry-and-chance lane, and a
puzzle-and-proof lane, every problem with two Socratic hints and its own explanation), **Speak**
(a talk, or from week 5 a three-round debate, recorded), and the opt-in **Play** track
(instrument practice as four short sittings a week, on for a profile only when a parent turns it
on). A quest is a sequence of typed steps (instruction, task, science, data, artifact, log, and so
on); a problem within a Think or Ladder step is one of a fixed set of kinds (number, choice,
truefalse, order, grid, text).

**Ids are append-only.** Once a problem, step, quest, activity, or round id is committed it never
moves or changes meaning; new content is added at the end of a set, never inserted by renumbering,
because saved progress and the idea box point at these ids directly.

**Weeks end when their work is done, never on a date** (owner ruling, 13 September 2026, chosen
strictly with no override). A profile's current week is the first week whose quests are not all
finished, from `currentWeekFromDone` in `web/lib/domain/calendar.ts`, computed the same way on This
Week, the Sprout hill and the Parent view. A child who leaves one quest unfinished stays on that
week until it is done; that is deliberate, so do not add a timeout or a forced advance without the
owner asking. `startDate` and `pausedAt` survive on profile documents as history only, nothing
reads them to decide a week, and the pause control is gone because nothing advances on its own any
more. The Ladder week works the same way: three sessions of 2, 4 and 4 rounds
(`WEEK_SESSION_ROUNDS`), named session 1, 2 and 3, each waiting until it is finished rather than
expiring, with `ladderWeek` in `web/lib/domain/ladder.ts` deciding what comes next. Weekday names
decide nothing anywhere; `SessionDoc.day` is a record of when work happened, not an input.

**The math Ladder** is a second, separate engine from the weekly lane: a mastery-based sequence
(`content/ladder/graph.json` is a DAG of topics across six stages, arithmetic, prealgebra, algebra
1, geometry, algebra 2 and precalculus, and calculus) that a child works through at their own pace
via placement, spaced retrieval, and a mastery bar, rather than the week clock. Each authored topic
lives at `content/ladder/topics/<topic-id>.json` and carries an idea card, a worked example, a
problem bank of at least thirty problems, a stretch list, and two to four **ways** (genuinely
different solution methods the child can pick between, not rewordings of each other). The engine
itself is `web/lib/domain/ladder.ts`; the screen is `web/app/explorer/ladder/page.tsx` and
`web/components/ladder/LadderSession.tsx`. Authoring a new stage follows the same pipeline as
weekly content (author to scratch, adversarial verifier re-derives every answer, fixer, then a
separate landing pass); `docs/superpowers/specs/2026-09-08-math-ladder-design.md` is the design,
and `docs/content-authoring.md` rule 28 is the content contract, including the notation and figure
rules each later stage added (exact-value handling, `plane` and `polylines` figures, proof
ordering, and so on).

**Sprout** content lives separately (`content/sprout/weeks/` for season 1, `content/sprout/seasons/{2,3,4}/`
for the rest): a week is a theme plus exactly three activities of three to five rounds each, every
round with a spoken prompt, two to six items, and a correct answer, plus a spoken intro, an
off-screen closing line, and a parent card.

**Content authoring rules worth knowing before touching any file:** no personal information ever
(content is shared across families, so no real name, age, grade, or gender, and the learner is
always addressed as "you"); a `bonus` or `invent` extra never counts toward completion; a kit line
for a real instrument or material is never marked optional and never downgraded to save money (see
section 6); every figure kind has its own spec shape documented in rule 17, and every authored
figure should be checked with `web/scripts/figure-gallery.tsx` before landing; an agent authoring
content never edits the validator itself to make its own output pass. For anything beyond this
summary, read `docs/content-authoring.md` directly; it is the actual contract the validator
enforces, not a description of one.

## 6. Standing owner rules

These apply across this project (and, where noted, across every project the owner runs). They
come from the user's own memory files and this repo's own docs; treat them as binding, not as
suggestions.

- **No em dashes and no arrow characters in any user-facing copy**, and in this project's case
  also in comments, docs, and reports. Use commas, colons, periods, or plain words instead.
- **Real instruments, never toys.** A recommended 3D printer, robot kit, or bench tool is chosen
  for real capability (the exact motion, precision, or load the exercise needs), not a toy-grade
  or "for fun" version, and its kit line names the class of machine, the capability, the real
  price, and what real part or motion it enables.
- **The kit serves the exercise.** A needed instrument or material (a multimeter, a tape measure,
  a scale, calipers) is listed plainly on the season's shopping list with its week and cost, never
  marked "optional," and content is never authored around a weaker measurement to avoid a
  purchase.
- **No system-wide process kills in dispatched agents.** Any agent that launches Chrome, a dev
  server, or another background process for its own verification must track the specific PID it
  launched and kill only that PID; a broad match (`taskkill /IM chrome.exe`, `pkill node`) has
  twice caused real collateral damage to other concurrent sessions in the shared `C:\Work`
  directory.
- **No polling loops in background Bash.** Never wait on a subagent or a background task with a
  shell `until ... grep` loop; it can run unbounded, exhaust the shell's fork budget, and has
  killed a multi-day session before. Rely on task-completion notifications, or a bounded loop with
  a real sleep and a hard iteration cap.
- **Write regex-bearing edits via a file, never an inline heredoc or sed.** The Bash tool's
  heredocs and sed calls mangle backslashes even inside quotes; route any edit whose payload
  contains a backslash through the Write or Edit tool, or a scratch `.py` file. Never chain a
  `git commit` straight after a grep-filtered test run, since grep's exit code is not the test
  suite's.
- **Always update docs, commit only your own files, and push, without being asked**, at the end of
  a piece of work. This repository is standalone, so `git status` here shows only Wonderloop's own
  files, but the owner runs several other projects in sibling folders under `C:\Work`, each its
  own repository; never run a git command against this project from `C:\Work` itself, and stage
  only what this session actually changed.
- **Always subagent-driven, cheapest model that fits.** Execute implementation plans through
  subagent-driven-development by default rather than inline work in the main session, and within
  that, use the cheapest model each task's actual difficulty allows: haiku for mechanical sweeps,
  sonnet for real judgment and integration, the strongest model reserved for synthesis and
  architecture-level calls.
- **Verify UI work visually, every time.** A green typecheck or build proves nothing about visual
  correctness. Screenshot every changed screen and actually look at the screenshot before
  reporting UI work done; a report that cites a screenshot that was never written to disk has
  happened before.
- **The `ui-review` skill exists for exactly this.** Before, during, or when reviewing any
  Wonderloop UI work, load it; it points at `docs/ui-styleguide.md`, the owner's earned defect
  checklist (control language, alignment, figures, copy rules, Sprout's absolute no-fail-state
  rules, and known device traps like Safari's storage partitioning and speech-needs-a-gesture
  behavior), and requires walking that checklist by eye against real screenshots, not just running
  the automated gate.

## 7. Current state, as of 2026-09-13

The curriculum is finished and live: all four seasons, all 48 weeks, both the Explorer track
(Build, Make from season 2, Think, Speak, opt-in Play) and the Sprout track, authored, landed,
deployed, and in use by both of the owner's children. Content validates at 228 quests, 1028
problems, 48 Sprout weeks, 217 ideas, 83 skills, 36 motions, and 81 materials.

The Ladder's arithmetic through algebra 2 / precalculus stages (145 topic files, five of the six
stages in `content/ladder/graph.json`) are authored and landed in `content/ladder/topics/`, most
recently the algebra 2 stage's way figures (`79aac4e`).

**The calculus stage is parked, not landed.** Its topic graph, skills, and ideas are committed
(28 topics, `fa9e5e5`), but the 28 individual topic content files are drafted, not verified, and
not in this repository. They sit at `C:/Users/vvp91/wonderloop-scratch/ladder-ca/` on the owner's
machine, having passed only the structural checker (ids, difficulty counts, variants, prompts,
notation, option balance). Resuming this work means, in order: an adversarial verifier per bank
folder there, fixers, a separate landing pass into `content/ladder/topics/`, then the ways
authors and animators, the usual gates, screenshots, and deploy. Do not treat those draft files as
already part of the app.

Season 1 weeks 1 and 2 were re-verified in actual use on 2026-09-11 (an adversarial content
verifier recomputed all 91 answers, three real defects were found and fixed by textual
replacement so no problem id moved). The most recent commit on the branch, `a29c26e`, is that
fix pass; per this repo's own memory notes, **the deploy of that commit was deliberately held
until the owner's own session ended**, so if you are resuming work, check whether that commit (or
anything after it) has actually reached production before assuming the live site matches HEAD.

On 2026-09-12 the owner ran the app with his child on a laptop and reported: no exit after a
finished quest, the Ladder invisible on This Week, the Ladder's "next round" never arriving, and a
tablet-like constrained layout. He asked for a redesign, saw five demo directions, and then chose
to keep the existing design; do not propose visual redesigns again unless asked. What shipped
instead, inside the existing look: a primary "Done, back to This week" on a finished quest's last
step (`web/components/quest/QuestShell.tsx`); a Ladder card on This Week
(`web/components/explorer/LadderCard.tsx`, `stageSummary` in `web/lib/domain/ladder.ts`); the
Ladder session flow fixed (`web/components/ladder/LadderSession.tsx`: a fluency round now closes
the round instead of the session, the break explains its lock, the done screen says why via
`web/lib/domain/ladderCopy.ts`, and a Firestore write with an explicit `undefined` `endedAt` that
threw before the break screen could ever show is fixed); This Week widened to 1240px and the
Ladder to 960px. `web/scripts/ladder-round-flow-screenshots.mjs` drives a real round to the break
screen against the emulators for screenshots.

**2026-09-15: Parent season plan and a polish pass across every screen.** The owner asked for "an
index for the parents view so I can see what will be done in what week at a glance" and said the UI
looked amateurish. Asked the same session, he chose to refine the existing look rather than take a
new direction, across every screen, and wanted the index to carry quest titles plus the skills and
ideas each week teaches. The audit and the work packages are in
`docs/superpowers/plans/2026-09-15-parent-index-and-polish.md`. What changed: the Parent view went
from one 8,589px column of cards to tabs with a Season plan (`components/parent/SeasonIndex.tsx`,
`lib/domain/seasonIndex.ts`), per-quest resets moved to Settings, and the Ladder summary replaced a
wall of 150 topic pills; the header nav is Source Sans with a current-page bar and two tidy rows on
a phone; running meta text left Courier Prime for the shared `.tr-meta` class and page headings got
`.tr-page-title`; status chips are Source Sans; the quest screen's result row, idea card,
explanation list, cube-net figure spacing, side rail and quiet-button alignment were fixed, a
revisited finished quest no longer fires its toast, and on a phone the step comes before the rail;
This Week's track cards align section by section and the Ladder rungs are equal; the Skills map
went from 14,654px to about 2,200px (not-started skills behind a disclosure) and the portfolio sash
is compact. The 12 September note below about not proposing redesigns still holds for new visual
directions; refinement inside the look is now explicitly wanted.

Ask shipped on 2026-09-12: an AI tutor chat a child can open on a Think or Ladder problem once
they have missed at least once, beyond the two authored hints. Server: `web/lib/ai/tutor.ts`
(`tutorReply`, briefed with the problem, its hints, the child's own earlier tries, and the
authored explanation the child has never seen; asks claude-sonnet-5 via `callStructured`'s new
optional model override, `web/lib/ai/client.ts`) and `web/app/api/ai/tutor/route.ts` (the same
auth/key/rate-limit shape as the debate route). Guardrails: the system prompt never states the
final answer, its number, or a choice letter, even if asked, and closes the conversation kindly
after the sixth child message (`web/lib/domain/tutor.ts`'s `MAX_CHILD_MESSAGES`, shared with the
client so both sides count the same way). Gate (`web/components/quest/ProblemPlayer.tsx`): the
problem's hints must be authored (a new `hintsAuthored` prop, true everywhere except a Ladder
stretch problem -- `web/components/ladder/LadderSession.tsx` passes false there, since
`unhinted()` only ever fills stretch's hints with a synthetic "no hint" placeholder; retrieval and
fluency draw the topic's own real bank hints unchanged and stay eligible, contrary to an earlier,
incorrect assumption that they were hint-stripped too), at least one miss on record, and
`/api/ai/health` reporting the family's key configured. UI: `web/components/quest/AskPanel.tsx`
(closed: a quiet "Still stuck? Ask" under the hint panel; open: transcript, a bordered secondary
Send, "n asks left"), saved every exchange via `web/lib/data/tutor.ts` to
`households/{hid}/profiles/{pid}/tutorChats/{questId}__{problemId}` (covered by the household's
existing wildcard rule, proven in `web/scripts/rules.test.ts`), and shown to a parent by
`web/components/parent/AskTranscripts.tsx`.

Deferred, not blocking: an explain-step `problemId` mismatch on two season 3 weeks
(`docs/deferred-app-items.md`); a Week 8 flipped-showcase parent-facing brief surface still
needed before Season 2 week 8's secret-course mechanic is airtight; a Sprout birthday variant for
season 2 week 6. None of the app-side blockers from the 4 September push remain open; recording
capture, upload, and playback, and per-profile season rollover, are both built.

**2026-09-13: this folder became its own git repository.** Until this date Wonderloop lived as
`current projects/ai-teaches` inside the shared `C:\Work` repository, on one branch (`060625.0`)
with several unrelated projects (phi-store, govt.fyi, look-flipper, and others). That setup kept
causing real friction: agents opening this project saw hundreds of files that belonged to other
projects, one commit swept in another project's files by accident, `git status` and pushes took
minutes because of the size of the shared tree, and this guide's own claim that Wonderloop was
"not a monorepo" contradicted what `git log` and `git status` actually showed. The folder was
split out with its own history (a `git subtree split` at the time of the cut) into its own `.git`,
with `origin` set to `https://github.com/viking916/wonderloop.git` and branch `main`; `C:\Work`
itself now holds an older repository that does not track this project at all. One consequence:
commit hashes quoted anywhere in these docs from before the split (for example `a29c26e`,
`79aac4e`, `fa9e5e5` above) belong to the old shared history and may not resolve in this
repository's `git log`; find them by commit message instead, since the message and the change
survived the split even though the hash did not.

## 8. Where to look for open work

- `docs/deferred-app-items.md`: small app-side items content sprints have landed around; check
  here first for anything code-shaped and not yet built.
- `docs/owner-checklist.md`: the list of things that need the owner's own account, hardware, or
  judgment (device checks, billing and backup setup, kit purchases, account creation); do not
  attempt these from an agent session.
- `docs/owner-questions.md`: the running decisions log.
- `docs/superpowers/season-authoring-status.md`: the authoritative resume map for content work,
  updated after every landing; read this before `git log` when picking curriculum work back up,
  then trust `git log` over any older note in this status file or in memory.
- `docs/superpowers/plans/`: the original build plans (foundation and season 1, app core, voice
  and AI, deploy).
- `docs/superpowers/specs/`: the design spec (`2026-08-27-ai-teaches-design.md`), the per-season
  design drafts, the math Ladder design, and the not-yet-built Obsession lane design.
- `docs/reviews/`: curriculum review write-ups, one per season plus Sprout, and the
  cross-cutting 2026-09-05 curriculum review whose seven levers are already landed.

## 9. Keep this guide current

Any session that changes a route, a script, a deploy step, a content rule, or a standing owner
rule must update this file in the same session, alongside whatever other doc actually owns that
detail (`docs/content-authoring.md` for authoring rules, `docs/DEPLOYMENT.md` or
`docs/deploy-runbook.md` for deploy steps, `docs/ui-styleguide.md` for UI defect classes,
`docs/superpowers/season-authoring-status.md` for curriculum progress). Then commit and push, per
the standing rule in section 6. A stale guide is worse than no guide, since the next agent will
trust it.
