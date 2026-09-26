// Pure quest and step completion (spec 7.2). "Done" is honest: it needs a verified answer, an
// artifact, or a log, never a wall-clock guess. No Firebase, no React, no Date.now(): nothing
// here reads the clock at all, since completion is derived from what has actually been
// submitted, not from when.

import type { Quest, Step, Track } from "../content/schema";

export type StepProgress = { stepId: string; done: boolean };

/** The outcome the attempt-rules engine (attempts.ts) reports for a problem. */
export type ProblemOutcome = "unanswered" | "correct" | "revealed" | "exhausted";

export type ArtifactKind = "photo" | "code" | "recording" | "text";

/**
 * Everything isStepComplete needs to judge one quest's steps, scoped to that quest: which
 * ticked steps (instruction, science, typing) the child has marked done, per-item state for
 * task steps' checklists, the outcome of every problem he has attempted, what an explain step
 * has received, which artifact kinds have been submitted per artifact step, and which
 * log/debate steps are on record. "parked" is the explicit "stuck, come back later" flag
 * (spec 7.2); it does not derive from step progress.
 *
 * checklist is keyed by task step id, one boolean per item in that step's content.checklist,
 * in the same order. A task step whose id has no entry in checklist falls back to the plain
 * tick in ticks, so callers that have not adopted per-item tracking yet still work.
 */
export type QuestProgress = {
  ticks: StepProgress[];
  checklist: Record<string, boolean[]>;
  problemOutcomes: Record<string, ProblemOutcome>;
  explains: Record<string, { text?: string; recording?: boolean }>;
  artifacts: Record<string, ArtifactKind[]>;
  logs: string[];
  debates: string[];
  // "Meet the idea" lessons (task 4, concept-first prototype): step ids of lesson steps he has
  // opened to the end. Purely a completion marker, exactly like logs/debates above -- nothing
  // about a beat's right/wrong answers is ever recorded here or anywhere else (see
  // components/quest/LessonPlayer.tsx). Optional so every progress doc written before this field
  // existed still parses; every reader below treats a missing array the same as an empty one.
  lessons?: string[];
  parked?: boolean;
  // The opt-in clock on a timed problem set (lib/domain/clock.ts): started, finished or declined,
  // keyed by step id. Optional like lessons above, for every progress doc written before it.
  clocks?: Record<string, StepClock>;
  // A data step's table and the sentence answered from it (components/quest/DataStep.tsx), keyed
  // by step id. Cells are kept as the strings typed; the chart parses them. Optional like the
  // fields above, for every progress doc written before the data step existed.
  data?: Record<string, DataEntry>;
};

export type DataRow = { cells: string[] };

export type DataEntry = {
  /** One entry per row; `cells` holds one string per column in the step's column order. Rows are
   * objects because Firestore refuses an array nested inside an array. */
  rows: DataRow[];
  /** The child's answer to the step's question. */
  answer: string;
  /** ms, when it was last saved. */
  at: number;
};

/** A row counts once every cell is filled and every non-label cell is a number. */
export function dataRowComplete(row: string[], columnCount: number): boolean {
  if (row.length < columnCount) return false;
  if (row[0].trim().length === 0) return false;
  return row.slice(1, columnCount).every((cell) => cell.trim().length > 0 && Number.isFinite(Number(cell)));
}

export type StepClock = {
  /** Set when the child pressed Start the clock. */
  startedAt?: number;
  /** Set once every problem in the set has an outcome. */
  finishedAt?: number;
  /** Set when the child chose to do the set without a clock. */
  declined?: boolean;
};

export function emptyQuestProgress(): QuestProgress {
  return { ticks: [], checklist: {}, problemOutcomes: {}, explains: {}, artifacts: {}, logs: [], debates: [], lessons: [] };
}

/**
 * The artifact kinds the app can actually put on record for an artifact step.
 *
 * Every kind is a real upload now: photo, code and text always were (a file in Storage and a
 * doc in Firestore, lib/data/artifacts.ts), and since the owner's 4 September 2026 decision
 * that recordings live in Firebase Storage, "recording" is one too (components/quest/
 * RecordingBlock.tsx: recorded in the app, chosen from the phone, or, as a last resort, marked
 * made with the file kept elsewhere). So this is the accepted list itself. It stays a function,
 * and stays the one place the rule lives, because components/quest/ArtifactStep.tsx renders
 * exactly the blocks it returns and lib/content/app-content.test.ts's completability invariant
 * judges every landed quest against it: "what the app offers" and "what the test believes it
 * offers" cannot drift apart.
 */
export function savableArtifactKinds(step: Extract<Step, { kind: "artifact" }>): ArtifactKind[] {
  return [...step.accepts];
}

/**
 * A monster problem set (lane "monster", one per sprint: weeks 1-4, 5-8, 9-12). A1 (2026-09-24
 * year refinement, reduced scope, owner ruling in section 0 of that plan): the monster no longer
 * blocks its Think quest's completion, so isDone/resumePosition/weekSummary below all treat it
 * as outside the set of steps that decide "done" -- it stays a real step (visible in the step
 * list, still openable, its worked solution still opens exactly the way any other problem's
 * does, no reveal wait), it simply never holds the week up.
 */
function isMonsterStep(step: Step): boolean {
  return step.kind === "problem-set" && step.lane === "monster";
}

export function isStepComplete(step: Step, progress: QuestProgress): boolean {
  switch (step.kind) {
    case "instruction":
    case "science":
    case "typing":
      return progress.ticks.some((t) => t.stepId === step.id && t.done);
    case "task": {
      const items = progress.checklist[step.id];
      // No per-item state recorded for this step: fall back to the plain tick.
      if (!items) return progress.ticks.some((t) => t.stepId === step.id && t.done);
      return step.checklist.every((_, i) => items[i] === true);
    }
    case "warmup":
    case "problem-set":
      return step.problems.every((p) => (progress.problemOutcomes[p.id] ?? "unanswered") !== "unanswered");
    case "puzzle-of-week":
      return (progress.problemOutcomes[step.problem.id] ?? "unanswered") !== "unanswered";
    case "explain": {
      const submission = progress.explains[step.id];
      return Boolean(submission && ((submission.text && submission.text.trim().length > 0) || submission.recording));
    }
    case "artifact": {
      const submitted = progress.artifacts[step.id] ?? [];
      return submitted.some((kind) => step.accepts.includes(kind));
    }
    case "log":
      return progress.logs.includes(step.id);
    case "debate":
      return progress.debates.includes(step.id);
    case "lesson":
      return (progress.lessons ?? []).includes(step.id);
    case "data": {
      const entry = progress.data?.[step.id];
      if (!entry) return false;
      const complete = entry.rows.filter((r) => dataRowComplete(r.cells, step.columns.length)).length;
      return complete >= step.minRows && entry.answer.trim().length > 0;
    }
  }
}

export type QuestStatus = "not_started" | "in_progress" | "parked" | "done";

/**
 * Honours spec 7.2's three completion rules. "all-steps" (Think) needs every step complete.
 * "artifact-and-log" (Build) and "recording-and-log" (Speak) need only the quest's artifact
 * step and log step complete: an instruction, science or task step left unticked does not
 * block completion, matching "Build quests need an artifact ... and a Maker's Log."
 */
function isDone(quest: Quest, progress: QuestProgress): boolean {
  // A1: a monster step is never counted here, so a Think quest is "done" the moment every OTHER
  // step is complete, whether or not the monster has been answered.
  if (quest.completion === "all-steps") {
    return quest.steps.filter((s) => !isMonsterStep(s)).every((s) => isStepComplete(s, progress));
  }
  const artifactStep = quest.steps.find((s) => s.kind === "artifact");
  const logStep = quest.steps.find((s) => s.kind === "log");
  if (!artifactStep || !logStep) return false;
  return isStepComplete(artifactStep, progress) && isStepComplete(logStep, progress);
}

function hasAnyProgress(progress: QuestProgress): boolean {
  if (progress.ticks.some((t) => t.done)) return true;
  if (Object.values(progress.checklist).some((items) => items.some(Boolean))) return true;
  if (Object.values(progress.problemOutcomes).some((o) => o !== "unanswered")) return true;
  if (Object.values(progress.explains).some((e) => (e.text && e.text.trim().length > 0) || e.recording)) return true;
  if (Object.values(progress.artifacts).some((kinds) => kinds.length > 0)) return true;
  if (progress.logs.length > 0) return true;
  if (progress.debates.length > 0) return true;
  if ((progress.lessons ?? []).length > 0) return true;
  return false;
}

export function questStatus(quest: Quest, progress: QuestProgress): QuestStatus {
  if (isDone(quest, progress)) return "done"; // he can never un-complete a quest (spec 7.2)
  if (progress.parked) return "parked";
  if (hasAnyProgress(progress)) return "in_progress";
  return "not_started";
}

/**
 * Where to resume: the first incomplete step, and, when that step is a problem set or warm-up,
 * the index of the first unanswered problem inside it. Once every step is complete this points
 * one past the last step, since there is nothing left to resume.
 */
export function resumePosition(quest: Quest, progress: QuestProgress): { stepIndex: number; problemIndex?: number } {
  // A1: once every other step is complete, an unanswered monster is skipped here too, so a
  // reopened quest that only has the monster left lands past the end (the same "nothing left to
  // resume" place a genuinely finished quest lands), never parked on an unsolved monster. While
  // any other step is still open, a monster met earlier in the step order still stops the loop
  // exactly as any other unanswered step would -- this only changes what happens once it is
  // truly the last thing standing.
  const everythingElseDone = quest.steps.filter((s) => !isMonsterStep(s)).every((s) => isStepComplete(s, progress));
  for (let i = 0; i < quest.steps.length; i++) {
    const step = quest.steps[i];
    if (everythingElseDone && isMonsterStep(step)) continue;
    if (isStepComplete(step, progress)) continue;
    if (step.kind === "warmup" || step.kind === "problem-set") {
      const problemIndex = step.problems.findIndex((p) => (progress.problemOutcomes[p.id] ?? "unanswered") === "unanswered");
      return { stepIndex: i, problemIndex: problemIndex >= 0 ? problemIndex : 0 };
    }
    return { stepIndex: i };
  }
  return { stepIndex: quest.steps.length };
}

export type TrackSummary = { track: Track; questId: string; status: QuestStatus; minutesLeft: number };

/**
 * Per-track status for "This Week" ("quest 7 of 12, sprint 2, 40 min left"). minutesLeft is the
 * quest's minutes scaled by the fraction of its steps not yet complete: 0 once done, the full
 * length when untouched, shrinking step by step in between. It is an estimate for display, not
 * a measured elapsed time (this module never reads a clock). A quest with `sittings: 2` (a heavy
 * quest that runs over two calendar weeks at the same weekly pace, not two weeks of work in one)
 * uses its plain `minutes` here unchanged, since this is a THIS WEEK estimate and the weekly
 * budget is unaffected by how many weeks the quest spans; see lib/domain/questTime.ts.
 */
export function weekSummary(quests: Quest[], progressByQuest: Record<string, QuestProgress>): TrackSummary[] {
  return quests.map((quest) => {
    const progress = progressByQuest[quest.id] ?? emptyQuestProgress();
    const status = questStatus(quest, progress);
    // A1: a monster step is left out of both sides of this fraction, the same way it is left
    // out of isDone above, so an unsolved monster never inflates "minutes left" on a Think quest
    // that is otherwise finished (and never counts toward the total either, for the same reason).
    const countedSteps = quest.steps.filter((s) => !isMonsterStep(s));
    const total = countedSteps.length;
    const remaining = countedSteps.filter((s) => !isStepComplete(s, progress)).length;
    const minutesLeft = status === "done" ? 0 : Math.round(quest.minutes * (remaining / total));
    return { track: quest.track, questId: quest.id, status, minutesLeft };
  });
}
