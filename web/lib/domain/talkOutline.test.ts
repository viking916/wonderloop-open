import { describe, expect, test } from "vitest";
import { sprintRangeForShowcaseWeek, talkOutline, type MakerLogInput } from "./talkOutline";

const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function log(overrides: Partial<MakerLogInput> & { week: number }): MakerLogInput {
  return {
    questTitle: `Week ${overrides.week} build`,
    answers: ["a badge", "cut, glue, wire it up", "the wire fell off", "taped it down", "measure twice, and I used loops"],
    at: NOW,
    ...overrides,
  };
}

describe("sprintRangeForShowcaseWeek", () => {
  test("each Showcase week closes its own four-week sprint", () => {
    expect(sprintRangeForShowcaseWeek(4)).toEqual([1, 4]);
    expect(sprintRangeForShowcaseWeek(8)).toEqual([5, 8]);
    expect(sprintRangeForShowcaseWeek(12)).toEqual([9, 12]);
  });
});

describe("talkOutline: the empty sprint", () => {
  test("no logs at all: a nudge, not a blank card", () => {
    const outline = talkOutline({ logs: [], showcaseWeek: 4, now: NOW });
    expect(outline.hasLogs).toBe(false);
    if (outline.hasLogs) throw new Error("unreachable");
    expect(outline.sprintStartWeek).toBe(1);
    expect(outline.sprintEndWeek).toBe(4);
    expect(outline.guidance.length).toBeGreaterThan(0);
    // A nudge tells him what to do, not what he failed to do.
    expect(outline.guidance.toLowerCase()).not.toMatch(/should have|failed|forgot|didn't|never/);
  });

  test("logs exist, but none fall in this sprint's four weeks", () => {
    const outline = talkOutline({ logs: [log({ week: 5 }), log({ week: 9 })], showcaseWeek: 4, now: NOW });
    expect(outline.hasLogs).toBe(false);
  });
});

describe("talkOutline: one project", () => {
  const single = [
    log({
      week: 4,
      questTitle: "Showcase: the gadget demo",
      answers: [
        "A name badge that lights up",
        "First I cut the shape, then I wired the LED, then I coded the blink",
        "The LED would not light up at all",
        "I checked the wiring and found the battery was in backwards",
        "Next time I would test the battery first, and I used the debugging idea",
      ],
    }),
  ];

  test("produces exactly five beats, problem and fix leading", () => {
    const outline = talkOutline({ logs: single, showcaseWeek: 4, now: NOW });
    expect(outline.hasLogs).toBe(true);
    if (!outline.hasLogs) throw new Error("unreachable");
    expect(outline.beats.map((b) => b.id)).toEqual(["problem", "fix", "made", "steps", "reflection"]);
    expect(outline.anchorWeek).toBe(4);
    expect(outline.anchorQuestTitle).toBe("Showcase: the gadget demo");
  });

  test("every beat quotes his own words verbatim, never rewritten", () => {
    const outline = talkOutline({ logs: single, showcaseWeek: 4, now: NOW });
    if (!outline.hasLogs) throw new Error("unreachable");
    const problem = outline.beats.find((b) => b.id === "problem")!;
    expect(problem.quotes).toEqual([{ week: 4, questTitle: "Showcase: the gadget demo", words: "The LED would not light up at all" }]);
    const fix = outline.beats.find((b) => b.id === "fix")!;
    expect(fix.quotes[0]!.words).toBe("I checked the wiring and found the battery was in backwards");
  });

  test("cues are prompts to speak from, not a script", () => {
    const outline = talkOutline({ logs: single, showcaseWeek: 4, now: NOW });
    if (!outline.hasLogs) throw new Error("unreachable");
    for (const beat of outline.beats) {
      expect(beat.cue.length).toBeGreaterThan(0);
      expect(beat.cue).not.toBe(beat.quotes[0]?.words);
    }
  });
});

describe("talkOutline: several projects in one sprint", () => {
  const short = log({
    week: 1,
    questTitle: "Name badge",
    answers: ["A name badge", "Cut, glue, wire", "It broke", "Fixed it", "Would go slower, used loops"],
  });
  const rich = log({
    week: 3,
    questTitle: "Breadboard week one",
    answers: [
      "An LED and button circuit",
      "I read the diagram, placed the LED, then wired the button in",
      "The LED stayed dark even though the circuit looked right on the diagram",
      "I traced every wire one at a time and found the button was in the wrong row of the breadboard",
      "Next time I would check the row numbers first, and I used the debugging idea",
    ],
  });
  const medium = log({
    week: 4,
    questTitle: "Showcase: the gadget demo",
    answers: ["A blinking badge", "Wired it, coded it", "The battery died", "Swapped batteries", "Would bring spares, used the loop idea"],
  });

  test("the anchor is the project with the longest problem-and-fix story", () => {
    const outline = talkOutline({ logs: [short, rich, medium], showcaseWeek: 4, now: NOW });
    if (!outline.hasLogs) throw new Error("unreachable");
    expect(outline.anchorWeek).toBe(3);
    expect(outline.anchorQuestTitle).toBe("Breadboard week one");
  });

  test("the made beat names every project this sprint, oldest first, not just the anchor", () => {
    const outline = talkOutline({ logs: [medium, short, rich], showcaseWeek: 4, now: NOW });
    if (!outline.hasLogs) throw new Error("unreachable");
    const made = outline.beats.find((b) => b.id === "made")!;
    expect(made.quotes.map((q) => q.week)).toEqual([1, 3, 4]);
    expect(made.quotes.map((q) => q.words)).toEqual(["A name badge", "An LED and button circuit", "A blinking badge"]);
  });

  test("problem, fix, steps and reflection all come from the anchor project alone", () => {
    const outline = talkOutline({ logs: [short, rich, medium], showcaseWeek: 4, now: NOW });
    if (!outline.hasLogs) throw new Error("unreachable");
    for (const id of ["problem", "fix", "steps", "reflection"] as const) {
      const beat = outline.beats.find((b) => b.id === id)!;
      expect(beat.quotes).toHaveLength(1);
      expect(beat.quotes[0]!.week).toBe(3);
    }
  });

  test("a tie in story length is broken by recency to now, then by the later week", () => {
    const tiedA = log({
      week: 1,
      questTitle: "A",
      answers: ["made a", "steps a", "went wrong same length", "fixed it same length", "reflect a"],
      at: NOW - 10 * DAY_MS,
    });
    const tiedB = log({
      week: 2,
      questTitle: "B",
      answers: ["made b", "steps b", "went wrong same length", "fixed it same length", "reflect b"],
      at: NOW - 1 * DAY_MS,
    });
    const outline = talkOutline({ logs: [tiedA, tiedB], showcaseWeek: 4, now: NOW });
    if (!outline.hasLogs) throw new Error("unreachable");
    expect(outline.anchorWeek).toBe(2);
  });

  test("only logs inside the four-week sprint are considered", () => {
    const outsideSprint = log({ week: 5, questTitle: "Next sprint's build", answers: ["x", "x", "a very very very long problem story here", "a very very very long fix story here", "x"] });
    const outline = talkOutline({ logs: [short, rich, medium, outsideSprint], showcaseWeek: 4, now: NOW });
    if (!outline.hasLogs) throw new Error("unreachable");
    expect(outline.beats.find((b) => b.id === "made")!.quotes.map((q) => q.week)).toEqual([1, 3, 4]);
    expect(outline.anchorWeek).not.toBe(5);
  });
});

describe("talkOutline: sprint 2 and sprint 3 ranges", () => {
  test("week 8's sprint is weeks 5 to 8", () => {
    const outline = talkOutline({ logs: [log({ week: 6 })], showcaseWeek: 8, now: NOW });
    expect(outline.hasLogs).toBe(true);
    if (!outline.hasLogs) throw new Error("unreachable");
    expect(outline.sprintStartWeek).toBe(5);
    expect(outline.sprintEndWeek).toBe(8);
  });

  test("week 12's sprint is weeks 9 to 12", () => {
    const outline = talkOutline({ logs: [log({ week: 11 })], showcaseWeek: 12, now: NOW });
    expect(outline.hasLogs).toBe(true);
    if (!outline.hasLogs) throw new Error("unreachable");
    expect(outline.sprintStartWeek).toBe(9);
    expect(outline.sprintEndWeek).toBe(12);
  });
});
