import { describe, expect, test } from "vitest";
import { LessonSchema, ProblemSchema, QuestSchema, StepSchema, SproutWeekSchema } from "./schema";

const goodProblem = {
  id: "s1-w06-think-04-p03",
  kind: "number",
  lane: "puzzle",
  prompt: "A drawer has 10 red socks and 10 blue socks. It is dark. How many socks must you pull out to be sure of a matching pair?",
  answer: { kind: "number", value: "3" },
  explanation: [
    "There are only two colours. Think of two drawers: a red one and a blue one.",
    "Pull one sock, it goes in one drawer. Pull a second, it might go in the other. Still no pair.",
    "Pull a third sock. There are only two drawers, so it must land where a sock already is. That is your pair.",
    "The 10 and 10 were a distraction. Only the number of colours matters.",
  ],
  ideaId: "pigeonhole",
  introducesIdea: true,
  useAgain: "when a question says how many to be sure and there are fewer kinds of thing than things.",
  hints: ["How many colours are there? Forget the tens.", "Imagine one drawer per colour and drop socks in one at a time."],
  socraticHint: "If you only had two drawers to work with, how many socks would it take before one drawer had to hold two?",
  skills: ["think.proof", "think.logic"],
  thinkMinutes: 5,
  difficulty: 2,
  variant: {
    prompt: "A bag has red, green and blue marbles, lots of each. Eyes closed, how many must you take to be sure of two the same colour?",
    answer: { kind: "number", value: "4" },
  },
};

describe("ProblemSchema", () => {
  test("accepts a complete problem", () => {
    expect(ProblemSchema.safeParse(goodProblem).success).toBe(true);
  });
  test("rejects a problem with one hint", () => {
    const r = ProblemSchema.safeParse({ ...goodProblem, hints: ["only one"] });
    expect(r.success).toBe(false);
  });
  test("rejects a problem missing the tier-3 socraticHint", () => {
    const { socraticHint, ...noSocraticHint } = goodProblem;
    expect(ProblemSchema.safeParse(noSocraticHint).success).toBe(false);
  });
  test("rejects an em dash in the socraticHint", () => {
    const r = ProblemSchema.safeParse({ ...goodProblem, socraticHint: "What if you tried fewer socks — would that still work?" });
    expect(r.success).toBe(false);
  });
  test("rejects an explanation with one step", () => {
    const r = ProblemSchema.safeParse({ ...goodProblem, explanation: ["just one"] });
    expect(r.success).toBe(false);
  });
  test("requires a variant for number problems", () => {
    const { variant, ...noVariant } = goodProblem;
    expect(ProblemSchema.safeParse(noVariant).success).toBe(false);
  });
  test("does not require a variant for text problems", () => {
    const { variant, ...rest } = goodProblem;
    const textProblem = { ...rest, kind: "text", answer: { kind: "rubric", mustMention: ["two colours", "third sock"] } };
    expect(ProblemSchema.safeParse(textProblem).success).toBe(true);
  });
  test("rejects em dashes in prompts", () => {
    const r = ProblemSchema.safeParse({ ...goodProblem, prompt: "Socks — how many?" });
    expect(r.success).toBe(false);
  });
  test("choice answers must index an option", () => {
    const choice = { ...goodProblem, kind: "choice", options: ["1", "2", "3"], answer: { kind: "choice", index: 5 }, variant: { prompt: "x", options: ["a", "b", "c"], answer: { kind: "choice", index: 0 } } };
    expect(ProblemSchema.safeParse(choice).success).toBe(false);
  });
  test("rejects an ASCII arrow in prompts", () => {
    const r = ProblemSchema.safeParse({ ...goodProblem, prompt: "Step 1 -> Step 2" });
    expect(r.success).toBe(false);
  });
  test("rejects a Unicode arrow in hints", () => {
    const r = ProblemSchema.safeParse({ ...goodProblem, hints: ["First hint", "Second ⟶ hint"] });
    expect(r.success).toBe(false);
  });
  test("accepts a hyphen and a greater-than sign on their own", () => {
    const r = ProblemSchema.safeParse({ ...goodProblem, prompt: "Is 5 - 3 > 1?" });
    expect(r.success).toBe(true);
  });
  test("accepts a problem with a valid figure", () => {
    const r = ProblemSchema.safeParse({ ...goodProblem, figure: { kind: "grid", alt: "A 3 by 3 grid with two corners shaded.", spec: { rows: 3, cols: 3 } } });
    expect(r.success).toBe(true);
  });
  test("rejects a figure missing alt", () => {
    const r = ProblemSchema.safeParse({ ...goodProblem, figure: { kind: "grid", spec: { rows: 3, cols: 3 } } });
    expect(r.success).toBe(false);
  });
  test("accepts a variant with a valid figure", () => {
    const r = ProblemSchema.safeParse({
      ...goodProblem,
      variant: { ...goodProblem.variant, figure: { kind: "path", alt: "A path from the drawer to the sock pile.", spec: { steps: 3 } } },
    });
    expect(r.success).toBe(true);
  });
  test("rejects a variant figure missing alt", () => {
    const r = ProblemSchema.safeParse({
      ...goodProblem,
      variant: { ...goodProblem.variant, figure: { kind: "path", spec: { steps: 3 } } },
    });
    expect(r.success).toBe(false);
  });
});

describe("QuestSchema", () => {
  const quest = {
    id: "s1-w06-think",
    season: 1,
    week: 6,
    track: "think",
    title: "Pigeonhole",
    summary: "If there are more socks than drawers, two share.",
    minutes: 90,
    materials: ["graph paper", "pencil"],
    skills: ["think.proof"],
    completion: "all-steps",
    steps: [
      { kind: "warmup", id: "s1-w06-think-01", variant: "number-sense", problems: [goodProblem] },
      { kind: "explain", id: "s1-w06-think-02", title: "Explain it", mode: "written", prompt: "Write why three socks is always enough." },
    ],
  };
  test("accepts a quest", () => {
    expect(QuestSchema.safeParse(quest).success).toBe(true);
  });
  test("rejects a quest whose id does not match season, week and track", () => {
    expect(QuestSchema.safeParse({ ...quest, id: "s1-w07-think" }).success).toBe(false);
  });
  test("rejects wrong minutes for a track", () => {
    expect(QuestSchema.safeParse({ ...quest, minutes: 60 }).success).toBe(false);
  });
});

describe("LessonSchema", () => {
  const goodBeat = {
    id: "lesson-flip-and-multiply-b01",
    prompt: "Each of these 3 whole bars is cut into 2 equal halves. How many half-pieces in total?",
    figure: {
      kind: "grid",
      alt: "Three rows of two shaded squares, six half-pieces in total.",
      spec: { rows: 3, cols: 2, shaded: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]] },
    },
    answer: { kind: "number", value: "6" },
    onWrong: "Count one row at a time: 2 plus 2 plus 2 is 6.",
    onRight: "Six halves.",
  };
  const goodLesson = {
    id: "lesson-flip-and-multiply",
    ideaId: "flip-and-multiply",
    title: "Meet the idea: dividing by a fraction",
    beats: [
      goodBeat,
      { ...goodBeat, id: "lesson-flip-and-multiply-b02", answer: { kind: "number", value: "12" } },
      { ...goodBeat, id: "lesson-flip-and-multiply-b03", answer: { kind: "number", value: "1" } },
    ],
  };
  test("accepts a lesson with 3 beats", () => {
    expect(LessonSchema.safeParse(goodLesson).success).toBe(true);
  });
  test("rejects a lesson with 2 beats", () => {
    expect(LessonSchema.safeParse({ ...goodLesson, beats: goodLesson.beats.slice(0, 2) }).success).toBe(false);
  });
  test("rejects a lesson with 6 beats", () => {
    const beats = [0, 1, 2, 3, 4, 5].map((n) => ({ ...goodBeat, id: `lesson-flip-and-multiply-b0${n}` }));
    expect(LessonSchema.safeParse({ ...goodLesson, beats }).success).toBe(false);
  });
  test("rejects a beat id that does not belong to the lesson", () => {
    const beats = [{ ...goodBeat, id: "lesson-other-idea-b01" }, goodLesson.beats[1], goodLesson.beats[2]];
    expect(LessonSchema.safeParse({ ...goodLesson, beats }).success).toBe(false);
  });
  test("rejects an em dash in a beat's onWrong", () => {
    const beats = [{ ...goodBeat, onWrong: "Count again — you are close." }, goodLesson.beats[1], goodLesson.beats[2]];
    expect(LessonSchema.safeParse({ ...goodLesson, beats }).success).toBe(false);
  });
  test("a choice beat's answer index must be within its options", () => {
    const choiceBeat = { ...goodBeat, id: "lesson-flip-and-multiply-b04", options: ["A", "B"], answer: { kind: "choice", index: 5 } };
    expect(LessonSchema.safeParse({ ...goodLesson, beats: [goodLesson.beats[0], goodLesson.beats[1], choiceBeat] }).success).toBe(false);
  });
  test("a choice beat needs options", () => {
    const choiceBeat = { ...goodBeat, id: "lesson-flip-and-multiply-b04", answer: { kind: "choice", index: 0 } };
    expect(LessonSchema.safeParse({ ...goodLesson, beats: [goodLesson.beats[0], goodLesson.beats[1], choiceBeat] }).success).toBe(false);
  });
  test("rejects a rubric answer (not a valid lesson-beat kind)", () => {
    const rubricBeat = { ...goodBeat, answer: { kind: "rubric", mustMention: ["a", "b"] } };
    expect(LessonSchema.safeParse({ ...goodLesson, beats: [rubricBeat, goodLesson.beats[1], goodLesson.beats[2]] }).success).toBe(false);
  });
});

describe("StepSchema: lesson", () => {
  test("accepts a lesson step", () => {
    const step = { kind: "lesson", id: "s1-w06-think-07", title: "Meet the idea", lessonId: "lesson-flip-and-multiply" };
    expect(StepSchema.safeParse(step).success).toBe(true);
  });
  test("rejects a lesson step missing lessonId", () => {
    const step = { kind: "lesson", id: "s1-w06-think-07", title: "Meet the idea" };
    expect(StepSchema.safeParse(step).success).toBe(false);
  });
});

describe("SproutWeekSchema", () => {
  const week = {
    id: "sprout-w01",
    season: 1,
    week: 1,
    theme: "Patterns: what comes next",
    skills: ["sprout.patterns"],
    activities: [1, 2, 3].map((n) => ({
      id: `sprout-w01-a${n}`,
      title: "What comes next",
      skill: "sprout.patterns",
      kind: "tap-next",
      intro: "Look at the row. Something is missing at the end. Tap what comes next.",
      offScreen: "Go find two things that are the same colour and show a grown-up.",
      rounds: [1, 2, 3].map((r) => ({
        id: `sprout-w01-a${n}-r${r}`,
        prompt: "Red, blue, red, blue. What comes next?",
        items: [
          { id: "i1", shape: "circle", color: "red" },
          { id: "i2", shape: "circle", color: "blue" },
        ],
        correct: { kind: "pick", itemIds: ["i1"] },
      })),
    })),
    parentCard: {
      title: "Clap patterns",
      minutes: 15,
      includes: "sing",
      steps: ["Clap a pattern: clap clap pause.", "Ask him to copy it.", "Swap: he makes one, you copy."],
      notice: ["Does he keep the pause?", "Does he invent a pattern with three parts?"],
    },
  };
  test("accepts a sprout week", () => {
    expect(SproutWeekSchema.safeParse(week).success).toBe(true);
  });
  test("rejects two activities", () => {
    expect(SproutWeekSchema.safeParse({ ...week, activities: week.activities.slice(0, 2) }).success).toBe(false);
  });
});
