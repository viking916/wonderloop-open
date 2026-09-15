// The Season plan index (Parent view restructure, 15 September 2026): the owner asked for "an
// index for the parents view so I can see what will be done in what week at a glance", quest
// titles plus the skills and ideas each week teaches. Pure and Firebase-free, like every other
// module in this folder: it reads the generated content bundle through app-content.ts and
// lookup.ts (both filesystem- and Firebase-free themselves) and takes the child's own progress
// as plain data (doneByWeek, currentWeek), never a Firestore document.
//
// "Current" is never decided in here: a caller showing a season that is not the profile's own
// active season has no honest way to say a week in it is "current" (a past season is done, a
// future one has not started), so `currentWeek` is passed in as `undefined` for those, and only
// the active season's own caller passes the real currentWeekFromDone(doneByWeek) result.

import { getContent, getIdea, getSkill, getSproutWeek as getSproutWeekContent, getWeek as getWeekContent } from "../content/app-content";
import { getGameForWeek, problemsOf } from "../content/lookup";
import type { Game, Quest, Track } from "../content/schema";
import { tracksForProfile, type TrackChoice } from "./tracks";

export type SeasonIndexStatus = "done" | "current" | "upcoming";

export type SeasonIndexTrackCell = {
  track: Track;
  questId: string;
  title: string;
  minutes: number;
  /** Quest-level skill ids resolved to names (getSkill), falling back to the raw id when a
   * skill has been removed from the registry but a quest still names it. */
  skills: string[];
  /** Every idea the quest's steps, their problems, and its extras touch, resolved to names
   * (getIdea, same fallback), de-duplicated in first-seen order. */
  ideas: string[];
};

export type SeasonIndexKitItem = { name: string; approxUsd: number | null };

export type SeasonIndexWeek = {
  week: number;
  sprint: 1 | 2 | 3;
  showcase: boolean;
  status: SeasonIndexStatus;
  tracks: SeasonIndexTrackCell[];
  /** Season materials first needed this exact week (materials.ts's own neededByWeek field),
   * empty on a week that introduces nothing new. */
  kit: SeasonIndexKitItem[];
  /** The sprint's game, present only on the sprint's first week (1, 5, or 9). */
  game?: Game;
};

export type SeasonIndexSproutWeek = {
  week: number;
  sprint: 1 | 2 | 3;
  showcase: boolean;
  status: SeasonIndexStatus;
  theme: string;
  activityTitles: string[];
  parentCardTitle: string;
  skills: string[];
};

/** Sprints are weeks 1-4, 5-8, 9-12; the same arithmetic lookup.ts's getGameForWeek uses. */
function sprintOfWeek(week: number): 1 | 2 | 3 {
  return Math.min(3, Math.max(1, Math.ceil(week / 4))) as 1 | 2 | 3;
}

function isShowcaseWeek(week: number): boolean {
  return week === 4 || week === 8 || week === 12;
}

function isSprintFirstWeek(week: number): boolean {
  return week === 1 || week === 5 || week === 9;
}

function statusFor(week: number, doneByWeek: boolean[], currentWeek: number | undefined): SeasonIndexStatus {
  if (doneByWeek[week - 1]) return "done";
  if (currentWeek === week) return "current";
  return "upcoming";
}

function resolveSkillNames(ids: string[]): string[] {
  return ids.map((id) => getSkill(id)?.name ?? id);
}

/** Every idea id a quest touches: its steps' own optional ideaId (science, data), every step's
 * problems (problemsOf, each problem's required ideaId), and its extras' optional ideaId. */
function ideaIdsForQuest(quest: Quest): string[] {
  const ids: string[] = [];
  for (const step of quest.steps) {
    if ("ideaId" in step && step.ideaId) ids.push(step.ideaId);
    for (const problem of problemsOf(step)) ids.push(problem.ideaId);
  }
  for (const extra of quest.extras ?? []) {
    if (extra.ideaId) ids.push(extra.ideaId);
  }
  return ids;
}

function ideaNamesForQuest(quest: Quest): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const id of ideaIdsForQuest(quest)) {
    if (seen.has(id)) continue;
    seen.add(id);
    names.push(getIdea(id)?.name ?? id);
  }
  return names;
}

function kitForWeek(seasonId: number, week: number): SeasonIndexKitItem[] {
  const registry = getContent().materials[String(seasonId)] ?? [];
  return registry.filter((m) => m.neededByWeek === week).map((m) => ({ name: m.name, approxUsd: m.approxUsd }));
}

/**
 * The Season plan's twelve weeks for an Explorer profile: quest titles, minutes, skills and
 * ideas per present track, the week's kit, and the sprint's game on its first week.
 *
 * `doneByWeek` mirrors app/parent/page.tsx's own explorerDoneByWeek (12 entries, week i+1 done
 * or not). `currentWeek` is currentWeekFromDone(doneByWeek) for the profile's own active season,
 * or undefined for any other season a parent has picked in the selector, so a past or future
 * season never shows a week as "current".
 */
export function explorerSeasonIndex(
  seasonId: number,
  choice: TrackChoice,
  doneByWeek: boolean[],
  currentWeek: number | undefined,
): SeasonIndexWeek[] {
  const tracks = tracksForProfile(choice);
  const weeks: SeasonIndexWeek[] = [];

  for (let week = 1; week <= 12; week++) {
    const weekQuests = getWeekContent(seasonId, week);
    const trackCells: SeasonIndexTrackCell[] = [];
    for (const track of tracks) {
      const quest = weekQuests[track];
      if (!quest) continue;
      trackCells.push({
        track,
        questId: quest.id,
        title: quest.title,
        minutes: quest.minutes,
        skills: resolveSkillNames(quest.skills),
        ideas: ideaNamesForQuest(quest),
      });
    }

    weeks.push({
      week,
      sprint: sprintOfWeek(week),
      showcase: isShowcaseWeek(week),
      status: statusFor(week, doneByWeek, currentWeek),
      tracks: trackCells,
      kit: kitForWeek(seasonId, week),
      game: isSprintFirstWeek(week) ? getGameForWeek(getContent(), seasonId, week) : undefined,
    });
  }

  return weeks;
}

/**
 * The Season plan's twelve weeks for a Sprout profile: the theme, the three activity titles,
 * the parent card's own title, and the week's skills. Same status/currentWeek contract as
 * explorerSeasonIndex above; `doneByWeek` mirrors app/parent/page.tsx's sproutDoneByWeek.
 */
export function sproutSeasonIndex(
  seasonId: number,
  doneByWeek: boolean[],
  currentWeek: number | undefined,
): SeasonIndexSproutWeek[] {
  const weeks: SeasonIndexSproutWeek[] = [];

  for (let week = 1; week <= 12; week++) {
    const status = statusFor(week, doneByWeek, currentWeek);
    const sprint = sprintOfWeek(week);
    const showcase = isShowcaseWeek(week);
    const content = getSproutWeekContent(seasonId, week);

    if (!content) {
      weeks.push({ week, sprint, showcase, status, theme: "", activityTitles: [], parentCardTitle: "", skills: [] });
      continue;
    }

    weeks.push({
      week,
      sprint,
      showcase,
      status,
      theme: content.theme,
      activityTitles: content.activities.map((a) => a.title),
      parentCardTitle: content.parentCard.title,
      skills: resolveSkillNames([...new Set(content.skills)]),
    });
  }

  return weeks;
}
