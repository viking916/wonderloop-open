/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getQuest, getWeek, loadContent } from "./load";

const good = path.join(__dirname, "__fixtures__", "good");
const bad = path.join(__dirname, "__fixtures__", "bad");

describe("loadContent", () => {
  test("loads a valid tree", () => {
    const r = loadContent(good);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.content?.quests.map((q) => q.id)).toEqual(["s1-w06-think"]);
    expect(getQuest(r.content!, "s1-w06-think")?.title).toBeTruthy();
    expect(getWeek(r.content!, 1, 6).think?.id).toBe("s1-w06-think");
  });
  test("reports unknown idea, unknown sprout skill and missing explain step", () => {
    const r = loadContent(bad);
    expect(r.ok).toBe(false);
    const messages = r.errors.map((e) => e.message).join("\n");
    expect(messages).toMatch(/unknown idea "nope"/);
    expect(messages).toMatch(/unknown skill "sprout.missing"/);
    expect(messages).toMatch(/think quest must end with explain written then explain voice/);
  });
  test("reports missing weeks when expected", () => {
    const r = loadContent(good, { expectWeeks: { 1: 12 } });
    expect(r.errors.some((e) => /missing seasons\/1\/weeks\/01\/build.json/.test(e.message))).toBe(true);
  });
  test("a content tree with no lessons.json at all loads fine, with an empty lessons array", () => {
    const r = loadContent(good);
    expect(r.ok).toBe(true);
    expect(r.content?.lessons).toEqual([]);
  });
});

// "Meet the idea" lessons (task 4): lessons.json is a separate, optional registry (see load.ts's
// own comment on why it must stay optional for these very fixtures), so these tests build their
// own tree with one added rather than reusing the shared `cases` table above, which asserts a
// single mutation against the always-present fixture files.
describe("loadContent: lessons", () => {
  function goodLesson(): any {
    return {
      id: "lesson-flip-and-multiply",
      ideaId: "pigeonhole", // an idea the good fixture actually registers
      title: "Meet the idea",
      beats: [1, 2, 3].map((n) => ({
        id: `lesson-flip-and-multiply-b0${n}`,
        prompt: "How many pieces in total?",
        figure: { kind: "grid", alt: "A grid of shaded pieces.", spec: { rows: 1, cols: 2, shaded: [[0, 0], [0, 1]] } },
        answer: { kind: "number", value: "2" },
        onWrong: "Count the shaded squares.",
        onRight: "Two.",
      })),
    };
  }

  function lessonStep(lessonId = "lesson-flip-and-multiply"): any {
    return { kind: "lesson", id: "s1-w06-think-07", title: "Meet the idea", lessonId };
  }

  test("loads a tree with a lessons.json and a step that references it", () => {
    const tree = structuredClone(readTree(good));
    tree["lessons.json"] = { lessons: [goodLesson()] };
    think(tree).steps.splice(2, 0, lessonStep());
    const r = loadContent(writeTree(tree));
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.content?.lessons.map((l) => l.id)).toEqual(["lesson-flip-and-multiply"]);
  });
  test("rejects a lesson step referencing an unknown lesson", () => {
    const tree = structuredClone(readTree(good));
    think(tree).steps.splice(2, 0, lessonStep("nope"));
    const r = loadContent(writeTree(tree));
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.message).join("\n")).toMatch(/unknown lesson "nope"/);
  });
  test("rejects a lesson whose ideaId is unknown", () => {
    const tree = structuredClone(readTree(good));
    const lesson = goodLesson();
    lesson.ideaId = "not-a-real-idea";
    tree["lessons.json"] = { lessons: [lesson] };
    think(tree).steps.splice(2, 0, lessonStep());
    const r = loadContent(writeTree(tree));
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.message).join("\n")).toMatch(/unknown idea "not-a-real-idea"/);
  });
  test("rejects a duplicate lesson beat id", () => {
    const tree = structuredClone(readTree(good));
    const lesson = goodLesson();
    lesson.beats[1].id = lesson.beats[0].id;
    tree["lessons.json"] = { lessons: [lesson] };
    think(tree).steps.splice(2, 0, lessonStep());
    const r = loadContent(writeTree(tree));
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.message).join("\n")).toMatch(/duplicate id "lesson-flip-and-multiply-b01"/);
  });
});

// A tree is every JSON file in a content root, keyed by its forward-slash relative path, so a
// test can change one field and write the whole thing back out to a temp directory.
type Tree = Record<string, any>;

function readTree(dir: string, base = dir, out: Tree = {}): Tree {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) readTree(full, base, out);
    else if (entry.name.endsWith(".json")) out[path.relative(base, full).split(path.sep).join("/")] = JSON.parse(fs.readFileSync(full, "utf8"));
  }
  return out;
}

function writeTree(tree: Tree): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wonderloop-content-"));
  for (const [rel, value] of Object.entries(tree)) {
    const full = path.join(dir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(value, null, 2));
  }
  return dir;
}

const THINK = "seasons/1/weeks/06/think.json";
const SPROUT = "sprout/weeks/01.json";
const think = (t: Tree) => t[THINK];

function buildQuest(): any {
  return {
    id: "s1-w06-build", season: 1, week: 6, track: "build",
    title: "Line follower", summary: "A robot that keeps itself on a black line.", minutes: 60,
    materials: ["black tape"], skills: ["think.logic"], completion: "artifact-and-log",
    steps: [
      { kind: "instruction", id: "s1-w06-build-01", title: "The design loop", body: "Ask, imagine, plan, then build." },
      { kind: "typing", id: "s1-w06-build-02", minutes: 5, body: "Five minutes on the home row." },
      { kind: "science", id: "s1-w06-build-03", title: "Why it works", body: "White tape sends light back, black tape soaks it up." },
      { kind: "task", id: "s1-w06-build-04", title: "Show these", body: "Run it three times.", checklist: ["It follows a straight line.", "It finds the line again after a nudge.", "It stops at the end."] },
      { kind: "instruction", id: "s1-w06-build-05", title: "Bug diary", body: "Write down the bug that cost you the most time." },
      { kind: "artifact", id: "s1-w06-build-06", title: "Show your build", prompt: "Photo of the robot and the code.", accepts: ["photo", "code"] },
      { kind: "log", id: "s1-w06-build-07", variant: "maker" },
    ],
  };
}

function speakQuest(): any {
  return {
    id: "s1-w06-speak", season: 1, week: 6, track: "speak",
    title: "Claim, reason, example", summary: "Say the claim, then back it up.", minutes: 45,
    materials: [], skills: ["think.logic"], completion: "recording-and-log",
    steps: [
      { kind: "instruction", id: "s1-w06-speak-01", title: "Skill of the week", body: "Claim, reason, example. Is a good reason always a true one?" },
      { kind: "debate", id: "s1-w06-speak-02", motionId: "homework-banned", side: "for", rounds: 3 },
      { kind: "artifact", id: "s1-w06-speak-03", title: "Record it", prompt: "Record your two minutes.", accepts: ["recording"] },
      { kind: "log", id: "s1-w06-speak-04", variant: "speak" },
    ],
  };
}

const cases: { name: string; mutate: (t: Tree) => void; expect: RegExp }[] = [
  {
    name: "duplicate problem id",
    mutate: (t) => { const set = think(t).steps[2]; set.problems[1].id = set.problems[0].id; },
    expect: /duplicate id "s1-w06-think-03-p01"/,
  },
  {
    name: "build quest missing science",
    mutate: (t) => { const b = buildQuest(); b.steps = b.steps.filter((s: any) => s.kind !== "science"); t["seasons/1/weeks/06/build.json"] = b; },
    expect: /build quest needs a science step/,
  },
  {
    name: "speak quest not ending with a recording artifact then a speak log",
    mutate: (t) => { const s = speakQuest(); s.steps = [s.steps[0], s.steps[1], s.steps[3], s.steps[2]]; t["seasons/1/weeks/06/speak.json"] = s; },
    expect: /speak quest must end with a recording artifact then a speak log/,
  },
  {
    name: "introducesIdea in a week other than the idea firstWeek",
    mutate: (t) => { t["ideas.json"].ideas.find((i: any) => i.id === "pigeonhole").firstWeek = 5; },
    expect: /idea "pigeonhole" firstWeek is 5 but first introduced in week 6/,
  },
  {
    name: "explain problemId not in the quest",
    mutate: (t) => { think(t).steps[think(t).steps.length - 1].problemId = "s1-w06-think-04-p09"; },
    expect: /explain problemId "s1-w06-think-04-p09" not in this quest/,
  },
  {
    name: "sprout correct references a missing item id",
    mutate: (t) => { t[SPROUT].activities[0].rounds[0].correct.itemIds = ["nope"]; },
    expect: /correct references unknown item "nope"/,
  },
  {
    name: "quest week does not match its folder",
    mutate: (t) => { think(t).week = 7; think(t).id = "s1-w07-think"; },
    expect: /season, week or track does not match the file location/,
  },
  {
    name: "thinkMinutes wrong for the lane",
    mutate: (t) => { think(t).steps[2].problems[0].thinkMinutes = 5; },
    expect: /thinkMinutes for the skills lane must be 4, not 5/,
  },
  {
    name: "grid cells the wrong size",
    mutate: (t) => {
      const p = think(t).steps[1].problem;
      delete p.options;
      p.kind = "grid";
      p.rows = ["Room 2", "Room 4"];
      p.cols = ["1 move", "2 moves"];
      p.answer = { kind: "grid", cells: [[true, false]] };
      p.variant = { prompt: "Same cave, but room 3 is blocked. Match each room to its fewest moves.", answer: { kind: "grid", cells: [[true, false], [false, true]] } };
    },
    expect: /grid cells must be 2 rows by 2 cols/,
  },
  {
    name: "duplicate choice options",
    mutate: (t) => { const p = think(t).steps[2].problems[0]; p.options[1] = p.options[0]; p.answer.index = 0; },
    expect: /choice options must be unique/,
  },
  {
    name: "warm-up with the same answer index on every problem",
    mutate: (t) => {
      const source = think(t).steps[1].problem;
      const clone = (n: number) => ({ ...structuredClone(source), id: `s1-w06-think-01-p0${n}`, lane: "warmup", thinkMinutes: 2 });
      think(t).steps[0].problems = [clone(1), clone(2)];
    },
    expect: /warm-up s1-w06-think-01 has the same answer index on every problem/,
  },
  {
    name: "sprout pick round with an identical wrong card",
    mutate: (t) => { t[SPROUT].activities[0].rounds[0].items[1].color = "red"; },
    expect: /wrong card "i2" looks and sounds exactly like a correct card/,
  },
];

describe("loadContent rejects", () => {
  const base = readTree(good);
  test.each(cases)("$name", ({ mutate, expect: pattern }) => {
    const tree = structuredClone(base);
    mutate(tree);
    const r = loadContent(writeTree(tree));
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.message).join("\n")).toMatch(pattern);
  });
});

// The per-season expected-weeks map (season 2 landing): strict validation claims an explicit
// week count per season, for quests and sprout alike, so a partially landed season passes
// exactly when everything it claims is on disk and nothing beyond it is.
describe("loadContent: per-season expected weeks", () => {
  // A tree whose season 1 has exactly week 1 landed (all three tracks plus sprout week 1, the
  // flat season 1 layout) and whose season 2 has the same week 1 landed under the per-season
  // layouts with season-namespaced sprout ids: the shape of a partially landed season 2.
  function partialTree(): Tree {
    const tree = readTree(good);
    const rename = (q: any, from: string, to: string) => JSON.parse(JSON.stringify(q).replaceAll(from, to));
    // introducesIdea ties an idea's registry firstWeek to the week that introduces it; these
    // relocated quests are about week counts, not idea introductions, so strip the flags.
    const stripIntro = (q: any) => {
      for (const s of q.steps) for (const p of [...(s.problems ?? []), ...(s.problem ? [s.problem] : [])]) delete p.introducesIdea;
      return q;
    };
    const think1 = stripIntro(rename(think(tree), "s1-w06-", "s1-w01-"));
    think1.week = 1;
    think1.steps[0].variant = "number-sense"; // week 1 of the warm-up rotation
    const build1 = rename(buildQuest(), "s1-w06-", "s1-w01-");
    build1.week = 1;
    const speak1 = rename(speakQuest(), "s1-w06-", "s1-w01-");
    speak1.week = 1;
    delete tree[THINK];
    tree["seasons/1/weeks/01/think.json"] = think1;
    tree["seasons/1/weeks/01/build.json"] = build1;
    tree["seasons/1/weeks/01/speak.json"] = speak1;
    const toSeason2 = (q: any) => { const c = rename(q, "s1-w01-", "s2-w01-"); c.season = 2; return c; };
    tree["seasons/2/weeks/01/think.json"] = toSeason2(think1);
    tree["seasons/2/weeks/01/build.json"] = toSeason2(build1);
    tree["seasons/2/weeks/01/speak.json"] = toSeason2(speak1);
    const sprout2 = rename(tree[SPROUT], "sprout-w01", "s2-sprout-w01");
    sprout2.season = 2;
    tree["sprout/seasons/2/weeks/01.json"] = sprout2;
    return tree;
  }

  test("a partially landed season passes when the map claims exactly its landed weeks", () => {
    const r = loadContent(writeTree(partialTree()), { expectWeeks: { 1: 1, 2: 1 } });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.content?.quests.map((q) => q.id).sort()).toEqual(
      ["s1-w01-build", "s1-w01-speak", "s1-w01-think", "s2-w01-build", "s2-w01-speak", "s2-w01-think"],
    );
    // Season 1 sprout must stay first: getSproutWeek matches on week number alone.
    expect(r.content?.sprout.map((w) => w.id)).toEqual(["sprout-w01", "s2-sprout-w01"]);
  });

  test("a season missing a week it claims fails, quests and sprout both", () => {
    const r = loadContent(writeTree(partialTree()), { expectWeeks: { 1: 1, 2: 2 } });
    expect(r.ok).toBe(false);
    const messages = r.errors.map((e) => e.message).join("\n");
    expect(messages).toMatch(/missing seasons\/2\/weeks\/02\/think.json/);
    expect(messages).toMatch(/missing sprout\/seasons\/2\/weeks\/02.json/);
  });

  test("a season on disk that the map does not claim fails strict validation", () => {
    const r = loadContent(writeTree(partialTree()), { expectWeeks: { 1: 1 } });
    expect(r.ok).toBe(false);
    const messages = r.errors.map((e) => e.message).join("\n");
    expect(messages).toMatch(/season 2 is on disk but not in the expected weeks map/);
    expect(messages).toMatch(/sprout season 2 is on disk but not in the expected weeks map/);
  });

  test("a landed week past the map's claim fails strict validation", () => {
    const tree = partialTree();
    tree["seasons/1/weeks/02/think.json"] = structuredClone(tree["seasons/1/weeks/01/think.json"]);
    tree["sprout/weeks/02.json"] = structuredClone(tree[SPROUT]);
    const r = loadContent(writeTree(tree), { expectWeeks: { 1: 1, 2: 1 } });
    expect(r.ok).toBe(false);
    const messages = r.errors.map((e) => e.message).join("\n");
    expect(messages).toMatch(/season 1 claims weeks 1 to 1 but week 2 is on disk/);
    expect(messages).toMatch(/sprout season 1 claims weeks 1 to 1 but week 2 is on disk/);
  });
});
