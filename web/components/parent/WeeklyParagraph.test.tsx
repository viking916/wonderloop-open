import { describe, expect, test } from "vitest";
import type { WeeklySummary } from "@/lib/domain/weeklySummary";
import { weeklySentences } from "./WeeklyParagraph";

function summary(overrides: Partial<WeeklySummary>): WeeklySummary {
  return {
    hasQuestsThisWeek: true,
    quests: [],
    finishedTracks: [],
    unfinishedTracks: ["build", "think", "speak"],
    allDone: false,
    minutesSpentEstimate: 0,
    sittingMinutesThisWeek: 0,
    sittingsThisWeek: 0,
    hardIdeas: [],
    explainItsWaiting: 0,
    logsWithoutComment: 0,
    parentNotes: [],
    isThinWeek: false,
    ...overrides,
  };
}

// The three awkward cases task 2 names explicitly: nothing done, everything done, and a week
// with a lot of first-try misses. Asserted verbatim so a future change to the wording has to be
// a deliberate, reviewed edit, not an accidental drift -- and so the exact text is on record
// for the human read-aloud check the task also asks for (see the task 2 report).
describe("weeklySentences: the three awkward cases", () => {
  test("nothing done this week", () => {
    const s = summary({ unfinishedTracks: ["build", "think", "speak"], isThinWeek: true });
    expect(weeklySentences(s)).toEqual(["Nothing started this week yet."]);
  });

  test("everything done this week", () => {
    const s = summary({
      finishedTracks: ["build", "think", "speak"],
      unfinishedTracks: [],
      allDone: true,
      minutesSpentEstimate: 180,
    });
    expect(weeklySentences(s)).toEqual([
      "Build, Think and Speak finished this week.",
      "About 180 minutes spent this week, estimated from steps completed rather than measured time.",
    ]);
  });

  test("a week with a lot of first-try misses", () => {
    const s = summary({
      finishedTracks: ["build"],
      unfinishedTracks: ["think", "speak"],
      minutesSpentEstimate: 92,
      hardIdeas: [
        { ideaId: "flip-and-multiply", missedProblemIds: ["p1", "p2", "p3"] },
        { ideaId: "count-what-you-cannot-see", missedProblemIds: ["p4", "p5"] },
        { ideaId: "same-slice", missedProblemIds: ["p6"] },
      ],
    });
    expect(weeklySentences(s)).toEqual([
      "Build finished this week. Think and Speak still open.",
      "About 92 minutes spent this week, estimated from steps completed rather than measured time.",
      "Tricky on the first try: Flip and multiply, Count the hidden ones and Same slice.",
    ]);
  });
});

describe("weeklySentences: sittingMinutesThisWeek (Plan 4 task 35)", () => {
  test("real sitting time is its own sentence, distinct from the step-budget estimate", () => {
    const s = summary({
      finishedTracks: ["build"],
      unfinishedTracks: ["think", "speak"],
      minutesSpentEstimate: 92,
      sittingMinutesThisWeek: 41,
      sittingsThisWeek: 3,
    });
    expect(weeklySentences(s)).toEqual([
      "Build finished this week. Think and Speak still open.",
      "About 92 minutes spent this week, estimated from steps completed rather than measured time.",
      "About 41 minutes actually sitting with it this week, across 3 sittings.",
    ]);
  });

  test("a single sitting is worded in the singular", () => {
    const s = summary({ sittingMinutesThisWeek: 8, sittingsThisWeek: 1 });
    expect(weeklySentences(s)).toContain("About 8 minutes actually sitting with it this week, across 1 sitting.");
  });

  test("zero sitting minutes says nothing about sitting time at all", () => {
    const s = summary({ sittingMinutesThisWeek: 0, sittingsThisWeek: 0 });
    expect(weeklySentences(s).join(" ")).not.toMatch(/sitting/);
  });
});

describe("weeklySentences: waiting on the parent and parent notes", () => {
  test("both an explain-it and a log are waiting", () => {
    const s = summary({ explainItsWaiting: 1, logsWithoutComment: 2 });
    expect(weeklySentences(s)).toContain("Waiting on you: 1 explain-it answer waiting for a look and 2 logs with no comment yet.");
  });

  test("a parent note is restated verbatim, not summarized", () => {
    const s = summary({ parentNotes: [{ skillId: "build.chess", note: "Chess club on Tuesday", at: 0 }] });
    expect(weeklySentences(s)).toContain("Also logged this week: Chess club on Tuesday.");
  });

  test("no quest assigned this week", () => {
    const s = summary({ hasQuestsThisWeek: false });
    expect(weeklySentences(s)).toEqual(["No quest is assigned this week."]);
  });
});
