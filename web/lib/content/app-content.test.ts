import { describe, expect, test } from "vitest";
import { getContent, getLesson, getLessonForIdea, getProblem, getQuest, getSkill } from "./app-content";
import { EXPECT_WEEKS } from "./load";
import type { Step } from "./schema";
import { emptyQuestProgress, questStatus, savableArtifactKinds, type QuestProgress } from "../domain/completion";

describe("app-content", () => {
  /**
   * Pins the bundle to the content tree rather than to a number a landing has to remember to bump.
   * getContent reads a generated file, and `npx vitest run` skips the pretest hook that rebuilds
   * it, so a landing that runs vitest directly can test a stale bundle and pass: season 3 landed
   * with the validator seeing 28 sprout weeks while the bundle still held 20, which quietly took
   * a whole season out of every content-wide guarantee below.
   */
  test("the generated bundle covers exactly the weeks the loader expects", () => {
    const content = getContent();
    const expectedWeeks = Object.values(EXPECT_WEEKS).reduce((a, b) => a + b, 0);
    expect(content.sprout.length).toBe(expectedWeeks);
    // Three quests every week, plus Play and Make quests wherever they are authored.
    const playWeeks = content.quests.filter((q) => q.track === "play").length;
    const makeWeeks = content.quests.filter((q) => q.track === "make").length;
    expect(content.quests.filter((q) => q.track !== "play" && q.track !== "make").length).toBe(expectedWeeks * 3);
    expect(playWeeks % 12).toBe(0);
    expect(playWeeks).toBeGreaterThan(0);
    expect(makeWeeks % 12).toBe(0);
    const seasons = [...new Set(content.quests.map((q) => q.season))].sort();
    expect(seasons).toEqual(Object.keys(EXPECT_WEEKS).map(Number).sort());
  });

  test("getContent is memoised: two calls return the same object", () => {
    expect(getContent()).toBe(getContent());
  });

  test("getQuest returns a quest with its steps", () => {
    const quest = getQuest("s1-w07-think");
    expect(quest?.steps.length).toBe(6);
  });

  test("getProblem finds a problem by id, with its quest", () => {
    const found = getProblem("s1-w07-think-03-p04");
    expect(found?.quest.id).toBe("s1-w07-think");
    expect(found?.problem.answer.kind).toBe("number");
    if (found?.problem.answer.kind === "number") {
      expect(found.problem.answer.value).toBe("32.40");
    }
  });

  test("getSkill returns a known skill", () => {
    expect(getSkill("think.money")).toBeTruthy();
  });

  test("getLesson resolves the authored flip-and-multiply lesson", () => {
    const lesson = getLesson("lesson-flip-and-multiply");
    expect(lesson?.beats.length).toBeGreaterThanOrEqual(3);
    expect(lesson?.beats.length).toBeLessThanOrEqual(5);
  });

  test("getLessonForIdea finds the same lesson by ideaId", () => {
    expect(getLessonForIdea("flip-and-multiply")?.id).toBe("lesson-flip-and-multiply");
  });

  test("getLessonForIdea returns undefined for an idea with no authored lesson", () => {
    expect(getLessonForIdea("guess-and-round")).toBeUndefined();
  });

  /**
   * Pins the guarantee rather than the rule that enforces it. During the season 2 week 9 to 12
   * authoring, weeks 10 and 11 were written without the philosophy question the design gives them,
   * and the validator's debate rule was narrowed to weeks 5 to 8 so the content would pass. The
   * rule was right and the content was wrong. This test fails whichever way that happens again: a
   * missing debate, or a rule quietly relaxed to permit one.
   */
  test("every non-showcase speak quest from week 5 carries its debate", () => {
    const due = getContent().quests.filter((q) => q.track === "speak" && q.week >= 5 && !q.showcase);
    // Guards against the test passing because it examined nothing.
    expect(due.length).toBeGreaterThanOrEqual(9);
    const missing = due.filter((q) => !q.steps.some((s) => s.kind === "debate")).map((q) => q.id);
    expect(missing).toEqual([]);
  });

  test("every debate step names a motion that exists in the registry", () => {
    const content = getContent();
    const motionIds = new Set(content.motions.map((m) => m.id));
    const dangling = content.quests
      .flatMap((q) => q.steps.map((s) => ({ quest: q.id, step: s })))
      .filter(({ step }) => step.kind === "debate")
      .filter(({ step }) => !motionIds.has((step as { motionId: string }).motionId))
      .map(({ quest, step }) => `${quest}: ${(step as { motionId: string }).motionId}`);
    expect(dangling).toEqual([]);
  });
});

/**
 * The invariant nothing held before a child's first Monday: that a quest the app has
 * actually landed can be finished in the app.
 *
 * It could not. 42 of the 48 Speak quests -- every one whose artifact step accepts only a
 * recording, week 1 of season 1 first among them -- had no control that could put anything on
 * record, so isStepComplete could never return true for that step and questStatus could never
 * reach "done". Every gate was green throughout: verify:ui checks how screens render, the
 * domain unit tests check completion against progress handed to them ready-made, and content
 * validation checks the content. None of them ever asked whether the progress those unit tests
 * assume is progress a child could actually produce.
 *
 * This walks every landed quest, applies for each step the progress a child can genuinely reach
 * through the UI for that step kind, and holds the quest to reaching "done". Where a step kind's
 * reachable progress depends on more than the kind -- artifact steps, whose controls are gated
 * per accepted kind -- it asks the app's own function (savableArtifactKinds, which
 * components/quest/ArtifactStep.tsx renders from) rather than restating the rule here, so the
 * test cannot pass by believing something about the UI that stopped being true.
 */
type StepReach = { progress: QuestProgress; unreachable?: string };

function reachStep(step: Step, progress: QuestProgress): StepReach {
  switch (step.kind) {
    // "Got it" / "Done" ticks.
    case "instruction":
    case "science":
    case "typing":
      return { progress: { ...progress, ticks: [...progress.ticks, { stepId: step.id, done: true }] } };
    // Every checklist item ticked (TaskStep).
    case "task":
      return { progress: { ...progress, checklist: { ...progress.checklist, [step.id]: step.checklist.map(() => true) } } };
    // Every problem answered (ProblemPlayer; any outcome other than "unanswered" counts, and a
    // correct answer is the one he reaches by doing the work).
    case "warmup":
    case "problem-set":
      return {
        progress: {
          ...progress,
          problemOutcomes: {
            ...progress.problemOutcomes,
            ...Object.fromEntries(step.problems.map((p) => [p.id, "correct" as const])),
          },
        },
      };
    case "puzzle-of-week":
      return {
        progress: { ...progress, problemOutcomes: { ...progress.problemOutcomes, [step.problem.id]: "correct" } },
      };
    // Typed into the textarea and saved -- offered in both "written" and "voice" mode
    // (components/quest/ExplainStep.tsx).
    case "explain":
      return { progress: { ...progress, explains: { ...progress.explains, [step.id]: { text: "what he wrote" } } } };
    case "artifact": {
      const kinds = savableArtifactKinds(step);
      if (kinds.length === 0) {
        return { progress, unreachable: `accepts ${step.accepts.join(", ")}, and the app offers no way to record any of them` };
      }
      return { progress: { ...progress, artifacts: { ...progress.artifacts, [step.id]: [kinds[0]] } } };
    }
    case "log":
      return { progress: { ...progress, logs: [...progress.logs, step.id] } };
    // The written three points (components/quest/DebateStepPlaceholder.tsx); the voice opponent
    // is not built, and completion never waits on it.
    case "debate":
      return { progress: { ...progress, debates: [...progress.debates, step.id] } };
    case "lesson":
      return { progress: { ...progress, lessons: [...(progress.lessons ?? []), step.id] } };
    case "data": {
      const rows = Array.from({ length: step.minRows }, (_, i) => ({ cells: [`run ${i + 1}`, ...step.columns.slice(1).map(() => String(i + 1))] }));
      return { progress: { ...progress, data: { ...(progress.data ?? {}), [step.id]: { rows, answer: "it went up", at: 1 } } } };
    }
  }
}

describe("every landed quest is completable", () => {
  test("each quest reaches done from progress a child can actually produce in the app", () => {
    const quests = getContent().quests;
    // Guards against passing because it examined nothing (a stale or empty bundle).
    expect(quests.length).toBeGreaterThanOrEqual(3);

    const unreachableSteps: string[] = [];
    const neverDone: string[] = [];
    let artifactStepsWalked = 0;

    for (const quest of quests) {
      let progress = emptyQuestProgress();
      for (const step of quest.steps) {
        if (step.kind === "artifact") artifactStepsWalked++;
        const reach = reachStep(step, progress);
        progress = reach.progress;
        if (reach.unreachable) unreachableSteps.push(`${quest.id} step ${step.id} (${step.kind}): ${reach.unreachable}`);
      }
      const status = questStatus(quest, progress);
      if (status !== "done") neverDone.push(`${quest.id} (completion "${quest.completion}") reached "${status}"`);
    }

    // The artifact step is where this class of defect lives; a run that walked none of them
    // proves nothing.
    expect(artifactStepsWalked).toBeGreaterThanOrEqual(quests.length / 2);
    expect(unreachableSteps).toEqual([]);
    expect(neverDone).toEqual([]);
  });
});
