// The weekly parent paragraph, computed, not written (Plan 3 Task 2; spec 10 item 5, amended by
// docs/superpowers/plans/2026-08-30-plan-3-voice-and-ai.md: "no model. It reports facts about
// the week, and facts are better served by arithmetic than by prose that might flatter or
// invent"). This module decides the facts; rendering them as sentences is the component's job
// (components/parent/WeeklyParagraph.tsx). Pure: no React, no Firebase, no Date.now() -- `now`
// is passed in.
//
// "The week" here is the trailing WEEK_WINDOW_MS ending at `now`, not the calendar/season week
// (lib/domain/calendar.ts's currentWeekFor). This module has no reason to know about seasons or
// a profile's startDate -- a rolling window means "this week" always means "recently", the same
// thing a parent reading on any given day would mean by it, without threading
// profile.startDate and the season's calendarStart through a module that otherwise has nothing
// to do with the calendar. `quests` is the one exception: which quests belong to "this week" is
// a content/calendar fact the caller already resolves (lib/content/app-content.ts's getWeek) to
// render This Week's own cards, so it arrives already scoped rather than re-derived here.

import type { Quest, Track } from "../content/schema";
import { emptyQuestProgress, questStatus, weekSummary, type QuestProgress, type QuestStatus } from "./completion";

/** Seven days. See the module header for why a rolling window, not the calendar week. */
export const WEEK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type WeeklyQuestInput = { track: Track; quest: Quest; progress: QuestProgress };

/**
 * One attempt, flattened to what this module needs. `approved` is the parent's thumbs-up on a
 * revealed (explain-it/proof) attempt -- lib/data/types.ts's ProblemProgress.parentReview,
 * resolved by the caller the same way app/parent/page.tsx's computeExplainItems already does --
 * so this module never has to know the shape of a progress document's `problems` map.
 * `revealed` is attempts.ts's own flag for "not auto-graded, the explanation opened on
 * submission" (a proof or explain-it): it is what tells this module an attempt is the kind of
 * thing that waits for a parent's look, with no need to look up a problem's content kind.
 */
export type WeeklyAttemptInput = {
  problemId: string;
  ideaIds: string[];
  tryNumber: 1 | 2 | 3;
  correct: boolean;
  revealed: boolean;
  approved: boolean;
  at: number;
};

export type WeeklyLogInput = { hasComment: boolean; at: number };

export type WeeklyParentEntryInput = { skillId: string; note: string; at: number };

export type WeeklyQuestStatusEntry = { track: Track; questTitle: string; status: QuestStatus };

/** An idea a first try missed on, this week. `missedProblemIds` is a set of distinct problems
 * (a problem retried more than once this week still counts once), the same "problems, not
 * attempts" convention lib/domain/ideas.ts's metIdeas already uses. */
export type HardIdea = { ideaId: string; missedProblemIds: string[] };

export type WeeklySummary = {
  /** False when the profile has no quest assigned this week at all (e.g. the season has ended).
   * Every other field is still well-formed in that case, just empty/zero. */
  hasQuestsThisWeek: boolean;
  quests: WeeklyQuestStatusEntry[];
  finishedTracks: Track[];
  /** Not started, in progress, or parked -- everything short of done. */
  unfinishedTracks: Track[];
  allDone: boolean;
  /** The sum of each track's step-completion estimate (completion.ts's own weekSummary), never
   * a measured elapsed time -- see that module's doc comment. The caller must say "About" when
   * it renders this, the same honesty the existing KidCard already applies (components/parent/
   * KidCard.tsx's own doc comment). */
  minutesSpentEstimate: number;
  /** Plan 4 task 35: real elapsed time, built from the SAME `attempts`/`logs` this module
   * already takes -- never a second data source -- rather than minutesSpentEstimate's per-quest
   * time budget above. Every attempt and every log already carries its own real timestamp; this
   * sums each continuous stretch of them (see SITTING_GAP_MS below for what "continuous" means)
   * rather than assuming a step took as long as its authored minutes say it should. It can still
   * undercount -- a step with no attempt and no log (reading instructions, typing code, watching
   * a video) leaves no timestamp behind at all -- so the caller should still say "About" here,
   * the same honesty minutesSpentEstimate already gets, just for a different reason: this is a
   * clustering rule over real moments, not a stopwatch that ran the whole time. */
  sittingMinutesThisWeek: number;
  /** How many separate sittings sittingMinutesThisWeek was built from; 0 in a thin week. */
  sittingsThisWeek: number;
  /** Worst (most distinct missed problems) first; ties broken by which idea was missed first
   * this week, so the order is stable across otherwise-tied runs. */
  hardIdeas: HardIdea[];
  /** Explain-it/proof attempts this week whose LATEST attempt on that problem is still
   * unapproved -- mirrors app/parent/page.tsx's computeExplainItems, which only ever shows the
   * newest attempt per problem, not the whole history. */
  explainItsWaiting: number;
  logsWithoutComment: number;
  /** This week's parent-entered activity notes, unchanged, for the caller to restate verbatim
   * -- never summarized or reworded, since they are already the parent's own words. */
  parentNotes: WeeklyParentEntryInput[];
  /** Literally nothing happened this week: no quest touched, no attempt, no log, no parent
   * note. Distinct from "some tracks unfinished", which is the ordinary case, not a thin one. */
  isThinWeek: boolean;
};

function inWeek(at: number, now: number): boolean {
  return at <= now && at > now - WEEK_WINDOW_MS;
}

/** Plan 4 task 35: a gap this short between two recorded moments still counts as the same
 * continuous sitting, not two separate ones -- a few minutes reading a hint or writing a
 * sentence should not split one sitting in half. Longer than this, and it reads as a real break
 * (closing the laptop over lunch, coming back the next evening), i.e. a new sitting. */
const SITTING_GAP_MS = 10 * 60 * 1000;

/** Every sitting is credited at least this much, even a single recorded moment (checking one
 * problem did take some real seconds, never zero). */
const SITTING_MIN_MS = 60 * 1000;

/** Clusters a week's real recorded timestamps into sittings and sums their real elapsed spans.
 * Pure and tiny on purpose -- weeklySummary is the only caller, and this is the whole of what
 * "actual sitting time" means here (see WeeklySummary.sittingMinutesThisWeek's own comment). */
function sittingsFrom(times: number[]): { minutes: number; sittings: number } {
  if (times.length === 0) return { minutes: 0, sittings: 0 };
  const sorted = [...times].sort((a, b) => a - b);
  let totalMs = 0;
  let sittings = 1;
  let sittingStart = sorted[0]!;
  let sittingEnd = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i]!;
    if (t - sittingEnd <= SITTING_GAP_MS) {
      sittingEnd = t;
      continue;
    }
    totalMs += Math.max(sittingEnd - sittingStart, SITTING_MIN_MS);
    sittings += 1;
    sittingStart = t;
    sittingEnd = t;
  }
  totalMs += Math.max(sittingEnd - sittingStart, SITTING_MIN_MS);
  return { minutes: Math.round(totalMs / 60_000), sittings };
}

export function weeklySummary(input: {
  quests: WeeklyQuestInput[];
  attempts: WeeklyAttemptInput[];
  logs: WeeklyLogInput[];
  parentEntries: WeeklyParentEntryInput[];
  now: number;
}): WeeklySummary {
  const { quests, attempts, logs, parentEntries, now } = input;

  const weekAttempts = attempts.filter((a) => inWeek(a.at, now));
  const weekLogs = logs.filter((l) => inWeek(l.at, now));
  const weekParentEntries = parentEntries.filter((e) => inWeek(e.at, now));

  const statuses = quests.map(({ quest, progress }) => questStatus(quest, progress));
  const questEntries: WeeklyQuestStatusEntry[] = quests.map(({ track, quest }, i) => ({
    track,
    questTitle: quest.title,
    status: statuses[i],
  }));
  const finishedTracks = questEntries.filter((q) => q.status === "done").map((q) => q.track);
  const unfinishedTracks = questEntries.filter((q) => q.status !== "done").map((q) => q.track);
  const hasQuestsThisWeek = quests.length > 0;
  const allDone = hasQuestsThisWeek && unfinishedTracks.length === 0;

  const progressByQuest: Record<string, QuestProgress> = {};
  for (const q of quests) progressByQuest[q.quest.id] = q.progress ?? emptyQuestProgress();
  const remaining = weekSummary(quests.map((q) => q.quest), progressByQuest);
  const minutesSpentEstimate = remaining.reduce((sum, s, i) => sum + Math.round(quests[i].quest.minutes - s.minutesLeft), 0);

  const { minutes: sittingMinutesThisWeek, sittings: sittingsThisWeek } = sittingsFrom([
    ...weekAttempts.map((a) => a.at),
    ...weekLogs.map((l) => l.at),
  ]);

  // First-try misses this week, grouped by idea. An attempt's ideaIds is written as a single-
  // element array in practice (see lib/data/types.ts's AttemptDoc doc comment and every writer
  // of it); flatMap covers the shape faithfully without assuming it can never carry more than
  // one, matching lib/domain/ideas.ts's own metIdeas.
  const missesByIdea = new Map<string, { problemOrder: string[]; problemSeen: Set<string>; firstAt: number }>();
  for (const a of [...weekAttempts].sort((x, y) => x.at - y.at)) {
    if (a.tryNumber !== 1 || a.correct) continue;
    for (const ideaId of a.ideaIds) {
      const entry = missesByIdea.get(ideaId) ?? { problemOrder: [], problemSeen: new Set<string>(), firstAt: a.at };
      if (!entry.problemSeen.has(a.problemId)) {
        entry.problemSeen.add(a.problemId);
        entry.problemOrder.push(a.problemId);
      }
      missesByIdea.set(ideaId, entry);
    }
  }
  const hardIdeas: HardIdea[] = [...missesByIdea.entries()]
    .map(([ideaId, entry]) => ({ ideaId, missedProblemIds: entry.problemOrder, firstAt: entry.firstAt }))
    .sort((a, b) => b.missedProblemIds.length - a.missedProblemIds.length || a.firstAt - b.firstAt)
    .map(({ ideaId, missedProblemIds }) => ({ ideaId, missedProblemIds }));

  // Waiting on the parent: the latest revealed (explain-it/proof) attempt per problem this
  // week, when it is still unapproved -- an earlier revealed attempt on the same problem that
  // has since been redone and re-revealed should not still count.
  const latestRevealedByProblem = new Map<string, WeeklyAttemptInput>();
  for (const a of weekAttempts) {
    if (!a.revealed) continue;
    const current = latestRevealedByProblem.get(a.problemId);
    if (!current || a.at > current.at) latestRevealedByProblem.set(a.problemId, a);
  }
  const explainItsWaiting = [...latestRevealedByProblem.values()].filter((a) => !a.approved).length;

  const logsWithoutComment = weekLogs.filter((l) => !l.hasComment).length;

  const anyQuestTouched = questEntries.some((q) => q.status !== "not_started");
  const isThinWeek = !anyQuestTouched && weekAttempts.length === 0 && weekLogs.length === 0 && weekParentEntries.length === 0;

  return {
    hasQuestsThisWeek,
    quests: questEntries,
    finishedTracks,
    unfinishedTracks,
    allDone,
    minutesSpentEstimate,
    sittingMinutesThisWeek,
    sittingsThisWeek,
    hardIdeas,
    explainItsWaiting,
    logsWithoutComment,
    parentNotes: weekParentEntries,
    isThinWeek,
  };
}
