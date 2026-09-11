import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  BooksSchema, CalendarSchema, GamesRegistrySchema, LadderGraphSchema, LadderTopicSchema, IdeasRegistrySchema, LessonsRegistrySchema, MaterialsSchema, MotionsSchema, QuestSchema, SkillsRegistrySchema, SproutWeekSchema,
  type LadderTopic, type Problem, type Quest, type SproutWeek,
} from "./schema";
import { getQuest, getSproutWeek, getWeek, problemsOf, type Content, type Material } from "./lookup";

// Re-exported so existing consumers of load.ts (this module reads the content tree from disk,
// so it is server/script-only) keep working unchanged. The filesystem-free definitions live in
// ./lookup, which app-content.ts imports directly so it never pulls node:fs into a client bundle.
export { getQuest, getSproutWeek, getWeek, problemsOf };
export type { Content };

export type ContentError = { file: string; path: string; message: string };
export type LoadResult = { ok: boolean; errors: ContentError[]; content: Content | null };

const TRACKS = ["build", "make", "think", "speak", "play"] as const;
const pad = (n: number) => String(n).padStart(2, "0");

function readJson<T>(file: string, schema: z.ZodType<T>, errors: ContentError[], root: string): T | null {
  if (!fs.existsSync(file)) { errors.push({ file, path: "", message: `missing ${path.relative(root, file).split(path.sep).join("/")}` }); return null; }
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { errors.push({ file, path: "", message: `invalid JSON: ${(e as Error).message}` }); return null; }
  const r = schema.safeParse(raw);
  if (!r.success) { for (const i of r.error.issues) errors.push({ file, path: i.path.join("."), message: i.message }); return null; }
  return r.data;
}

/** The thinkMinutes floor every problem in a lane must carry, from the authoring guide rule 8. */
const LANE_MINUTES: Record<Problem["lane"], number> = { warmup: 2, "puzzle-of-week": 5, skills: 4, shape: 4, puzzle: 5, check: 4, monster: 8 };

function checkGridSize(cells: boolean[][], rows: string[] | undefined, cols: string[] | undefined, errors: ContentError[], file: string, at: string) {
  if (!rows || !cols) { errors.push({ file, path: at, message: "grid problems need rows and cols" }); return; }
  if (cells.length !== rows.length || cells.some((row) => row.length !== cols.length)) {
    errors.push({ file, path: at, message: `grid cells must be ${rows.length} rows by ${cols.length} cols` });
  }
}

function checkProblem(p: Problem, errors: ContentError[], file: string) {
  if (p.thinkMinutes !== LANE_MINUTES[p.lane]) errors.push({ file, path: p.id, message: `thinkMinutes for the ${p.lane} lane must be ${LANE_MINUTES[p.lane]}, not ${p.thinkMinutes}` });
  if (p.answer.kind === "grid") checkGridSize(p.answer.cells, p.rows, p.cols, errors, file, p.id);
  // A variant that leaves rows or cols out reuses the parent's.
  if (p.variant?.answer.kind === "grid") checkGridSize(p.variant.answer.cells, p.variant.rows ?? p.rows, p.variant.cols ?? p.cols, errors, file, `${p.id}.variant`);
  if (p.options && new Set(p.options).size !== p.options.length) errors.push({ file, path: p.id, message: "choice options must be unique" });
  if (p.variant?.options && new Set(p.variant.options).size !== p.variant.options.length) errors.push({ file, path: `${p.id}.variant`, message: "choice options must be unique" });
}

function checkThinkStructure(q: Quest, errors: ContentError[], file: string) {
  const kinds = q.steps.map((s) => (s.kind === "problem-set" ? `problem-set:${s.lane}` : s.kind === "explain" ? `explain:${s.mode}` : s.kind === "warmup" ? `warmup:${s.variant}` : s.kind));
  // A warm-up of nothing but choice problems must not park the answer on one index every time.
  for (const s of q.steps) {
    if (s.kind !== "warmup" || !s.problems.every((p) => p.answer.kind === "choice")) continue;
    const indexes = new Set(s.problems.map((p) => (p.answer.kind === "choice" ? p.answer.index : -1)));
    if (s.problems.length > 1 && indexes.size === 1) errors.push({ file, path: s.id, message: `warm-up ${s.id} has the same answer index on every problem` });
  }
  // Two explains of the same mode means one of them was meant to be the other. It held for every
  // landed week before it was written down: showcases run one voice and one written, ordinary
  // weeks end written then voice, and season 1's showcases carry none at all. Checked for every
  // think quest, showcase included, because the showcase branch below returns early and a season 2
  // week 12 draft reached the landing queue with two voice explains and no written one.
  const explainModes = q.steps.flatMap((s) => (s.kind === "explain" ? [s.mode] : []));
  const duplicated = explainModes.filter((m, i) => explainModes.indexOf(m) !== i);
  for (const mode of new Set(duplicated)) errors.push({ file, path: "steps", message: `think quest has more than one ${mode} explain step` });

  if (q.showcase) {
    const check = q.steps.find((s) => s.kind === "problem-set" && s.lane === "check");
    if (!check || (check.kind === "problem-set" && check.problems.length !== 10)) errors.push({ file, path: "steps", message: "showcase think quest needs a check problem-set with exactly 10 problems" });
    if (!q.steps.some((s) => s.kind === "instruction")) errors.push({ file, path: "steps", message: "showcase think quest needs an instruction step" });
    return;
  }
  const expectedWarmup = [3, 6, 9, 12].includes(q.week) ? "warmup:fermi" : [2, 10].includes(q.week) ? "warmup:rhythm" : "warmup:number-sense";
  if (kinds[0] !== expectedWarmup) errors.push({ file, path: "steps.0", message: `think quest week ${q.week} must start with ${expectedWarmup}` });
  if (kinds[1] !== "puzzle-of-week") errors.push({ file, path: "steps.1", message: "think quest needs puzzle-of-week second" });
  if (!kinds.includes("problem-set:skills") || !kinds.includes("problem-set:puzzle")) errors.push({ file, path: "steps", message: "think quest needs a skills problem-set and a puzzle problem-set" });
  const skillsAt = kinds.indexOf("problem-set:skills"), puzzleAt = kinds.indexOf("problem-set:puzzle");
  if (skillsAt >= 0 && puzzleAt >= 0 && skillsAt > puzzleAt) errors.push({ file, path: "steps", message: "the skills problem-set must come before the puzzle problem-set" });
  // The geometry-and-chance lane, where a week has one, sits between the two.
  const shapeAt = kinds.indexOf("problem-set:shape");
  if (shapeAt >= 0 && (shapeAt < skillsAt || shapeAt > puzzleAt)) errors.push({ file, path: "steps", message: "the shape problem-set must sit between the skills and puzzle problem-sets" });
  for (const s of q.steps) {
    if (s.kind !== "problem-set") continue;
    const n = s.problems.length;
    if (s.lane === "skills" && (n < 6 || n > 8)) errors.push({ file, path: s.id, message: `skills problem-set needs 6 to 8 problems, not ${n}` });
    if (s.lane === "shape" && (n < 3 || n > 4)) errors.push({ file, path: s.id, message: `shape problem-set needs 3 or 4 problems, not ${n}` });
    if (s.lane === "puzzle") {
      // A proof week runs three written proofs instead of a full puzzle set.
      const allText = s.problems.every((p) => p.kind === "text");
      if (!((n >= 6 && n <= 10) || (allText && n === 3))) errors.push({ file, path: s.id, message: `puzzle problem-set needs 6 to 10 problems, or exactly 3 when every problem is text, not ${n}` });
    }
  }
  const voice = q.steps.find((s) => s.kind === "explain" && s.mode === "voice");
  if (voice?.kind === "explain" && voice.problemId) {
    const inPuzzleLane = q.steps.some((s) => (s.kind === "problem-set" && s.lane === "puzzle" && s.problems.some((p) => p.id === voice.problemId)) || (s.kind === "puzzle-of-week" && s.problem.id === voice.problemId));
    if (!inPuzzleLane) errors.push({ file, path: voice.id, message: `explain voice problemId "${voice.problemId}" must be a puzzle-lane problem or the puzzle of the week` });
  }
  if (kinds.slice(-2).join(",") !== "explain:written,explain:voice") errors.push({ file, path: "steps", message: "think quest must end with explain written then explain voice" });
}

function checkBuildStructure(q: Quest, errors: ContentError[], file: string) {
  const kinds = q.steps.map((s) => s.kind);
  for (const k of ["artifact", "log"] as const) if (!kinds.includes(k)) errors.push({ file, path: "steps", message: `build quest needs a ${k} step` });
  if (!q.showcase) for (const k of ["science", "task"] as const) if (!kinds.includes(k)) errors.push({ file, path: "steps", message: `build quest needs a ${k} step` });
  if (q.week >= 5 && !q.showcase && !kinds.includes("typing")) errors.push({ file, path: "steps", message: "build quests from week 5 need a typing warm-up" });
  const log = q.steps.find((s) => s.kind === "log");
  if (log && log.kind === "log" && log.variant !== "maker") errors.push({ file, path: "steps", message: "build log must be the maker variant" });
}

/**
 * A Play quest (instrument practice, 6 September 2026) is a practice scaffold: the week's
 * practice trick as an instruction, the sittings as a task checklist, a recording of the piece,
 * then the Practice log. Every one of those has to be there for the week to teach anything, and
 * the recording plus the log are what completion reads (completion "recording-and-log").
 */
function checkPlayStructure(q: Quest, errors: ContentError[], file: string) {
  const kinds = q.steps.map((s) => s.kind);
  for (const k of ["instruction", "task"] as const) if (!kinds.includes(k)) errors.push({ file, path: "steps", message: `play quest needs a ${k} step` });
  const last = q.steps.slice(-2);
  const okEnd = last[0]?.kind === "artifact" && last[0].accepts.includes("recording") && last[1]?.kind === "log" && last[1].variant === "play";
  if (!okEnd) errors.push({ file, path: "steps", message: "play quest must end with a recording artifact then a play log" });
  if (q.completion !== "recording-and-log") errors.push({ file, path: "completion", message: "play quests complete on recording-and-log" });
}

/**
 * A Make quest (the engineering track, 6 September 2026) is a build with numbers: the design
 * loop as an instruction, a science moment, a task checklist of observable behaviours, a data
 * step (the week's measurements, charted, with a claim answered from them), an artifact, and a
 * Maker's Log. Showcase weeks drop the science and data steps like Build does.
 */
function checkMakeStructure(q: Quest, errors: ContentError[], file: string) {
  const kinds = q.steps.map((s) => s.kind);
  for (const k of ["instruction", "task", "artifact", "log"] as const) if (!kinds.includes(k)) errors.push({ file, path: "steps", message: `make quest needs a ${k} step` });
  if (!q.showcase) for (const k of ["science", "data"] as const) if (!kinds.includes(k)) errors.push({ file, path: "steps", message: `make quest needs a ${k} step` });
  const log = q.steps.find((s) => s.kind === "log");
  if (log && log.kind === "log" && log.variant !== "maker") errors.push({ file, path: "steps", message: "make log must be the maker variant" });
  if (q.completion !== "artifact-and-log") errors.push({ file, path: "completion", message: "make quests complete on artifact-and-log" });
}

/**
 * Which weeks of a season must carry a debate step, past the week 4 point where debate begins.
 *
 * This is per season and deliberately has no default, because the honest answer could differ by
 * season and a season that inherits someone else's answer silently is how a debate goes missing.
 * Add a season here when you author it; content for an undeclared season fails loudly rather than
 * quietly skipping the check.
 *
 * Both seasons so far debate every week from 5 on, because the house delivers a design's weekly
 * philosophy question AS the debate. This rule was briefly narrowed to weeks 5 to 8 during the
 * season 2 week 9 to 12 authoring, on the reasoning that those weeks belong to the free build.
 * That was backwards: the design gives weeks 9, 10 and 11 philosophy questions like every other
 * week, weeks 10 and 11 had simply lost theirs, and narrowing the rule would have hidden that
 * permanently. The content was fixed instead. A rule that fails is evidence before it is an
 * obstacle.
 */
const DEBATE_WEEKS: Record<number, (week: number) => boolean> = {
  1: (week) => week >= 5,
  2: (week) => week >= 5,
  3: (week) => week >= 5,
  4: (week) => week >= 5,
};

function checkSpeakStructure(q: Quest, errors: ContentError[], file: string) {
  const last = q.steps.slice(-2);
  const okEnd = last[0]?.kind === "artifact" && last[0].accepts.includes("recording") && last[1]?.kind === "log" && last[1].variant === "speak";
  if (!okEnd) errors.push({ file, path: "steps", message: "speak quest must end with a recording artifact then a speak log" });
  const debateDue = DEBATE_WEEKS[q.season];
  if (!debateDue) {
    errors.push({ file, path: "season", message: `season ${q.season} has no debate-week policy in DEBATE_WEEKS; declare one before authoring its speak quests` });
  } else if (debateDue(q.week) && !q.showcase && !q.steps.some((s) => s.kind === "debate")) {
    errors.push({ file, path: "steps", message: `speak quests in season ${q.season} week ${q.week} need a debate step` });
  }
  if (q.showcase && !q.steps.some((s) => s.kind === "task" && /Teach someone younger|Big Brother/i.test(s.title))) errors.push({ file, path: "steps", message: "showcase speak quest needs a Teach someone younger task step" });
}

const PICK_KINDS = ["tap-next", "odd-one-out", "match", "listen-tap", "compare"] as const;
type SproutRound = SproutWeek["activities"][number]["rounds"][number];
type SproutItem = SproutRound["items"][number];

/** Everything the child can perceive about a card. Two cards with the same key are the same card to him. */
const cardKey = (i: SproutItem) => [i.shape, i.color ?? "", i.size ?? "", i.count ?? "", i.sound ?? ""].join("|");

function checkSproutRound(a: SproutWeek["activities"][number], r: SproutRound, errors: ContentError[], file: string) {
  const ids = r.items.map((i) => i.id);
  const sorted = (xs: string[]) => [...xs].sort().join(",");
  if (r.correct.kind === "order" && sorted(r.correct.itemIds) !== sorted(ids)) {
    errors.push({ file, path: r.id, message: "order must list every item in the round exactly once" });
  }
  if (r.correct.kind === "groups") {
    const flat = r.correct.groups.flat();
    if (sorted(flat) !== sorted(ids)) errors.push({ file, path: r.id, message: "groups must put every item in the round in exactly one group" });
  }
  if (r.correct.kind === "count") {
    // Reference items are shown beside the round, never inside the pile being counted (the player
    // draws them in their own strip), so they must not be part of the total either. A season 4
    // draft marked the big block in a count round as reference and it drew twice, once in the
    // strip and once in the pile: fourteen things on screen for an answer of eight.
    const counted = r.items.filter((i) => !i.reference);
    const total = counted.reduce((n, i) => n + (i.count ?? 1), 0);
    if (r.correct.value > total) errors.push({ file, path: r.id, message: `count value ${r.correct.value} is more than the ${total} things on screen` });
    if (counted.length === 0) errors.push({ file, path: r.id, message: "a count round needs something to count that is not reference material" });
  }
  if (r.correct.kind === "pick" && (PICK_KINDS as readonly string[]).includes(a.kind)) {
    // In a tap-next round only the last two cards are the choices; everything before them is the
    // trail, which repeats the correct card on purpose.
    const choices = a.kind === "tap-next" ? r.items.slice(-2) : r.items;
    const picked = r.correct.itemIds;
    // Narrowing the test to the choices only holds if the answer is one of them.
    if (a.kind === "tap-next" && !picked.every((id) => choices.some((i) => i.id === id))) {
      errors.push({ file, path: r.id, message: "in a tap-next round the correct card must be one of the last two cards" });
    }
    const correctKeys = choices.filter((i) => r.correct.kind === "pick" && r.correct.itemIds.includes(i.id)).map(cardKey);
    for (const i of choices) {
      if (r.correct.kind === "pick" && r.correct.itemIds.includes(i.id)) continue;
      if (correctKeys.includes(cardKey(i))) errors.push({ file, path: r.id, message: `wrong card "${i.id}" looks and sounds exactly like a correct card` });
    }
  }
}

/** Weeks each landed season claims, quests and sprout alike. Maintained by hand as sprints
 * land. Strict validation (validate:content, prebuild, generate, seeding) expects exactly these
 * weeks per season and fails on a claimed week that is missing or a landed week that is not
 * claimed; --partial passes no map and validates whatever is on disk. */
export const EXPECT_WEEKS: Record<number, number> = { 1: 12, 2: 12, 3: 12, 4: 12 };

export function loadContent(root: string, opts: { expectWeeks?: Record<number, number> } = {}): LoadResult {
  const errors: ContentError[] = [];
  const skills = readJson(path.join(root, "skills.json"), SkillsRegistrySchema, errors, root)?.skills ?? [];
  const ideas = readJson(path.join(root, "ideas.json"), IdeasRegistrySchema, errors, root)?.ideas ?? [];
  const motions = readJson(path.join(root, "motions.json"), MotionsSchema, errors, root)?.motions ?? [];
  const books = readJson(path.join(root, "books.json"), BooksSchema, errors, root)?.books ?? [];
  // Season 1's materials live at the root (the original registry); seasons 2 and later carry
  // their own at content/seasons/{n}/materials.json. Keyed by season id as a string.
  const materials: Record<string, Material[]> = {
    "1": readJson(path.join(root, "materials.json"), MaterialsSchema, errors, root)?.items ?? [],
  };
  for (const season of Object.keys(opts.expectWeeks ?? EXPECT_WEEKS)) {
    const file = path.join(root, "seasons", season, "materials.json");
    if (season !== "1" && fs.existsSync(file)) materials[season] = readJson(file, MaterialsSchema, errors, root)?.items ?? [];
  }
  const calendar = readJson(path.join(root, "calendar.json"), CalendarSchema, errors, root);
  // lessons.json is optional, unlike every other registry above: it was added after every other
  // content root already existed (task 4, the concept-first prototype's first lesson), and a
  // content tree with none authored yet -- most of all the schema/load test fixtures under
  // __fixtures__ -- is not an error, just "no lessons authored here". A malformed lessons.json
  // that DOES exist is still validated and still errors exactly like every other registry.
  // games.json (7 September 2026) is optional the same way: the game of the sprint, one per
  // season and sprint, played with the family. Its skill must exist; two games for the same
  // season and sprint is a defect.
  const gamesFile = path.join(root, "games.json");
  const games = fs.existsSync(gamesFile) ? (readJson(gamesFile, GamesRegistrySchema, errors, root)?.games ?? []) : [];
  const lessonsFile = path.join(root, "lessons.json");
  const lessons = fs.existsSync(lessonsFile) ? (readJson(lessonsFile, LessonsRegistrySchema, errors, root)?.lessons ?? []) : [];

  const skillIds = new Set(skills.map((s) => s.id));
  {
    const seen = new Set<string>();
    for (const g of games) {
      if (!skillIds.has(g.skill)) errors.push({ file: gamesFile, path: g.id, message: `unknown skill "${g.skill}"` });
      const key = `${g.season}:${g.sprint}`;
      if (seen.has(key)) errors.push({ file: gamesFile, path: g.id, message: `season ${g.season} sprint ${g.sprint} already has a game` });
      seen.add(key);
    }
  }
  const ideaIds = new Set(ideas.map((i) => i.id));
  const motionIds = new Set(motions.map((m) => m.id));
  const lessonIds = new Set(lessons.map((l) => l.id));
  const seen = new Map<string, string>();
  const claim = (id: string, file: string) => { if (seen.has(id)) errors.push({ file, path: id, message: `duplicate id "${id}" (also in ${seen.get(id)})` }); else seen.set(id, file); };
  const ideaFirstSeen = new Map<string, number>();

  for (const lesson of lessons) {
    claim(lesson.id, lessonsFile);
    if (!ideaIds.has(lesson.ideaId)) errors.push({ file: lessonsFile, path: lesson.id, message: `unknown idea "${lesson.ideaId}"` });
    for (const beat of lesson.beats) claim(beat.id, lessonsFile);
  }

  // The Ladder (8 September 2026): content/ladder/graph.json and content/ladder/topics/*.json,
  // both optional (a tree without them has no Ladder). Every topic file must be in the graph,
  // every need must exist without a cycle, every skill and idea must resolve, and a bank holds
  // at least ten problems at each difficulty so the engine's bands are real.
  const ladderDir = path.join(root, "ladder");
  const graphFile = path.join(ladderDir, "graph.json");
  const ladderGraph = fs.existsSync(graphFile) ? (readJson(graphFile, LadderGraphSchema, errors, root)?.topics ?? []) : [];
  const ladderTopics: Record<string, LadderTopic> = {};
  {
    const metaIds = new Set(ladderGraph.map((t) => t.id));
    for (const t of ladderGraph) {
      claim(t.id, graphFile);
      for (const n of t.needs) if (!metaIds.has(n)) errors.push({ file: graphFile, path: t.id, message: `unknown need "${n}"` });
      for (const sk of t.skills) if (!skillIds.has(sk)) errors.push({ file: graphFile, path: t.id, message: `unknown skill "${sk}"` });
    }
    // Cycle check by peeling topics whose needs have all been peeled.
    const remaining = new Map(ladderGraph.map((t) => [t.id, new Set(t.needs.filter((n) => metaIds.has(n)))]));
    let peeled = true;
    while (peeled && remaining.size) {
      peeled = false;
      for (const [id, needs] of remaining) {
        if (needs.size === 0) {
          remaining.delete(id);
          for (const other of remaining.values()) other.delete(id);
          peeled = true;
        }
      }
    }
    if (remaining.size) errors.push({ file: graphFile, path: [...remaining.keys()].join(","), message: "the topic graph has a cycle" });
    const topicsDir = path.join(ladderDir, "topics");
    const files = fs.existsSync(topicsDir) ? fs.readdirSync(topicsDir).filter((f) => f.endsWith(".json")).sort() : [];
    for (const f of files) {
      const file = path.join(topicsDir, f);
      const topic = readJson(file, LadderTopicSchema, errors, root);
      if (!topic) continue;
      if (topic.id !== f.replace(/\.json$/, "")) errors.push({ file, path: topic.id, message: "topic id must match the file name" });
      if (!metaIds.has(topic.id)) errors.push({ file, path: topic.id, message: "topic is not in graph.json" });
      const counts = [0, 0, 0, 0];
      for (const p of [...topic.bank, ...topic.stretch]) {
        claim(p.id, file);
        if (!p.id.startsWith(`ladder-${topic.id}-p`)) errors.push({ file, path: p.id, message: `problem id must start with ladder-${topic.id}-p` });
        if (!ideaIds.has(p.ideaId)) errors.push({ file, path: p.id, message: `unknown idea "${p.ideaId}"` });
        for (const sk of p.skills) if (!skillIds.has(sk)) errors.push({ file, path: p.id, message: `unknown skill "${sk}"` });
      }
      for (const p of topic.bank) counts[p.difficulty]++;
      if (counts[1] < 10 || counts[2] < 10 || counts[3] < 10) errors.push({ file, path: topic.id, message: `bank needs at least ten problems at each difficulty (has ${counts[1]}/${counts[2]}/${counts[3]})` });
      ladderTopics[topic.id] = topic;
    }
  }

  const quests: Quest[] = [];
  const seasonsDir = path.join(root, "seasons");
  const onDiskSeasons = fs.existsSync(seasonsDir) ? fs.readdirSync(seasonsDir).map(Number).filter(Number.isInteger) : [];
  const claimedSeasons = opts.expectWeeks ? Object.keys(opts.expectWeeks).map(Number) : [];
  const seasonNums = [...new Set([...onDiskSeasons, ...claimedSeasons])].sort((a, b) => a - b);
  for (const season of seasonNums.length ? seasonNums : [1]) {
    const weeksDir = path.join(seasonsDir, String(season), "weeks");
    const claimed = opts.expectWeeks?.[season];
    if (opts.expectWeeks && claimed === undefined) {
      errors.push({ file: weeksDir, path: "", message: `season ${season} is on disk but not in the expected weeks map` });
      continue;
    }
    const present = fs.existsSync(weeksDir) ? fs.readdirSync(weeksDir).map(Number).filter(Number.isInteger) : [];
    if (claimed) for (const week of present) if (week > claimed) errors.push({ file: path.join(weeksDir, pad(week)), path: "", message: `season ${season} claims weeks 1 to ${claimed} but week ${week} is on disk` });
    const weeks = claimed ? Array.from({ length: claimed }, (_, i) => i + 1) : present.sort((a, b) => a - b);
    for (const week of weeks) for (const track of TRACKS) {
      const file = path.join(weeksDir, pad(week), `${track}.json`);
      if (!claimed && !fs.existsSync(file)) continue;
      // Play is authored season by season (season 1 first, 6 September 2026) and is opt-in per
      // profile, so a week without a play.json is a week with three quests, not an error.
      if ((track === "play" || track === "make") && !fs.existsSync(file)) continue;
      const q = readJson(file, QuestSchema, errors, root);
      if (!q) continue;
      if (q.season !== season || q.week !== week || q.track !== track) errors.push({ file, path: "", message: "season, week or track does not match the file location" });
      claim(q.id, file);
      for (const sk of q.skills) if (!skillIds.has(sk)) errors.push({ file, path: "skills", message: `unknown skill "${sk}"` });
      for (const st of q.steps) if ((st.kind === "science" || st.kind === "data") && st.ideaId && !ideaIds.has(st.ideaId)) errors.push({ file, path: st.id, message: `unknown idea "${st.ideaId}"` });
      for (const ex of q.extras ?? []) if (ex.ideaId && !ideaIds.has(ex.ideaId)) errors.push({ file, path: ex.id, message: `unknown idea "${ex.ideaId}"` });
      const problemIds = new Set<string>();
      for (const step of q.steps) {
        claim(step.id, file);
        if (!step.id.startsWith(q.id + "-")) errors.push({ file, path: step.id, message: `step id must start with ${q.id}-` });
        if (step.kind === "debate" && !motionIds.has(step.motionId)) errors.push({ file, path: step.id, message: `unknown motion "${step.motionId}"` });
        if (step.kind === "lesson" && !lessonIds.has(step.lessonId)) errors.push({ file, path: step.id, message: `unknown lesson "${step.lessonId}"` });
        for (const p of problemsOf(step)) {
          claim(p.id, file); problemIds.add(p.id);
          if (!p.id.startsWith(step.id + "-p")) errors.push({ file, path: p.id, message: `problem id must start with ${step.id}-p` });
          for (const sk of p.skills) if (!skillIds.has(sk)) errors.push({ file, path: p.id, message: `unknown skill "${sk}"` });
          if (!ideaIds.has(p.ideaId)) errors.push({ file, path: p.id, message: `unknown idea "${p.ideaId}"` });
          checkProblem(p, errors, file);
          if (p.introducesIdea) { const prev = ideaFirstSeen.get(p.ideaId); if (prev === undefined || week < prev) ideaFirstSeen.set(p.ideaId, week); }
        }
      }
      for (const step of q.steps) if (step.kind === "explain" && step.problemId && !problemIds.has(step.problemId)) errors.push({ file, path: step.id, message: `explain problemId "${step.problemId}" not in this quest` });
      if (q.track === "think") checkThinkStructure(q, errors, file);
      if (q.track === "build") checkBuildStructure(q, errors, file);
      if (q.track === "speak") checkSpeakStructure(q, errors, file);
      if (q.track === "play") checkPlayStructure(q, errors, file);
      if (q.track === "make") checkMakeStructure(q, errors, file);
      quests.push(q);
    }
  }
  for (const idea of ideas) {
    const first = ideaFirstSeen.get(idea.id);
    if (first !== undefined && first !== idea.firstWeek) errors.push({ file: path.join(root, "ideas.json"), path: idea.id, message: `idea "${idea.id}" firstWeek is ${idea.firstWeek} but first introduced in week ${first}` });
  }

  const sprout: SproutWeek[] = [];
  // Two layouts, deliberately: season 1 predates seasons and lives flat at sprout/weeks/NN.json
  // with append-only ids (sprout-wNN; real progress points at them), while season 2 onward lives
  // at sprout/seasons/<n>/weeks/NN.json with season-namespaced ids (s2-sprout-wNN). Season 1
  // loads first so lookup.ts's getSproutWeek, which matches on week number alone, keeps
  // resolving to season 1 exactly as it did before a second season landed.
  const flatSproutDir = path.join(root, "sprout", "weeks");
  const sproutSeasonsDir = path.join(root, "sprout", "seasons");
  const sproutDirFor = (season: number) => (season === 1 ? flatSproutDir : path.join(sproutSeasonsDir, String(season), "weeks"));
  const onDiskSproutSeasons = [
    ...(fs.existsSync(flatSproutDir) ? [1] : []),
    ...(fs.existsSync(sproutSeasonsDir) ? fs.readdirSync(sproutSeasonsDir).map(Number).filter((n) => Number.isInteger(n) && n > 1) : []),
  ];
  const sproutSeasons = [...new Set([...onDiskSproutSeasons, ...claimedSeasons])].sort((a, b) => a - b);
  for (const season of sproutSeasons) {
    const dir = sproutDirFor(season);
    const claimed = opts.expectWeeks?.[season];
    if (opts.expectWeeks && claimed === undefined) {
      errors.push({ file: dir, path: "", message: `sprout season ${season} is on disk but not in the expected weeks map` });
      continue;
    }
    const present = fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => Number(f.replace(".json", ""))).filter(Number.isInteger).sort((a, b) => a - b) : [];
    if (claimed) for (const week of present) if (week > claimed) errors.push({ file: path.join(dir, `${pad(week)}.json`), path: "", message: `sprout season ${season} claims weeks 1 to ${claimed} but week ${week} is on disk` });
    const weeks = claimed ? Array.from({ length: claimed }, (_, i) => i + 1) : present;
    for (const week of weeks) {
      const file = path.join(dir, `${pad(week)}.json`);
      if (!claimed && !fs.existsSync(file)) continue;
      const w = readJson(file, SproutWeekSchema, errors, root);
      if (!w) continue;
      if (w.week !== week) errors.push({ file, path: "week", message: "week does not match the file name" });
      if (w.season !== season) errors.push({ file, path: "season", message: "season does not match the file location" });
      claim(w.id, file);
      for (const sk of w.skills) if (!skillIds.has(sk)) errors.push({ file, path: "skills", message: `unknown skill "${sk}"` });
      for (const a of w.activities) {
        claim(a.id, file);
        if (!a.id.startsWith(w.id + "-a")) errors.push({ file, path: a.id, message: `activity id must start with ${w.id}-a` });
        if (!skillIds.has(a.skill)) errors.push({ file, path: a.id, message: `unknown skill "${a.skill}"` });
        for (const r of a.rounds) {
          claim(r.id, file);
          if (!r.id.startsWith(a.id + "-r")) errors.push({ file, path: r.id, message: `round id must start with ${a.id}-r` });
          const itemIds = new Set(r.items.map((i) => i.id));
          const referenced = r.correct.kind === "count" ? [] : r.correct.kind === "groups" ? r.correct.groups.flat() : r.correct.itemIds;
          let unknown = false;
          for (const id of referenced) if (!itemIds.has(id)) { unknown = true; errors.push({ file, path: r.id, message: `correct references unknown item "${id}"` }); }
          if (!unknown) checkSproutRound(a, r, errors, file);
        }
      }
      sprout.push(w);
    }
  }

  const ok = errors.length === 0;
  return { ok, errors, content: ok && calendar ? { skills, ideas, motions, lessons, games, books, materials, calendar, quests, sprout, ladder: { graph: ladderGraph, topics: ladderTopics } } : null };
}
