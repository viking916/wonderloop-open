"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/ui/Header";
import { RequireProfile } from "@/components/RequireProfile";
import { SwitchProfileButton } from "@/components/SwitchProfileButton";
import { ExplorerNav } from "@/components/explorer/ExplorerNav";
import { WeekHeader, SHOWCASE_WEEKS } from "@/components/explorer/WeekHeader";
import { TrackCards } from "@/components/explorer/TrackCards";
import { SideStrip, type MonsterCardData } from "@/components/explorer/SideStrip";
import { TalkOutlineCard } from "@/components/explorer/TalkOutlineCard";
import type { SeasonTrailWeek, WeekStatus } from "@/components/ui/SeasonTrail";
import { profileInitials, useSession, type Profile } from "@/lib/session";
import { getContent, getWeek } from "@/lib/content/app-content";
import { getGameForWeek, getSeasonBook } from "@/lib/content/lookup";
import { questsForProfile, tracksForProfile, type TrackChoice } from "@/lib/domain/tracks";
import { currentWeekFor } from "@/lib/domain/calendar";
import { questStatus, emptyQuestProgress } from "@/lib/domain/completion";
import { talkOutline, sprintRangeForShowcaseWeek, type MakerLogInput } from "@/lib/domain/talkOutline";
import { watchProgress, watchReviewQueue } from "@/lib/data/progress";
import { watchLogs } from "@/lib/data/logs";
import { markGamePlayed, watchGamePlays, type GamePlayDoc } from "@/lib/data/games";
import type { ProgressDoc, LogDoc } from "@/lib/data/types";
import type { ReviewItem } from "@/lib/domain/review";

const WEEK_STORAGE_PREFIX = "wonderloop:thisWeek:";

function weekStorageKey(pid: string): string {
  return `${WEEK_STORAGE_PREFIX}${pid}`;
}

function readStoredWeek(pid: string): number | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(weekStorageKey(pid));
    const n = raw ? Number(raw) : NaN;
    return Number.isInteger(n) && n >= 1 && n <= 12 ? n : undefined;
  } catch {
    // Private browsing / storage disabled: fall back to the real current week.
    return undefined;
  }
}

function writeStoredWeek(pid: string, week: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(weekStorageKey(pid), String(week));
  } catch {
    // Ignore: losing the persisted jump just means the picker resets on reload.
  }
}

/**
 * Builds the twelve-week SeasonTrail model: done/current/todo per week, straight from
 * questStatus over each week's quests, plus a flag (the Build quest's title and the latest
 * completion date) on any Showcase week that is fully done. "current" always marks the real
 * current week, never the picker's displayed week, so jumping the picker never moves the "you
 * are here" marker.
 */
function buildTrailWeeks(
  seasonId: number,
  currentWeek: number,
  progressDocs: Record<string, ProgressDoc>,
  choice: TrackChoice,
): SeasonTrailWeek[] {
  const weeks: SeasonTrailWeek[] = [];
  const tracks = tracksForProfile(choice);
  for (let week = 1; week <= 12; week++) {
    const quests = getWeek(seasonId, week);
    const questList = tracks.map((t) => quests[t]).filter((q): q is NonNullable<typeof q> => Boolean(q));
    const showcase = questList.some((q) => q.showcase) || (SHOWCASE_WEEKS as readonly number[]).includes(week);
    const statuses = questList.map((q) => questStatus(q, progressDocs[q.id]?.quest ?? emptyQuestProgress()));
    const done = questList.length > 0 && statuses.every((s) => s === "done");

    let status: WeekStatus;
    if (week === currentWeek) status = "current";
    else if (done) status = "done";
    else status = "todo";

    let flag: string | undefined;
    if (done && showcase) {
      const buildQuest = quests.build;
      const completions = questList.map((q) => progressDocs[q.id]?.completedAt).filter((x): x is number => Boolean(x));
      const latest = completions.length > 0 ? Math.max(...completions) : undefined;
      const dateStr = latest ? new Date(latest).toLocaleDateString(undefined, { month: "long", day: "numeric" }) : undefined;
      flag = buildQuest ? (dateStr ? `${buildQuest.title}, ${dateStr}` : buildQuest.title) : undefined;
    }

    weeks.push({ week, status, showcase, flag });
  }
  return weeks;
}

/**
 * The sprint's Maker's Log material for lib/domain/talkOutline.ts's talkOutline (Plan 3 Task
 * 3): for every week in the sprint that closes at `showcaseWeek`, the build track's own log
 * step (the only step with variant "maker" -- see lib/domain/badges.ts's own makerLogs, which
 * filters the same way), resolved to its LATEST log on record for that quest, the same
 * "latest, not every resubmit" rule buildCompletedEntries (app/explorer/portfolio/page.tsx)
 * already applies. `logs` is expected sorted newest-first, the order watchLogs already
 * delivers, so the first match per quest is already the latest one.
 */
function buildSprintLogs(
  seasonId: number,
  showcaseWeek: number,
  logs: Array<{ id: string; log: LogDoc }>,
): MakerLogInput[] {
  const [start, end] = sprintRangeForShowcaseWeek(showcaseWeek);
  const result: MakerLogInput[] = [];
  for (let week = start; week <= end; week++) {
    const build = getWeek(seasonId, week).build;
    if (!build) continue;
    const logStep = build.steps.find((s) => s.kind === "log");
    if (logStep?.variant !== "maker") continue;
    const latest = logs.find((l) => l.log.questId === build.id);
    if (!latest || latest.log.answers.length !== 5) continue;
    result.push({
      week,
      questTitle: build.title,
      answers: latest.log.answers as [string, string, string, string, string],
      at: latest.log.at,
    });
  }
  return result;
}

function findMonster(seasonId: number, week: number): MonsterCardData | undefined {
  const think = getWeek(seasonId, week).think;
  const step = think?.steps.find((s) => s.kind === "problem-set" && s.lane === "monster");
  if (!step || step.kind !== "problem-set") return undefined;
  const problem = step.problems[0];
  if (!problem) return undefined;
  return { weekLabel: `Week ${week}`, title: step.title, prompt: problem.prompt };
}

export default function ExplorerPage() {
  return <RequireProfile kind="explorer">{(profile) => <ExplorerWithHousehold profile={profile} />}</RequireProfile>;
}

function ExplorerWithHousehold({ profile }: { profile: Profile }) {
  const { householdId } = useSession();
  // Invariant: session.tsx never sets status "ready" without a householdId, so this should
  // never actually render null -- kept as a type-narrowing guard, not a real-world fallback.
  if (!householdId) return null;

  // A fresh ExplorerHome instance per profile+household (the key), so its own once-at-mount
  // state (the "now" snapshot, the localStorage-hydrated displayedWeek) is always initialized
  // against the right profile, with no separate hydration effect needed: switching profiles
  // navigates away and back through the picker, which unmounts this tree entirely.
  return <ExplorerHome key={`${householdId}:${profile.id}`} profile={profile} householdId={householdId} />;
}

function ExplorerHome({ profile, householdId }: { profile: Profile; householdId: string }) {
  const content = useMemo(() => getContent(), []);
  const seasonId = profile.seasonId;

  // A single impure read, made once at this component's first render (React's sanctioned
  // escape hatch for exactly this: see useState's lazy-initializer form) -- not on every
  // render, which is what the "no impure calls during render" rule actually guards against.
  const [now] = useState(() => Date.now());
  const currentWeek = useMemo(
    () => currentWeekFor(profile.startDate, content.calendar.seasonStart, now, profile.pausedAt),
    [profile.startDate, profile.pausedAt, content, now],
  );

  const [displayedWeek, setDisplayedWeek] = useState<number>(() => readStoredWeek(profile.id) ?? currentWeek);

  const pickWeek = useCallback(
    (week: number) => {
      setDisplayedWeek(week);
      writeStoredWeek(profile.id, week);
    },
    [profile.id],
  );

  const [progressDocs, setProgressDocs] = useState<Record<string, ProgressDoc>>({});
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [logs, setLogs] = useState<Array<{ id: string; log: LogDoc }>>([]);
  const [gamePlays, setGamePlays] = useState<Record<string, GamePlayDoc>>({});

  useEffect(() => {
    const unsubProgress = watchProgress(householdId, profile.id, (list) => {
      setProgressDocs(Object.fromEntries(list.map((p) => [p.questId, p.progress])));
    });
    const unsubReview = watchReviewQueue(householdId, profile.id, setReviewQueue);
    // Only the Showcase weeks read `logs` at all (the talk outline below); watched unconditionally
    // here anyway, the same "no separate gate on a subscription" shape watchProgress/watchReviewQueue
    // already use, since the picker can jump to a Showcase week at any moment.
    const unsubLogs = watchLogs(householdId, profile.id, setLogs);
    const unsubGames = watchGamePlays(householdId, profile.id, setGamePlays);
    return () => {
      unsubProgress();
      unsubReview();
      unsubLogs();
      unsubGames();
    };
  }, [householdId, profile.id]);

  const weekQuests = useMemo(
    () => questsForProfile(getWeek(seasonId, displayedWeek), profile),
    [seasonId, displayedWeek, profile],
  );
  const trailWeeks = useMemo(
    () => buildTrailWeeks(seasonId, currentWeek, progressDocs, profile),
    [seasonId, currentWeek, progressDocs, profile],
  );
  const monster = useMemo(() => findMonster(seasonId, displayedWeek), [seasonId, displayedWeek]);
  const book = useMemo(() => getSeasonBook(content, seasonId), [content, seasonId]);
  // The game of the sprint (7 September 2026): content picks it by season and sprint; the family
  // marks it played once, and the card says so from then on.
  const game = useMemo(() => {
    const g = getGameForWeek(content, seasonId, displayedWeek);
    if (!g) return undefined;
    return { id: g.id, sprint: g.sprint, name: g.name, players: g.players, minutes: g.minutes, teaches: g.teaches, rules: g.rules, notice: g.notice, playedAt: gamePlays[g.id]?.playedAt };
  }, [content, seasonId, displayedWeek, gamePlays]);
  const onGamePlayed = useCallback((gameId: string) => {
    void markGamePlayed(householdId, profile.id, gameId, Date.now()).catch(() => undefined);
  }, [householdId, profile.id]);
  const isShowcaseWeek = (SHOWCASE_WEEKS as readonly number[]).includes(displayedWeek);
  const outline = useMemo(() => {
    if (!isShowcaseWeek) return undefined;
    const sprintLogs = buildSprintLogs(seasonId, displayedWeek, logs);
    return talkOutline({ logs: sprintLogs, showcaseWeek: displayedWeek, now });
  }, [isShowcaseWeek, seasonId, displayedWeek, logs, now]);

  const hrefFor = useCallback((questId: string) => `/explorer/quest/${questId}`, []);

  return (
    <div className="flex flex-col flex-1">
      <Header
        userName={profile.name}
        initials={profileInitials(profile.name)}
        rightSlot={
          <>
            <ExplorerNav current="week" />
            <SwitchProfileButton />
          </>
        }
      />
      <main className="mx-auto w-full max-w-[1080px] px-4 py-6 sm:px-6">
        <Card tone="surface" shadow className="!p-0 tr-this-week">
          <WeekHeader
            seasonId={seasonId}
            currentWeek={currentWeek}
            displayedWeek={displayedWeek}
            trailWeeks={trailWeeks}
            onPickWeek={pickWeek}
            hasPlay={Boolean(weekQuests.play)}
          />
          {outline ? <TalkOutlineCard outline={outline} /> : null}
          <TrackCards quests={weekQuests} progressDocs={progressDocs} hrefFor={hrefFor} />
          <SideStrip game={game} onGamePlayed={onGamePlayed} monster={monster} book={book} reviewQueue={reviewQueue} now={now} />
        </Card>
      </main>
    </div>
  );
}
