import { describe, expect, test } from "vitest";
import { getContent } from "../content/app-content";
import type { Quest } from "../content/schema";
import { emptyQuestProgress, type QuestProgress } from "./completion";
import { trackCardModel } from "./trackCard";

const content = getContent();

function quest(id: string): Quest {
  const q = content.quests.find((x) => x.id === id);
  if (!q) throw new Error(`quest ${id} not in content`);
  return q;
}

function allProblemIds(q: Quest): string[] {
  const ids: string[] = [];
  for (const step of q.steps) {
    if (step.kind === "warmup" || step.kind === "problem-set") ids.push(...step.problems.map((p) => p.id));
    if (step.kind === "puzzle-of-week") ids.push(step.problem.id);
  }
  return ids;
}

const buildQuest = quest("s1-w01-build");
const thinkQuest = quest("s1-w01-think");
const speakQuest = quest("s1-w01-speak");

describe("trackCardModel: not started", () => {
  test("todo status, 0 progress, Start", () => {
    const model = trackCardModel(speakQuest, emptyQuestProgress());
    expect(model.status).toBe("todo");
    expect(model.progress).toBe(0);
    expect(model.ctaLabel).toBe("Start");
    expect(model.meta).toBe("Not started");
  });
});

describe("trackCardModel: done", () => {
  test("Build (artifact-and-log): done status, 100 progress, portfolio cta", () => {
    const artifactStep = buildQuest.steps.find((s) => s.kind === "artifact")!;
    const logStep = buildQuest.steps.find((s) => s.kind === "log")!;
    const progress: QuestProgress = {
      ...emptyQuestProgress(),
      artifacts: { [artifactStep.id]: ["photo"] },
      logs: [logStep.id],
    };
    const model = trackCardModel(buildQuest, progress);
    expect(model.status).toBe("done");
    expect(model.progress).toBe(100);
    expect(model.ctaLabel).toBe("See it in the portfolio");
    expect(model.meta).toBe("Artifact and Maker's Log in the portfolio");
  });
});

describe("trackCardModel: in progress, seeded scenario", () => {
  // Mirrors scripts/seed-emulators.ts's week 1 Think seed exactly: the first 12 of 23 problems
  // (in document order: 8 warmup + 1 puzzle-of-week + 3 of the first problem-set) all marked
  // correct, nothing past that touched. Resume must land on the first problem-set step's 4th
  // problem (0-indexed 3), matching this task's required "Resume at problem 4" label.
  test("resume label and meta match the seeded half-answered state", () => {
    const ids = allProblemIds(thinkQuest);
    const answered = ids.slice(0, 12);
    const progress: QuestProgress = {
      ...emptyQuestProgress(),
      problemOutcomes: Object.fromEntries(answered.map((id) => [id, "correct" as const])),
    };
    const model = trackCardModel(thinkQuest, progress);
    expect(model.status).toBe("current");
    expect(model.ctaLabel).toBe("Resume at problem 4");
    expect(model.meta).toMatch(/^Problem 4 of \d+ · about \d+ min left$/);
    expect(model.progress).toBeGreaterThan(0);
    expect(model.progress).toBeLessThan(100);
  });
});

describe("trackCardModel: parked", () => {
  test("prefixes the meta with Paused, keeps the same resume cta", () => {
    const progress: QuestProgress = { ...emptyQuestProgress(), parked: true, ticks: [] };
    // Nudge in-progress via one answered warmup problem so status is parked, not not_started.
    const warmup = thinkQuest.steps.find((s) => s.kind === "warmup")!;
    progress.problemOutcomes = { [warmup.problems[0].id]: "correct" };
    const model = trackCardModel(thinkQuest, progress);
    expect(model.status).toBe("current");
    expect(model.meta.startsWith("Paused. ")).toBe(true);
  });
});
