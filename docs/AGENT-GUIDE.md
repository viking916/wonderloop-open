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

- **The Explorer**, roughly ages 8 to 11. Gets four quests a week across four tracks (Build, Make,
  Think, Speak), each about an hour, plus access to a separate mastery-based math sequence called
  the Ladder, plus (23 September 2026) a Practice this week card of plain checkboxes, not quests:
  piano (30 minutes a week, for a profile whose parent has turned the Play track on) and chess (a
  game on Saturday and a game on Sunday, on by default, played with a parent or on chess.com).
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
- `app/explorer/page.tsx`: This Week, the Explorer's home screen (season strip, the Ladder card,
  the Practice this week card of piano/chess checkboxes, week's cards, monster problem, season
  book, mistake box).
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
  paragraph, quests, Ladder summary, the Practice this week card, calibration), Season plan
  (`#plan`: `SeasonIndex`, every week
  of a season with its quest titles, skills, ideas, kit and the sprint's game), To review
  (`#review`: mistake box, logs, debates, Ask transcripts, parent activities), Shopping
  (`#shopping`) and Settings (`#settings`: invite, profiles, PIN, AI key, device checks, then every
  reset including the per-quest ones). Each child's section stays mounted whatever the tab, because
  it owns the Firestore subscriptions and reports the child's current week upward.
- `app/privacy/page.tsx`, `app/terms/page.tsx`: the consent-gate legal pages.
- `app/style/page.tsx`: the style gallery, a reference page for every UI primitive and figure
  kind, used as one of the visual regression baselines.
- `app/api/ai/debate`, `app/api/ai/tutor`, `app/api/ai/builder`, `app/api/ai/health`,
  `app/api/ai/key`: the server-side AI routes. All calls to Anthropic happen here, never in
  client code, and are billed to the family's own key. `tutor` is Ask (12 September 2026), the
  Socratic tutor a child can open beyond the authored hints; it never states a final answer.
  `builder` is Builder Ask (A4, 25 September 2026), the Build and Make helper: it explains
  outright rather than asking Socratic questions, but keeps the same never-the-solution line in a
  different place -- never the child's whole program, never a complete solution to the step,
  never the project designed for him.

Inside `web/components`: `quest/` holds the ProblemPlayer and every step and figure component
(problem kinds, hints, explanations, Ask's panel, Builder Ask's panel (A4, 25 September 2026),
the working space, recording and photo capture, all the figure kinds like LedMatrix,
ProblemFigure, AnimatedDiagram, SceneFigure); `parent/` holds every Parent view card, including
Ask's and Builder Ask's saved transcripts, shown together; `explorer/` holds the nav, side strip,
and track cards; `sprout/` holds the toddler-track player and its speech and orientation hooks;
`portfolio/`, `skills/`, `ladder/` hold those screens' pieces; `ui/` holds shared primitives
(Button, Card, Chip, Header, Toast, and so on); a handful of top-level components handle sign-in,
consent, and profile switching.

Inside `web/lib`: `content/` loads, validates against Zod schemas, and bundles the curriculum
(`load.ts`, `schema.ts`, `app-content.ts`); `domain/` is pure, unit-tested business logic with no
Firebase dependency (calendar and week math, completion rules, skills leveling, the Ladder engine,
badges, debate rules, the review/mistake-box logic, Ask's shared child-message cap, Builder Ask's
own per-step cap and availability rule (`builderAsk.ts`, A4), the Parent
view's season index `seasonIndex.ts`, and so on, each with its own `.test.ts`); `data/` is the Firestore and Storage read/write layer (households,
progress, artifacts, logs, resets, Ask's and Builder Ask's saved transcripts (one collection,
`tutor.ts`), the allowlist); `ai/` is the
server-only Anthropic integration (`client.ts`, `debate.ts`, `tutor.ts`, `builder.ts`,
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
route, every profile kind, at ten viewports (phone, four tablet sizes, 1280x900, the laptop sizes
1536x864 and 1920x1080, and, added 23 September 2026, the two laptop sizes a real Windows laptop's
own display scaling actually reports, 1280x720 and 1366x768 -- see this section's own 23 September
entry below), including all 12 weeks of This Week, every step of a
quest, two real ProblemPlayer interactions (a wrong answer, then a correct one), and the Parent
view's PIN prompt plus its This week/Season plan/Settings tabs (reached for real, by pressing
"Not now" on the PIN prompt and clicking each tab). It fails on low text contrast against the
actual rendered background, a button with no explicit CSS color, a link styled as a button that
still shows an underline, real horizontal overflow, any console error or uncaught exception, and a
visual regression against one of 150 committed baselines in `docs/visual-baselines/` (15 screens
times all ten viewports; the two viewports added 23 September 2026, 1280x720 and 1366x768, got
their first baselines the same week once a clean run finally completed -- see this section's 23
September entry). It writes one screenshot per route and viewport to
`docs/screenshots/` at the repo root (not a `web/`-local copy) and takes about 6 to 7 minutes on a
quiet machine; there is no fast mode. Accepting new baselines is a separate, deliberate command,
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
week. An Explorer week is built from up to four quests, one per track: **Build** (a real
micro:bit, breadboard, robot, or Python project, with a science moment and a Maker's Log),
**Make** (from season 2 on: mechanical, electrical, and aerospace engineering toward robotics
built from parts, with a data step wherever the week has a genuine measurement), **Think** (a
number-sense warm-up, a spatial puzzle, a skills lane, a geometry-and-chance lane, and a
puzzle-and-proof lane, every problem with two Socratic hints and its own explanation), and
**Speak** (a talk, or from week 5 a three-round debate, recorded). A quest is a sequence of typed
steps (instruction, task, science, data, artifact, log, and so on); a problem within a Think or
Ladder step is one of a fixed set of kinds (number, choice, truefalse, order, grid, text).

**The Play track is authored content, not a shown quest** (changed 23 September 2026; see that
date's entry in section 7). `content/seasons/*/weeks/*/play.json` still exists, still validates,
and is untouched -- `lib/domain/tracks.ts`'s `tracksForProfile`/`questsForProfile` simply never
return it any more, for any profile, so no Play quest card ever renders on This Week, the Parent
view's week plan, or the Season plan. In its place, a profile whose `ProfileDoc.playTrack` is on
gets a single "30 minutes of piano practice this week" checkbox on the new Practice this week
card (`lib/domain/practice.ts`, `components/explorer/PracticeCard.tsx`,
`components/parent/PracticeCard.tsx`), stored at `households/{hid}/profiles/{pid}/practice/
{docId}` (`docId` is `s{season}w{week}`, e.g. `s1w03`). The same card carries two chess
checkboxes, "Chess game on Saturday" and "Chess game on Sunday" (on by default for every Explorer
profile, off only when a parent sets the new `ProfileDoc.chessPractice` to `false`), since the
owner asked for two chess games a week, with a parent or on chess.com, as a practice alongside
piano. Neither checkbox ever gates a week: a week still ends only when its quests are done (see
the ruling just below), so nothing that decides a profile's current week reads this collection.
The skills map (`app/explorer/skills/page.tsx`) still shows Play skills whenever the track is on
or real evidence already exists, and parent-entered activities
(`components/parent/ParentActivities.tsx`) can still log a note against a Play skill -- both read
`TRACK_ORDER` directly rather than `tracksForProfile` for exactly this reason, since that function
now means "which tracks are quests", not "which tracks this profile has any relationship to".

**Ids are append-only.** Once a problem, step, quest, activity, or round id is committed it never
moves or changes meaning; new content is added at the end of a set, never inserted by renumbering,
because saved progress and the idea box point at these ids directly.

**Weeks end when their work is done, never on a date** (owner ruling, 13 September 2026, chosen
strictly with no override). A profile's current week is the first week whose quests are not all
finished, from `currentWeekFromDone` in `web/lib/domain/calendar.ts`, computed the same way on This
Week, the Sprout hill and the Parent view. A child who leaves one quest unfinished stays on that
week until it is done; that is deliberate, so do not add a timeout or a forced advance without the
owner asking. **The monster problem is not part of "done"** (A1, 2026-09-24 year refinement, owner
ruling in section 0 of `docs/superpowers/plans/2026-09-24-year-refinement.md`): a Think quest's
`problem-set` step of lane `monster` is left out of `web/lib/domain/completion.ts`'s `isDone`,
`resumePosition` and `weekSummary`, so a week whose only unfinished thing is an unanswered monster
still reads done and still advances the week clock. The monster keeps a real place in the quest
(still a step in the list, still openable, its worked solution still opens the moment it is
answered, no reveal wait) -- it simply never holds a week up the way every other step does. This
Week's monster card (`web/lib/domain/monster.ts`) shows accordingly: the sprint's one monster
(weeks 1-4, 5-8 or 9-12) for the whole sprint, not just its own authored week, "still open" if
carried over unsolved from the sprint before, "solved" once answered. `startDate` and `pausedAt` survive on profile documents as history only, nothing
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

**First time means full hand-holding, second lighter, third a one-line spec** (content rules 30
and 31, added 2026-09-24 by the year refinement plan). A step that puts a child in front of a new
skill, tool or platform never opens spec-first; check `docs/superpowers/first-time-ledger.md`
before writing one, since it names which quest is that skill's first, second and third occurrence
across all four seasons and tracks whether each has actually landed. Every quest also ends in a
fun payoff (rule 31): something that moves, flies, launches, lights up, or a game or challenge the
child can beat.

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
- **First time means full hand-holding; second is lighter; third is a one-line spec.** Content
  rule 30 and `docs/superpowers/first-time-ledger.md` are the reference; a step is never spec-first
  on a skill, tool or platform the child has not already been guided through once.
- **Fun is a rule.** Content rule 31: every quest ends in something that moves, flies, launches,
  lights up, or a game or challenge the child can beat, and every content package's `CHANGES.md`
  names that payoff.
- **Weekly hours never go up.** A heavy quest gets `sittings: 2` (rule 29) and spreads over two
  calendar weeks at the same weekly pace; `minutes` is never doubled to fit more into one week.
- **AMC 8 is the only competition this year.** `content/calendar.json` lists no other contest
  sitting in the current school year; a competition entry that is not actually sat this year gets
  a note saying so, past problems used for practice only, rather than being removed outright. The
  one exception is FIRST LEGO League, which is removed entirely, since it is a team competition
  and this curriculum's goal is a confident, self-reliant one-man-team builder who is never pointed
  at a club, team or outside group.
- **Hints stay exactly as they are.** Two hints per problem, no time gating on either hint or Ask;
  this is unchanged by any other ruling.
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
problems, 48 Sprout weeks, 403 ideas, 127 skills, 36 motions, and 82 materials.

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

Later the same day the owner asked why laptops still got a "tablet style constrained UI": every
route capped its own width (720 to 1240px) and no gate had ever looked wider than 1280. Every page
now uses `.tr-page` with `--page-max: 1440px`; above 1280 a problem (quest or Ladder round) splits
into a question column and a side column for working space, hints, Ask and the timer; Ladder home
and the Mistake box use two columns; and `verify:ui` runs at 1536x864 and 1920x1080 too. The
Ladder's five minute break between rounds is now optional: a quiet "Skip the break" persists
`breakUntil` as now in the open session (`lib/domain/ladder.ts`'s `breakActive`), so a reload after
skipping never brings the lock back.

**2026-09-16: every action answers a press.** The owner reported that pressing a button often did
nothing visible, so the app felt broken. `components/ui/Button.tsx` now tracks a promise-returning
`onClick` itself: it keeps its tier colour and label, adds a spinner once the work passes
`PENDING_SHOW_DELAY_MS` (120ms, held for `PENDING_MIN_VISIBLE_MS`, 400ms, both in
`lib/pendingTiming.ts`), sets `aria-busy`, and blocks a second press without the `disabled`
attribute, which used to flatten a live control to kraft and read as broken. `lib/useAsyncAction.ts`
covers non-button controls (form submits, file inputs, profile tiles), and
`components/RouteProgressBar.tsx`, mounted in `app/layout.tsx`, shows a page load. Every waiting
action across the quest, Ladder, Parent view, sign-in and This Week screens was swept onto it, and
the old `disabled={saving}` plus "Saving..." label swaps were removed. Two truths worth keeping:
the think-time cooldown never spins (it is a timed lock, not work), and a Check on an answer never
shows a spinner at all, because Firestore's local cache echoes the write in about 80ms, under the
120ms threshold.

Ask shipped on 2026-09-12: an AI tutor chat a child can open on a Think or Ladder problem once
they have missed at least once, beyond the two authored hints. Server: `web/lib/ai/tutor.ts`
(`tutorReply`, briefed with the problem, its hints, the child's own earlier tries, and the
authored explanation the child has never seen; asks claude-sonnet-5 via `callStructured`'s new
optional model override, `web/lib/ai/client.ts`) and `web/app/api/ai/tutor/route.ts` (the same
auth/key/rate-limit shape as the debate route). Guardrails: the system prompt never states the
final answer, its number, or a choice letter, even if asked, and closes the conversation kindly
after the sixth child message (`web/lib/domain/tutor.ts`'s `MAX_CHILD_MESSAGES`, shared with the
client so both sides count the same way; raised to 15, and the prompt itself revised to stop
circling before ever reaching the cap, by the 2026-09-26 entry below). Gate
(`web/components/quest/ProblemPlayer.tsx`): the
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

**2026-09-23: piano and chess become plain weekly checkboxes, and Play stops being a quest.** The
owner's ask, verbatim: "Keep piano lessons simple a checkbox which says 30min piano practice per
week. Add in ladder chess game on saturday and sunday as checkbox, Im expecting [my child] to play
atleast 2 chess games with me or on chess.com per week as a practice." A new Practice this week
card (`components/explorer/PracticeCard.tsx` on This Week, `components/parent/PracticeCard.tsx` on
the Parent view's This week tab for the child's real current week) shows: a piano checkbox, "30
minutes of piano practice this week", only for a profile with `ProfileDoc.playTrack` on; and two
chess checkboxes, "Chess game on Saturday" / "Chess game on Sunday" with the quiet line "Two games
a week, with a parent or on chess.com.", on by default for every Explorer profile and turned off
per profile with the new `ProfileDoc.chessPractice` (`false` means off; absent or `true` means
on). Storage: `households/{hid}/profiles/{pid}/practice/{docId}`, `docId` = `s{season}w{week}`
(e.g. `s1w03`), fields `{ piano?, chessSat?, chessSun?, updatedAt }` (`lib/data/types.ts`'s
`PracticeDoc`, `lib/data/practice.ts`'s watch/set, both covered by the existing household wildcard
in `firestore.rules`, proven the same way `workings` and `tutorChats` already are in
`scripts/rules.test.ts`). The pure logic (the doc id, which rows a profile gets, a one-line
summary like "Chess 1 of 2, piano done") lives in `lib/domain/practice.ts`. Ticking never gates a
week, by design (section 5's ruling restated once more here): a week still ends only when its
quests are done.

Piano itself replaces the Play track's old four-sitting quest: `lib/domain/tracks.ts`'s
`tracksForProfile`/`questsForProfile` now never return `"play"`, for any profile, so no Play quest
card renders anywhere a profile's weekly quests are shown (This Week, the Parent view's week plan,
the Season plan, which simply drops the Play column). The Play content files
(`content/seasons/*/weeks/*/play.json`) are untouched and still validate; they are just never
surfaced as a quest any more. Two callers that used `tracksForProfile` for a broader "does this
profile have any relationship to this track" question, not "which quests does this profile do this
week", were repointed at `TRACK_ORDER` directly so they kept their old behaviour: the skills map
(`app/explorer/skills/page.tsx`, still shows Play skills when the track is on or evidence already
exists) and parent-entered activities (`components/parent/ParentActivities.tsx`, still offers Play
skills in its picker). `components/parent/ProfileManager.tsx`'s Play toggle copy changed to name
piano ("Piano on: a 30 minute practice checkbox each week" / "Piano off: turn it on for a child who
takes lessons", buttons "Turn piano off"/"Turn piano on") and gained a matching chess toggle
("Chess on: two weekend games a week" / "Chess off", "Turn chess off"/"Turn chess on"), backed by
`lib/data/households.ts`'s new `setChessPractice`, mirroring the existing `setPlayTrack`.

**2026-09-23: the laptop was still tablet-shaped, because the 15 September fix's own breakpoints
never reached a real laptop.** The owner reported it again: "on laptop it appears as if its on
tablet." Root cause, confirmed by grepping `app/globals.css` for its `@media` rules: the 15
September pass introduced three laptop-width rules (the problem screen's question/working-space
split, the five-track-card row, the skills grid's fourth column), and all three waited for
`min-width: 1281px` or `min-width: 1400px`. Windows display scaling (125% or 150%, the default on
most laptops sold in the last few years) reports a CSS viewport narrower than the physical panel:
a 1920 or 1600px screen shows up as 1536x864 or 1280x720, and 1366x768 is itself a common native
panel size outright. `verify:ui`'s own two laptop viewports, 1536x864 and 1920x1080, are both
comfortably wider than 1400 and so never exercised the trap; nothing had ever checked 1280 or
1366-wide. All three breakpoints moved to `min-width: 1200px` (comfortably above the 1194/1180px
iPad-landscape widths this app still treats as tablets), and two short-viewport rules were added
(`.tr-page`, `.tr-header`, both `@media (min-width: 1200px) and (max-height: 800px)`) to give back
some vertical padding on the 720-768px-tall viewports the same scaling produces, since a laptop
that reports a narrow width almost always reports a short height too. `docs/ui-styleguide.md`
section 6 has a new line for this defect class, and `web/scripts/verify-ui.mjs`'s `VIEWPORTS` gained
1280x720 and 1366x768 (see this file's section 3). The fix was verified directly: the Ladder's
two-column problem layout (`.tr-problem__layout`, shared by every ProblemPlayer including quests,
proven via `web/scripts/ladder-round-flow-screenshots.mjs`) and the Skills map's four-column grid
both confirmed switching on at 1280x720 and 1366x768 where they previously had not, by screenshot,
before and after.

Two things the same-day session that did the work above could not finish: the app's
`/explorer/quest/[questId]` and `/sprout/activity/[activityId]` routes returning a 500 all
session (Next.js 16's dev-time validation worker pool
(`node_modules/next/dist/server/dev/dev-validation-worker-pool.js`) had exhausted its retry limit
for those two routes, which only a dev server restart clears, and that session was told not to
touch the shared dev server), and `npm run verify:ui` unable to complete a full ten-viewport run
on a machine running upward of 25 Node and 30 Chromium processes at once. A **landing session**
picked both up the same day. It confirmed the PID listening on port 3000 was this repo's own
`next dev` (and its child process) before stopping just that PID and restarting `npm run dev`
fresh, which cleared the quest/activity 500 immediately (`curl`ed 200 on both routes afterward).
`npm run verify:ui` still needed one retry (the first attempt crashed at the ninth of ten
viewports, 1280x720, on `returnToPicker: .tr-picker never rendered after 4 attempts`, the same
class of transient hang the paragraph above describes); the retry completed cleanly with 66
findings, all of them either an expected dimension change (the practice card, the dropped Play
card, and the 1200px breakpoint move above changing seven screens' heights at exactly 1280x900,
where old (1281px) and new (1200px) thresholds disagree) or an expected missing baseline for the
two viewports added that day. Screenshots were opened and read at both new laptop widths for This
Week, a quest problem (confirming the two-column split engages at 1280x720 and 1366x768, not just
above 1400), the Ladder round, the Skills map, and all three of the Parent view's This week/Season
plan/Settings tabs, plus 390x844 and 820x1180 for the unchanged phone and iPad layouts; none showed
a defect, so `--update-baselines` was run and `verify-ui` came back PASS. `docs/visual-baselines/`
now holds 150 files (15 screens times all ten viewports, up from 120); see this file's section 3.

**2026-09-23: an optional second sitting for a heavy quest, `sittings`, and what it actually
means.** A quest may now carry `"sittings": 2` on `QuestSchema` (`web/lib/content/schema.ts`);
`minutes` stays the schema's fixed per-track figure (`TRACK_MINUTES`) unchanged and is never
multiplied by it. The field went through two meanings the same day: an owner-approved draft first
read it as two sittings inside one week (minutes doubled for the week's estimate), then a same-day
owner correction replaced that with the shipped meaning: a `sittings: 2` quest runs over **two
calendar weeks** at the same weekly pace, so the This Week estimate a child or parent sees stays
the plain per-week `minutes`, never doubled. `web/lib/domain/questTime.ts`'s `questTimeLabel` is
the one place that turns `minutes` and `sittings` into the line a child or parent reads ("2 weeks,
about 60 min each"), and every quest card, the Parent view's week plan and per-quest reset list,
and the Season plan (`components/parent/SeasonIndex.tsx`) go through it rather than reading
`minutes` directly; `docs/content-authoring.md` rule 29 is the content contract. Season 1 weeks 3
and 10 are the first two landed with `sittings: 2` (see the content-landing entry just below).

**2026-09-23: season 1 build weeks 3, 5, 6, 7, 10 and 11 land an explain-before-use scaffolding
pass.** Landed from `C:/Users/vvp91/wonderloop-scratch/s1-scaffolding/` after an author pass, two
adversarial verification rounds, and an owner-directed third round on a real safety gap. Week 3
(LED and button on a breadboard) gained new science steps deriving voltage and the 330 ohm
resistor floor for an LED on a micro:bit pin (never lower; `docs/content-authoring.md` rule 23), a
breadboard-internals diagram, a pull-up explanation ("Why 0 means pressed"), a new bonus extra
wiring a second LED in parallel, and a real two-week break ("Good place to stop", carrying
`sittings: 2`). Weeks 5, 6, 7 and 11 gained recap and bridging science steps (three vocabulary
words, motor physics, analog versus digital, halving a search, a less-than explainer) and "write
it yourself first" spec blocks ahead of the existing numbered builds. Week 10 (Python turtle) also
gained `sittings: 2`. Round 3 fixed a real safety gap the verifier could not resolve alone: the
micro:bit breakout board's legs can land in the same breadboard columns the week's circuit uses,
so week 3 now tells the child to seat the breakout at column 35 or higher on a full-size board (or
keep it off the board on jumper wires on a small one), and the season's breadboard kit line is now
"full-size 830-point breadboard starter kit" (`content/materials.json`; the shopping list ticks by
name, so this intentionally resets any tick on the old "breadboard starter kit" line). Four new
ideas (`voltage-is-the-push`, `pull-up-rests-high`, `series-and-parallel`, `analog-and-digital`)
were added to `content/ideas.json`. No id moved. Content validates at 228 quests, 1028 problems,
48 sprout weeks, 402 ideas, 127 skills. Full detail is in
`docs/superpowers/season-authoring-status.md`'s matching 23 September entry.

**2026-09-24: season 1 showcase weeks 4, 8 and 12 gain a "Build it again, no help" retention task
step** (`s1-w04-build-04`, `s1-w08-build-04`, `s1-w12-build-04`, each placed before that week's
artifact step and never gating `artifact-and-log` completion), landed from
`C:/Users/vvp91/wonderloop-scratch/b1-retention/` after an author pass and one verifier round; see
`docs/superpowers/season-authoring-status.md`'s matching 24 September entry.

**2026-09-24: A1 (reduced scope), the monster stops blocking the week.** From
`docs/superpowers/plans/2026-09-24-year-refinement.md`, section 0's owner ruling: no wait on a
monster's worked solution (it opens exactly as it always has, the instant it is answered), but the
approved part of A1 ships: a monster (`problem-set` lane `monster`, one per sprint, weeks 1-4, 5-8,
9-12) no longer blocks its Think quest's completion, and it is shown on This Week for the whole
sprint, not just its own authored week. `web/lib/domain/completion.ts`'s `isDone` (all-steps),
`resumePosition` and `weekSummary` all leave a monster step out, so a Think quest with everything
else finished reads "done" and the week clock advances, whether or not the monster has been
answered (section 5 above has the fuller rule). New `web/lib/domain/monster.ts`
(`findSprintMonster`, `sprintOfWeek`): This Week's monster card names the sprint's one monster, with
an "Open the monster" link to its step (`QuestShell`'s existing `?step=n`, no new plumbing needed),
and an unsolved monster is carried over from the sprint just before as "still open" for exactly one
sprint before the current sprint's own takes over regardless. `web/components/explorer/SideStrip.tsx`
renders the three states (open, still open, solved); `web/app/explorer/page.tsx`'s old
single-week `findMonster` is gone, replaced by `findSprintMonster` fed the profile's whole
progress-by-quest map (already in hand from `watchProgress`, not a new read). The Parent view says
the same thing: `web/lib/domain/seasonIndex.ts`'s `SeasonIndexTrackCell` gained `hasMonster`, shown
as a line under the Think cell in `components/parent/SeasonIndex.tsx`'s Season plan, and
`components/parent/WeekPlan.tsx`'s This week tab shows the same line on the Think row whenever that
week's own quest carries the monster. `lib/domain/review.ts` and `lib/data/progress.ts` were
checked and need no change: neither assumes a finished Think quest has its monster answered, since
`questStatus`/`buildProgressDoc` already flow through `completion.ts`'s `isDone`. Not touched, on
the owner's own instruction: `web/lib/domain/attempts.ts` (no `revealFloorMs`, no
`MONSTER_REVEAL_MS`, no 20-word guard, no "solution opens {day, time}" copy) and
`web/components/quest/ProblemPlayer.tsx`.

**2026-09-24: B2, season 1 weeks 5 and 6 gain first-time mBot and mBlock guides.** Content only,
no app change: week 5's first sitting is now a real screwdriver assembly guide, both quests gain
`sittings: 2` and a corrected mBlock 5 block set (weeks 5 to 8's mBlock 3 names and a
non-existent line follower block are all fixed). See
`docs/superpowers/season-authoring-status.md`'s matching entry and `docs/owner-checklist.md` for
the 18 real-device checks this needs.

**2026-09-25: A4, Build and Make Ask.** From `docs/superpowers/plans/2026-09-24-year-refinement.md`
section 0.1, the owner's AI-fluency ruling: the child should be comfortable asking AI questions
inside Wonderloop, on the family's own key, with every exchange saved and visible to a parent,
never through an outside chat app. This package is the app half of that ruling (G1, the content
half -- first-time-asking-AI guides, planted-mistake catches, seasons 3 and 4's "AI as a working
partner" -- is separate, not yet built). A second AI panel, "Stuck? Ask", sits beside Ask
(12 September 2026) rather than replacing it: Ask stays exactly as it is, Socratic, gated on a
miss, scoped to a Think or Ladder problem.

Builder Ask is a different job in a different place: `web/lib/ai/builder.ts` (`builderReply`,
reviewed system prompt recorded with its rationale in
`docs/superpowers/specs/2026-09-25-builder-ask-prompt.md`) briefs claude-sonnet-5 with the quest's
title and track and the current step's title, body and (task steps only) checklist, and is
allowed to explain outright -- "why doesn't this work", in plain sentences, with a small example
of a few lines when it helps -- rather than only asking a question first. The one rule that never
bends, in three phrasings so a model cannot satisfy one while breaking the others: never the
child's whole program, never a complete solution to the step, never the project designed for him.
When it states a fact the child could check himself (a pin, a measured value, a block name), it
must say how to check it, since it can be wrong. It never asks for or repeats personal
information, stays on the build topic, and is bound by the year refinement plan's own rule 8
(section 1.3, "named safety steps where the hazard first appears") for the same three named
hazards (mains electricity, an opened power supply, LiPo misuse) the curriculum itself is held
to.
Route: `web/app/api/ai/builder/route.ts`, the same auth/family-key shape as `tutor`'s, sharing its
rate-limit pool (`lib/ai/usage.ts`'s `reserveCall`, keyed by household and profile, not by
route). Cap: `web/lib/domain/builderAsk.ts`'s `MAX_BUILDER_STEP_MESSAGES` (10 child messages per
step, a separate budget from Ask's own `MAX_CHILD_MESSAGES` of 6 per problem; both raised, and the
shared rate-limit pool's own cap raised alongside them, by the 2026-09-26 entry below).

Availability is two pure functions in `builderAsk.ts`: `builderAskAvailable` (Build or Make track,
and not season 1 weeks 1 to 4 -- every season 2, 3 and 4 week clears the rule on its own, since
Make never exists before season 2) and `isBuilderAskStep` (the four step kinds that carry a real
title and body to brief the model with: instruction, science, task, data -- typing, artifact and
log steps have no body to brief, and no problem-kind step ever appears in a Build or Make quest).
Unlike Ask, there is no miss gate and no hint gate: the owner's ruling is "available at any step,
at any time". `web/components/quest/QuestShell.tsx` renders `BuilderAskPanel` right after any step
that clears both checks, for every Build or Make quest; `web/components/quest/BuilderAskPanel.tsx`
reuses AskPanel's own markup and CSS classes (`.tr-ask*`, unchanged) for visual consistency, adding
two standing lines the ruling requires: "AI can be wrong. Check what it tells you." and "Never
type your name, school or address."

Storage: the same collection Ask already uses, `households/{hid}/profiles/{pid}/tutorChats`,
`TutorChatDoc` gaining an optional `kind: "problem" | "step"` (absent means "problem", every
existing document) so `AskTranscripts.tsx`'s single `watchTutorChats` listener already picks up
step chats with no second query. A step chat's id is `{questId}__step__{stepId}`
(`builderAsk.ts`'s `builderChatId`, `lib/data/types.ts`'s `tutorChatStepRef`), marked with a
literal `__step__` segment so it can never be confused with a problem chat's plain `__` join.
`firestore.rules`' existing household wildcard already covers any document under `tutorChats/`,
proved directly (not just assumed) by two new cases in `web/scripts/rules.test.ts`. The Parent
view's Ask transcripts card (`AskTranscripts.tsx`) labels a step chat by quest and track/step
rather than by the problem it was asked on.

**2026-09-24: Ask and Builder Ask take a real multi-line question.** Both panels' single-line
`<input>` sent on Enter, so a child typing a four-part question (what I am building, what I
expected, what happened, what I tried) sent it in pieces. `AskPanel.tsx` and `BuilderAskPanel.tsx`
now use a `<textarea>` (starts at 4 rows, auto-grows with the draft to about 8 before
`app/globals.css`'s `.tr-ask__input` max-height and overflow-y:auto take over); Enter inserts a
new line, and only the Send button or Ctrl/Cmd+Enter sends. The "n asks left" counter is
unchanged; there was no character limit or counter to preserve (grepped for one before assuming
the brief meant it). `.tr-ask__row` moved from `align-items: stretch` to `flex-end` so Send sits
level with the textarea's last line instead of stretching full height, and a bug caught in the
same session's own screenshot review, not by any gate, is fixed alongside it: the existing
`@media (max-width: 480px)` rule that stacks the row into a column never reset `align-items`, so
at 390 wide both the textarea and the Send button shrank to the card's right edge instead of each
spanning full width; that media query now sets `align-items: stretch` explicitly.
`web/scripts/a4-builder-ask-screenshots.mjs` gained a step that fills a real four-line question
and screenshots the grown box before sending.

**2026-09-24: G1, B3, B4 and B5 land, and trinket.io's shutdown is worked around with Thonny.**
Content only, from `C:/Users/vvp91/wonderloop-scratch/s1-batch3/`, after an author pass and two
adversarial verification rounds. **trinket.io shut down 2026-08-31**; the only two files in all of
`content/` that referenced it, `s1-w10-build` and `s1-w12-build`, now use **Thonny** instead (a
free, offline Python editor, installed once by a grown-up), with a new first-time install guide
(`s1-w10-build-08`), `turtle.done()` added to every guided turtle program (Thonny on Windows has
open turtle-window-freeze reports, so the drawing window's lifecycle and the `Stop`-button recovery
are now taught explicitly), and week 12's retention spec fixed so the timed rebuild is not just a
read of whatever Thonny reopened on its own. New `s1-w05-build-15` "How to ask AI a good question"
is the first-time guide for the `Stuck? Ask` panel on Build/Make (A4), written to match the panel
exactly as built, including the multi-line textarea from the entry above it (app commit `2997363`
landed mid-package; the step originally described the old single-line box and was corrected once
the mismatch was caught in re-verification). New `s1-w11-build-08` "Find the answer yourself"
teaches the AI-fluency ladder the owner asked for (error, official docs, Ask, grown-up) on a bug
the child plants on purpose. `s1-w07-build-04`'s last spec-first gap on the ultrasonic block is
fixed, with a new "check the AI" step (`s1-w07-build-08`) carrying a practice answer with two
planted mistakes, tested by action, never given away in the text; the same package fixed `play
note`'s real mBlock 5 category (`Show`, not `Sound`) everywhere in season 1. Week 9 gained a
first-time camera-permission guide matching Chrome's real prompt. Week 11's Python badge guide is
reordered guide-first and every python.microbit.org claim corrected to the real v3 editor. Week
2's gravity sentence now matches MakeCode's own -1023 reading, and the last two "as if to your
sister" lines are gone (rule 21). Nine new ids, no id moved. Screenshots:
`web/scripts/s1-batch3-screenshots.mjs`, every new or changed step in weeks 2, 5, 6, 7, 9, 10, 11
and 12, at 1366x768 and 820x1180.

**2026-09-26: Ask and Builder Ask stop growing the page and stop circling.** Owner feedback on
both AI helpers: "AI chat keeps growing, making the screen appear weird height-wise" and "AI is
too strict, going in circles, and has limited asks." Three separate fixes:

- **Height.** `.tr-ask__log` (`web/app/globals.css`) is now a fixed-height scroll area (45vh on
  laptop widths, 50vh under the existing 480px phone breakpoint, a small `min-height` so it does
  not visibly jump on the first bubble) instead of an unbounded flex column, so a long transcript
  scrolls inside its own card rather than pushing the whole page taller; the panel's own total
  height stays stable, and the input plus Send stay visible right below it. `AskPanel.tsx` and
  `BuilderAskPanel.tsx` both gained a `logRef` and a `useEffect` on `[messages.length]` that
  scrolls the log to its newest message (the CSS's `scroll-behavior: smooth` means this takes a
  fraction of a second, not instant, which matters if a screenshot script measures it too soon
  after opening the panel). `web/scripts/ask-height-fix-screenshots.mjs` seeds a 14-message
  transcript directly into the emulator (no real Anthropic call) and confirms, at 1366x768,
  820x1180 and 390x844, that the transcript scrolls internally and the newest message is visible.
- **Circling.** Both `web/lib/ai/tutor.ts` and `web/lib/ai/builder.ts` were revised, then given an
  opus review pass, to answer first, cap clarifying questions to one for the whole conversation
  (not one per reply, which never actually bounded anything), and switch into a fuller teaching
  mode once the child is genuinely stuck rather than nudging forever -- for maths, a full worked
  example with different numbers AND a different final answer, then only the first concrete step
  of his own problem; for builds, a plain explanation of what is wrong and what to change, with a
  short example. The owner's original rules stay exactly as strict: maths Ask never states his own
  problem's answer (now also never confirms or denies a guess for it), Builder Ask never writes
  his whole program or designs his project. Full rationale, the opus review's findings, and the
  exact prompt shapes: `docs/superpowers/specs/2026-09-25-builder-ask-prompt.md`'s "2026-09-25
  anti-circling revision" section.
- **Limits.** `web/lib/domain/tutor.ts`'s `MAX_CHILD_MESSAGES` 6 to 15; `web/lib/domain/builderAsk.ts`'s
  `MAX_BUILDER_STEP_MESSAGES` 10 to 25; `web/lib/domain/rateLimit.ts`'s `RATE_LIMIT_MAX_CALLS`
  (the shared per-profile, per-hour cap across every AI route) 20 to 45, since a full 15-message
  maths conversation and a full 25-message build conversation in the same hour already spend 40
  calls between them. `s1-w05-build-15`'s "How to ask AI a good question" step (its body, its
  figure's alt text, and the figure's own "n asks left" label) was patched from 10 to 25 to match,
  no id moved.

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
