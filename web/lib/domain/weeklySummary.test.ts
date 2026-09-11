import { describe, expect, test } from "vitest";
import type { Quest, Track } from "../content/schema";
import { emptyQuestProgress, type QuestProgress } from "./completion";
import {
  WEEK_WINDOW_MS,
  weeklySummary,
  type WeeklyAttemptInput,
  type WeeklyLogInput,
  type WeeklyParentEntryInput,
  type WeeklyQuestInput,
} from "./weeklySummary";

const NOW = 1_700_000_000_000;

/** A minimal, single-step ("all-steps") quest: done exactly when its one log step is logged.
 * Real content (lib/content/schema.ts's QuestSchema/StepSchema) is a much richer discriminated
 * union, but this module only ever calls completion.ts's questStatus/weekSummary over whatever
 * Quest/QuestProgress it is given, so a fake this simple is a faithful fixture -- it is never
 * zod-validated, only read by pure functions. */
function fakeQuest(track: Track, minutes: number): Quest {
  const id = `fake-${track}`;
  return {
    id,
    season: 1,
    week: 1,
    track,
    title: `${track} quest`,
    summary: "",
    minutes,
    materials: [],
    skills: ["x"],
    completion: "all-steps",
    steps: [{ kind: "log", id: `${id}-log`, variant: "maker" }],
  } as Quest;
}

function doneProgress(quest: Quest): QuestProgress {
  return { ...emptyQuestProgress(), logs: [quest.steps[0]!.id] };
}

function attempt(overrides: Partial<WeeklyAttemptInput>): WeeklyAttemptInput {
  return {
    problemId: "p1",
    ideaIds: ["idea-a"],
    tryNumber: 1,
    correct: false,
    revealed: false,
    approved: false,
    at: NOW,
    ...overrides,
  };
}

describe("weeklySummary: the empty week", () => {
  test("no quests, no records at all: thin, nothing to report", () => {
    const s = weeklySummary({ quests: [], attempts: [], logs: [], parentEntries: [], now: NOW });
    expect(s.hasQuestsThisWeek).toBe(false);
    expect(s.isThinWeek).toBe(true);
    expect(s.allDone).toBe(false);
    expect(s.minutesSpentEstimate).toBe(0);
    expect(s.hardIdeas).toEqual([]);
    expect(s.explainItsWaiting).toBe(0);
    expect(s.logsWithoutComment).toBe(0);
    expect(s.finishedTracks).toEqual([]);
    expect(s.unfinishedTracks).toEqual([]);
  });

  test("quests assigned but untouched: still thin, and every track is unfinished", () => {
    const build = fakeQuest("build", 60);
    const think = fakeQuest("think", 75);
    const speak = fakeQuest("speak", 45);
    const quests: WeeklyQuestInput[] = [
      { track: "build", quest: build, progress: emptyQuestProgress() },
      { track: "think", quest: think, progress: emptyQuestProgress() },
      { track: "speak", quest: speak, progress: emptyQuestProgress() },
    ];
    const s = weeklySummary({ quests, attempts: [], logs: [], parentEntries: [], now: NOW });
    expect(s.hasQuestsThisWeek).toBe(true);
    expect(s.isThinWeek).toBe(true);
    expect(s.finishedTracks).toEqual([]);
    expect(s.unfinishedTracks).toEqual(["build", "think", "speak"]);
    expect(s.minutesSpentEstimate).toBe(0);
  });
});

describe("weeklySummary: the everything-done week", () => {
  test("all three tracks done: allDone, full minutes, not thin", () => {
    const build = fakeQuest("build", 60);
    const think = fakeQuest("think", 75);
    const speak = fakeQuest("speak", 45);
    const quests: WeeklyQuestInput[] = [
      { track: "build", quest: build, progress: doneProgress(build) },
      { track: "think", quest: think, progress: doneProgress(think) },
      { track: "speak", quest: speak, progress: doneProgress(speak) },
    ];
    const s = weeklySummary({ quests, attempts: [], logs: [], parentEntries: [], now: NOW });
    expect(s.allDone).toBe(true);
    expect(s.finishedTracks).toEqual(["build", "think", "speak"]);
    expect(s.unfinishedTracks).toEqual([]);
    expect(s.minutesSpentEstimate).toBe(180);
    expect(s.isThinWeek).toBe(false);
  });

  test("a partial week: one done, one not started -- neither thin nor allDone", () => {
    const build = fakeQuest("build", 60);
    const think = fakeQuest("think", 75);
    const quests: WeeklyQuestInput[] = [
      { track: "build", quest: build, progress: doneProgress(build) },
      { track: "think", quest: think, progress: emptyQuestProgress() },
    ];
    const s = weeklySummary({ quests, attempts: [], logs: [], parentEntries: [], now: NOW });
    expect(s.allDone).toBe(false);
    expect(s.isThinWeek).toBe(false);
    expect(s.finishedTracks).toEqual(["build"]);
    expect(s.unfinishedTracks).toEqual(["think"]);
    expect(s.minutesSpentEstimate).toBe(60);
  });
});

describe("weeklySummary: sittingMinutesThisWeek (Plan 4 task 35 -- real elapsed time, not the estimate)", () => {
  test("no attempts and no logs: zero minutes, zero sittings", () => {
    const s = weeklySummary({ quests: [], attempts: [], logs: [], parentEntries: [], now: NOW });
    expect(s.sittingMinutesThisWeek).toBe(0);
    expect(s.sittingsThisWeek).toBe(0);
  });

  test("a burst of attempts a few minutes apart is one sitting, spanning first to last", () => {
    const attempts: WeeklyAttemptInput[] = [
      attempt({ at: NOW - 20 * 60 * 1000 }),
      attempt({ at: NOW - 15 * 60 * 1000 }),
      attempt({ at: NOW - 10 * 60 * 1000 }),
    ];
    const s = weeklySummary({ quests: [], attempts, logs: [], parentEntries: [], now: NOW });
    expect(s.sittingsThisWeek).toBe(1);
    expect(s.sittingMinutesThisWeek).toBe(10);
  });

  test("two clusters more than the gap apart are two separate sittings", () => {
    const attempts: WeeklyAttemptInput[] = [
      attempt({ at: NOW - 6 * 24 * 60 * 60 * 1000 }),
      attempt({ at: NOW - 6 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000 }),
      attempt({ at: NOW - 60 * 60 * 1000 }),
      attempt({ at: NOW - 55 * 60 * 1000 }),
    ];
    const s = weeklySummary({ quests: [], attempts, logs: [], parentEntries: [], now: NOW });
    expect(s.sittingsThisWeek).toBe(2);
    expect(s.sittingMinutesThisWeek).toBe(10); // 5 minutes each sitting
  });

  test("a single recorded moment still counts as one real minute, not zero", () => {
    const s = weeklySummary({ quests: [], attempts: [attempt({ at: NOW })], logs: [], parentEntries: [], now: NOW });
    expect(s.sittingsThisWeek).toBe(1);
    expect(s.sittingMinutesThisWeek).toBe(1);
  });

  test("logs contribute timestamps too, alongside attempts", () => {
    const s = weeklySummary({
      quests: [],
      attempts: [attempt({ at: NOW - 10 * 60 * 1000 })],
      logs: [{ hasComment: false, at: NOW - 8 * 60 * 1000 }],
      parentEntries: [],
      now: NOW,
    });
    expect(s.sittingsThisWeek).toBe(1);
    expect(s.sittingMinutesThisWeek).toBe(2);
  });

  test("an attempt outside the rolling week window is not counted", () => {
    const s = weeklySummary({
      quests: [],
      attempts: [attempt({ at: NOW - WEEK_WINDOW_MS - 1000 })],
      logs: [],
      parentEntries: [],
      now: NOW,
    });
    expect(s.sittingsThisWeek).toBe(0);
    expect(s.sittingMinutesThisWeek).toBe(0);
  });
});

describe("weeklySummary: many first-try misses, grouped by idea", () => {
  test("the worst idea (most distinct missed problems) sorts first", () => {
    const attempts: WeeklyAttemptInput[] = [
      attempt({ problemId: "p1", ideaIds: ["flip-and-multiply"], at: NOW - 5000 }),
      attempt({ problemId: "p2", ideaIds: ["flip-and-multiply"], at: NOW - 4000 }),
      attempt({ problemId: "p3", ideaIds: ["count-what-you-cannot-see"], at: NOW - 3000 }),
    ];
    const s = weeklySummary({ quests: [], attempts, logs: [], parentEntries: [], now: NOW });
    expect(s.hardIdeas).toEqual([
      { ideaId: "flip-and-multiply", missedProblemIds: ["p1", "p2"] },
      { ideaId: "count-what-you-cannot-see", missedProblemIds: ["p3"] },
    ]);
  });

  test("a correct first try never counts as a miss", () => {
    const attempts: WeeklyAttemptInput[] = [attempt({ correct: true })];
    const s = weeklySummary({ quests: [], attempts, logs: [], parentEntries: [], now: NOW });
    expect(s.hardIdeas).toEqual([]);
  });

  test("a wrong SECOND try is not a first-try miss", () => {
    const attempts: WeeklyAttemptInput[] = [attempt({ tryNumber: 2, correct: false })];
    const s = weeklySummary({ quests: [], attempts, logs: [], parentEntries: [], now: NOW });
    expect(s.hardIdeas).toEqual([]);
  });

  test("the same problem missed on two different attempt cycles this week counts once", () => {
    const attempts: WeeklyAttemptInput[] = [
      attempt({ problemId: "p1", at: NOW - 5000 }),
      attempt({ problemId: "p1", at: NOW - 1000 }), // retried, wrong again
    ];
    const s = weeklySummary({ quests: [], attempts, logs: [], parentEntries: [], now: NOW });
    expect(s.hardIdeas).toEqual([{ ideaId: "idea-a", missedProblemIds: ["p1"] }]);
  });

  test("a tie in count breaks toward whichever idea was missed first", () => {
    const attempts: WeeklyAttemptInput[] = [
      attempt({ problemId: "p1", ideaIds: ["idea-b"], at: NOW - 1000 }),
      attempt({ problemId: "p2", ideaIds: ["idea-a"], at: NOW - 9000 }),
    ];
    const s = weeklySummary({ quests: [], attempts, logs: [], parentEntries: [], now: NOW });
    expect(s.hardIdeas.map((h) => h.ideaId)).toEqual(["idea-a", "idea-b"]);
  });
});

describe("weeklySummary: waiting on the parent", () => {
  test("a revealed (explain-it) attempt not yet approved is waiting", () => {
    const attempts: WeeklyAttemptInput[] = [attempt({ revealed: true, approved: false })];
    const s = weeklySummary({ quests: [], attempts, logs: [], parentEntries: [], now: NOW });
    expect(s.explainItsWaiting).toBe(1);
  });

  test("an approved revealed attempt is not waiting", () => {
    const attempts: WeeklyAttemptInput[] = [attempt({ revealed: true, approved: true })];
    const s = weeklySummary({ quests: [], attempts, logs: [], parentEntries: [], now: NOW });
    expect(s.explainItsWaiting).toBe(0);
  });

  test("only the LATEST revealed attempt on a problem decides whether it is waiting", () => {
    const attempts: WeeklyAttemptInput[] = [
      attempt({ problemId: "p1", revealed: true, approved: true, at: NOW - 5000 }),
      attempt({ problemId: "p1", revealed: true, approved: false, at: NOW - 1000 }), // redone since
    ];
    const s = weeklySummary({ quests: [], attempts, logs: [], parentEntries: [], now: NOW });
    expect(s.explainItsWaiting).toBe(1);
  });

  test("a log with no comment is waiting; one with a comment is not", () => {
    const logs: WeeklyLogInput[] = [
      { hasComment: false, at: NOW - 1000 },
      { hasComment: true, at: NOW - 2000 },
    ];
    const s = weeklySummary({ quests: [], attempts: [], logs, parentEntries: [], now: NOW });
    expect(s.logsWithoutComment).toBe(1);
  });
});

describe("weeklySummary: the rolling 7-day window", () => {
  test("a record exactly at now is in the window", () => {
    const attempts: WeeklyAttemptInput[] = [attempt({ at: NOW })];
    const s = weeklySummary({ quests: [], attempts, logs: [], parentEntries: [], now: NOW });
    expect(s.hardIdeas).toHaveLength(1);
  });

  test("a record older than the window is excluded", () => {
    const attempts: WeeklyAttemptInput[] = [attempt({ at: NOW - WEEK_WINDOW_MS - 1 })];
    const s = weeklySummary({ quests: [], attempts, logs: [], parentEntries: [], now: NOW });
    expect(s.hardIdeas).toEqual([]);
    expect(s.isThinWeek).toBe(true);
  });

  test("a record from the future (clock skew) is excluded, not counted as this week", () => {
    const attempts: WeeklyAttemptInput[] = [attempt({ at: NOW + 1000 })];
    const s = weeklySummary({ quests: [], attempts, logs: [], parentEntries: [], now: NOW });
    expect(s.hardIdeas).toEqual([]);
  });

  test("parent entries outside the window are excluded from parentNotes and do not un-thin the week", () => {
    const parentEntries: WeeklyParentEntryInput[] = [{ skillId: "build.chess", note: "Chess club", at: NOW - WEEK_WINDOW_MS - 1 }];
    const s = weeklySummary({ quests: [], attempts: [], logs: [], parentEntries, now: NOW });
    expect(s.parentNotes).toEqual([]);
    expect(s.isThinWeek).toBe(true);
  });

  test("a parent entry inside the window is kept verbatim and un-thins the week", () => {
    const parentEntries: WeeklyParentEntryInput[] = [{ skillId: "build.chess", note: "Chess club on Tuesday", at: NOW - 1000 }];
    const s = weeklySummary({ quests: [], attempts: [], logs: [], parentEntries, now: NOW });
    expect(s.parentNotes).toEqual(parentEntries);
    expect(s.isThinWeek).toBe(false);
  });
});
