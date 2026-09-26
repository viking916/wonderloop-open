import { describe, expect, test } from "vitest";
import { emptyQuestProgress, type QuestProgress } from "./completion";
import { findSprintMonster, sprintOfWeek } from "./monster";
import { getQuest } from "../content/app-content";

// The monster's step position moves whenever a lesson step is inserted before it, so the
// expected link is read from the content rather than hard-coded.
function monsterStepIndex(questId: string): number {
  const steps = getQuest(questId)?.steps ?? [];
  return steps.findIndex((s) => s.kind === "problem-set" && s.lane === "monster");
}

// Season 1 authors its monster in weeks 4, 8 and 11 (one per sprint: 1-4, 5-8, 9-12).
const SEASON = 1;
const SPRINT1_QUEST = "s1-w04-think";
const SPRINT1_PROBLEM = "s1-w04-think-03-p01";
const SPRINT2_QUEST = "s1-w08-think";
const SPRINT2_PROBLEM = "s1-w08-think-03-p01";

function solved(questId: string, problemId: string): Record<string, QuestProgress> {
  return { [questId]: { ...emptyQuestProgress(), problemOutcomes: { [problemId]: "revealed" } } };
}

describe("sprintOfWeek", () => {
  test("groups weeks into 1-4, 5-8, 9-12", () => {
    expect(sprintOfWeek(1)).toBe(1);
    expect(sprintOfWeek(4)).toBe(1);
    expect(sprintOfWeek(5)).toBe(2);
    expect(sprintOfWeek(8)).toBe(2);
    expect(sprintOfWeek(9)).toBe(3);
    expect(sprintOfWeek(12)).toBe(3);
  });
});

describe("findSprintMonster: weeks 1, 3, 4 all show sprint 1's monster", () => {
  for (const week of [1, 3, 4]) {
    test(`week ${week}`, () => {
      const card = findSprintMonster(SEASON, week, {});
      expect(card?.weekLabel).toBe("Week 4");
      expect(card?.href).toBe(`/explorer/quest/${SPRINT1_QUEST}?step=${monsterStepIndex(SPRINT1_QUEST)}`);
      expect(card?.status).toBe("open");
    });
  }
});

describe("findSprintMonster: solved", () => {
  test("week 4's own monster reads solved once its problem has an outcome", () => {
    const card = findSprintMonster(SEASON, 4, solved(SPRINT1_QUEST, SPRINT1_PROBLEM));
    expect(card?.status).toBe("solved");
    expect(card?.weekLabel).toBe("Week 4");
  });

  test("a solved sprint-1 monster does not leak into week 5's still-open carry-over: week 5 shows sprint 2's own monster instead", () => {
    const card = findSprintMonster(SEASON, 5, solved(SPRINT1_QUEST, SPRINT1_PROBLEM));
    expect(card?.weekLabel).toBe("Week 8");
    expect(card?.status).toBe("open");
  });
});

describe("findSprintMonster: still-open carry-over", () => {
  test("week 5, sprint 1's monster left unanswered: carries week 4's monster over as still-open", () => {
    const card = findSprintMonster(SEASON, 5, {});
    expect(card?.weekLabel).toBe("Week 4");
    expect(card?.status).toBe("still-open");
  });

  test("the carry-over holds for the rest of sprint 2 (week 6, 7, 8) while still unsolved", () => {
    for (const week of [6, 7, 8]) {
      const card = findSprintMonster(SEASON, week, {});
      expect(card?.weekLabel).toBe("Week 4");
      expect(card?.status).toBe("still-open");
    }
  });

  test("solving week 4's monster mid-sprint-2 switches the card to sprint 2's own monster", () => {
    const card = findSprintMonster(SEASON, 6, solved(SPRINT1_QUEST, SPRINT1_PROBLEM));
    expect(card?.weekLabel).toBe("Week 8");
    expect(card?.status).toBe("open");
  });

  test("week 9 drops the sprint-1 carry-over even if it is still unsolved: only sprint 2's monster is checked", () => {
    // Never solved sprint 1's or sprint 2's monster; by week 9 only sprint 3 (week 11) and its
    // immediate predecessor (sprint 2, week 8) are ever consulted, so sprint 1's monster is gone
    // for good from the card, matching "until solved or the next sprint's monster arrives".
    const card = findSprintMonster(SEASON, 9, {});
    expect(card?.weekLabel).toBe("Week 8");
    expect(card?.status).toBe("still-open");
  });

  test("both this sprint's and the carried one solved: no still-open card, current sprint's own monster shows", () => {
    const progress = {
      ...solved(SPRINT1_QUEST, SPRINT1_PROBLEM),
      ...solved(SPRINT2_QUEST, SPRINT2_PROBLEM),
    };
    const card = findSprintMonster(SEASON, 6, progress);
    expect(card?.weekLabel).toBe("Week 8");
    expect(card?.status).toBe("solved");
  });
});
