"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Header } from "@/components/ui/Header";
import { RequireProfile } from "@/components/RequireProfile";
import { SwitchProfileButton } from "@/components/SwitchProfileButton";
import { KidCard } from "@/components/parent/KidCard";
import { WeekPlan } from "@/components/parent/WeekPlan";
import { LadderCard } from "@/components/parent/LadderCard";
import { MistakeBox, type FastFailFlag } from "@/components/parent/MistakeBox";
import { LogList, type ExplainItItem } from "@/components/parent/LogList";
import { WeeklyParagraph } from "@/components/parent/WeeklyParagraph";
import { CalibrationCard } from "@/components/skills/CalibrationCard";
import { SproutCard } from "@/components/parent/SproutCard";
import { SeasonIndex } from "@/components/parent/SeasonIndex";
import { ResetControls } from "@/components/parent/ResetControls";
import { QuestResets } from "@/components/parent/QuestResets";
import { InviteCard } from "@/components/parent/InviteCard";
import { ParentActivities } from "@/components/parent/ParentActivities";
import { ParentPinGate } from "@/components/parent/ParentPinGate";
import { PinSettings } from "@/components/parent/PinSettings";
import { DeviceCheck } from "@/components/parent/DeviceCheck";
import { ProfileManager } from "@/components/parent/ProfileManager";
import { SeasonShoppingList } from "@/components/parent/SeasonShoppingList";
import { AiKeyCard } from "@/components/parent/AiKeyCard";
import { getContent, getProblem, getSproutWeek, getWeek } from "@/lib/content/app-content";
import { TRACK_LABEL, TRACK_ORDER, type Quest, type Track } from "@/lib/content/schema";
import { questsForProfile, tracksForProfile, type TrackChoice } from "@/lib/domain/tracks";
import { currentWeekFromDone, calendarWeekRange } from "@/lib/domain/calendar";
import { emptyQuestProgress, questStatus } from "@/lib/domain/completion";
import { viewProblem } from "@/lib/domain/attempts";
import { trackCardModel } from "@/lib/domain/trackCard";
import { ideaEventsFromProgress, metIdeas, type IdeaEvent } from "@/lib/domain/ideas";
import { starsForWeek } from "@/lib/domain/sprout";
import type { ReviewItem } from "@/lib/domain/review";
import { weeklySummary, type WeeklyAttemptInput, type WeeklyQuestInput } from "@/lib/domain/weeklySummary";
import { watchHousehold } from "@/lib/data/households";
import { watchLogs } from "@/lib/data/logs";
import { watchDebates } from "@/lib/data/debates";
import { DebateList } from "@/components/parent/DebateList";
import { watchTutorChats } from "@/lib/data/tutor";
import { AskTranscripts } from "@/components/parent/AskTranscripts";
import { watchParentActivities } from "@/lib/data/parentActivities";
import { watchResets } from "@/lib/data/resets";
import {
  doneActivityIds,
  toProblemState,
  watchAllAttempts,
  watchProgress,
  watchReviewQueue,
  watchScreenTime,
  watchScreenTimeToday,
} from "@/lib/data/progress";
import { watchAllWorkings } from "@/lib/data/workings";
import { hasWorkingContent } from "@/lib/domain/workings";
import type { WorkingItem } from "@/components/parent/LogList";
import type { AttemptDoc, DebateDoc, HouseholdDoc, LogDoc, ProgressDoc, ResetDoc, TutorChatDoc, WorkingDoc } from "@/lib/data/types";
import type { ResetRecord } from "@/lib/domain/resets";
import { profileInitials, useSession, type Profile } from "@/lib/session";

/** Parent view (spec 7.1 screen 8, task 13; restructured into a title area and tabs 15 September
 * 2026, owner: "the UI looks amateurish", plus a request for a season index): both children's
 * progress, the Sprout card, the mistake box, the idea box, logs with a parent comment, reset
 * controls, the invite card, and parent-entered activities. Guarded the same way every
 * profile-scoped route is (RequireProfile), but unlike the child screens it renders every OTHER
 * profile in the household, not the active one -- the active "parent" profile itself has no
 * quest data of its own to show.
 */
export default function ParentPage() {
  return <RequireProfile kind="parent">{(profile) => <ParentWithHousehold profile={profile} />}</RequireProfile>;
}

function ParentWithHousehold({ profile }: { profile: Profile }) {
  const { householdId, profiles } = useSession();
  // Invariant: session.tsx never sets status "ready" without a householdId (see the same
  // pattern in app/explorer/page.tsx).
  if (!householdId) return null;
  // Task 9 feature 1: everything below this gate is the actual parent view; ParentPinGate
  // decides whether to show it yet. Keyed on householdId so its own "have we decided a phase
  // yet" state resets if the signed-in household ever changes underneath it.
  return (
    <ParentPinGate key={householdId} householdId={householdId}>
      <ParentHome key={`${householdId}:${profile.id}`} profile={profile} householdId={householdId} profiles={profiles} />
    </ParentPinGate>
  );
}

// ---------------------------------------------------------------------------
// Title area, child switcher, and the tab bar
// ---------------------------------------------------------------------------

type TabId = "week" | "plan" | "review" | "shopping" | "settings";

// `short` is what shows below 640px (styleguide 2: nothing truncated mid-word) -- "This week" and
// "Season plan" and "To review" were cut mid-word by the tab bar's own horizontal scroll at
// 390px, and "Shopping" alone did not fit either once its neighbours claimed the width; `label`
// stays the full name for wider screens and for the tab's aria-label at every width, so a screen
// reader always hears the same full name regardless of which text is visually shown.
const TABS: { id: TabId; label: string; short: string }[] = [
  { id: "week", label: "This week", short: "Week" },
  { id: "plan", label: "Season plan", short: "Plan" },
  { id: "review", label: "To review", short: "Review" },
  { id: "shopping", label: "Shopping", short: "Shopping" },
  { id: "settings", label: "Settings", short: "Settings" },
];

function tabFromHash(hash: string): TabId | undefined {
  const id = hash.replace(/^#/, "");
  return TABS.some((t) => t.id === id) ? (id as TabId) : undefined;
}

/** The tab bar: a role="tablist" of real buttons (never links styled as tabs), current tab
 * reflected in the URL hash so a reload keeps it (ParentHome owns the hash sync). Arrow/Home/End
 * move focus AND activate the tab they land on, the common "automatic activation" tabs pattern. */
function TabBar({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  const refs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  const go = useCallback(
    (id: TabId) => {
      onChange(id);
      refs.current[id]?.focus();
    },
    [onChange],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, id: TabId) => {
      const i = TABS.findIndex((t) => t.id === id);
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(TABS[(i + 1) % TABS.length].id);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(TABS[(i - 1 + TABS.length) % TABS.length].id);
      } else if (e.key === "Home") {
        e.preventDefault();
        go(TABS[0].id);
      } else if (e.key === "End") {
        e.preventDefault();
        go(TABS[TABS.length - 1].id);
      }
    },
    [go],
  );

  return (
    <div className="pr-tabbar" role="tablist" aria-label="Parent view sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          ref={(el) => {
            refs.current[tab.id] = el;
          }}
          type="button"
          role="tab"
          id={`pr-tab-${tab.id}`}
          aria-selected={active === tab.id}
          aria-controls={`pr-panel-${tab.id}`}
          aria-label={tab.label}
          tabIndex={active === tab.id ? 0 : -1}
          className={active === tab.id ? "pr-tab pr-tab--on" : "pr-tab"}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => onKeyDown(e, tab.id)}
        >
          <span className="pr-tab__full" aria-hidden="true">
            {tab.label}
          </span>
          <span className="pr-tab__short" aria-hidden="true">
            {tab.short}
          </span>
        </button>
      ))}
    </div>
  );
}

/** The child switcher: only shown with more than one child (task brief). Real buttons,
 * aria-pressed, a segmented control -- never styled to look like a primary or secondary button
 * (this decides which child the child-scoped tabs show, it does not submit anything). */
function ChildSwitcher({ kids, selectedId, onSelect }: { kids: Profile[]; selectedId: string | undefined; onSelect: (id: string) => void }) {
  return (
    <div className="pr-child-switch" role="group" aria-label="Which child">
      {kids.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-pressed={c.id === selectedId}
          className={c.id === selectedId ? "pr-child-switch__btn pr-child-switch__btn--on" : "pr-child-switch__btn"}
          onClick={() => onSelect(c.id)}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}

function ParentHome({ profile, householdId, profiles }: { profile: Profile; householdId: string; profiles: Profile[] }) {
  const [household, setHousehold] = useState<HouseholdDoc | undefined>(undefined);
  useEffect(() => watchHousehold(householdId, setHousehold), [householdId]);

  const children = profiles.filter((p) => p.kind === "explorer" || p.kind === "sprout");

  const content = useMemo(() => getContent(), []);

  // Every child's own completion-derived current week (owner decision, 13 September 2026),
  // reported up by whichever child section actually computes it (ExplorerChildSection,
  // SproutChildSection below) so it is derived in exactly one place per profile and every other
  // reader of "this profile's current week" -- the shopping list here, ProfileManager's profile
  // row, ResetControls for the selected child -- agrees with what that child's own section shows.
  // The functional updater bails out (returns the same object) when the reported week has not
  // actually changed, so a child reporting the same week again never forces an extra render.
  const [weekByProfileId, setWeekByProfileId] = useState<Record<string, number>>({});
  const reportWeek = useCallback((profileId: string, week: number) => {
    setWeekByProfileId((prev) => (prev[profileId] === week ? prev : { ...prev, [profileId]: week }));
  }, []);

  // Task 14: the season shopping list is household-wide, not per child (the gear and the book
  // are shared), so it needs exactly one "how urgent is this" reference point rather than one
  // per child. The first Explorer profile's own season and current week stand in for the
  // household's -- Sprout carries no materials of its own (content/materials.json and the
  // season book are both Explorer-track concerns), and this app has never supported more than
  // one Explorer profile per household.
  const shoppingProfile = profiles.find((p) => p.kind === "explorer");
  const shoppingWeek = shoppingProfile ? weekByProfileId[shoppingProfile.id] : undefined;

  // The tab bar (15 September 2026 restructure): current tab reflected in the URL hash so a
  // reload keeps it. Read once, in the initializer (never in an effect -- setting state
  // synchronously inside an effect body just to seed it from something already known at first
  // render triggers a needless second render), then kept in sync on every change via
  // history.replaceState, which updates the address bar without adding a back-button entry for
  // every tab click.
  const [activeTab, setActiveTab] = useState<TabId>(() => (typeof window === "undefined" ? "week" : (tabFromHash(window.location.hash) ?? "week")));
  const changeTab = useCallback((id: TabId) => {
    setActiveTab(id);
    window.history.replaceState(null, "", `#${id}`);
  }, []);

  // The child switcher (only shown with more than one child): decides which child the
  // child-scoped tabs (This week, Season plan, To review, and Settings' Resets) show. Falls back
  // to the first child so a household with exactly one child, or a stale selection after a child
  // is removed, always has someone selected.
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(undefined);
  const selectedChild = children.find((c) => c.id === selectedChildId) ?? children[0];
  const selectedChildWeek = selectedChild ? weekByProfileId[selectedChild.id] : undefined;

  return (
    <div className="flex flex-col flex-1">
      <Header userName={profile.name} initials={profileInitials(profile.name)} rightSlot={<SwitchProfileButton />} />
      <main className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 pr-page">
        <div className="pr-titlearea">
          <h1 className="tr-page-title">Parent view</h1>
          <p className="tr-meta pr-titlearea__household">{household ? household.name : "Loading household"}</p>
        </div>

        {children.length > 1 ? <ChildSwitcher kids={children} selectedId={selectedChild?.id} onSelect={setSelectedChildId} /> : null}

        <TabBar active={activeTab} onChange={changeTab} />

        <div role="tabpanel" id={`pr-panel-${activeTab}`} aria-labelledby={`pr-tab-${activeTab}`} className="pr-tabpanel">
          {children.length === 0 ? (
            <EmptyState title="No children yet" description="An Explorer or Sprout profile has not been added to this household." />
          ) : (
            children.map((child) =>
              child.kind === "explorer" ? (
                <ExplorerChildSection
                  key={child.id}
                  profile={child}
                  householdId={householdId}
                  onWeekComputed={(week) => reportWeek(child.id, week)}
                  activeTab={activeTab}
                  isSelected={child.id === selectedChild?.id}
                />
              ) : (
                <SproutChildSection
                  key={child.id}
                  profile={child}
                  householdId={householdId}
                  onWeekComputed={(week) => reportWeek(child.id, week)}
                  activeTab={activeTab}
                  isSelected={child.id === selectedChild?.id}
                />
              ),
            )
          )}

          {activeTab === "shopping" ? (
            shoppingProfile && shoppingWeek ? (
              <SeasonShoppingList
                householdId={householdId}
                household={household}
                seasonId={shoppingProfile.seasonId}
                currentWeek={shoppingWeek}
                seasonIds={Object.keys(content.materials).map(Number).sort((a, b) => a - b)}
              />
            ) : (
              <EmptyState title="Loading the shopping list" description="Waiting for a child's current week." />
            )
          ) : null}

          {activeTab === "settings" ? (
            <>
              {household ? (
                <InviteCard householdName={household.name} inviteCode={household.inviteCode} />
              ) : (
                <EmptyState title="Loading household" description="Fetching the invite code." />
              )}
              <ProfileManager householdId={householdId} profiles={profiles} weekByProfileId={weekByProfileId} />
              <PinSettings householdId={householdId} household={household} />
              <AiKeyCard householdId={householdId} />
              {children[0] ? <DeviceCheck householdId={householdId} profileId={children[0].id} /> : null}

              {selectedChild ? (
                <div className="pr-settings-resets">
                  <h3 className="pr-settings-resets__heading">Resets</h3>
                  {selectedChildWeek ? (
                    <>
                      <ResetControls profile={selectedChild} householdId={householdId} currentWeek={selectedChildWeek} />
                      <QuestResets profile={selectedChild} householdId={householdId} currentWeek={selectedChildWeek} />
                    </>
                  ) : (
                    <EmptyState title="Loading reset controls" description={`Waiting for ${selectedChild.name}'s current week.`} />
                  )}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Explorer detail
// ---------------------------------------------------------------------------

function summarizeExplorerWeek(
  quests: Partial<Record<Track, Quest>>, progressDocs: Record<string, ProgressDoc>,
): { doneLabel: string; leftLabel: string; minutesSpent: number } {
  const doneNames: string[] = [];
  const leftNames: string[] = [];
  let minutesSpent = 0;

  for (const track of TRACK_ORDER) {
    const quest = quests[track];
    if (!quest) continue;
    const progress = progressDocs[quest.id]?.quest ?? emptyQuestProgress();
    const status = questStatus(quest, progress);
    const model = trackCardModel(quest, progress);
    minutesSpent += Math.round(quest.minutes * (model.progress / 100));
    if (status === "done") doneNames.push(TRACK_LABEL[track]);
    else leftNames.push(TRACK_LABEL[track]);
  }

  return {
    doneLabel: doneNames.length > 0 ? `${doneNames.join(" and ")} done` : "Nothing done yet",
    leftLabel: leftNames.length > 0 ? `${leftNames.join(" and ")} left` : "",
    minutesSpent,
  };
}

/** Every problem with 3+ recorded attempts, resolved through lib/domain/attempts.ts's own
 * viewProblem (the same function ProblemPlayer.tsx uses live) to decide fastFail -- this never
 * re-derives the fast-fail rule itself, only rebuilds the ProblemState viewProblem needs from
 * what is already stored (lib/data/progress.ts's toProblemState, which scopes those stored
 * attempts to the current cycle through lib/domain/attempts.ts's currentCycleProblemState --
 * the SAME cycle rule ProblemPlayer.tsx's own live state is built from, so a fastFail flag
 * cannot silently differ between the two depending on which one happens to run. Final review,
 * finding C1: this comment used to claim the two rebuilds were already the same; they were not
 * until currentCycleProblemState was extracted to make it true). */
function computeFastFailFlags(
  attempts: Array<{ id: string; attempt: AttemptDoc }>, progressDocs: Record<string, ProgressDoc>, now: number,
): FastFailFlag[] {
  const attemptDocs = attempts.map((a) => a.attempt);
  const problemIds = new Set(attemptDocs.map((a) => a.problemId));
  const flags: FastFailFlag[] = [];

  for (const problemId of problemIds) {
    const resolved = getProblem(problemId);
    if (!resolved) continue;
    const state = toProblemState(progressDocs[resolved.quest.id], problemId, attemptDocs);
    const view = viewProblem(resolved.problem, state, now);
    if (view.fastFail) {
      const lastAt = state.attempts.length > 0 ? state.attempts[state.attempts.length - 1].at : now;
      flags.push({ problemId, questId: resolved.quest.id, at: lastAt });
    }
  }

  return flags.sort((a, b) => b.at - a.at);
}

/** Every rubric (not-auto-graded) "explain-it" problem's latest attempt, with its answer text
 * and whether the parent has already approved it (lib/data/types.ts's ProblemProgress
 * .parentReview). "Latest" mirrors spec 7.2's "history is kept, the newest is shown". */
function computeExplainItems(
  attempts: Array<{ id: string; attempt: AttemptDoc }>, progressDocs: Record<string, ProgressDoc>,
): ExplainItItem[] {
  const latestByProblem = new Map<string, AttemptDoc>();
  for (const { attempt } of attempts) {
    if (!attempt.revealed) continue;
    const resolved = getProblem(attempt.problemId);
    if (!resolved || resolved.problem.kind !== "text") continue;
    const current = latestByProblem.get(attempt.problemId);
    if (!current || attempt.at > current.at) latestByProblem.set(attempt.problemId, attempt);
  }

  const items: ExplainItItem[] = [];
  for (const [problemId, attempt] of latestByProblem) {
    const resolved = getProblem(problemId);
    if (!resolved) continue;
    const approved = progressDocs[resolved.quest.id]?.problems?.[problemId]?.parentReview === "approved";
    items.push({
      problemId, questId: resolved.quest.id, questTitle: resolved.quest.title, week: resolved.quest.week,
      answer: attempt.answer, at: attempt.at, approved,
    });
  }

  return items.sort((a, b) => b.at - a.at);
}

/** Task 43: every problem with a saved working (typed notes and/or pen strokes), newest first --
 * the parent view's read-only mirror of the same working space the problem player shows. A
 * working document itself carries no quest/week, so this resolves each one against content the
 * same way computeExplainItems above resolves an attempt's problemId; a problem id no longer in
 * the content (should not happen, but content does change across seasons) is skipped rather
 * than shown with a blank title. */
function computeWorkingItems(workings: Array<{ problemId: string; working: WorkingDoc }>): WorkingItem[] {
  const items: WorkingItem[] = [];
  for (const { problemId, working } of workings) {
    if (!hasWorkingContent(working)) continue;
    const resolved = getProblem(problemId);
    if (!resolved) continue;
    items.push({
      problemId, questId: resolved.quest.id, questTitle: resolved.quest.title, week: resolved.quest.week,
      content: { text: working.text, strokes: working.strokes }, at: working.updatedAt,
    });
  }
  return items.sort((a, b) => b.at - a.at);
}

/**
 * Which of the twelve weeks are done for an Explorer profile (owner decision, 13 September 2026:
 * a week is bounded by finishing it, not by a date) -- the same rule app/explorer/page.tsx's own
 * computeDoneByWeek uses, so the Parent view's "current week" can never disagree with what This
 * Week itself shows. A week with none of this profile's quests authored counts as not done.
 */
function explorerDoneByWeek(seasonId: number, progressDocs: Record<string, ProgressDoc>, choice: TrackChoice): boolean[] {
  const tracks = tracksForProfile(choice);
  const doneByWeek: boolean[] = [];
  for (let week = 1; week <= 12; week++) {
    const quests = getWeek(seasonId, week);
    const questList = tracks.map((t) => quests[t]).filter((q): q is NonNullable<typeof q> => Boolean(q));
    const statuses = questList.map((q) => questStatus(q, progressDocs[q.id]?.quest ?? emptyQuestProgress()));
    doneByWeek.push(questList.length > 0 && statuses.every((s) => s === "done"));
  }
  return doneByWeek;
}

/** The same rule as above, for a Sprout profile: every activity in the week done (mirrors
 * app/sprout/page.tsx's own computeDoneByWeek). */
function sproutDoneByWeek(seasonId: number, progressDocs: Record<string, ProgressDoc>): boolean[] {
  const doneByWeek: boolean[] = [];
  for (let week = 1; week <= 12; week++) {
    const weekContent = getSproutWeek(seasonId, week);
    if (!weekContent || weekContent.activities.length === 0) {
      doneByWeek.push(false);
      continue;
    }
    const doneIds = doneActivityIds(weekContent.activities, progressDocs);
    doneByWeek.push(doneIds.size === weekContent.activities.length);
  }
  return doneByWeek;
}

function ExplorerChildSection({
  profile,
  householdId,
  onWeekComputed,
  activeTab,
  isSelected,
}: {
  profile: Profile;
  householdId: string;
  /** Reports this child's own completion-derived current week up to ParentHome, which is the
   * single place other parts of the Parent view (the shopping list, ProfileManager's profile
   * row, ResetControls for the selected child) read a profile's current week from. */
  onWeekComputed: (week: number) => void;
  /** Which tab is showing right now: the data watchers below stay subscribed regardless (the
   * shopping list depends on onWeekComputed firing even for a child whose tab is not open), but
   * only the content belonging to this tab, for this child, is ever rendered. */
  activeTab: TabId;
  /** Whether this is the child the switcher currently shows. Every child-scoped tab is scoped to
   * one child at a time; a non-selected child's section stays mounted (so its watchers keep
   * running) but renders nothing. */
  isSelected: boolean;
}) {
  const [now] = useState(() => Date.now());

  const [progressDocs, setProgressDocs] = useState<Record<string, ProgressDoc>>({});
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [attempts, setAttempts] = useState<Array<{ id: string; attempt: AttemptDoc }>>([]);
  const [logs, setLogs] = useState<Array<{ id: string; log: LogDoc }>>([]);
  const [debates, setDebates] = useState<Array<{ id: string; debate: DebateDoc }>>([]);
  const [tutorChats, setTutorChats] = useState<Array<{ id: string; chat: TutorChatDoc }>>([]);
  const [resetDocs, setResetDocs] = useState<Array<{ id: string; reset: ResetDoc }>>([]);
  const [parentEntries, setParentEntries] = useState<Array<{ id: string; skillId: string; note: string; at: number }>>([]);
  const [workings, setWorkings] = useState<Array<{ problemId: string; working: WorkingDoc }>>([]);

  useEffect(() => {
    const unsubProgress = watchProgress(householdId, profile.id, (list) => {
      setProgressDocs(Object.fromEntries(list.map((p) => [p.questId, p.progress])));
    });
    const unsubReview = watchReviewQueue(householdId, profile.id, setReviewQueue);
    const unsubAttempts = watchAllAttempts(householdId, profile.id, setAttempts);
    const unsubLogs = watchLogs(householdId, profile.id, setLogs);
    const unsubDebates = watchDebates(householdId, profile.id, setDebates);
    const unsubTutorChats = watchTutorChats(householdId, profile.id, setTutorChats);
    const unsubResets = watchResets(householdId, profile.id, setResetDocs);
    const unsubParentEntries = watchParentActivities(householdId, profile.id, (list) => {
      setParentEntries(list.map(({ id, entry }) => ({ id, skillId: entry.skillId, note: entry.note, at: entry.at })));
    });
    const unsubWorkings = watchAllWorkings(householdId, profile.id, setWorkings);
    return () => {
      unsubProgress();
      unsubReview();
      unsubAttempts();
      unsubLogs();
      unsubDebates();
      unsubTutorChats();
      unsubResets();
      unsubParentEntries();
      unsubWorkings();
    };
  }, [householdId, profile.id]);

  // The current week is which of the twelve is done, not which date it is (owner decision, 13
  // September 2026): see explorerDoneByWeek above.
  const doneByWeek = useMemo(() => explorerDoneByWeek(profile.seasonId, progressDocs, profile), [progressDocs, profile]);
  const currentWeek = useMemo(() => currentWeekFromDone(doneByWeek), [doneByWeek]);
  useEffect(() => onWeekComputed(currentWeek), [currentWeek, onWeekComputed]);
  const weekQuests = useMemo(
    () => questsForProfile(getWeek(profile.seasonId, currentWeek), profile),
    [profile, currentWeek],
  );

  // Task 13 fix 1: performReset never deletes logs or artifacts at any scope (spec 7.2 keeps
  // history; only the copy and the presentation change here, not the deletion). LogList uses
  // this, alongside lib/domain/resets.ts's coveringResetAt, to label a log that predates the
  // most recent reset covering its quest as belonging to an earlier run, instead of letting it
  // read as live work against a quest the same screen now shows as "Not started".
  const resets = useMemo<ResetRecord[]>(
    () => resetDocs.map(({ reset }) => ({ scope: reset.scope, targetId: reset.targetId, at: reset.at })),
    [resetDocs],
  );

  const { doneLabel, leftLabel, minutesSpent } = useMemo(
    () => summarizeExplorerWeek(weekQuests, progressDocs),
    [weekQuests, progressDocs],
  );

  const ideaEvents = useMemo<IdeaEvent[]>(
    () => [
      ...attempts.flatMap(({ attempt }) => attempt.ideaIds.map((ideaId) => ({ ideaId, problemId: attempt.problemId, at: attempt.at }))),
      ...ideaEventsFromProgress(getContent().quests, Object.entries(progressDocs).map(([questId, progress]) => ({ questId, progress }))),
    ],
    [attempts, progressDocs],
  );
  const ideaCount = useMemo(() => metIdeas(ideaEvents).length, [ideaEvents]);
  const fastFailFlags = useMemo(() => computeFastFailFlags(attempts, progressDocs, now), [attempts, progressDocs, now]);
  const explainItems = useMemo(() => computeExplainItems(attempts, progressDocs), [attempts, progressDocs]);
  const workingItems = useMemo(() => computeWorkingItems(workings), [workings]);

  // Task 2: the weekly paragraph is computed, not written (lib/domain/weeklySummary.ts). It
  // reads the SAME progress/attempts/logs/parent-entries state everything else on this screen
  // already reads, so it can never disagree with the mistake box or the explain-it list about
  // what actually happened -- only the words are new. `approved` mirrors computeExplainItems
  // above: ProblemProgress.parentReview, resolved from the same progressDocs map.
  const weeklyQuestInputs = useMemo<WeeklyQuestInput[]>(
    () =>
      TRACK_ORDER.flatMap((track) => {
        const quest = weekQuests[track];
        if (!quest) return [];
        return [{ track, quest, progress: progressDocs[quest.id]?.quest ?? emptyQuestProgress() }];
      }),
    [weekQuests, progressDocs],
  );
  const weeklyAttemptInputs = useMemo<WeeklyAttemptInput[]>(
    () =>
      attempts.map(({ attempt }) => ({
        problemId: attempt.problemId,
        ideaIds: attempt.ideaIds,
        tryNumber: attempt.tryNumber,
        correct: attempt.correct,
        revealed: attempt.revealed,
        approved: progressDocs[attempt.questId]?.problems?.[attempt.problemId]?.parentReview === "approved",
        at: attempt.at,
      })),
    [attempts, progressDocs],
  );
  const weeklyLogInputs = useMemo(
    () => logs.map(({ log }) => ({ hasComment: Boolean(log.parentComment && log.parentComment.trim()), at: log.at })),
    [logs],
  );
  const weeklyParentEntryInputs = useMemo(
    () => parentEntries.map(({ skillId, note, at }) => ({ skillId, note, at })),
    [parentEntries],
  );
  const weekly = useMemo(
    () =>
      weeklySummary({
        quests: weeklyQuestInputs,
        attempts: weeklyAttemptInputs,
        logs: weeklyLogInputs,
        parentEntries: weeklyParentEntryInputs,
        now,
      }),
    [weeklyQuestInputs, weeklyAttemptInputs, weeklyLogInputs, weeklyParentEntryInputs, now],
  );

  return (
    <section className="pr-child" aria-label={`${profile.name}'s progress`} hidden={!isSelected}>
      {isSelected && activeTab === "week" ? (
        <>
          <KidCard profile={profile} currentWeek={currentWeek} doneLabel={doneLabel} leftLabel={leftLabel} minutesSpentThisWeek={minutesSpent} />
          <WeeklyParagraph summary={weekly} />
          <WeekPlan profile={profile} quests={weekQuests} progressDocs={progressDocs} />
          <LadderCard householdId={householdId} profileId={profile.id} name={profile.name} />
          <CalibrationCard attempts={attempts.map(({ attempt }) => attempt)} />
        </>
      ) : null}

      {isSelected && activeTab === "plan" ? <SeasonIndex profile={profile} doneByWeek={doneByWeek} /> : null}

      {isSelected && activeTab === "review" ? (
        <>
          <MistakeBox profile={profile} householdId={householdId} reviewQueue={reviewQueue} now={now} ideaCount={ideaCount} fastFailFlags={fastFailFlags} />
          <LogList profile={profile} householdId={householdId} logs={logs} explainItems={explainItems} resets={resets} workingItems={workingItems} />
          <DebateList profile={profile} debates={debates} />
          <AskTranscripts profile={profile} chats={tutorChats} />
          <ParentActivities profile={profile} householdId={householdId} />
        </>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sprout detail
// ---------------------------------------------------------------------------

function SproutChildSection({
  profile,
  householdId,
  onWeekComputed,
  activeTab,
  isSelected,
}: {
  profile: Profile;
  householdId: string;
  /** See ExplorerChildSection's own doc comment: reports this child's current week up to
   * ParentHome, the one place other Parent view parts read a profile's current week from. */
  onWeekComputed: (week: number) => void;
  /** See ExplorerChildSection's own doc comment. */
  activeTab: TabId;
  isSelected: boolean;
}) {
  const [now] = useState(() => Date.now());

  const [progressDocs, setProgressDocs] = useState<Record<string, ProgressDoc>>({});
  const [minutesToday, setMinutesToday] = useState(0);
  const [screenTimeEntries, setScreenTimeEntries] = useState<Array<{ date: string; minutes: number }>>([]);

  useEffect(() => {
    const unsubProgress = watchProgress(householdId, profile.id, (list) => {
      setProgressDocs(Object.fromEntries(list.map((p) => [p.questId, p.progress])));
    });
    const unsubToday = watchScreenTimeToday(householdId, profile.id, setMinutesToday);
    const unsubWeek = watchScreenTime(householdId, profile.id, setScreenTimeEntries);
    return () => {
      unsubProgress();
      unsubToday();
      unsubWeek();
    };
  }, [householdId, profile.id]);

  // The current week is which of the twelve is done, not which date it is (owner decision, 13
  // September 2026): see sproutDoneByWeek above.
  const doneByWeek = useMemo(() => sproutDoneByWeek(profile.seasonId, progressDocs), [profile.seasonId, progressDocs]);
  const currentWeek = useMemo(() => currentWeekFromDone(doneByWeek), [doneByWeek]);
  useEffect(() => onWeekComputed(currentWeek), [currentWeek, onWeekComputed]);
  const week = useMemo(() => getSproutWeek(profile.seasonId, currentWeek), [profile.seasonId, currentWeek]);

  // "This week" here is a real calendar week (Monday through Sunday containing `now`), not the
  // content week above: content weeks no longer run on a clock (lib/domain/calendar.ts's own
  // header), so there is no honest date range a content week "spans" any more. This stat answers
  // a different, still-honest question -- how much Sprout screen time this real week -- rather
  // than pretending the content week has a date range it does not.
  const { startId, endId } = useMemo(() => calendarWeekRange(now), [now]);
  const minutesSpentThisWeek = useMemo(
    () => screenTimeEntries.filter((e) => e.date >= startId && e.date <= endId).reduce((sum, e) => sum + e.minutes, 0),
    [screenTimeEntries, startId, endId],
  );

  if (!week) {
    return (
      <section className="pr-child" aria-label={`${profile.name}'s progress`} hidden={!isSelected}>
        {isSelected && activeTab === "week" ? (
          <>
            <KidCard profile={profile} currentWeek={currentWeek} doneLabel="Nothing done yet" leftLabel="" minutesSpentThisWeek={minutesSpentThisWeek} />
            <EmptyState title="No activities yet" description="This week's Sprout activities have not been added yet." />
          </>
        ) : null}
        {isSelected && activeTab === "plan" ? <SeasonIndex profile={profile} doneByWeek={doneByWeek} /> : null}
        {isSelected && activeTab === "review" ? <ParentActivities profile={profile} householdId={householdId} /> : null}
      </section>
    );
  }

  const doneIds = doneActivityIds(week.activities, progressDocs);
  const stars = starsForWeek(week.activities.map((a) => doneIds.has(a.id)));
  const doneCount = doneIds.size;
  const total = week.activities.length;
  const leftCount = total - doneCount;
  const doneLabel = `${doneCount} of ${total} activities`;
  const leftLabel = leftCount > 0 ? `${leftCount} ${leftCount === 1 ? "activity" : "activities"} left` : "";

  return (
    <section className="pr-child" aria-label={`${profile.name}'s progress`} hidden={!isSelected}>
      {isSelected && activeTab === "week" ? (
        <>
          <KidCard profile={profile} currentWeek={currentWeek} doneLabel={doneLabel} leftLabel={leftLabel} minutesSpentThisWeek={minutesSpentThisWeek} />
          <SproutCard profile={profile} householdId={householdId} week={week} doneIds={doneIds} stars={stars} minutesToday={minutesToday} />
        </>
      ) : null}
      {isSelected && activeTab === "plan" ? <SeasonIndex profile={profile} doneByWeek={doneByWeek} /> : null}
      {isSelected && activeTab === "review" ? <ParentActivities profile={profile} householdId={householdId} /> : null}
    </section>
  );
}
