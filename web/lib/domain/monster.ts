// This Week's monster card (A1, 2026-09-24 year refinement, reduced scope: see section 0 of
// docs/superpowers/plans/2026-09-24-year-refinement.md, the owner's ruling that overrides the
// original A1 draft). There is no reveal wait: a monster's worked solution opens exactly the way
// any other problem's does, the instant it is answered. What actually changed is completion.ts
// (a monster step no longer blocks its Think quest's "done") and what is shown here: the monster
// card is no longer scoped to its own single authored week, it is scoped to the whole sprint
// (weeks 1-4, 5-8, 9-12) that week sits in, so it reads as a month-long hunt rather than a
// one-week deadline. Pure and Firebase-free, like every other module in this folder: it reads
// the content tree through app-content.ts and takes progress as a plain map, never Firestore.

import { getWeek } from "../content/app-content";
import type { Quest, Step } from "../content/schema";
import { emptyQuestProgress, isStepComplete, type QuestProgress } from "./completion";

export type MonsterStep = Extract<Step, { kind: "problem-set" }>;

export type MonsterStatus = "open" | "still-open" | "solved";

export type MonsterCardData = {
  weekLabel: string;
  title: string;
  prompt: string;
  status: MonsterStatus;
  /** The quest screen, at the monster's own step (QuestShell reads `?step=n`). */
  href: string;
};

type MonsterEntry = { week: number; quest: Quest; step: MonsterStep };

/** Sprints are weeks 1-4, 5-8, 9-12 -- the same split lib/domain/seasonIndex.ts's own
 * sprintOfWeek and lib/content/lookup.ts's game-of-the-sprint lookup already use. */
export function sprintOfWeek(week: number): 1 | 2 | 3 {
  return Math.min(3, Math.max(1, Math.ceil(week / 4))) as 1 | 2 | 3;
}

function monsterInWeek(seasonId: number, week: number): MonsterEntry | undefined {
  const think = getWeek(seasonId, week).think;
  if (!think) return undefined;
  const step = think.steps.find((s): s is MonsterStep => s.kind === "problem-set" && s.lane === "monster");
  if (!step) return undefined;
  return { week, quest: think, step };
}

/** The one monster authored somewhere in a sprint's four weeks, if any (every season so far
 * authors exactly one, but this never assumes it). */
function monsterForSprint(seasonId: number, sprint: 1 | 2 | 3): MonsterEntry | undefined {
  const start = (sprint - 1) * 4 + 1;
  for (let week = start; week < start + 4; week++) {
    const entry = monsterInWeek(seasonId, week);
    if (entry) return entry;
  }
  return undefined;
}

function cardFor(entry: MonsterEntry, status: MonsterStatus): MonsterCardData {
  const problem = entry.step.problems[0];
  const stepIndex = entry.quest.steps.findIndex((s) => s.id === entry.step.id);
  return {
    weekLabel: `Week ${entry.week}`,
    title: entry.step.title,
    prompt: problem?.prompt ?? "",
    status,
    href: `/explorer/quest/${entry.quest.id}?step=${stepIndex}`,
  };
}

/**
 * This Week's monster card: the sprint containing `displayedWeek` names one monster, shown for
 * that whole sprint, not just its own authored week -- a month-long hunt he can beat, not a
 * one-week deadline.
 *
 * Carry-over: an unsolved monster from the immediately preceding sprint is shown instead of the
 * current sprint's own, marked "still-open", for exactly that one sprint. Once the displayed
 * week moves on to yet another sprint, the carried-over monster is dropped in favour of whatever
 * that new sprint's own "previous sprint" check finds -- so an unsolved monster is never carried
 * more than one sprint past its own, but it is never silently dropped the moment its own sprint
 * ends either.
 */
export function findSprintMonster(
  seasonId: number,
  displayedWeek: number,
  progressByQuest: Record<string, QuestProgress>,
): MonsterCardData | undefined {
  const sprint = sprintOfWeek(displayedWeek);

  if (sprint > 1) {
    const previous = monsterForSprint(seasonId, (sprint - 1) as 1 | 2 | 3);
    if (previous) {
      const previousProgress = progressByQuest[previous.quest.id] ?? emptyQuestProgress();
      if (!isStepComplete(previous.step, previousProgress)) {
        return cardFor(previous, "still-open");
      }
    }
  }

  const current = monsterForSprint(seasonId, sprint);
  if (!current) return undefined;
  const currentProgress = progressByQuest[current.quest.id] ?? emptyQuestProgress();
  const solved = isStepComplete(current.step, currentProgress);
  return cardFor(current, solved ? "solved" : "open");
}
