# Content authoring guide

This is the reference for anyone writing Wonderloop content: quests, problems, Sprout weeks, or the registries. The rules below are copied verbatim from the plan and are the contract the validator enforces.

## Content Authoring Rules (apply to every content task)

These rules are the contract between the author (a task executor) and the validator. They are repeated in `docs/content-authoring.md` (Task 5).

1. **Ids.** Quest id: `s1-w07-think`. Step id: `s1-w07-think-03`. Problem id: `s1-w07-think-03-p04`. Sprout week: `sprout-w07`; activity `sprout-w07-a2`; round `sprout-w07-a2-r3`. Ids are unique across the whole tree.
2. **Problem kinds.** `number` (answer is a numeric string; fractions like `3/4`, decimals like `0.75`, money like `32.40`, negatives like `-3`; the checker accepts any equivalent form), `choice` (3 to 5 options, one correct index), `truefalse`, `order` (items and the correct order as indices), `grid` (rows, cols, boolean cells), `text` (proofs and explain-its; not auto-graded; `answer.mustMention` lists 2 to 4 phrases the AI checker and the parent look for).
3. **Explanation.** An array of 2 to 6 strings, each one step, plain language. The last step may name the distraction or the trap. Never restate the prompt.
4. **Idea.** `ideaId` must exist in `ideas.json`. A problem that introduces an idea for the first time sets `introducesIdea: true` and its `explanation` names the idea in words a kid would repeat.
5. **useAgain.** One sentence starting with "when": when to reach for this idea again.
6. **Hints.** Exactly two. Hint 1 points at the trap or the first move. Hint 2 gives the first step of the method. Neither states the answer.
7. **Skills.** 1 to 3 skill ids from `skills.json`. The Skills lane tags `think.skills.*`; the Puzzle lane tags the puzzle skill and often `think.proof`. Money problems tag `think.money` plus the math skill.
8. **thinkMinutes.** The floor before "How it works" can open after a third try, one value per lane, and the validator checks every problem against it: 2 for warm-ups, 5 for the puzzle of the week, 4 for Skills-lane problems, 4 for the Shape and chance lane, 5 for Puzzle-lane problems and proofs, 4 for the showcase check lane, 8 for the monster problem.
9. **Variant.** Required for `number`, `choice`, `truefalse`, `order`, `grid`. Same idea, changed surface (different numbers, objects or setting). `variant` has `prompt` and `answer` (same kind as the parent).
10. **Think quest structure**, in order: `warmup` (number-sense; `fermi` in weeks 3, 6, 9, 12; `rhythm` in weeks 2 and 10), `puzzle-of-week` (a single spatial problem), `problem-set` lane `skills` (6 to 8 problems), from season 2 a `problem-set` lane `shape` (Shape and chance: geometry and probability, 3 or 4 problems, owner direction of 6 September 2026; season 1 carries them appended to the puzzle lane instead, since its ids are frozen by use), `problem-set` lane `puzzle` (6 to 10 problems, 3 in proof weeks), `explain` written, `explain` voice (`problemId` points at one puzzle-lane problem). Showcase weeks replace both problem sets with one `problem-set` lane `check` (the sprint check, 10 problems) and one `instruction` describing the family presentation.
11. **Build quest structure**, in order: `instruction` (the design loop: ask, imagine, plan), `typing` (weeks 5 and later), `science`, `task` (with a 3 to 5 item checklist of observable behaviours), `instruction` (bug diary prompt), `artifact` (accepts photo and code), `log` variant `maker`. Showcase weeks: `instruction` (what to demo), `artifact` (photo or recording), `log` maker.
12. **Speak quest structure**, in order: `instruction` (the skill of the week, with the philosophy question), one of `task` (a talk to prepare) or `debate` (weeks 5 and later), `artifact` accepts recording, `log` variant `speak`. Week 5 opens with the AI-literacy `instruction`. Showcase weeks: `instruction`, `artifact` recording, `log` speak. The Teach someone younger quest (a younger sibling, cousin or friend, or a parent playing the part) is an extra `task` step in weeks 4, 8, 12; its title starts with "Teach someone younger".
13. **Sprout week**: `theme`, exactly 3 activities of 3 to 5 rounds, each round has a spoken `prompt`, 2 to 6 `items`, and a `correct` answer. Use 2 items only for `compare` rounds, two-move `sequence` rounds, and `count` rounds where two cards are the whole question: one card to count plus one decoy of a different shape (`sprout-w04-a1-r1`, a coin and a cup; `sprout-w04-a1-r4`, a stack of three coins and a cup), or two cards that are both counted (`sprout-w04-a1-r2`). The counted card may carry a `count`, so a two-card round can still answer 3. Every pick round's wrong cards must differ from the correct card in at least one of shape, colour, size, count or sound, or the child cannot tell them apart and the round has no answer. In a `tap-next` round the last two items are the choices and everything before them is the trail, so the trail may repeat the correct card. In `listen-tap` and `order` rounds identical cards are interchangeable: the app accepts any card with the same perceivable attributes. The week also needs an `intro` and an `offScreen` line per activity (both spoken); a `parentCard` with `includes` set to one of `read-aloud | blocks | cut-draw | sing | why-walk`, 3 to 5 `steps`, 2 to 3 `notice` lines.
14. **Copy.** Sentence case. No em dashes, no arrows. No "great job" filler. Errors and empty states say what to do next.
15. **Money and percent.** A prompt may show whole dollars (`$40`) or cents (`$32.40`). Every money answer value is a two-decimal string with no `$`, including whole dollars: `32.40`, `45.00`. An answer that is itself a percent carries `"unit": "%"` on the answer object and the value stays a bare number (`"value": "90"`, not `"90%"`), so a child who types `90` and a child who types `90%` both get it right.
16. **Ids are append-only.** Once a problem, step, quest, activity or round id is committed it never moves and never changes meaning. Do not renumber to make room; add new ones at the end of the set. Saved progress and the idea box point at these ids.
19. **Prompts keep their line breaks.** A prompt may contain `
`; the quest screen renders it with
    `white-space: pre-line`, so a worked solution in a find-the-mistake problem can put each
    numbered line on its own line. Use it only where lines genuinely belong apart.
20. **Bodies and prompts are plain text with four conventions** (`components/quest/StepBody.tsx` renders them): paragraphs are separated by one blank line; consecutive lines starting `1. `, `2. `, `3. ` are an ordered list, one action per item, and every do-this-then-that sequence is written that way (a program written as a paragraph threw the child off on the first real session); single-backtick spans are block, drawer, menu, file and key names and render as code; URLs are written in full with `https://` and render as links that open in a new tab. Never write markdown beyond these four.
23. **The physics thread (and, later, chemistry and biology).** Science is taught the way everything else here accelerates: as named ideas, measured, retrieved and taught back. A Build `science` step may carry `ideaId` (the idea it teaches; ticking the step meets the idea in the idea box), an extra may carry `ideaId` too, and a physics extra has a fixed shape: one line naming what to find out, then "Predict first: ..." with the number written in the Maker's Log, the measurement with the week's own kit, "Compare: ...", and "Teach it: ...". Weeks later a warm-up problem retrieves the idea through a number-sense calculation, tagged with the idea and the `build.physics` skill. Every figure a body cites is recomputed before landing. The kit grows when a measurement needs it: a multimeter, a tape measure, a scale or a thermometer goes on the season list as a plain item with its week, never as "optional" and never replaced by a weaker measurement to save a few dollars (owner decision, 6 September 2026: the goal is the child's best, and the instrument is part of the exercise). Chemistry and biology follow the same pattern when they arrive (kitchen chemistry with a safety line; seeds, growth and the field journal for biology); they get their own skill ids under `build.` and ideas in the same registry. (Owner decision, 6 September 2026.)
24. **The Play track (instrument practice), opt-in per profile.** A fourth quest a week, `s{n}-w{NN}-play`, track `play`, 60 minutes as four sittings of about fifteen. It is a practice scaffold, not a piece: the teacher sets the pieces, the quest sets how they are practised. Fixed shape, checked by the loader: an `instruction` step naming the week's practice trick and why it works (hard bars first, slow is smooth, hands alone, loop the join, listen back, last line first, the map of the piece, dynamics, sight-reading), optionally a `science` step with an `ideaId` (sound physics, same predict/measure/compare/teach shape as rule 23), a `task` step whose checklist is the sittings (never days: the design forbids streaks and daily guilt, so a sitting is ticked whenever it happens) with the fifth item an old piece played again (retrieval), then a recording `artifact` and a `log` of variant `play` (the Practice log, four prompts in `components/quest/LogStep.tsx`). Completion is `recording-and-log`. Showcase weeks are mini recitals: two pieces, names said, one question from the family; week 12's task is "Teach someone younger a tune". Skills are `play.*`; a Practice log awards `play.practice-craft` and `play.listening`. The track is authored for every week but shown only to profiles with `playTrack` on (`lib/domain/tracks.ts`); a parent turns it on in the Parent view. Copy is instrument-neutral where it costs nothing and says "piano" where the technique is a piano technique. (Owner's ask, 6 September 2026.)
25. **The Make track (engineering) and the data step.** Make is a core fifth quest, `s{n}-w{NN}-make`, track `make`, 60 minutes: mechanical, electrical and aerospace engineering toward robotics, with hardware that keeps climbing (owner direction, 6 September 2026: math, CS, engineering, robotics, physics and EE toward chips are the focus; chemistry and biology stay to two science moments a season). Structure, checked by the loader: `instruction` (the design loop for the week's build), `science`, `task` (3 to 5 observable behaviours), `data`, `artifact` (photo or code), `log` variant `maker`; Showcase weeks drop `science` and `data`. Completion is `artifact-and-log`. Skills are `make.*`; a Maker's Log on a Make quest awards `make.notebook`. **The data step** is the data-science thread and goes in every Build and Make week that has a genuine measurement: `{ kind: "data", id, title, body, columns: [label, number...] (2 to 4), minRows (3 to 12), question, ideaId? }`. The body says what to measure and how to keep it fair (what changes, what stays the same, how many runs); the app charts each numeric column with its mean and median; the question is one claim to answer from the chart in a sentence with a number in it. The four statistics ideas that stay are mean, median, spread and "was the difference bigger than the wobble"; nothing beyond them. Never invent a measurement to fill the slot: a week with nothing honest to measure has no data step, and NOTES says so. The kit serves the exercise (rule 23): calipers, a spring scale, a 3D printer, a fabricated board go on the season list as plain items.
26. **Games of the sprint and chess warm-ups.** `content/games.json` holds one game per season and sprint (`{ id, name, season, sprint, players, minutes, kit, cost, teaches, rules, notice, skill, ideaId? }`), chosen for what it teaches (Set, Mastermind, Dots and boxes, Hex, Guess my rule, the 24 game, Kerbal Space Program, Battleship, the Rubik's cube, Sprouts, Blokus, Quarto). This Week shows the sprint's game beside the season book with its rules and one thing to notice; the family marks it played once (`households/{hid}/profiles/{pid}/games`), and that is evidence on the card, never points. The game's kit goes on the season list with its cost. Chess tactics ride the Think track as a second `warmup` step, variant `chess`, inserted after the shape lane in weeks 2, 6 and 10 of seasons 2 to 4: four `choice` problems with a `board` figure (`spec.fen`), options in algebraic notation, skill `think.chess`. Every chess position is confirmed with python-chess before landing (legal, side to move, the answer unique for a mate, the hanging piece really undefended); a puzzle the script did not confirm does not ship. (Owner direction, 6 September 2026.)
27. **Real instruments, never toys.** When a kit line is a machine or a kit (a 3D printer, a robot platform, a bench tool), it names the class of machine and the capability the exercise needs (bed size, layer precision, load, degrees of freedom), with the real price, and its `why` says what real part or motion it enables. A 3D printer is chosen so the child prints robot parts to tolerance, never trinkets for fun; a robot is chosen for motion, physics, gripping, walking and control, never a preprogrammed toy. An author agent's materials output is audited against this before landing. (Owner rule, 7 September 2026.)
22. **Extras (optional).** A quest may carry `extras`: `[{ id: "<questId>-x01", kind: "bonus" | "invent", title, minutes (5 to 60), body, figure? }]`. A `bonus` is more to build with the same kit when there is time, written as a numbered list in the body conventions and ending with one line on what to notice; an `invent` is a design brief with a starting question, three constraints, sketch first, and how to know it works, never the steps. Extras never count toward completion; a finished one is ticked under its own id. Ids are append-only like everything else. (Owner's ask after the first Build session felt too short, 6 September 2026.)
21. **No personal information.** Content is shared by every family that uses the app, so it never carries a real child's name, age, grade, school stage or gender, and never assumes a particular sibling. The learner is "you"; in parent-facing lines the learner is "your child" and then "they"; a sibling is "a younger sibling, cousin or friend, or a parent playing the part"; fictional characters in problems keep their own names and pronouns (owner decision, 6 September 2026).
18. **Timed sets (optional).** A `problem-set` step may carry `"timed": true`. The app then offers
    an opt-in, count-up clock before the first problem, records "minutes to finish" once every
    problem has an outcome, and shows that one number to the parent as a fact, never a score. It
    never counts down and is never required. Season 1's three summit check sets carry it; use it
    on a set that stands in for a real competition paper, and nowhere a child could read it as a
    verdict (curriculum review 2026-09-05, lever 5; `web/lib/domain/clock.ts`).
17. **Figure (optional).** A problem or its variant, and a Build `instruction`, `science` or `task` step, may carry a `figure`: `{ kind: "net" | "stack" | "grid" | "path" | "shape" | "leds" | "board" | "keys" | "beats" | "diagram" | "scene" | "plane", alt: "...", spec: { ... } }`. A problem may also carry `explanationFigure` of the same shape, drawn under the worked explanation once the answer is in: fraction problems in particular explain better with the shaded grid than with prose alone (owner's catch after week one, 7 September 2026; 37 landed across season 1 Think). The Play track's two kinds are `keys` (a piano keyboard: `spec { octaves: 1 | 2, from: "C4", highlight: ["C4", "E4", "G4"], labels?: boolean }`) and `beats` (a bar of beats: `spec { beats: 4, pattern: "x.x-", count?: ["1", "&", "2", "&"] }`, `x` a note or clap, `.` a rest, `-` a held note); every Play step that names keys or a rhythm carries one (same catch, 94 landed). A grid that counts bars or sittings is one row of N cells with the marked ones shaded, never `mode: "bars"` with a single column, which draws N enormous squares. The Make track's visual guide is `diagram` (7 September 2026, owner: every hands-on step needs a guide the child can follow): `spec { w, h, wide?, items: [...] }` with items `box` (x, y, w, h, label, sub?, fill?), `line` (x1, y1, x2, y2, label?, arrow?, dashed?, color?), `circle`, `poly` (points), `dot` (a marked point with a label on a side), `dim` (a dimension line with a label) and `text`; fills and colours are palette names (ink, accent, green, rust, paper, muted, sand, none). Every `science` and `task` step on a Make quest carries one, and an `instruction` step when the plan needs a layout; the figure shows the bench as the body describes it with the body's own words on every part, wire and value. A diagram may carry `spec.frames` (8 September 2026, owner: a kid visualises motion better when the picture moves): `[{ ms?, caption?, set: { "<item index>": { ...field overrides or hidden: true } } }]`, 3 to 6 frames, frame 0 the resting picture, each caption one short line in the body's words; the figure plays in a loop, a tap pauses it, and under reduced motion a tap steps it. Frames only override existing items (a moving marker must already be in the base drawing), and every frame passes the geometry lint as a still. Use frames where the step's idea IS motion (gears turning, current flowing, a foot lifting, a flowchart executing), never as decoration. The `scene` kind is a small drag-to-rotate 3D scene with one slider, built in code (`components/quest/SceneFigure.tsx`), for the few ideas that are three-dimensional: `{ kind: "scene", alt, spec: { type: "net-cube" | "walker" | "arm", ... } }`. New scene types are written by hand, never authored as free geometry, and only where turning the thing teaches something a still cannot. Look at every authored figure before landing with `npx tsx scripts/figure-gallery.tsx <out-prefix> <patch.json or quest files>`, which renders them all to one page and photographs it. The `leds` kind is an animated micro:bit (`components/quest/LedMatrix.tsx`): `spec.frames` is a list of `{ rows: [five strings of five characters, "#" lit and "." dark], ms: hold in milliseconds }`, with an optional `spec.caption` shown under the board; use it wherever a step describes a picture on the 5 by 5 screen, so the child sees the heart beat or the die change rather than imagining it (owner's catch, first real session, 5 September 2026). `spec` is shape-specific and free-form; `alt` is required and describes the figure in words, since the Quest screen renders `alt` on its own until a figure component for that `kind` exists. Optional; when absent the prose in the prompt is the picture. Season 1 uses it in nine problems; later seasons more.

---

## Skill ids (83)

Generated from `content/skills.json` on 2026-09-05; the registry is the authority, this list is a convenience.

### Think (29)
`think.logic`, `think.deduction`, `think.patterns`, `think.spatial`, `think.proof`, `think.algorithms`, `think.number-sense`, `think.money`, `think.skills.fractions`, `think.skills.decimals`, `think.skills.percent`, `think.skills.ratios`, `think.skills.negatives`, `think.skills.equations`, `think.skills.exponents`, `think.skills.coordinates`, `think.skills.inequalities`, `think.skills.primes`, `think.skills.statistics`, `think.skills.gcd-lcm`, `think.skills.modular`, `think.skills.variables`, `think.skills.angles`, `think.skills.counting`, `think.skills.area`, `think.skills.probability`, `think.skills.pythagoras`, `think.skills.volume`, `think.skills.linear`

### Build (16)
`build.blocks`, `build.sensors`, `build.loops`, `build.conditionals`, `build.variables`, `build.functions`, `build.debugging`, `build.python`, `build.data`, `build.ai`, `build.circuits`, `build.soldering`, `build.design`, `build.version-control`, `build.documentation`, `build.cpp`

### Speak (15)
`speak.voice`, `speak.structure`, `speak.claim-reason-example`, `speak.steelman`, `speak.cross-examination`, `speak.listening`, `speak.reflection`, `speak.analogy`, `speak.prompting`, `speak.rebuttal`, `speak.evidence`, `speak.summary`, `speak.judging`, `speak.coaching`, `speak.producing`

### Sprout (9)
`sprout.patterns`, `sprout.sorting`, `sprout.sequencing`, `sprout.matching`, `sprout.spatial`, `sprout.counting`, `sprout.comparing`, `sprout.sounds`, `sprout.rhyming`

## Idea ids (213)

Generated from `content/ideas.json` on 2026-09-05. An idea's `firstWeek` is the week of its season it was written for; later seasons reuse ideas freely, and a problem that reintroduces one in a new season sets `introducesIdea: true` again only when the season's design calls for it.

`true-or-false`, `if-then`, `cross-it-off`, `find-the-rule`, `break-the-pattern`, `common-bottom`, `same-slice`, `of-means-times`, `place-value-shift`, `flip-and-multiply`, `percent-is-per-hundred`, `same-or-different`, `pigeonhole`, `what-stays-the-same`, `two-way-check`, `halve-the-search`, `compare-and-swap`, `count-the-steps`, `unit-price`, `number-line`, `keep-the-balance`, `work-backwards`, `print-what-it-sees`, `look-at-the-training`, `guess-and-round`, `do-the-inside-first`, `fold-it-in-your-head`, `turn-it-in-your-head`, `count-what-you-cannot-see`, `dots-and-lines`, `count-the-lines`, `color-the-map`, `domino-idea`, `gate`, `exponents-fast-forward`, `winning-position`, `test-it-or-trust-it`, `two-symbols-are-enough`, `numbers-wear-costumes`, `copycat-pairing`, `money-snowball`, `xor-disagreement`, `machines-can-add`, `domino-proof`, `sketch-then-ink`, `primes-are-atoms`, `letter-is-a-box`, `threshold`, `data-teaches-the-machine`, `gcd-and-lcm`, `job-facts-limits`, `squeeze-the-list`, `sense-think-act`, `robot-moods`, `clock-math`, `binary-balance`, `choices-multiply`, `pay-yourself-first`, `fit-the-cap`, `corners-on-a-line`, `area-in-pieces`, `count-the-ways`, `the-long-run`, `next-word-guessing`, `square-on-the-side`, `nearest-neighbour`, `read-the-input`, `save-point`, `the-timer-is-the-referee`, `two-walks-one-day`, `loop-over-the-herd`, `simulate-it`, `fast-forward-rules`, `split-the-rectangle`, `readme-for-a-human`, `ship-it`, `flow-the-argument`, `story-math`, `casework`, `both-sides-balance`, `fixed-or-per-unit`, `break-even`, `impossible-assumption`, `try-them-all`, `count-the-steps-first`, `proportion-balance`, `paint-the-board`, `collapse-to-your-best`, `profit-is-what-remains`, `margin-as-percent`, `loan-comes-first`, `opportunity-cost`, `the-number-that-only-falls`, `root-undoes-square`, `match-them-up`, `count-the-opposite`, `every-pair-twice`, `the-compiler-reads-first`, `error-before-run`, `slope-is-the-per`, `line-law`, `say-why-they-won`, `types-are-promises`, `the-overflow-cliff`, `two-costumes-one-plan`, `the-mirage`, `one-stroke-rule`, `negative-turns-the-tables`, `the-speed-gap`, `route-and-weather`, `look-at-the-extreme`, `race-pace`, `same-grader-same-rules`, `reasons-beside-every-step`, `distance-is-a-triangle`, `powers-of-ten-zoom`, `the-protocol-card`, `park-and-return`, `counting-the-scarce-ingredient`, `which-middle-tells-the-truth`, `data-has-holes`, `smallest-criminal`, `set-the-problem`, `edge-cases-are-ambush-points`, `plant-and-pay-off`, `some-numbers-escape-fractions`, `read-code-like-a-book`, `rest-is-training`, `weigh-the-information`, `subtract-the-inside`, `the-state-map`, `share-the-factor`, `count-the-overlap-once`, `pair-the-ends`, `layer-by-layer`, `two-colors-or-a-cycle`

## Motion ids (36)

Generated from `content/motions.json` on 2026-09-05.

`homework-banned`, `own-bedtime`, `video-games-good`, `paid-for-chores`, `ok-to-lie`, `robots-decide`, `what-is-fair`, `zoos-should-exist`, `smart-or-kind`, `calculators-in-every-test`, `dangerous-tools-grown-ups-only`, `believe-the-computer`, `robots-can-have-feelings`, `machine-can-surprise`, `thought-beats-price`, `never-know-what-others-want`, `fail-in-public`, `handmade-beats-bought`, `machines-will-outthink-us`, `give-it-away-free`, `make-it-or-buy-it`, `allowance-earned-not-given`, `sell-for-more-than-it-cost`, `practice-changes-you`, `family-is-not-a-real-test`, `every-yes-costs-a-no`, `winning-is-being-right`, `argue-a-side-you-doubt`, `competitions-make-better-learners`, `program-that-runs-works`, `arguing-a-side-you-doubt-is-lying`, `empty-time-makes-ideas`, `hard-fun-is-the-best-fun`, `worth-saying-only-if-new`, `a-true-story-can-leave-things-out`, `finished-when-the-maker-says-so`

---

## One complete example problem

This is the sock problem from `web/lib/content/schema.test.ts` (the `goodProblem` constant), copied as content JSON.

```json
{
  "id": "s1-w06-think-04-p03",
  "kind": "number",
  "lane": "puzzle",
  "prompt": "A drawer has 10 red socks and 10 blue socks. It is dark. How many socks must you pull out to be sure of a matching pair?",
  "answer": { "kind": "number", "value": "3" },
  "explanation": [
    "There are only two colours. Think of two drawers: a red one and a blue one.",
    "Pull one sock, it goes in one drawer. Pull a second, it might go in the other. Still no pair.",
    "Pull a third sock. There are only two drawers, so it must land where a sock already is. That is your pair.",
    "The 10 and 10 were a distraction. Only the number of colours matters."
  ],
  "ideaId": "pigeonhole",
  "introducesIdea": true,
  "useAgain": "when a question says how many to be sure and there are fewer kinds of thing than things.",
  "hints": [
    "How many colours are there? Forget the tens.",
    "Imagine one drawer per colour and drop socks in one at a time."
  ],
  "skills": ["think.proof", "think.logic"],
  "thinkMinutes": 5,
  "difficulty": 2,
  "variant": {
    "prompt": "A bag has red, green and blue marbles, lots of each. Eyes closed, how many must you take to be sure of two the same colour?",
    "answer": { "kind": "number", "value": "4" }
  }
}
```

## One complete Sprout round

Adapted from round 1 of activity `sprout-w01-a1` in `web/lib/content/__fixtures__/good/sprout/weeks/01.json`, expanded from two cards to six so the trail is long enough to show the pattern. This is a `tap-next` round, so `i5` and `i6` are the two choices and `i1` to `i4` are the trail. The schema allows 2 to 6 cards.

```json
{
  "id": "sprout-w01-a1-r1",
  "prompt": "Red, blue, red, blue. What comes next?",
  "items": [
    { "id": "i1", "shape": "circle", "color": "red" },
    { "id": "i2", "shape": "circle", "color": "blue" },
    { "id": "i3", "shape": "circle", "color": "red" },
    { "id": "i4", "shape": "circle", "color": "blue" },
    { "id": "i5", "shape": "circle", "color": "red" },
    { "id": "i6", "shape": "circle", "color": "blue" }
  ],
  "correct": { "kind": "pick", "itemIds": ["i5"] }
}
```

## A failing rule is evidence before it is an obstacle

When the validator rejects content you just authored, the rule is a suspect but so is the content,
and the content is usually guilty. During the season 2 week 9 to 12 authoring the debate rule was
narrowed rather than obeyed, and it would have permanently hidden two weeks that had lost the
philosophy question the design gives them.

So: an agent authoring content never edits the repository, and that includes the validator. Report
the failure with what you think the rule should be and why, and let the landing pass rule on it. If
a rule really is wrong, changing it is a decision with its own commit and its own test, not a line
edited in passing to make a run go green.

## Run the tests through npm, not vitest directly

`npm test` runs a `pretest` hook that regenerates the content bundle first. `npx vitest run` does
not, so it can test a bundle that is behind the content tree and pass. Season 3 landed with the
validator reporting 28 sprout weeks while the bundle still held 20, and every content-wide test ran
over two seasons instead of three without saying so.

A test now pins the bundle to `EXPECT_WEEKS` and fails when it falls behind, but the habit is
cheaper than the backstop: run `npm test`.

## Explanation length has a per-lane budget

An explanation is as long as its lane needs and no longer. Across seasons 1 and 2, the voice the
project approved, the medians run: warm-up 41 words, skills 55, check 58, puzzle 75, puzzle of the
week 94, monster 195. A monster explains a whole technique and earns its room; a warm-up does not.

The content report names anything past its lane's budget (warm-up 75, skills 105, check 125, puzzle
145, puzzle of the week 175, monster 290, shape 105 like skills), which is those same seasons' ninetieth percentile with
headroom.

Watch for this in particular when authoring from the previous sprint as your exemplar. Season 3
drifted upward in every lane that way, worst in the check lane at nearly double, because each
sprint matched the last and rounded up. Take the length cue from seasons 1 and 2, not from the
sprint immediately before you.

28. **The Ladder (mastery sequence).** `content/ladder/graph.json` lists every topic (`{ id, stage 1 to 6, title, needs, skills, fluencySeconds, thread: spine | number-theory | counting, summary }`) as a graph without cycles; `content/ladder/topics/<id>.json` carries a topic's idea card, a worked example, a bank of at least thirty problems with at least ten at each difficulty, and a stretch list. A Ladder problem is an ordinary problem (rules 2, 3, 17) with id `ladder-<topic>-pNN`, lane `skills`, `ideaId` equal to the topic id (one idea per topic in ideas.json), and a variant on every auto-graded problem because the fluency round and retrieval re-serve them. Wrong options in a choice are the real mistakes. No grade words anywhere: stages have names, not grades. The engine (lib/domain/ladder.ts) serves bands by the child's last ten results, so the difficulty field is load-bearing. A topic also carries `ways`: two to four genuinely different methods for its problems (`{ id: "<topic>-wN", name, when, steps, example, answer, trap, figure? }`), the first restating the idea card's own, so the child can pick the one that fits how he thinks (owner, 8 September 2026: "multiple tips and tricks so he can pick the pattern he likes"); a way is a different mechanic, never a rewording. Author a stage at a time through the usual author and verifier pipeline (docs/superpowers/specs/2026-09-08-math-ladder-design.md). (Owner decision, 8 September 2026.) Three rules the prealgebra stage taught (9 September 2026): the player does not shuffle options, so the correct option's position is spread across the four slots in every topic (a scripted author puts it first every time; a rebalance pass before the verifier, and the checker refuses a topic where one slot holds more than half); a figure on the prompt never labels the value the prompt asks for (a jump drawn from -5 to 3 labelled 3 answers "what is -5 + 8"), so a figure that shows the answer goes on `explanationFigure`; and a coordinate plane is the `plane` kind (`{ kind: "plane", alt, spec: { range: 1 to 12, points: [{ x, y, label? }], polygon?: [[x, y], ...], segments?: [[[x1, y1], [x2, y2]], ...] } }`, `components/quest/ProblemFigure.tsx`), which draws a unit grid, numbered ticks and labelled points; a diagram cannot carry a grid (its twenty-item cap and its label lint), and a point on bare axes cannot be read. Diagram dims put the label on the side their direction sets (left to right below, right to left above, top to bottom left), so a dim above a shape is drawn right to left; number lines and prisms are drawn to scale. The algebra stage (10 September 2026) added `polylines` to the plane (a line across the plane as two edge points, a parabola sampled every half unit, `{ points, dashed: true }` for a strict inequality's boundary), the notation rules (a caret for exponents, never the letter x as a times sign in a file with a variable, `2 - (-8)` with the negative in brackets, `x` never `1x`, `sqrt(5)`), and the rule that a symbolic answer is a `choice` in simplest form while an irrational value is never a `number`. The geometry stage (10 September 2026) added: a proof is an `order` problem whose steps have exactly one valid order (interchangeable premises are merged into one step) or a `choice` of the reason; an `order` problem's items are never stored in the correct order (the player does not shuffle, so the answer would be on screen; the checker refuses an identity order); pi answers are the multiple of pi as a `number` or a `choice` written `12 pi`; exact roots are choices; spelling is American throughout the Ladder (meters, centimeters, color, center), normalised by a sweep. The algebra 2 and precalculus stage (11 September 2026) added: an exact value is always exact (a `number` only when rational, otherwise a `choice` such as `sqrt(3)/2`, `pi/6` or `2 + 3i`, never a decimal); `log_b(x)` and `ln(x)` for logarithms and `x^(1/2)` for fractional exponents; a context sentence must be physically sensible (a sensor measures an angle, it does not "read sin(x) = 3/5"; no invented props such as a dial shaped like the unit circle; a 3D printer has no reflector), or the framing is dropped; two different problems never ask the identical question under different device names (a cross-problem duplicate check refuses it); a plane figure drops any point, segment or polygon outside its range and keeps labels off lines, the origin and the tick band, so a rational graph is sampled every quarter unit between its dashed asymptotes and a sinusoid every quarter unit of its period.
