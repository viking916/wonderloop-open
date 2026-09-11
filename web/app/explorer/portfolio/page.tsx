"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Header } from "@/components/ui/Header";
import { RequireProfile } from "@/components/RequireProfile";
import { SwitchProfileButton } from "@/components/SwitchProfileButton";
import { ExplorerNav } from "@/components/explorer/ExplorerNav";
import { BadgeCelebration } from "@/components/portfolio/BadgeCelebration";
import { JournalSpread } from "@/components/portfolio/JournalSpread";
import { PatchSash } from "@/components/portfolio/PatchSash";
import { getQuest, getContent } from "@/lib/content/app-content";
import { problemsOf } from "@/lib/content/lookup";
import type { Quest } from "@/lib/content/schema";
import { emptyQuestProgress, isStepComplete } from "@/lib/domain/completion";
import { earnedBadges, newlyEarned, type Badge, type BadgeProgress, type QuestCompletion } from "@/lib/domain/badges";
import { ideaEventsFromProgress, type IdeaEvent } from "@/lib/domain/ideas";
import { REVIEW_QUEST_ID } from "@/lib/domain/review";
import { watchArtifacts } from "@/lib/data/artifacts";
import { watchLogs } from "@/lib/data/logs";
import { watchParentActivities } from "@/lib/data/parentActivities";
import { watchAllAttempts, watchProgress } from "@/lib/data/progress";
import type { ArtifactDoc, AttemptDoc, LogDoc, ProgressDoc } from "@/lib/data/types";
import { profileInitials, useSession, type Profile } from "@/lib/session";

export default function PortfolioPage() {
  return <RequireProfile kind="explorer">{(profile) => <PortfolioWithHousehold profile={profile} />}</RequireProfile>;
}

function PortfolioWithHousehold({ profile }: { profile: Profile }) {
  const { householdId } = useSession();
  // Invariant: session.tsx never sets status "ready" without a householdId -- a
  // type-narrowing guard, not a real-world fallback (matches app/explorer/page.tsx).
  if (!householdId) return null;
  return <PortfolioHome key={`${householdId}:${profile.id}`} profile={profile} householdId={householdId} />;
}

type CompletedEntry = {
  questId: string;
  quest: Quest;
  progress: ProgressDoc;
  artifact?: { id: string; artifact: ArtifactDoc };
  log?: { id: string; log: LogDoc };
};

/**
 * Every done quest, resolved to its content and its latest artifact/log, newest completion
 * first. "Latest" (not "only") artifact/log per quest: a resubmit keeps history (spec 7.2), and
 * the journal always shows what is current.
 */
function buildCompletedEntries(
  progressList: Array<{ questId: string; progress: ProgressDoc }>,
  artifacts: Array<{ id: string; artifact: ArtifactDoc }>,
  logs: Array<{ id: string; log: LogDoc }>,
): CompletedEntry[] {
  const entries: CompletedEntry[] = [];
  for (const { questId, progress } of progressList) {
    if (progress.status !== "done") continue;
    const quest = getQuest(questId);
    if (!quest) continue;
    const artifact = artifacts.filter((a) => a.artifact.questId === questId).sort((a, b) => b.artifact.at - a.artifact.at)[0];
    const log = logs.filter((l) => l.log.questId === questId).sort((a, b) => b.log.at - a.log.at)[0];
    entries.push({ questId, quest, progress, artifact, log });
  }
  return entries.sort((a, b) => (b.progress.completedAt ?? 0) - (a.progress.completedAt ?? 0));
}

/**
 * Maps this profile's raw progress and logs to lib/domain/badges.ts's BadgeProgress -- the
 * wiring layer buildTrailWeeks (app/explorer/page.tsx) is the precedent for: a page-local pure
 * function over already-fetched Firestore data, content-resolved through getQuest, so
 * earnedBadges itself (the actual badge decision) never has to know Firestore's document shape.
 *
 * Two facts have no finer-grained timestamp anywhere in the data model than the quest's own
 * completedAt/startedAt: a debate step's own completion time, and a task step's own tick time
 * (lib/domain/completion.ts's StepProgress carries no "at" at all). Both fall back to the
 * quest's completedAt (or startedAt, for a still-in-progress quest whose sub-step is done
 * anyway) rather than inventing a more precise number.
 */
function buildBadgeProgress(
  progressList: Array<{ questId: string; progress: ProgressDoc }>,
  logs: Array<{ id: string; log: LogDoc }>,
  attempts: Array<{ id: string; attempt: AttemptDoc }>,
  parentActivities: Array<{ id: string; entry: { skillId: string; note: string; at: number } }>,
): BadgeProgress {
  const buildQuestsDone: QuestCompletion[] = [];
  const showcaseCompletions: QuestCompletion[] = [];
  const textProofSubmissions: { at: number }[] = [];
  const debatesCompleted: { at: number }[] = [];
  const bigBrotherTicks: { at: number }[] = [];
  const ownWordsExplains: { text: string; at: number }[] = [];

  for (const { questId, progress } of progressList) {
    const quest = getQuest(questId);
    if (!quest) continue;
    const at = progress.completedAt ?? progress.startedAt ?? 0;
    // A progress doc written by something other than buildProgressDoc (a merge-only write
    // that only ever touched `problems`, e.g. a "just opened this problem" write with no
    // `quest`/`status` of its own yet) can exist with no `quest` field at all, even though
    // ProgressDoc's type says it is always present. Every read below goes through this
    // fallback instead of `progress.quest` directly, so a doc in that shape is read as "no
    // step progress yet" rather than crashing the whole portfolio.
    const questProgress = progress.quest ?? emptyQuestProgress();

    if (progress.status === "done") {
      if (quest.track === "build") buildQuestsDone.push({ track: "build", week: quest.week, at });
      if (quest.showcase) showcaseCompletions.push({ track: quest.track, week: quest.week, at });
    }

    // First Proof: a text-kind ("proof", never auto-graded) problem attempted -- its outcome
    // is "revealed" the moment it is submitted (lib/domain/attempts.ts) -- together with this
    // quest's own explain-it step having a submission on record.
    const textProblems = quest.steps.flatMap(problemsOf).filter((p) => p.kind === "text");
    const hasTextSubmission = textProblems.some((p) => (questProgress.problemOutcomes[p.id] ?? "unanswered") !== "unanswered");
    const hasExplainSubmission = quest.steps.some((s) => s.kind === "explain" && isStepComplete(s, questProgress));
    if (hasTextSubmission && hasExplainSubmission) textProofSubmissions.push({ at });

    // Own Words: an explain step finished that carries no problemId at all -- a free-form
    // reflection, never an answer to a specific problem (that is textProofSubmissions' job,
    // just above). `text` comes straight from QuestProgress.explains, the same field
    // ExplainStep.tsx saves the textarea into, so earnedBadges can hold it to its own length
    // floor rather than trusting completion alone.
    for (const s of quest.steps) {
      if (s.kind === "explain" && !s.problemId && isStepComplete(s, questProgress)) {
        ownWordsExplains.push({ text: questProgress.explains[s.id]?.text ?? "", at });
      }
    }

    // Debate: QuestProgress.debates already holds the ids of completed debate steps.
    if (quest.steps.some((s) => s.kind === "debate" && questProgress.debates.includes(s.id))) {
      debatesCompleted.push({ at });
    }

    // Big Brother: the "Big Brother quest" task step in weeks 4, 8, 12's Speak quests.
    const bigBrotherStep = quest.steps.find((s) => s.kind === "task" && s.title === "Big Brother quest");
    if (bigBrotherStep && isStepComplete(bigBrotherStep, questProgress)) bigBrotherTicks.push({ at });
  }

  const makerLogs = logs
    .map(({ log }) => {
      const quest = getQuest(log.questId);
      const step = quest?.steps.find((s) => s.kind === "log");
      if (step?.variant !== "maker") return undefined;
      return { whatWentWrong: log.answers[2] ?? "", howFixed: log.answers[3] ?? "", at: log.at };
    })
    .filter((x): x is { whatWentWrong: string; howFixed: string; at: number } => Boolean(x));

  // Idea Spotter: every idea tag on every attempt, across every quest -- the same raw event
  // lib/domain/ideas.ts's idea box already reduces, so an idea met in a second, different
  // problem is visible here too, not just in the idea box.
  const ideaEvents: IdeaEvent[] = [
    ...attempts.flatMap(({ attempt }) => attempt.ideaIds.map((ideaId) => ({ ideaId, problemId: attempt.problemId, at: attempt.at }))),
    ...ideaEventsFromProgress(getContent().quests, progressList),
  ];

  // Comeback: a mistake-box variant (recorded under REVIEW_QUEST_ID, never a real quest id --
  // see lib/domain/review.ts) answered correctly on its first try back.
  const reviewSuccesses = attempts
    .filter(({ attempt }) => attempt.questId === REVIEW_QUEST_ID && attempt.tryNumber === 1 && attempt.correct)
    .map(({ attempt }) => ({ at: attempt.at }));

  // Pass It On: every parent-entered skill note on record (lib/data/parentActivities.ts).
  const parentSkillNotes = parentActivities.map(({ entry }) => ({ at: entry.at }));

  return {
    buildQuestsDone,
    showcaseCompletions,
    textProofSubmissions,
    debatesCompleted,
    bigBrotherTicks,
    makerLogs,
    ownWordsExplains,
    ideaEvents,
    reviewSuccesses,
    parentSkillNotes,
  };
}

/** Plan 4 task 35: one localStorage key per profile, holding the badge ids this profile has
 * already been shown a celebration for. Never Firestore -- this is a purely cosmetic "have I
 * shown this before" flag, not a fact about the child worth syncing across devices, and keeping
 * it local avoids adding a new persisted data source for something this low-stakes. */
function badgesSeenKey(profileId: string): string {
  return `wonderloop:badges-seen:${profileId}`;
}

function PortfolioHome({ profile, householdId }: { profile: Profile; householdId: string }) {
  const [progressList, setProgressList] = useState<Array<{ questId: string; progress: ProgressDoc }>>([]);
  const [artifacts, setArtifacts] = useState<Array<{ id: string; artifact: ArtifactDoc }>>([]);
  const [logs, setLogs] = useState<Array<{ id: string; log: LogDoc }>>([]);
  const [attempts, setAttempts] = useState<Array<{ id: string; attempt: AttemptDoc }>>([]);
  const [parentActivities, setParentActivities] = useState<Array<{ id: string; entry: { skillId: string; note: string; at: number } }>>([]);
  // Plan 4 task 35: which of the five watchers below have delivered at least one real snapshot.
  // The badge celebration effect waits for all five before it ever judges "newly earned" --
  // buildBadgeProgress reads every one of these lists, so judging off a still-empty subset would
  // read a genuinely already-earned badge (whichever list had not arrived yet) as brand new.
  const [loaded, setLoaded] = useState({ progress: false, artifacts: false, logs: false, attempts: false, parentActivities: false });
  const allLoaded = Object.values(loaded).every(Boolean);

  useEffect(() => {
    const unsubProgress = watchProgress(householdId, profile.id, (list) => {
      setProgressList(list);
      setLoaded((prev) => (prev.progress ? prev : { ...prev, progress: true }));
    });
    const unsubArtifacts = watchArtifacts(householdId, profile.id, (list) => {
      setArtifacts(list);
      setLoaded((prev) => (prev.artifacts ? prev : { ...prev, artifacts: true }));
    });
    const unsubLogs = watchLogs(householdId, profile.id, (list) => {
      setLogs(list);
      setLoaded((prev) => (prev.logs ? prev : { ...prev, logs: true }));
    });
    const unsubAttempts = watchAllAttempts(householdId, profile.id, (list) => {
      setAttempts(list);
      setLoaded((prev) => (prev.attempts ? prev : { ...prev, attempts: true }));
    });
    const unsubParentActivities = watchParentActivities(householdId, profile.id, (list) => {
      setParentActivities(list);
      setLoaded((prev) => (prev.parentActivities ? prev : { ...prev, parentActivities: true }));
    });
    return () => {
      unsubProgress();
      unsubArtifacts();
      unsubLogs();
      unsubAttempts();
      unsubParentActivities();
    };
  }, [householdId, profile.id]);

  const entries = useMemo(() => buildCompletedEntries(progressList, artifacts, logs), [progressList, artifacts, logs]);
  const badgeProgress = useMemo(
    () => buildBadgeProgress(progressList, logs, attempts, parentActivities),
    [progressList, logs, attempts, parentActivities],
  );
  const earned = useMemo(() => earnedBadges(badgeProgress), [badgeProgress]);
  const earnedIdsKey = useMemo(() => earned.map((b) => b.id).join(","), [earned]);

  // Plan 4 task 35: the celebration itself. Waits for allLoaded (see above) so it never judges
  // "newly earned" off an incomplete picture. The FIRST time this profile's portfolio has ever
  // loaded this feature (localStorage has no entry at all yet), today's already-earned badges
  // become the baseline with nothing celebrated -- they did not just happen, this code just
  // started watching. Every load after that, anything in `earned` missing from the stored set is
  // genuinely new since last time, gets shown once, and is folded into the stored set right away
  // so leaving without dismissing never re-shows it on the next visit.
  const [celebrating, setCelebrating] = useState<Badge[]>([]);
  useEffect(() => {
    if (!allLoaded) return;
    const key = badgesSeenKey(profile.id);
    let stored: string | null;
    try {
      stored = window.localStorage.getItem(key);
    } catch {
      return; // localStorage unavailable (private mode, etc.): never celebrate off a guess
    }
    if (stored === null) {
      try {
        window.localStorage.setItem(key, JSON.stringify(earned.map((b) => b.id)));
      } catch {
        /* best-effort only; nothing to celebrate off of this load either way */
      }
      return;
    }
    let seenIds: string[] = [];
    try {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) seenIds = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      seenIds = [];
    }
    const fresh = newlyEarned(earned, seenIds);
    if (fresh.length === 0) return;
    // Synchronous, not deferred to a callback: `fresh` is already fully computed above from
    // state already held (earned) plus a synchronous localStorage read, the same "no async
    // boundary" shape ActivityPlayer.tsx's own react-hooks/set-state-in-effect precedent covers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCelebrating(fresh);
    try {
      window.localStorage.setItem(key, JSON.stringify(earned.map((b) => b.id)));
    } catch {
      /* best-effort only */
    }
    // Deliberately scoped to the actual set of earned ids, not `earned`'s own array identity
    // (a fresh Firestore snapshot for something badges never read, e.g. a new artifact, still
    // creates a new array reference) and not `profile.id` (a key change already remounts this
    // whole component via PortfolioWithHousehold's own `key={...}`, so a stale profile.id here
    // is not a real risk).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLoaded, earnedIdsKey]);

  const weeks = useMemo(() => [...new Set(entries.map((e) => e.quest.week))].sort((a, b) => a - b), [entries]);
  const [weekFilter, setWeekFilter] = useState<number | "all">("all");
  const shown = weekFilter === "all" ? entries : entries.filter((e) => e.quest.week === weekFilter);

  return (
    <div className="flex flex-col flex-1">
      <Header
        userName={profile.name}
        initials={profileInitials(profile.name)}
        rightSlot={
          <>
            <ExplorerNav current="portfolio" />
            <SwitchProfileButton />
          </>
        }
      />
      <main className="mx-auto w-full max-w-[1080px] px-4 py-6 sm:px-6">
        <BadgeCelebration badges={celebrating} onDismiss={() => setCelebrating([])} />
        <Card tone="surface" shadow className="!p-0 tr-portfolio">
          <div className="tr-journal">
            {entries.length > 0 ? (
              <div className="tr-week-filter">
                <label htmlFor="portfolio-week-filter">Week</label>
                <select
                  id="portfolio-week-filter"
                  value={weekFilter}
                  onChange={(e) => setWeekFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                >
                  <option value="all">All weeks</option>
                  {weeks.map((w) => (
                    <option key={w} value={w}>
                      Week {w}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {entries.length === 0 ? (
              <EmptyState
                title="Nothing in the journal yet"
                description="Finish a quest's artifact and Maker's Log, or every Think problem, and it shows up here."
              />
            ) : (
              shown.map((entry) => {
                const explainEntries = explainEntriesFor(entry);
                const dataEntries = dataEntriesFor(entry);
                return (
                  <JournalSpread
                    key={entry.questId}
                    quest={entry.quest}
                    completedAt={entry.progress.completedAt}
                    artifact={entry.artifact}
                    log={entry.log}
                    explainEntries={explainEntries}
                    dataEntries={dataEntries}
                    recordingOnPhone={recordingOnPhoneFor(entry)}
                  />
                );
              })
            )}
          </div>
          <PatchSash progress={badgeProgress} />
        </Card>
      </main>
    </div>
  );
}

/**
 * True when this quest's artifact step was finished by marking the recording made
 * (components/quest/ArtifactStep.tsx): the recording is on the family's phone, so there is no
 * artifact doc and no file to show. Read straight from the same QuestProgress.artifacts entry
 * that completed the step, so the spread can say what actually happened instead of the
 * "No artifact recorded for this quest" fallback.
 */
function recordingOnPhoneFor(entry: CompletedEntry): boolean {
  const questProgress = entry.progress.quest ?? emptyQuestProgress();
  return entry.quest.steps.some(
    (s) => s.kind === "artifact" && (questProgress.artifacts[s.id] ?? []).includes("recording"),
  );
}

/** Think quests have no artifact step: fall back to their written explain-it submissions. */
function explainEntriesFor(entry: CompletedEntry): { title: string; text: string }[] {
  const hasArtifactStep = entry.quest.steps.some((s) => s.kind === "artifact");
  if (hasArtifactStep) return [];
  const explains = entry.progress.quest?.explains ?? {};
  return entry.quest.steps
    .filter((s) => s.kind === "explain")
    .map((s) => ({ title: s.title, text: explains[s.id]?.text ?? "" }))
    .filter((e) => e.text.trim().length > 0);
}

/** A data step's table and the sentence answered from it, for the journal page beside the
 * artifact: the question, then the answer, then the rows as "label: values". */
function dataEntriesFor(entry: CompletedEntry): { title: string; text: string }[] {
  const data = entry.progress.quest?.data ?? {};
  return entry.quest.steps
    .filter((s) => s.kind === "data")
    .map((s) => {
      const d = data[s.id];
      if (!d || !d.answer.trim()) return { title: s.title, text: "" };
      const rows = d.rows.map((r) => r.cells).filter((r) => r[0]?.trim()).map((r) => `${r[0]}: ${r.slice(1).join(", ")}`).join("; ");
      return { title: s.title, text: `${s.question} ${d.answer.trim()} (${rows})` };
    })
    .filter((e) => e.text.trim().length > 0);
}
