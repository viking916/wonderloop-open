"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Header } from "@/components/ui/Header";
import { QuestMaterials } from "@/components/ui/QuestMaterials";
import { Toast } from "@/components/ui/Toast";
import { ExplorerNav } from "@/components/explorer/ExplorerNav";
import { SwitchProfileButton } from "@/components/SwitchProfileButton";
import { BreakOffer } from "./BreakOffer";
import { StepList } from "./StepList";
import { InstructionStep } from "./InstructionStep";
import { ScienceStep } from "./ScienceStep";
import { TypingStep } from "./TypingStep";
import { TaskStep } from "./TaskStep";
import { DataStep } from "./DataStep";
import { ExplainStep } from "./ExplainStep";
import { ArtifactStep } from "./ArtifactStep";
import { LogStep } from "./LogStep";
import { DebateRoom } from "./DebateRoom";
import { LessonStep } from "./LessonStep";
import { ProblemPlayer } from "./ProblemPlayer";
import { getContent } from "@/lib/content/app-content";
import { TRACK_LABEL, type Quest, type Step } from "@/lib/content/schema";
import { emptyQuestProgress, questStatus, resumePosition, type QuestProgress } from "@/lib/domain/completion";
import { newQuestMaterials } from "@/lib/domain/materials";
import { buildProgressDoc, saveQuestProgress, watchProgress } from "@/lib/data/progress";
import type { ProgressDoc } from "@/lib/data/types";
import { profileInitials, type Profile } from "@/lib/session";
import { LoadingTrail } from "@/components/LoadingTrail";
import { breakDue } from "@/lib/domain/breaks";
import { startClock } from "@/lib/data/households";
import { ExtrasPanel } from "./ExtrasPanel";
import { extrasSummary } from "@/lib/domain/extras";

export type QuestShellProps = {
  quest: Quest;
  profile: Profile;
  householdId: string;
};

function stepParamFrom(searchParamsValue: string | null, total: number): number | null {
  if (searchParamsValue === null) return null;
  const n = Number(searchParamsValue);
  return Number.isInteger(n) && n >= 0 && n < total ? n : null;
}

/**
 * The Quest screen (spec 7.1 screen 3): the waypoint step list on the left, the current step on
 * the right, and "Stuck, come back later". This component owns the one Firestore round trip
 * (watchProgress) and the one write path (onUpdate below); every step component only ever
 * describes the QuestProgress it wants next, it never touches Firestore or decides completion
 * itself -- that stays entirely in lib/domain/completion.ts, called from here and from the step
 * components that need to read it (isStepComplete, questStatus, resumePosition).
 *
 * The URL's `?step=n` is the source of truth for which step is showing, so a refresh keeps the
 * place; with no valid `step` param, it lands on resumePosition once progress has loaded, and
 * writes that choice back into the URL.
 */
export function QuestShell({ quest, profile, householdId }: QuestShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [progressDoc, setProgressDoc] = useState<ProgressDoc | undefined>(undefined);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  // The break offer (Plan 4 task 35; lib/domain/breaks.ts has the full reasoning for why this
  // is offered and never forced). workStartedAt marks the beginning of this continuous stretch
  // of work; a fresh QuestShell mount is itself a fresh stretch (leaving and coming back, via
  // "Take a break" or otherwise, always remounts this component), so no separate reset logic is
  // needed for that case. lastDismissedAt records the last "Not now", so breakDue's own snooze
  // rule can keep this from nagging again right away.
  const [workStartedAt] = useState(() => Date.now());
  const [lastDismissedAt, setLastDismissedAt] = useState<number | undefined>(undefined);
  const [breakOffered, setBreakOffered] = useState(false);

  /**
   * Task 40 fix (double-CTA on a problem set's last problem), generalized by task 41's own-primary
   * audit: the quest-level "Continue" below is a persistent, always-rendered control -- it never
   * knew whether the step it sits under was already showing its own forward action. ProblemPlayer's
   * "Next step" (added task 10, commit 575c715) was wired to the exact same navigation
   * (goToStep(stepIndex + 1)) as this "Continue", but that commit only ever ADDED the near button;
   * it never suppressed the far one it was meant to replace, so both rendered as primary at once
   * the instant the last problem's explanation opened -- exactly what the owner's screenshot
   * caught (task 40). Task 41's audit found the identical shape in six more step kinds
   * (InstructionStep, ScienceStep, TypingStep, ExplainStep, ArtifactStep, LogStep,
   * DebateStepPlaceholder) plus LessonStep/LessonPlayer and the rest of ProblemPlayer's own states
   * (Check while unanswered, Next problem mid-set) that task 40 had left unaudited: every one of
   * them renders its own variant="primary" control while its step is unfinished, with this same
   * "Continue" sitting there enabled the whole time too. Every step kind with an own primary now
   * reports whether it is currently showing one via onOwnPrimaryChange below (renamed from task
   * 40's narrower onFinishControlChange); stepOwnPrimary mirrors it, and "Continue" is hidden
   * while it is true (see the render below) -- the step's own action is the one primary while
   * unfinished, "Continue" takes over once it is done. Reset on every stepIndex change (not just
   * on the current step's own unmount) so a step of any other kind never inherits a stale true
   * from the step before it. TaskStep has no own primary control and never calls this.
   */
  const [stepOwnPrimary, setStepOwnPrimary] = useState(false);

  useEffect(() => {
    const unsub = watchProgress(householdId, profile.id, (list) => {
      const entry = list.find((p) => p.questId === quest.id);
      setProgressDoc(entry?.progress);
      setProgressLoaded(true);
    });
    return unsub;
  }, [householdId, profile.id, quest.id]);

  const questProgress = useMemo(() => progressDoc?.quest ?? emptyQuestProgress(), [progressDoc]);
  // Task 14: which of this quest's own materials are new to its track this season, so the side
  // rail's "get these ready" checklist can flag only what actually changed.
  const newMaterials = useMemo(() => newQuestMaterials(getContent().quests, quest), [quest]);

  // The URL is the only place the current step lives; there is no separate React state to keep
  // in sync with it. urlStep is null when the URL carries no (valid) ?step=; resumeStep is the
  // fallback once progress has actually loaded, so it never resolves against an empty,
  // not-yet-real QuestProgress before the real progress arrives.
  // ?step=extras shows the quest's bonus tracks and make-your-own brief instead of a step.
  const showExtras = searchParams.get("step") === "extras" && (quest.extras?.length ?? 0) > 0;
  const urlStep = stepParamFrom(searchParams.get("step"), quest.steps.length);
  const resumeStep = progressLoaded
    ? Math.max(0, Math.min(resumePosition(quest, questProgress).stepIndex, quest.steps.length - 1))
    : null;
  const stepIndex = urlStep ?? resumeStep;

  const goToStep = useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(i, quest.steps.length - 1));
      const params = new URLSearchParams(searchParams.toString());
      params.set("step", String(clamped));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname, quest.steps.length],
  );

  // No step in the URL yet: write the resumed position into it once progress has loaded, so a
  // refresh from here on lands exactly back here.
  useEffect(() => {
    if (showExtras || urlStep !== null || resumeStep === null) return;
    goToStep(resumeStep);
  }, [showExtras, urlStep, resumeStep, goToStep]);

  const goToExtras = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("step", "extras");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, router, pathname]);
  const extras = extrasSummary(quest, questProgress);

  // The break offer (Plan 4 task 35): re-checked only when stepIndex itself changes -- exactly
  // a step boundary, whether from Continue, Back, a waypoint click, or a step's own "Next
  // problem"/"Next step" control finishing a step. A ProblemPlayer moving between problems
  // within one problem-set step never changes stepIndex, so this can never fire mid-problem;
  // that is the whole point of keying it here rather than inside any step component. Deliberately
  // scoped to [stepIndex] alone, not workStartedAt/lastDismissedAt: those two only ever change
  // from the handlers below, which already decide breakOffered for themselves -- re-running this
  // check merely because lastDismissedAt just changed would immediately re-show the very offer
  // that was just dismissed.
  useEffect(() => {
    if (stepIndex === null) return;
    // Synchronous, not deferred to a callback: breakDue is a pure function of state already
    // held (workStartedAt, lastDismissedAt) plus Date.now() read directly, the same way every
    // other Date.now() call in this component works -- there is nothing external or async to
    // wait on here (ActivityPlayer.tsx's own react-hooks/set-state-in-effect precedent for this
    // exact "synchronous derived reset, no async boundary" shape).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBreakOffered(breakDue({ workStartedAt, lastDismissedAt, now: Date.now() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // Task 40 fix: stepOwnPrimary must never carry over from the step just left -- every step
  // component with an own primary already reports false through onOwnPrimaryChange on its own
  // unmount (key={step.id} changing), but this is a second, independent reset on the boundary
  // itself, so a step of any other kind that renders no such control at all is never left showing
  // a stale true from before. Adjusted
  // here during render (React's "adjusting state when a prop changes" pattern, the same shape
  // ProblemPlayer.tsx already uses throughout for a value that must reset in the SAME commit as
  // a boundary rather than one commit+effect cycle later) instead of an effect, which would call
  // setState synchronously in an effect body for no external system this needs to synchronize
  // with -- stepIndex itself is already the state being watched.
  const [prevStepIndexForPrimary, setPrevStepIndexForPrimary] = useState(stepIndex);
  if (stepIndex !== prevStepIndexForPrimary) {
    setPrevStepIndexForPrimary(stepIndex);
    setStepOwnPrimary(false);
  }

  /** "Take a break": leaves for the Explorer home, same as any other navigation away mid-quest.
   * No "parked" flag is written -- he is not stuck, so nothing here should claim he is; his
   * place is already exactly where "Stuck, come back later" would resume him too, since neither
   * one loses any unsaved local draft (a step is never mid-write when this can even show, per
   * the boundary rule above). */
  const handleTakeBreak = useCallback(() => {
    setBreakOffered(false);
    router.push("/explorer");
  }, [router]);

  /** "Not now": costs nothing. Does not touch Firestore, does not mark him stuck, just records
   * when he said it so breakDue's own snooze rule keeps this from asking again right away. */
  const handleDismissBreak = useCallback(() => {
    setBreakOffered(false);
    setLastDismissedAt(Date.now());
  }, []);

  // The single write path. Every step component reaches Firestore only through this, passing a
  // pure `updater`. By default the write it produces clears "parked" (spec 7.2's "Stuck, come
  // back later" flag): every one of those calls -- a tick, a checklist toggle, a saved artifact,
  // a saved log, an explain or debate answer, a problem attempt -- represents him actually back
  // and doing the quest, and this is the only place that fact needs to be known, since no step
  // component calls onUpdate just to change which step is showing (navigation never reaches
  // here at all). Only handlePark's own write is allowed to set parked true, via keepParked.
  const onUpdate = useCallback(
    async (updater: (prev: QuestProgress) => QuestProgress, opts: { keepParked?: boolean } = {}) => {
      const prev = progressDoc;
      const prevProgress = prev?.quest ?? emptyQuestProgress();
      const updated = updater(prevProgress);
      const next = opts.keepParked ? updated : { ...updated, parked: false };
      const wasStarted = Boolean(prev?.startedAt);
      const wasDone = prev?.status === "done";
      const newStatus = questStatus(quest, next);

      const extra: { startedAt?: number; completedAt?: number; problems?: ProgressDoc["problems"] } = {
        problems: prev?.problems ?? {},
      };
      if (!wasStarted) extra.startedAt = Date.now();
      if (!wasDone && newStatus === "done") extra.completedAt = Date.now();

      try {
        setSaveError(undefined);
        await saveQuestProgress(householdId, profile.id, quest.id, buildProgressDoc(quest, next, extra));
        // The child's own week clock starts on their first saved step (households.ts startClock).
        if (!profile.startDate) void startClock(householdId, profile.id, Date.now()).catch(() => undefined);
      } catch {
        setSaveError("Could not save just now. Check your connection; it will try again.");
      }
    },
    [progressDoc, quest, householdId, profile.id],
  );

  const handlePark = useCallback(async () => {
    await onUpdate((prev) => ({ ...prev, parked: true }), { keepParked: true });
    router.push("/explorer");
  }, [onUpdate, router]);

  if (!progressLoaded || stepIndex === null) {
    return <LoadingTrail />;
  }

  const step = quest.steps[stepIndex];
  const status = questStatus(quest, questProgress);

  return (
    <div className="flex flex-col flex-1">
      <Header
        userName={profile.name}
        initials={profileInitials(profile.name)}
        rightSlot={
          <>
            <ExplorerNav current="quest" />
            <SwitchProfileButton />
          </>
        }
      />
      <main className="mx-auto w-full max-w-[1080px] px-4 py-6 sm:px-6">
        <Card tone="surface" shadow className="!p-0 tr-quest">
          <aside className="tr-quest__side">
            <span className="tr-eyebrow">
              {TRACK_LABEL[quest.track]} - Week {quest.week}
            </span>
            <h2 className="tr-quest__title">{quest.title}</h2>
            <QuestMaterials materials={quest.materials} newMaterials={newMaterials} className="tr-quest__materials" />
            <StepList steps={quest.steps} progress={questProgress} currentIndex={showExtras ? -1 : stepIndex} onSelect={goToStep} />
            {extras.total > 0 ? (
              <button type="button" className={showExtras ? "tr-extras-link tr-extras-link--on" : "tr-extras-link"} onClick={goToExtras} aria-current={showExtras ? "page" : undefined}>
                <span className="tr-extras-link__label">If there is time</span>
                <span className="tr-extras-link__count">
                  {extras.done} of {extras.total} done
                </span>
              </button>
            ) : null}
            {/* Plan 4 task 35: made more visible than the plain quiet-tier text link this used
                to be -- a light callout box and an icon draw the eye without promoting the
                button itself out of the "quiet" tier (app/globals.css's Button block still names
                this control by name as belonging there, alongside Back and Skip for now: it must
                stay low-stakes and easily reversible-looking, never a coercive CTA). It is the
                honest version of a break -- parking a quest without failing it -- so it deserves
                to actually be found, not just exist. */}
            {/* Owner's first real session, 5 September 2026: he wanted to stop for the day and could
                not see how to get back to This Week; the only exit on the screen read "Stuck, come
                back later", which is a different thing (it parks the quest). A plain way home, with
                no verdict attached, and the header's own nav above it. Progress is saved as he goes,
                so leaving costs nothing and the copy says so. */}
            <p className="tr-quest__home">
              Done for now? <a href="/explorer">Back to This Week</a>. Everything you finished is saved.
            </p>
            <div className="tr-quest__park-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="tr-quest__park-icon">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4l3 2" />
              </svg>
              <div>
                <p className="tr-quest__park-hint">Stuck on this step? That is okay.</p>
                <button type="button" className="tr-btn tr-btn--quiet tr-quest__park" onClick={() => void handlePark()}>
                  Stuck, come back later
                </button>
              </div>
            </div>
          </aside>
          <div className="tr-quest__main">
            {status === "done" ? <Toast tone="success" message="Quest complete. Great work." /> : null}
            {saveError ? <Toast tone="hint" message={saveError} onDismiss={() => setSaveError(undefined)} /> : null}
            {breakOffered ? <BreakOffer onTakeBreak={handleTakeBreak} onNotNow={handleDismissBreak} /> : null}
            <p className="tr-eyebrow">
              {showExtras ? "Bonus tracks" : `Step ${stepIndex + 1} of ${quest.steps.length}`}
            </p>
            {showExtras ? (
              <ExtrasPanel quest={quest} progress={questProgress} onUpdate={onUpdate} onBackToSteps={() => goToStep(stepIndex)} />
            ) : step ? (
              renderStep(
                step,
                quest,
                questProgress,
                progressDoc?.problems ?? {},
                progressLoaded,
                householdId,
                profile.id,
                onUpdate,
                stepIndex < quest.steps.length - 1 ? () => goToStep(stepIndex + 1) : undefined,
                setStepOwnPrimary,
              )
            ) : (
              <EmptyState title="Nothing here yet" description="This quest has no more steps." />
            )}
            {showExtras ? null : (
            <div className="tr-quest__nav">
              {/* Task 12 fix (UX audit finding 1 named this "Back" specifically): was the plain
                  "tr-btn" tier -- a white box with a 2px border, the same look a <select> or a
                  text input carries. Task 20: now "tr-btn--quiet", the low-stakes/reversible
                  navigation tier every other "go back" or "skip" control in the app uses (Skip
                  for now, Try it again, Stuck come back later) -- not "secondary", which is
                  reserved for a real dashboard action, and no longer "ghost" (dashed), which no
                  longer exists as a tier at all. */}
              <button
                type="button"
                className="tr-btn tr-btn--quiet"
                onClick={() => goToStep(stepIndex - 1)}
                disabled={stepIndex === 0}
              >
                Back
              </button>
              {/* Task 40 fix, generalized by task 41: while the step itself is already showing
                  its own primary control (stepOwnPrimary, reported by whichever step kind is on
                  screen via onOwnPrimaryChange -- "Got it", "Start/Pause/Resume", a "Save..."
                  button, or ProblemPlayer's "Check"/"Next problem"/"Next step") this "Continue"
                  is hidden rather than rendered alongside it, so only one primary control is ever
                  on screen at a time (control language, commit 13b42c1: at most one primary per
                  group). Once the step is done, its own control either disappears or (for the
                  "Save..." family, which stays clickable so he can revise and resave) demotes to
                  "secondary", and "Continue" takes over as the one control that moves the quest
                  forward. */}
              {!stepOwnPrimary ? (
                <button
                  type="button"
                  className="tr-btn tr-btn--primary"
                  onClick={() => goToStep(stepIndex + 1)}
                  disabled={stepIndex >= quest.steps.length - 1}
                >
                  Continue
                </button>
              ) : null}
            </div>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}

function renderStep(
  step: Step,
  quest: Quest,
  progress: QuestProgress,
  problemsProgress: ProgressDoc["problems"],
  progressLoaded: boolean,
  householdId: string,
  profileId: string,
  onUpdate: (updater: (prev: QuestProgress) => QuestProgress) => Promise<void>,
  /** Task 10 fix (ux-audit.md, "the only forward control on a set's last problem is far away
   * and easy to miss"): only ProblemPlayer uses this, to render a real "Next step" button next
   * to its own last-problem-done line instead of leaving the quest-level "Continue" as the only
   * working control. undefined when this step is already the quest's last step, i.e. there is
   * no next step to go to. */
  onFinished: (() => void) | undefined,
  /**
   * Task 40 fix, generalized by task 41's own-primary audit (styleguide "one primary action per
   * group"): every step kind below that renders its own variant="primary" control reports
   * through this callback whenever that control is on screen and the step is not yet complete --
   * "Got it" before the tick, "Start/Pause/Resume" before the timer finishes, "Save answer"/
   * "Save code"/"Save text"/"Save my log"/"Save my points" before that step's own completion
   * condition is met, "Check"/"Next problem"/"Next step" throughout a problem-kind step, "Check"/
   * "Next"/"Done" throughout a "Meet the idea" lesson. QuestShell tracks the result as
   * stepOwnPrimary and hides the footer's "Continue" for exactly that window (see stepOwnPrimary
   * above): the step's own action is the one primary while the step is unfinished, and "Continue"
   * takes over once it is done -- never both live at once. TaskStep has no primary control of its
   * own (a checklist, ticked directly, with only "Continue" ever primary below it) and so never
   * calls this at all. Named onOwnPrimaryChange (not task 40's narrower onFinishControlChange)
   * since it is no longer specific to ProblemPlayer's last-problem "finish" control. */
  onOwnPrimaryChange: (visible: boolean) => void,
) {
  // key={step.id} on every branch: without it, navigating between two steps of the same kind
  // (e.g. "Explain it" to "Explain back", both kind "explain") reuses the same component
  // instance, since React reconciles by type+position, not by which step it is showing. That
  // instance's local state (a textarea's typed answer, an artifact's local preview, a timer)
  // would otherwise carry over from the previous step instead of resetting for the new one.
  switch (step.kind) {
    case "instruction":
      return (
        <InstructionStep
          key={step.id}
          step={step}
          progress={progress}
          onUpdate={onUpdate}
          onOwnPrimaryChange={onOwnPrimaryChange}
        />
      );
    case "science":
      return (
        <ScienceStep
          key={step.id}
          step={step}
          progress={progress}
          onUpdate={onUpdate}
          onOwnPrimaryChange={onOwnPrimaryChange}
        />
      );
    case "typing":
      return (
        <TypingStep
          key={step.id}
          step={step}
          progress={progress}
          onUpdate={onUpdate}
          onOwnPrimaryChange={onOwnPrimaryChange}
        />
      );
    case "task":
      return <TaskStep key={step.id} step={step} progress={progress} onUpdate={onUpdate} />;
    case "data":
      return (
        <DataStep
          key={step.id}
          step={step}
          progress={progress}
          onUpdate={onUpdate}
          onOwnPrimaryChange={onOwnPrimaryChange}
        />
      );
    case "explain":
      return (
        <ExplainStep
          key={step.id}
          step={step}
          quest={quest}
          progress={progress}
          householdId={householdId}
          profileId={profileId}
          onUpdate={onUpdate}
          onOwnPrimaryChange={onOwnPrimaryChange}
        />
      );
    case "artifact":
      return (
        <ArtifactStep
          key={step.id}
          step={step}
          quest={quest}
          progress={progress}
          householdId={householdId}
          profileId={profileId}
          onUpdate={onUpdate}
          onOwnPrimaryChange={onOwnPrimaryChange}
        />
      );
    case "log":
      return (
        <LogStep
          key={step.id}
          step={step}
          quest={quest}
          progress={progress}
          householdId={householdId}
          profileId={profileId}
          onUpdate={onUpdate}
          onOwnPrimaryChange={onOwnPrimaryChange}
        />
      );
    case "debate":
      return (
        <DebateRoom
          key={step.id}
          step={step}
          quest={quest}
          progress={progress}
          householdId={householdId}
          profileId={profileId}
          onUpdate={onUpdate}
          onOwnPrimaryChange={onOwnPrimaryChange}
        />
      );
    case "lesson":
      return (
        <LessonStep
          key={step.id}
          step={step}
          progress={progress}
          onUpdate={onUpdate}
          onOwnPrimaryChange={onOwnPrimaryChange}
        />
      );
    case "warmup":
    case "problem-set":
    case "puzzle-of-week":
      return (
        <ProblemPlayer
          key={step.id}
          step={step}
          quest={quest}
          progress={progress}
          problemsProgress={problemsProgress}
          progressLoaded={progressLoaded}
          householdId={householdId}
          profileId={profileId}
          onUpdate={onUpdate}
          onFinished={onFinished}
          onOwnPrimaryChange={onOwnPrimaryChange}
        />
      );
  }
}
