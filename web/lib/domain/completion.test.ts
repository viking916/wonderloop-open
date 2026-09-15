import { describe, expect, test } from "vitest";
import { getContent } from "../content/app-content";
import type { Quest } from "../content/schema";
import {
  emptyQuestProgress,
  isStepComplete,
  questStatus,
  resumePosition,
  weekSummary,
  type QuestProgress,
} from "./completion";

const content = getContent();

function quest(id: string): Quest {
  const q = content.quests.find((x) => x.id === id);
  if (!q) throw new Error(`quest ${id} not in content`);
  return q;
}

type ProblemOutcome = QuestProgress["problemOutcomes"][string];

function outcomesFor(ids: string[], outcome: ProblemOutcome): Record<string, ProblemOutcome> {
  return Object.fromEntries(ids.map((id) => [id, outcome]));
}

// Week 1: build (artifact-and-log), think (all-steps, ends in two explain steps), speak
// (recording-and-log). Week 4: a Showcase week, where think has no explain steps.
const buildQuest = quest("s1-w01-build");
const thinkQuest = quest("s1-w01-think");
const speakQuest = quest("s1-w01-speak");
const showcaseThinkQuest = quest("s1-w04-think");
const showcaseSpeakQuest = quest("s1-w04-speak");
const showcaseBuildQuest = quest("s1-w04-build");

function allProblemIds(q: Quest): string[] {
  const ids: string[] = [];
  for (const step of q.steps) {
    if (step.kind === "warmup" || step.kind === "problem-set") ids.push(...step.problems.map((p) => p.id));
    if (step.kind === "puzzle-of-week") ids.push(step.problem.id);
  }
  return ids;
}

describe("isStepComplete: instruction, science, typing, task (ticked)", () => {
  test("incomplete until ticked done", () => {
    const step = buildQuest.steps.find((s) => s.kind === "instruction")!;
    const progress = emptyQuestProgress();
    expect(isStepComplete(step, progress)).toBe(false);
  });

  test("complete once ticked done", () => {
    const step = buildQuest.steps.find((s) => s.kind === "instruction")!;
    const progress: QuestProgress = { ...emptyQuestProgress(), ticks: [{ stepId: step.id, done: true }] };
    expect(isStepComplete(step, progress)).toBe(true);
  });

  test("a tick recorded as done: false does not complete the step", () => {
    const step = buildQuest.steps.find((s) => s.kind === "task")!;
    const progress: QuestProgress = { ...emptyQuestProgress(), ticks: [{ stepId: step.id, done: false }] };
    expect(isStepComplete(step, progress)).toBe(false);
  });
});

describe("isStepComplete: task with a checklist", () => {
  // buildQuest's task step (s1-w01-build-03) has a 4-item checklist in real content.
  const taskStep = buildQuest.steps.find((s) => s.kind === "task")!;
  if (taskStep.kind !== "task") throw new Error("expected a task step");
  const checklistLength = taskStep.checklist.length;

  test("two of four items ticked: not complete", () => {
    const items = taskStep.checklist.map((_, i) => i < 2);
    const progress: QuestProgress = { ...emptyQuestProgress(), checklist: { [taskStep.id]: items } };
    expect(isStepComplete(taskStep, progress)).toBe(false);
  });

  test("every item ticked: complete", () => {
    const items = taskStep.checklist.map(() => true);
    const progress: QuestProgress = { ...emptyQuestProgress(), checklist: { [taskStep.id]: items } };
    expect(isStepComplete(taskStep, progress)).toBe(true);
    expect(items).toHaveLength(checklistLength);
  });

  test("a plain done:true tick still completes the step when checklist has no entry for it (fallback)", () => {
    const progress: QuestProgress = { ...emptyQuestProgress(), ticks: [{ stepId: taskStep.id, done: true }] };
    expect(isStepComplete(taskStep, progress)).toBe(true);
  });

  test("a plain done:false tick, with no checklist entry, does not complete the step (fallback)", () => {
    const progress: QuestProgress = { ...emptyQuestProgress(), ticks: [{ stepId: taskStep.id, done: false }] };
    expect(isStepComplete(taskStep, progress)).toBe(false);
  });

  test("a checklist entry, once present, overrides an unrelated done:true tick", () => {
    const items = taskStep.checklist.map(() => false); // nothing actually ticked
    const progress: QuestProgress = {
      ...emptyQuestProgress(),
      ticks: [{ stepId: taskStep.id, done: true }], // stale/legacy plain tick
      checklist: { [taskStep.id]: items },
    };
    expect(isStepComplete(taskStep, progress)).toBe(false);
  });
});

describe("isStepComplete: problem-set and warmup", () => {
  test("incomplete while any problem is unanswered", () => {
    const step = thinkQuest.steps.find((s) => s.kind === "problem-set" && s.lane === "skills")!;
    const problems = (step as Extract<typeof step, { kind: "problem-set" }>).problems;
    const progress: QuestProgress = {
      ...emptyQuestProgress(),
      problemOutcomes: outcomesFor(problems.slice(0, -1).map((p) => p.id), "correct"),
    };
    expect(isStepComplete(step, progress)).toBe(false);
  });

  test("complete when every problem has a non-unanswered outcome, including exhausted and revealed", () => {
    const step = thinkQuest.steps.find((s) => s.kind === "problem-set" && s.lane === "skills")!;
    const problems = (step as Extract<typeof step, { kind: "problem-set" }>).problems;
    const outcomes = ["correct", "exhausted", "revealed"] as const;
    const progress: QuestProgress = {
      ...emptyQuestProgress(),
      problemOutcomes: Object.fromEntries(problems.map((p, i) => [p.id, outcomes[i % outcomes.length]])),
    };
    expect(isStepComplete(step, progress)).toBe(true);
  });
});

describe("isStepComplete: puzzle-of-week", () => {
  test("tracks its single problem", () => {
    const step = thinkQuest.steps.find((s) => s.kind === "puzzle-of-week")!;
    const problemId = (step as Extract<typeof step, { kind: "puzzle-of-week" }>).problem.id;
    expect(isStepComplete(step, emptyQuestProgress())).toBe(false);
    const progress: QuestProgress = { ...emptyQuestProgress(), problemOutcomes: { [problemId]: "correct" } };
    expect(isStepComplete(step, progress)).toBe(true);
  });
});

describe("isStepComplete: explain", () => {
  test("incomplete with no text and no recording", () => {
    const step = thinkQuest.steps.find((s) => s.kind === "explain" && s.mode === "written")!;
    expect(isStepComplete(step, emptyQuestProgress())).toBe(false);
  });

  test("complete when text exists", () => {
    const step = thinkQuest.steps.find((s) => s.kind === "explain" && s.mode === "written")!;
    const progress: QuestProgress = { ...emptyQuestProgress(), explains: { [step.id]: { text: "I used the equivalence idea." } } };
    expect(isStepComplete(step, progress)).toBe(true);
  });

  test("complete when a recording exists, with no text", () => {
    const step = thinkQuest.steps.find((s) => s.kind === "explain" && s.mode === "voice")!;
    const progress: QuestProgress = { ...emptyQuestProgress(), explains: { [step.id]: { recording: true } } };
    expect(isStepComplete(step, progress)).toBe(true);
  });

  test("blank whitespace text does not count as a submission", () => {
    const step = thinkQuest.steps.find((s) => s.kind === "explain" && s.mode === "written")!;
    const progress: QuestProgress = { ...emptyQuestProgress(), explains: { [step.id]: { text: "   " } } };
    expect(isStepComplete(step, progress)).toBe(false);
  });
});

describe("isStepComplete: artifact", () => {
  test("incomplete with nothing submitted", () => {
    const step = buildQuest.steps.find((s) => s.kind === "artifact")!;
    expect(isStepComplete(step, emptyQuestProgress())).toBe(false);
  });

  test("complete when a submitted kind is in the step's accepts list", () => {
    const step = buildQuest.steps.find((s) => s.kind === "artifact")!; // accepts photo, code
    const progress: QuestProgress = { ...emptyQuestProgress(), artifacts: { [step.id]: ["photo"] } };
    expect(isStepComplete(step, progress)).toBe(true);
  });

  test("a submitted kind outside accepts does not count", () => {
    const speakArtifact = speakQuest.steps.find((s) => s.kind === "artifact")!; // accepts only recording
    const progress: QuestProgress = { ...emptyQuestProgress(), artifacts: { [speakArtifact.id]: ["photo"] } };
    expect(isStepComplete(speakArtifact, progress)).toBe(false);
  });
});

describe("isStepComplete: log and debate", () => {
  test("log incomplete until a log is on record for that step", () => {
    const step = buildQuest.steps.find((s) => s.kind === "log")!;
    expect(isStepComplete(step, emptyQuestProgress())).toBe(false);
    const progress: QuestProgress = { ...emptyQuestProgress(), logs: [step.id] };
    expect(isStepComplete(step, progress)).toBe(true);
  });

  test("debate incomplete until the debate is on record for that step", () => {
    const debateQuest = quest("s1-w05-speak");
    const step = debateQuest.steps.find((s) => s.kind === "debate")!;
    expect(isStepComplete(step, emptyQuestProgress())).toBe(false);
    const progress: QuestProgress = { ...emptyQuestProgress(), debates: [step.id] };
    expect(isStepComplete(step, progress)).toBe(true);
  });
});

describe("isStepComplete: lesson (task 4, Meet the idea)", () => {
  const lessonQuest = quest("s1-w06-think");
  const step = lessonQuest.steps.find((s) => s.kind === "lesson")!;

  test("a lesson step exists in week 6's think quest, before the skills lane", () => {
    expect(step).toBeTruthy();
    const skillsIndex = lessonQuest.steps.findIndex((s) => s.kind === "problem-set" && s.lane === "skills");
    const lessonIndex = lessonQuest.steps.indexOf(step);
    expect(lessonIndex).toBeLessThan(skillsIndex);
  });

  test("incomplete with no progress at all", () => {
    expect(isStepComplete(step, emptyQuestProgress())).toBe(false);
  });

  test("incomplete when lessons is missing entirely (progress docs written before this field existed)", () => {
    const withoutLessons: QuestProgress = { ticks: [], checklist: {}, problemOutcomes: {}, explains: {}, artifacts: {}, logs: [], debates: [] };
    expect(isStepComplete(step, withoutLessons)).toBe(false);
  });

  test("complete once the step id is on record in lessons", () => {
    const progress: QuestProgress = { ...emptyQuestProgress(), lessons: [step.id] };
    expect(isStepComplete(step, progress)).toBe(true);
  });

  test("a different lesson step id on record does not complete this one", () => {
    const progress: QuestProgress = { ...emptyQuestProgress(), lessons: ["some-other-step-id"] };
    expect(isStepComplete(step, progress)).toBe(false);
  });
});

describe("questStatus: all-steps (Think)", () => {
  test("not_started with no progress at all", () => {
    expect(questStatus(thinkQuest, emptyQuestProgress())).toBe("not_started");
  });

  test("in_progress once some but not all steps are complete", () => {
    const firstStep = thinkQuest.steps[0];
    const problems = firstStep.kind === "warmup" ? firstStep.problems : [];
    const progress: QuestProgress = {
      ...emptyQuestProgress(),
      problemOutcomes: outcomesFor(problems.map((p) => p.id), "correct"),
    };
    expect(questStatus(thinkQuest, progress)).toBe("in_progress");
  });

  test("done only once every step (including both trailing explain steps) is complete", () => {
    const allIds = allProblemIds(thinkQuest);
    const explainSteps = thinkQuest.steps.filter((s) => s.kind === "explain");
    const otherTickable = thinkQuest.steps.filter((s) => ["instruction", "science", "typing", "task"].includes(s.kind));
    const progress: QuestProgress = {
      ...emptyQuestProgress(),
      ticks: otherTickable.map((s) => ({ stepId: s.id, done: true })),
      problemOutcomes: outcomesFor(allIds, "correct"),
      explains: Object.fromEntries(explainSteps.map((s) => [s.id, { text: "done", recording: true }])),
    };
    expect(questStatus(thinkQuest, progress)).toBe("done");
  });

  test("a Showcase Think week (no explain steps) still completes on all-steps", () => {
    const allIds = allProblemIds(showcaseThinkQuest);
    const tickable = showcaseThinkQuest.steps.filter((s) => ["instruction", "science", "typing", "task"].includes(s.kind));
    const progress: QuestProgress = {
      ...emptyQuestProgress(),
      ticks: tickable.map((s) => ({ stepId: s.id, done: true })),
      problemOutcomes: outcomesFor(allIds, "correct"),
    };
    expect(questStatus(showcaseThinkQuest, progress)).toBe("done");
  });
});

describe("questStatus: artifact-and-log (Build)", () => {
  test("a Build quest with an artifact but no log is in_progress, not done", () => {
    const artifactStep = buildQuest.steps.find((s) => s.kind === "artifact")!;
    const progress: QuestProgress = { ...emptyQuestProgress(), artifacts: { [artifactStep.id]: ["photo"] } };
    expect(questStatus(buildQuest, progress)).toBe("in_progress");
  });

  test("done once both the artifact and the log are complete, even if the task checklist was never ticked", () => {
    const artifactStep = buildQuest.steps.find((s) => s.kind === "artifact")!;
    const logStep = buildQuest.steps.find((s) => s.kind === "log")!;
    const progress: QuestProgress = {
      ...emptyQuestProgress(),
      artifacts: { [artifactStep.id]: ["code"] },
      logs: [logStep.id],
    };
    expect(questStatus(buildQuest, progress)).toBe("done");
  });

  test("a Showcase Build quest (no science or task step) still completes on artifact-and-log", () => {
    const artifactStep = showcaseBuildQuest.steps.find((s) => s.kind === "artifact")!;
    const logStep = showcaseBuildQuest.steps.find((s) => s.kind === "log")!;
    const progress: QuestProgress = {
      ...emptyQuestProgress(),
      artifacts: { [artifactStep.id]: ["photo"] },
      logs: [logStep.id],
    };
    expect(questStatus(showcaseBuildQuest, progress)).toBe("done");
  });
});

describe("questStatus: recording-and-log (Speak)", () => {
  test("done once the recording artifact and the log are complete", () => {
    const artifactStep = speakQuest.steps.find((s) => s.kind === "artifact")!;
    const logStep = speakQuest.steps.find((s) => s.kind === "log")!;
    const progress: QuestProgress = {
      ...emptyQuestProgress(),
      artifacts: { [artifactStep.id]: ["recording"] },
      logs: [logStep.id],
    };
    expect(questStatus(speakQuest, progress)).toBe("done");
  });

  test("a Showcase Speak quest (Big Brother task) still completes on recording-and-log", () => {
    const artifactStep = showcaseSpeakQuest.steps.find((s) => s.kind === "artifact")!;
    const logStep = showcaseSpeakQuest.steps.find((s) => s.kind === "log")!;
    const progress: QuestProgress = {
      ...emptyQuestProgress(),
      artifacts: { [artifactStep.id]: ["recording"] },
      logs: [logStep.id],
    };
    expect(questStatus(showcaseSpeakQuest, progress)).toBe("done");
  });
});

describe("questStatus: parked", () => {
  test("a parked quest is not done, even with an artifact submitted", () => {
    const artifactStep = buildQuest.steps.find((s) => s.kind === "artifact")!;
    const progress: QuestProgress = { ...emptyQuestProgress(), artifacts: { [artifactStep.id]: ["photo"] }, parked: true };
    expect(questStatus(buildQuest, progress)).toBe("parked");
  });

  test("done wins over parked once the completion rule is actually satisfied", () => {
    const artifactStep = buildQuest.steps.find((s) => s.kind === "artifact")!;
    const logStep = buildQuest.steps.find((s) => s.kind === "log")!;
    const progress: QuestProgress = {
      ...emptyQuestProgress(),
      artifacts: { [artifactStep.id]: ["photo"] },
      logs: [logStep.id],
      parked: true,
    };
    expect(questStatus(buildQuest, progress)).toBe("done");
  });
});

describe("resumePosition", () => {
  test("returns the first incomplete step when nothing is done", () => {
    expect(resumePosition(buildQuest, emptyQuestProgress())).toEqual({ stepIndex: 0 });
  });

  test("skips completed leading steps and lands on the first incomplete one", () => {
    const first = buildQuest.steps[0];
    const progress: QuestProgress = { ...emptyQuestProgress(), ticks: [{ stepId: first.id, done: true }] };
    expect(resumePosition(buildQuest, progress)).toEqual({ stepIndex: 1 });
  });

  test("stops at a task step whose checklist is only partly ticked", () => {
    const taskIndex = buildQuest.steps.findIndex((s) => s.kind === "task");
    const taskStep = buildQuest.steps[taskIndex];
    if (taskStep.kind !== "task") throw new Error("expected a task step");
    const leadingSteps = buildQuest.steps.slice(0, taskIndex);
    const items = taskStep.checklist.map((_, i) => i < 2); // 2 of 4 ticked
    const progress: QuestProgress = {
      ...emptyQuestProgress(),
      ticks: leadingSteps.map((s) => ({ stepId: s.id, done: true })),
      checklist: { [taskStep.id]: items },
    };
    expect(resumePosition(buildQuest, progress)).toEqual({ stepIndex: taskIndex });
  });

  test("moves past the task step once every checklist item is ticked", () => {
    const taskIndex = buildQuest.steps.findIndex((s) => s.kind === "task");
    const taskStep = buildQuest.steps[taskIndex];
    if (taskStep.kind !== "task") throw new Error("expected a task step");
    const leadingSteps = buildQuest.steps.slice(0, taskIndex);
    const items = taskStep.checklist.map(() => true); // all four ticked
    const progress: QuestProgress = {
      ...emptyQuestProgress(),
      ticks: leadingSteps.map((s) => ({ stepId: s.id, done: true })),
      checklist: { [taskStep.id]: items },
    };
    expect(resumePosition(buildQuest, progress)).toEqual({ stepIndex: taskIndex + 1 });
  });

  test("inside a problem-set step, returns the index of the first unanswered problem", () => {
    const stepIndex = thinkQuest.steps.findIndex((s) => s.kind === "problem-set" && s.lane === "skills");
    const step = thinkQuest.steps[stepIndex];
    const problems = (step as Extract<typeof step, { kind: "problem-set" }>).problems;
    // Complete every step before this one, and the first two problems in this set.
    const priorSteps = thinkQuest.steps.slice(0, stepIndex);
    const priorIds = priorSteps.flatMap((s) => (s.kind === "warmup" ? s.problems.map((p) => p.id) : s.kind === "puzzle-of-week" ? [s.problem.id] : []));
    const priorTicks = priorSteps.filter((s) => ["instruction", "science", "typing", "task"].includes(s.kind)).map((s) => ({ stepId: s.id, done: true }));
    const progress: QuestProgress = {
      ...emptyQuestProgress(),
      ticks: priorTicks,
      problemOutcomes: {
        ...outcomesFor(priorIds, "correct"),
        [problems[0].id]: "correct",
        [problems[1].id]: "exhausted",
      },
    };
    const position = resumePosition(thinkQuest, progress);
    expect(position.stepIndex).toBe(stepIndex);
    expect(position.problemIndex).toBe(2);
  });

  test("returns a stepIndex past the end once the quest is fully done", () => {
    const artifactStep = buildQuest.steps.find((s) => s.kind === "artifact")!;
    const logStep = buildQuest.steps.find((s) => s.kind === "log")!;
    const otherTickable = buildQuest.steps.filter((s) => ["instruction", "science", "typing", "task"].includes(s.kind));
    const progress: QuestProgress = {
      ...emptyQuestProgress(),
      ticks: otherTickable.map((s) => ({ stepId: s.id, done: true })),
      artifacts: { [artifactStep.id]: ["photo"] },
      logs: [logStep.id],
    };
    expect(resumePosition(buildQuest, progress)).toEqual({ stepIndex: buildQuest.steps.length });
  });
});

describe("weekSummary", () => {
  test("returns a per-track status and full minutes for untouched quests", () => {
    const quests = [buildQuest, thinkQuest, speakQuest];
    const summary = weekSummary(quests, {});
    expect(summary).toHaveLength(3);
    const build = summary.find((s) => s.track === "build")!;
    expect(build.status).toBe("not_started");
    expect(build.minutesLeft).toBe(buildQuest.minutes);
  });

  test("minutesLeft is 0 for a done quest", () => {
    const artifactStep = buildQuest.steps.find((s) => s.kind === "artifact")!;
    const logStep = buildQuest.steps.find((s) => s.kind === "log")!;
    const otherTickable = buildQuest.steps.filter((s) => ["instruction", "science", "typing", "task"].includes(s.kind));
    const progress: QuestProgress = {
      ...emptyQuestProgress(),
      ticks: otherTickable.map((s) => ({ stepId: s.id, done: true })),
      artifacts: { [artifactStep.id]: ["photo"] },
      logs: [logStep.id],
    };
    const summary = weekSummary([buildQuest], { [buildQuest.id]: progress });
    expect(summary[0].status).toBe("done");
    expect(summary[0].minutesLeft).toBe(0);
  });

  test("minutesLeft drops as steps complete, and stays under the full quest length", () => {
    const first = buildQuest.steps[0];
    const progress: QuestProgress = { ...emptyQuestProgress(), ticks: [{ stepId: first.id, done: true }] };
    const summary = weekSummary([buildQuest], { [buildQuest.id]: progress });
    expect(summary[0].minutesLeft).toBeLessThan(buildQuest.minutes);
    expect(summary[0].minutesLeft).toBeGreaterThan(0);
  });
});
