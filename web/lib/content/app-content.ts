import raw from "@/generated/content.json";
import {
  getLesson as findLesson,
  getLessonForIdea as findLessonForIdea,
  getQuest as findQuest,
  getSproutWeek as findSproutWeek,
  getWeek as findWeek,
  problemsOf,
  seasonCount as countSeasons,
  type Content,
} from "./lookup";
import type { Idea, LadderTopic, LadderTopicMeta, Lesson, Motion, Problem, Quest, Skill, SproutActivity, SproutWeek, Step, Track } from "./schema";

// The bundle is compiled once at prebuild by scripts/generate-content.ts and imported
// statically here, so this module never touches the filesystem: it works the same in a
// server component, a client component and a script.
const content = raw as unknown as Content;

let problemIndex: Map<string, { problem: Problem; quest: Quest; step: Step }> | null = null;

function buildProblemIndex(): Map<string, { problem: Problem; quest: Quest; step: Step }> {
  const index = new Map<string, { problem: Problem; quest: Quest; step: Step }>();
  for (const quest of content.quests) {
    for (const step of quest.steps) {
      for (const problem of problemsOf(step)) {
        index.set(problem.id, { problem, quest, step });
      }
    }
  }
  // Ladder problems resolve to a synthetic quest and step, so everything that maps an attempt
  // back to its problem (skills, the idea box, the portfolio) works for them unchanged.
  for (const topic of Object.values(content.ladder?.topics ?? {})) {
    const step: Step = { kind: "problem-set", id: `ladder-${topic.id}`, title: topic.id, lane: "skills", problems: [...topic.bank, ...topic.stretch] };
    const quest = ladderQuestFor(topic.id, step);
    for (const problem of step.problems) index.set(problem.id, { problem, quest, step });
  }
  return index;
}

/** The id every Ladder attempt and progress doc is stored under (lib/domain/ladder.ts). */
export const LADDER_QUEST_ID = "ladder";

/** A synthetic quest wrapping one Ladder topic's problems, for the player and the index. */
export function ladderQuestFor(topicId: string, step: Step): Quest {
  return {
    id: LADDER_QUEST_ID,
    season: 0,
    week: 0,
    track: "think",
    title: "The Ladder",
    summary: topicId,
    minutes: 25,
    materials: [],
    skills: [],
    completion: "all-steps",
    steps: [step],
  } as unknown as Quest;
}

export function getLadderGraph(): LadderTopicMeta[] {
  return content.ladder?.graph ?? [];
}

export function getLadderTopic(id: string): LadderTopic | undefined {
  return content.ladder?.topics?.[id];
}

/** The whole validated Content object. Same reference on every call. */
export function getContent(): Content {
  return content;
}

export function getQuest(questId: string): Quest | undefined {
  return findQuest(content, questId);
}

export function getWeek(season: number, week: number): Partial<Record<Track, Quest>> {
  return findWeek(content, season, week);
}

export function getSproutWeek(season: number, week: number): SproutWeek | undefined {
  return findSproutWeek(content, season, week);
}

export function getSeasonCount(): number {
  return countSeasons(content);
}

/**
 * Resolves a Sprout activity id straight from the id, without a caller having to already know
 * or pass the season or week: both are embedded in the id itself. Season 1 predates seasons and
 * its ids are bare ("sprout-w01-a1"); later seasons carry their prefix ("s2-sprout-w01-a1"),
 * matching the schema's own id regex. This is what /sprout/activity/[activityId] has to go on,
 * since the URL carries only the activity id. Returns both the week and the activity since a
 * caller (the activity player) needs the week for its parent card / week number too.
 */
export function getSproutActivity(activityId: string): { week: SproutWeek; activity: SproutActivity } | undefined {
  const match = /^(?:s(\d+)-)?sprout-w(\d{2})-a[1-3]$/.exec(activityId);
  if (!match) return undefined;
  const season = match[1] ? Number(match[1]) : 1;
  const week = getSproutWeek(season, Number(match[2]));
  if (!week) return undefined;
  const activity = week.activities.find((a) => a.id === activityId);
  if (!activity) return undefined;
  return { week, activity };
}

export function getSkill(id: string): Skill | undefined {
  return content.skills.find((s) => s.id === id);
}

export function getIdea(id: string): Idea | undefined {
  return content.ideas.find((i) => i.id === id);
}

export function getMotion(id: string): Motion | undefined {
  return content.motions.find((m) => m.id === id);
}

export function getLesson(id: string): Lesson | undefined {
  return findLesson(content, id);
}

/** The "Meet the idea" lesson for an idea, if one has been authored -- what ProblemPlayer's
 * struggle offer (after two failed tries) checks before showing "Want to meet the idea first?". */
export function getLessonForIdea(ideaId: string): Lesson | undefined {
  return findLessonForIdea(content, ideaId);
}

export function listWeeks(season: number): number[] {
  const weeks = new Set(content.quests.filter((q) => q.season === season).map((q) => q.week));
  return [...weeks].sort((a, b) => a - b);
}

/** The flat problem index is built once, on first use, and cached for the life of the module. */
export function getProblem(problemId: string): { problem: Problem; quest: Quest; step: Step } | undefined {
  if (!problemIndex) problemIndex = buildProblemIndex();
  return problemIndex.get(problemId);
}
