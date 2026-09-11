"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getDoc, getDocs, query, where } from "firebase/firestore";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Toast } from "@/components/ui/Toast";
import { NumberInput } from "./NumberInput";
import { ChoiceInput } from "./ChoiceInput";
import { TrueFalseInput } from "./TrueFalseInput";
import { OrderInput } from "./OrderInput";
import { GridInput, type CellState } from "./GridInput";
import { TextInput } from "./TextInput";
import { ProblemFigure } from "./ProblemFigure";
import { HintPanel } from "./HintPanel";
import { CONFIDENCE_LABEL, MISS_LABEL, type Confidence, type MissKind } from "@/lib/domain/calibration";
import { ExplanationPanel } from "./ExplanationPanel";
import { IdeaCard } from "./IdeaCard";
import { LessonPlayer } from "./LessonPlayer";
import { CooldownTimer, formatMMSS } from "./CooldownTimer";
import { WorkingSpace, type WorkingContent } from "./WorkingSpace";
import { PastWorking } from "./PastWorking";
import type { Problem, Quest, Step } from "@/lib/content/schema";
import type { QuestProgress } from "@/lib/domain/completion";
import {
  clockFor,
  clockOfferOpen,
  clockRunning,
  clockSeconds,
  declineClock,
  finishClock,
  formatClock,
  isTimedStep,
  minutesToFinish,
  setComplete,
  startClock,
} from "@/lib/domain/clock";
import { currentCycleProblemState, recordAttempt as recordAttemptDomain, viewProblem, type ProblemState } from "@/lib/domain/attempts";
import { REVIEW_QUEST_ID, clearOnVariantSuccess, scheduleOnMiss, type ReviewItem } from "@/lib/domain/review";
import { hasWorkingContent } from "@/lib/domain/workings";
import { numericInputMode, type UserInput } from "@/lib/answers";
import {
  clearReviewItem,
  recordAttempt as persistAttempt,
  setAttemptMissKind,
  saveQuestProgress,
  upsertReviewItem,
  watchAttemptsForQuest,
} from "@/lib/data/progress";
import { attemptsCol, reviewItemRef, type AttemptDoc, type ProblemProgress } from "@/lib/data/types";
import { getDb } from "@/lib/firebase/client";
import { getIdea, getLessonForIdea } from "@/lib/content/app-content";
// Final whole-branch review, finding I1: this used to be a second, independently-written copy
// of recomputeAndSaveSkills. ResetControls.tsx's copy is the one every other Parent-view caller
// (LogList, MistakeBox, SproutCard, WeekPlan) already imports, so this now shares that one
// rather than a quest-side implementation nobody else used.
import { recomputeAndSaveSkills } from "@/lib/data/skills-recompute";

export type ProblemPlayerProps = {
  step: Extract<Step, { kind: "warmup" } | { kind: "problem-set" } | { kind: "puzzle-of-week" }>;
  quest: Quest;
  progress: QuestProgress;
  /** ProgressDoc.problems for this quest, i.e. firstSeenAt/whatYouTried/revealedAt per problem
   * id -- everything besides the attempts themselves that lib/domain/attempts.ts's
   * ProblemState needs. QuestShell already watches this; the player never opens a second
   * listener on the same document. */
  problemsProgress: Record<string, ProblemProgress>;
  /** QuestShell's own progressLoaded flag: true once its watchProgress listener has delivered
   * at least one snapshot. Task 10 fix (review finding 1): problemsProgress above updates only
   * when this is already true on first mount, but this component also holds a second,
   * independently-syncing listener (watchAttemptsForQuest below) -- passing this through lets
   * the render gate on BOTH sources having delivered, not just assume the prop is only ever
   * handed over once it is real. */
  progressLoaded: boolean;
  householdId: string;
  profileId: string;
  onUpdate: (updater: (prev: QuestProgress) => QuestProgress) => Promise<void>;
  /** Task 10 fix (ux-audit.md finding "the only forward control on a set's last problem is far
   * away and easy to miss"): on the LAST problem in this step, once its explanation is open,
   * there is nothing more for this component to do -- but "That was the last problem in this
   * set." used to be plain, unstyled text sitting beside "Try it again", with the actual
   * working forward control (the quest-level "Continue") generically worded and pinned far
   * below. When QuestShell supplies this, a real, primary "Next step" button renders right next
   * to that line -- one obvious control, where he is already looking, worded differently from
   * the generic "Continue" used everywhere else on the page, instead of only that same-named
   * control pinned far away. Left undefined (e.g. if this step is also the quest's last step,
   * where "next step" is not a real destination), only the plain line shows, unchanged. */
  onFinished?: () => void;
  /**
   * Task 40 fix (double-CTA on a problem set's last problem, owner's screenshot), widened by
   * task 41's own-primary audit: task 10's "Next step" (above) and QuestShell's own persistent
   * "Continue" both call the identical goToStep(stepIndex + 1) the moment this component reaches
   * its last problem with the explanation open -- task 10 added the near button but never
   * suppressed the far one it was meant to replace, so both rendered as primary at once. Task 40
   * fixed exactly that one window. Task 41's audit (screenshotting every step kind against the
   * styleguide's "one primary action per group" rule) found the SAME shape everywhere else this
   * component shows its own primary button while unanswered ("Check") or mid-set ("Next
   * problem") -- Continue sat there enabled the whole time too, just less obviously than the
   * literal duplicate task 40 caught. This callback now reports whenever ANY of this component's
   * own primary controls (Check / Next problem / Next step) is on screen, not only the
   * last-problem one, so QuestShell can hide "Continue" for the step's own primary the entire
   * time it is unfinished -- exactly the same "own action is primary while unfinished; Continue
   * takes over when done" rule every other step kind now follows (see QuestShell's
   * onOwnPrimaryChange doc). Left undefined only in tests that do not care about this; QuestShell
   * always supplies it in the real app. Renamed from onFinishControlChange (task 40's name, which
   * described only the narrow original case).
   */
  onOwnPrimaryChange?: (visible: boolean) => void;
  /**
   * Task 17 (final review finding C2): a plain-language note shown above the prompt, for the
   * mistake-box review screen only. Left undefined everywhere else (the normal quest flow never
   * passes it). Review passes one exactly when the due item's problem has no authored variant,
   * so a child sees "this is the same problem again" stated outright rather than silently
   * getting the original with no explanation for why it looks familiar.
   */
  reviewNote?: string;
};

type Draft =
  | { kind: "number"; text: string }
  | { kind: "choice"; index: number | null }
  | { kind: "boolean"; value: boolean | null }
  | { kind: "order"; order: number[] }
  | { kind: "grid"; cells: CellState[][] }
  | { kind: "text"; text: string };

function freshDraft(problem: Problem): Draft {
  switch (problem.kind) {
    case "number":
      return { kind: "number", text: "" };
    case "choice":
      return { kind: "choice", index: null };
    case "truefalse":
      return { kind: "boolean", value: null };
    case "order":
      return { kind: "order", order: (problem.items ?? []).map((_, i) => i) };
    case "grid":
      return { kind: "grid", cells: (problem.rows ?? []).map(() => (problem.cols ?? []).map(() => "blank" as CellState)) };
    case "text":
      return { kind: "text", text: "" };
  }
}

function draftIsValid(draft: Draft): boolean {
  switch (draft.kind) {
    case "number":
    case "text":
      return draft.text.trim() !== "";
    case "choice":
      return draft.index !== null;
    case "boolean":
      return draft.value !== null;
    case "order":
    case "grid":
      return true;
  }
}

function toUserInput(draft: Draft): UserInput {
  switch (draft.kind) {
    case "number":
      return { kind: "number", text: draft.text };
    case "choice":
      return { kind: "choice", index: draft.index ?? -1 };
    case "boolean":
      return { kind: "boolean", value: draft.value ?? false };
    case "order":
      return { kind: "order", order: draft.order };
    case "grid":
      return { kind: "grid", cells: draft.cells.map((row) => row.map((c) => c === "tick")) };
    case "text":
      return { kind: "text", text: draft.text };
  }
}

function serializeAnswer(problem: Problem, input: UserInput): string {
  switch (input.kind) {
    case "number":
      return input.text;
    case "choice":
      return problem.options?.[input.index] ?? String(input.index);
    case "boolean":
      return input.value ? "True" : "False";
    case "order":
      return input.order.map((i) => problem.items?.[i] ?? String(i)).join(", ");
    case "grid":
      return input.cells.map((row) => row.map((c) => (c ? "1" : "0")).join("")).join("|");
    case "text":
      return input.text;
  }
}

/**
 * Task 10 fix (review finding 1, part 3): the message shown when recordAttempt's own,
 * freshest-state re-check refuses a submission. Every reason recordAttempt can return (see
 * lib/domain/attempts.ts) is named here so the child always sees why, in plain language, rather
 * than a submit that silently does nothing.
 */
function refusalMessage(reason?: string): string {
  switch (reason) {
    case "already-solved":
      return "You already got this one right.";
    case "already-revealed":
      return "The explanation for this one is already open.";
    case "no-tries-left":
      return "No tries left on this one right now.";
    case "cooldown":
      return "Hold on, your think time is not done yet.";
    case "needs-what-you-tried":
      return "Write what you tried before this next try.";
    default:
      return "That did not go through. Try again in a moment.";
  }
}

/**
 * Task 24: Check used to just sit disabled on an empty draft -- a washed-out, hard-to-read
 * block with nothing telling a child *why* nothing happens when they press it. Check stays
 * pressable instead (see its disabled prop below, which now only reflects a genuine cooldown/
 * saving-in-progress state), and pressing it on an empty draft teaches the actual rule instead
 * of just refusing silently, the same way refusalMessage above already does for every other
 * reason a submit can be turned away. order/grid drafts are never invalid (draftIsValid always
 * returns true for them), so their branch here is unreachable in practice; it exists only so
 * this switch stays exhaustive.
 */
function emptyDraftMessage(draft: Draft): string {
  switch (draft.kind) {
    case "number":
    case "text":
      return "Type your answer first.";
    case "choice":
      return "Pick an answer first.";
    case "boolean":
      return "Choose true or false first.";
    case "order":
    case "grid":
      return "Finish this one first.";
  }
}

// Review round 2, finding 1: how long ProblemPlayer waits for watchAttemptsForQuest's first
// snapshot before treating the load as stuck rather than merely slow. Long enough that a normal
// cold load (or a brief network blip) never trips it, short enough that a child is never left
// staring at "Getting this problem ready" for anywhere near a real school-day wait.
const ATTEMPTS_TIMEOUT_MS = 10_000;

type Lane = Problem["lane"];
const LANE_LABEL: Record<Lane, string> = {
  warmup: "Warm-up",
  "puzzle-of-week": "Puzzle of the week",
  skills: "Skills",
  shape: "Shape and chance",
  puzzle: "Puzzle",
  check: "Check",
  monster: "Monster problem",
};

/**
 * The problem player (spec 7.3/7.4, task 10). Owns one problem at a time from a warm-up,
 * puzzle-of-week or problem-set step. Every rule about tries, hints, cooldown, the
 * "what did you try" gate and when the explanation opens comes from lib/domain/attempts.ts's
 * viewProblem/recordAttempt -- this component only renders what that view says and calls it
 * again after each write; it never decides a rule itself.
 */
export function ProblemPlayer({ step, quest, progress, problemsProgress, progressLoaded, householdId, profileId, onUpdate, onFinished, onOwnPrimaryChange, reviewNote }: ProblemPlayerProps) {
  const problems: Problem[] = step.kind === "puzzle-of-week" ? [step.problem] : step.problems;

  const [index, setIndex] = useState(() => {
    const firstUnanswered = problems.findIndex((p) => (progress.problemOutcomes[p.id] ?? "unanswered") === "unanswered");
    return firstUnanswered >= 0 ? firstUnanswered : 0;
  });
  const problem = problems[Math.min(index, problems.length - 1)];

  // The opt-in clock on a timed set (lib/domain/clock.ts). The offer replaces the first problem
  // until he chooses; a running clock ticks in the header; the moment the last problem has an
  // outcome the clock stops itself and the minutes are written down, once.
  const timed = isTimedStep(step);
  const clock = timed ? clockFor(progress, step.id) : undefined;
  const clockStartedAt = clock?.startedAt;
  const clockFinishedAt = clock?.finishedAt;
  const offerOpen = timed && progressLoaded && clockOfferOpen(step, progress);
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    if (clockStartedAt === undefined || clockFinishedAt !== undefined) return;
    const tick = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [clockStartedAt, clockFinishedAt]);
  const timedSetDone = timed && step.kind === "problem-set" && setComplete(step, progress);
  const finishingRef = useRef(false);
  useEffect(() => {
    if (!timed || clockStartedAt === undefined || clockFinishedAt !== undefined || !timedSetDone || finishingRef.current) return;
    finishingRef.current = true;
    void onUpdate((prev) => finishClock(prev, step.id, Date.now())).finally(() => {
      finishingRef.current = false;
    });
  }, [timed, clockStartedAt, clockFinishedAt, timedSetDone, onUpdate, step.id]);

  // Task 10 fix (review finding 1, part 1): attemptsLoaded tracks whether
  // watchAttemptsForQuest has delivered at least one snapshot for this quest -- an empty first
  // snapshot still counts, since "no attempts yet" is real information too. Combined with
  // progressLoaded (the prop above) as `hydrated` further down, this is what the render gates
  // the attempt UI on, so a problem already several tries deep never flashes "Tries used: 0 of
  // 3", and a fresh proof/rubric submission never flashes a false "Not yet." before its
  // revealedAt round-trips back through problemsProgress.
  //
  // Review round 2, finding 1: the listener above had no error callback and no timeout, so a
  // permission error or a persistently offline quest that was never cached left attemptsLoaded
  // false forever -- the render below showed only the quiet loading line, with nothing on
  // screen a child could press. attemptsError/attemptsTimedOut track the two ways this can go
  // wrong; attemptsRetryKey lets "Try again" force the effect to tear down and re-subscribe.
  const [attempts, setAttempts] = useState<AttemptDoc[]>([]);
  const [attemptsLoaded, setAttemptsLoaded] = useState(false);
  const [attemptsError, setAttemptsError] = useState(false);
  const [attemptsTimedOut, setAttemptsTimedOut] = useState(false);
  const [attemptsRetryKey, setAttemptsRetryKey] = useState(0);
  // The three loaded/error/timedOut flags above must go back to "loading" whenever this needs to
  // resubscribe (a different household/profile/quest, or "Try again" bumping attemptsRetryKey) --
  // adjusted here during render (React's "adjusting state when a prop changes" pattern), guarded
  // by comparing against the previous render's own key, rather than in the effect below, so the
  // reset lands in the SAME commit as the new key instead of one commit+effect cycle later.
  const attemptsSubscriptionKey = `${householdId}|${profileId}|${quest.id}|${attemptsRetryKey}`;
  const [prevAttemptsSubscriptionKey, setPrevAttemptsSubscriptionKey] = useState(attemptsSubscriptionKey);
  if (attemptsSubscriptionKey !== prevAttemptsSubscriptionKey) {
    setPrevAttemptsSubscriptionKey(attemptsSubscriptionKey);
    setAttemptsLoaded(false);
    setAttemptsError(false);
    setAttemptsTimedOut(false);
  }
  useEffect(() => {
    const timeoutId = setTimeout(() => setAttemptsTimedOut(true), ATTEMPTS_TIMEOUT_MS);
    const unsubscribe = watchAttemptsForQuest(
      householdId,
      profileId,
      quest.id,
      (list) => {
        clearTimeout(timeoutId);
        setAttemptsError(false);
        setAttemptsTimedOut(false);
        setAttempts(list.map((x) => x.attempt));
        setAttemptsLoaded(true);
      },
      (err) => {
        clearTimeout(timeoutId);
        console.error("Wonderloop: could not load attempts for this quest", err);
        setAttemptsError(true);
      },
    );
    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [householdId, profileId, quest.id, attemptsRetryKey]);

  /** Review round 2, finding 1: true once the attempts listener has definitively failed
   * (a real error) or definitively taken too long -- either way, waiting quietly is no longer
   * honest, and the render below switches from the loading line to an actionable message. */
  const attemptsStuck = !attemptsLoaded && (attemptsError || attemptsTimedOut);

  // `now`, moved up from further below (it is still also used down there for the cooldown/tick
  // display): a timestamp captured once, the React-sanctioned way, via a lazy useState
  // initializer that runs exactly one time at mount. Reused below as the fallback firstSeenAt
  // stand-in instead of a fresh Date.now() call, since a fresh call would have to happen during
  // render, which the render phase must never do (see the comment on fallbackFirstSeen).
  const [now, setNow] = useState(() => Date.now());

  // A locally-generated stand-in for firstSeenAt, used only until the write below round-trips
  // back through problemsProgress. Kept stable per problem id (not a fresh timestamp on every
  // render), since the think-time floor is computed from it. Lives in state, not a ref: a ref
  // read during render can silently go stale (nothing re-renders when a ref changes -- exactly
  // the kind of gap this file's own history warns about), and populating it requires calling
  // Date.now(), which -- like any impure call -- must never happen during render (a
  // render can be invoked more than once for reasons that have nothing to do with what actually
  // ends up on screen, e.g. an interrupted render in concurrent mode; a ref mutated during a
  // render that is later thrown away would otherwise leak a wrong, unreachable timestamp into a
  // problem's think-time floor). `now` above already carries a timestamp captured the sanctioned
  // way; reusing it here is at worst ~1s stale relative to a fresh call, negligible next to the
  // tens-of-seconds cooldowns it feeds.
  const [fallbackFirstSeen, setFallbackFirstSeen] = useState<Record<string, number>>({});

  // Task 10 fix (review finding 2, spec 7.2 "he can retry any problem"): "Try it again" starts
  // a fresh attempt cycle by writing a NEW, later firstSeenAt (plus retry:true) to
  // problemsProgress. retryFirstSeen holds that new value locally, optimistically, until the
  // real problemsProgress[problemId].firstSeenAt round-trips past it -- the same "local value
  // wins while it is still ahead of the persisted one" shape as fallbackFirstSeen above, just
  // for a problem that has already been seen once rather than never.
  const [retryFirstSeen, setRetryFirstSeen] = useState<Record<string, number>>({});

  /** Review round 2, finding 2: reverts the optimistic "Try it again" override for one problem.
   * Called from handleRetry's catch -- if the write that actually starts the new cycle never
   * lands, the screen must fall back to the still-persisted, still-finished previous cycle
   * rather than showing a fresh, blank attempt cycle that does not really exist yet. */
  function clearLocalRetry(problemId: string) {
    setRetryFirstSeen((prev) => {
      if (!(problemId in prev)) return prev;
      const next = { ...prev };
      delete next[problemId];
      return next;
    });
  }

  function localRetryAhead(problemId: string): boolean {
    const real = problemsProgress[problemId]?.firstSeenAt;
    const local = retryFirstSeen[problemId];
    return local !== undefined && (real === undefined || local > real);
  }

  function firstSeenAtFor(problemId: string): number | undefined {
    if (localRetryAhead(problemId)) return retryFirstSeen[problemId];
    const real = problemsProgress[problemId]?.firstSeenAt;
    if (real !== undefined) return real;
    return fallbackFirstSeen[problemId];
  }

  /** Whether the CURRENT attempt cycle on this problem is a "Try it again" cycle rather than
   * the original one -- read from the local optimistic override first (see localRetryAhead),
   * falling back to the persisted flag once problemsProgress has caught up, so a page reload
   * mid-retry-cycle still reports true. */
  function isRetryCycleFor(problemId: string): boolean {
    if (localRetryAhead(problemId)) return true;
    return problemsProgress[problemId]?.retry === true;
  }

  // Populate the fallback the moment this problem is first rendered without a real, persisted
  // firstSeenAt -- adjusted here during render (React's "adjusting state when a prop changes"
  // pattern) rather than in an effect, so cycleStart below is correct in THIS render instead of
  // one commit+effect cycle later. A late cycleStart is exactly the kind of gap that has already
  // let a fresh problem's hint/cooldown show as available before it should be (see this file's
  // own history above). Self-correcting: the condition is false again the instant it fires
  // (firstSeenAtFor no longer returns undefined once fallbackFirstSeen has the entry), so this
  // cannot loop.
  if (firstSeenAtFor(problem.id) === undefined) {
    setFallbackFirstSeen((prev) => (problem.id in prev ? prev : { ...prev, [problem.id]: now }));
  }

  const cycleStart = firstSeenAtFor(problem.id)!;

  const realFirstSeenAt = problemsProgress[problem.id]?.firstSeenAt;
  useEffect(() => {
    if (realFirstSeenAt !== undefined) return;
    const fallback = firstSeenAtFor(problem.id);
    // By the time this effect runs, the render-time adjustment above has already committed a
    // fallback for this problem (or a real value has landed) -- fallback is only ever undefined
    // here in the single discarded render before that self-correction, never in the one React
    // actually commits and runs effects for.
    if (fallback === undefined) return;
    void saveQuestProgress(householdId, profileId, quest.id, { problems: { [problem.id]: { firstSeenAt: fallback } } });
    // Only re-fires when the problem changes or its real value finally lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem.id, realFirstSeenAt]);

  // Every attempt on record for this problem, across every past cycle -- NOT yet scoped to the
  // current one. currentCycleProblemState (lib/domain/attempts.ts) does that scoping below,
  // the same shared rebuild lib/data/progress.ts's toProblemState uses for the Parent view, so
  // "current cycle" means the same thing live and after the fact (final review, finding C1).
  const problemAttemptRecords = useMemo(
    () => attempts.filter((a) => a.problemId === problem.id).map((a) => ({ tryNumber: a.tryNumber, correct: a.correct, hintTier: a.hintTier, at: a.at })),
    [attempts, problem.id],
  );

  // Task 10 fix (review finding 1, part 1 continued): watchAttemptsForQuest and
  // QuestShell's watchProgress round-trip independently, and NOT at the same speed -- a fresh
  // attempt (from the fast attempts listener above) can be visible for a real, measured window
  // (verified live: attempts by ~40 ms, revealedAt not until ~500 ms) before problemsProgress's
  // revealedAt (from the slower progress-doc listener) catches up to the SAME submission. That
  // gap is exactly what let a rubric/text submission render "Not yet.", hint 1 and a cooldown
  // before settling to the explanation: attempts said "one wrong try", revealedAt still said
  // "not revealed". localRevealedAt closes it the same way retryFirstSeen closes the
  // firstSeenAt gap above: handleSubmit sets it the instant it knows the real value (no
  // Firestore round trip needed), and it defers to problemsProgress's own value once that has
  // caught up (or gone further, e.g. a later retry).
  const [localRevealedAt, setLocalRevealedAt] = useState<Record<string, number>>({});

  /** Review round 2, finding 2: reverts the optimistic revealedAt override for one problem.
   * Called from handleSubmit's catch -- a genuinely rejected write (permission denied, offline
   * with no queued retry, etc.) must not leave a false "revealed" on screen with only a toast
   * to explain it; this drops back to whatever problemsProgress's real, persisted revealedAt
   * says (undefined, if the write truly never landed). */
  function clearLocalRevealedAt(problemId: string) {
    setLocalRevealedAt((prev) => {
      if (!(problemId in prev)) return prev;
      const next = { ...prev };
      delete next[problemId];
      return next;
    });
  }

  const rawRevealedAt = problemsProgress[problem.id]?.revealedAt;
  const localRevealedForProblem = localRevealedAt[problem.id];
  const candidateRevealedAt =
    localRevealedForProblem !== undefined && (rawRevealedAt === undefined || localRevealedForProblem > rawRevealedAt)
      ? localRevealedForProblem
      : rawRevealedAt;

  const [triedText, setTriedText] = useState(() => problemsProgress[problem.id]?.whatYouTried ?? "");
  const [draft, setDraft] = useState<Draft>(() => freshDraft(problem));
  // Both triedText and draft reset only when the DISPLAYED problem changes, not on every remote
  // update, so a still-typing "what did you try" (or a still-filled-in draft) is never
  // overwritten by its own eventual round trip. Adjusted here during render, guarded by
  // comparing problem.id against the previous render's own value (React's "adjusting state when
  // a prop changes" pattern), instead of in two separate effects, so the reset lands in the same
  // commit as the new problem instead of one commit+effect cycle later -- the two effects this
  // replaced each deliberately fired ONLY on problem.id, not on every render of
  // problemsProgress/problem itself; that same one-shot-per-problem intent is now enforced by
  // the prevProblemId guard.
  // The struggle offer (task 4, concept-first prototype): "Want to meet the idea first?" after
  // two failed tries, alongside the existing hint flow -- never instead of it. Gated purely on
  // content (does this problem's idea have an authored lesson) and on view.triesUsed === 2, the
  // exact same unlock moment HintPanel's tier-3 Socratic hint already uses, so it appears right
  // next to that hint rather than earlier or later. Opening it does not touch Firestore, does
  // not reset triesUsed, does not clear the cooldown timer and does not start a fresh attempt
  // cycle -- see LessonPlayer's own module doc for why it is safe to mount here with zero risk
  // to the problem's own state.
  const lessonForIdea = getLessonForIdea(problem.ideaId);
  const [lessonOfferOpen, setLessonOfferOpen] = useState(false);

  // Task 43 (the working space): `working` mirrors WorkingSpace's own live content -- it fires
  // once on hydration and again on every real edit -- and is used only to decide the try-3 "what
  // did you try" gate's copy (hasWorkingContent(working) below). `pastWorking` is a SEPARATE,
  // deliberately frozen snapshot: pastWorkingCapturedRef records, per problem id, that the very
  // first onContentChange call for that problem has already been captured, so a later edit made
  // during THIS sitting (via WorkingSpace's own panel) never changes what the mistake-box "Your
  // working from last time" block shows -- that block is about what existed before this sitting,
  // not a live mirror of it. Keyed by problem id in a ref (not reset per problem the way
  // prevProblemId-guarded state is) so it stays correct across "Try it again" on the same
  // problem too, and survives for the whole lifetime of this component instance.
  const [working, setWorking] = useState<WorkingContent | undefined>(undefined);
  const [pastWorking, setPastWorking] = useState<WorkingContent | undefined>(undefined);
  const pastWorkingCapturedRef = useRef<Record<string, boolean>>({});
  function handleWorkingContentChange(content: WorkingContent | undefined) {
    setWorking(content);
    if (!pastWorkingCapturedRef.current[problem.id]) {
      pastWorkingCapturedRef.current[problem.id] = true;
      setPastWorking(content);
    }
  }

  const [prevProblemId, setPrevProblemId] = useState(problem.id);
  if (problem.id !== prevProblemId) {
    setPrevProblemId(problem.id);
    setTriedText(problemsProgress[problem.id]?.whatYouTried ?? "");
    setDraft(freshDraft(problem));
    setLessonOfferOpen(false);
    // WorkingSpace's own effect will re-fetch and call onContentChange again for the new
    // problem id shortly (its effect deps include problemId), but that is async -- clearing
    // both here, in the same commit as the problem switch, keeps the try-3 gate and the
    // mistake-box "last time" panel from showing the PREVIOUS problem's working for the one
    // render before that fetch resolves.
    setWorking(undefined);
    setPastWorking(undefined);
  }

  // Task 10 fix (Critical finding 1, the "Next problem" soft-lock): this used to be one
  // `busy` boolean shared across every problem in the step. handleSubmit's own write chain
  // (persistAttempt, saveQuestProgress, onUpdate, the review-item write, recomputeAndSaveSkills
  // -- five sequential awaits) can still be in flight when the LOCAL, synchronous part of a
  // correct/revealing submission already flips view.explanationOpen and renders "Next problem"
  // -- Firestore's own onSnapshot delivers the local echo of the just-written attempt (via
  // watchAttemptsForQuest above) well before that write chain's later awaits (saveQuestProgress,
  // onUpdate, the review write, recomputeAndSaveSkills) resolve, and "Next problem" was never
  // itself gated on busy. Click it in that window and `index` changes to a DIFFERENT problem,
  // but the one shared boolean was still true -- nothing reset it on a problem change -- so the
  // freshly shown problem inherited a "busy" it had nothing to do with, with no spinner or
  // message anywhere to explain it (only a full reload, or waiting out the old problem's own
  // write chain, ever cleared it). Keying pendingProblemIds by problem id instead means a
  // problem is only ever shown as busy while ITS OWN submit/retry is actually in flight; moving
  // on to a different, untouched problem can never inherit another problem's pending state.
  const [pendingProblemIds, setPendingProblemIds] = useState<Set<string>>(() => new Set());
  function markPending(problemId: string) {
    setPendingProblemIds((prev) => {
      if (prev.has(problemId)) return prev;
      const next = new Set(prev);
      next.add(problemId);
      return next;
    });
  }
  function clearPending(problemId: string) {
    setPendingProblemIds((prev) => {
      if (!prev.has(problemId)) return prev;
      const next = new Set(prev);
      next.delete(problemId);
      return next;
    });
  }
  const busy = pendingProblemIds.has(problem.id);
  const [error, setError] = useState<string | null>(null);
  // Knowing what you know (7 September 2026): the confidence tapped before this problem's
  // check, the id of the attempt just written (so a miss kind can land on it), and which
  // problems have already been asked what kind of miss it was.
  const [confidenceByProblem, setConfidenceByProblem] = useState<Record<string, Confidence>>({});
  const [lastAttemptId, setLastAttemptId] = useState<Record<string, string>>({});
  const [missAnswered, setMissAnswered] = useState<Record<string, MissKind>>({});
  const [ideaCount, setIdeaCount] = useState<number | null>(null);

  const state: ProblemState = useMemo(
    () => currentCycleProblemState(problem.id, cycleStart, problemAttemptRecords, triedText, candidateRevealedAt),
    [problem.id, problemAttemptRecords, triedText, cycleStart, candidateRevealedAt],
  );

  const view = viewProblem(problem, state, now);

  // Task 10 fix (review finding 1, part 1): the attempt UI (tries, hints, cooldown, "Not
  // yet.", the explanation) is only rendered once BOTH of ProblemPlayer's independently-syncing
  // sources have delivered for real -- attemptsLoaded (this component's own watchAttemptsForQuest)
  // and progressLoaded (QuestShell's watchProgress, which problemsProgress and problem's
  // firstSeenAt/revealedAt come from). Before that, `state` above is built from whatever these
  // two sources currently hold, which can be an empty attempts array or a not-yet-real
  // firstSeenAt -- exactly the false "unanswered, 0 tries" state the review caught on screen.
  const hydrated = attemptsLoaded && progressLoaded;

  useEffect(() => {
    if (view.explanationOpen) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [view.explanationOpen, problem.id]);

  // Task 40 fix (double-CTA on the last problem in a set), widened by task 41: the three
  // conditions below are exactly the three places the render further down puts up its own
  // ENABLED variant="primary" button -- "Check" while view.canSubmit (matches the button's own
  // `disabled` prop below exactly: reporting this while outcome is merely "unanswered" but Check
  // sits disabled/kraft on a between-tries cooldown or the "what did you try" gate would hide
  // "Continue" with nothing pressable at that moment beyond the quiet "Skip for now" -- the same
  // empty-textarea dead end ExplainStep/DebateStepPlaceholder/ArtifactStep/LessonPlayer were each
  // fixed to avoid), "Next problem" mid-set with the explanation open (never disabled), "Next
  // step" on the last problem with the explanation open (never disabled). Any one of them means
  // this component already has the one live primary action on screen for this step; reported up
  // to QuestShell so it can hide its own "Continue" for exactly as long as one of these is
  // showing, the same "own action is primary while unfinished" rule task 41 applied to every
  // other step kind, not only the narrow last-problem window task 40 fixed. The cleanup reports
  // false on unmount (a step change, via key={step.id} in QuestShell) as a second, independent
  // path to the same reset QuestShell's own stepIndex-keyed effect already performs.
  const ownPrimaryVisible =
    hydrated &&
    (offerOpen ||
      (view.canSubmit && !busy) ||
      (view.explanationOpen && index < problems.length - 1) ||
      (view.explanationOpen && index >= problems.length - 1 && Boolean(onFinished)));
  useEffect(() => {
    onOwnPrimaryChange?.(ownPrimaryVisible);
    return () => onOwnPrimaryChange?.(false);
  }, [ownPrimaryVisible, onOwnPrimaryChange]);

  // ideaCount must go back to null the moment the explanation panel closes (a fresh "Try it
  // again" on the SAME problem, or moving to a new one), so the NEXT open never briefly shows the
  // previous cycle's stale count before the fetch below resolves. Adjusted here during render,
  // guarded by comparing view.explanationOpen against the previous render's own value (React's
  // "adjusting state when a prop changes" pattern), rather than as the effect's synchronous
  // early-return branch, so the reset lands in the same commit as the close instead of one
  // commit+effect cycle later.
  const [wasExplanationOpen, setWasExplanationOpen] = useState(view.explanationOpen);
  if (view.explanationOpen !== wasExplanationOpen) {
    setWasExplanationOpen(view.explanationOpen);
    if (!view.explanationOpen) setIdeaCount(null);
  }

  useEffect(() => {
    if (!view.explanationOpen) return;
    let cancelled = false;
    void (async () => {
      const db = getDb();
      const snap = await getDocs(query(attemptsCol(db, householdId, profileId), where("ideaIds", "array-contains", problem.ideaId)));
      const distinct = new Set(snap.docs.map((d) => d.data().problemId));
      if (!cancelled) setIdeaCount(distinct.size);
    })();
    return () => {
      cancelled = true;
    };
  }, [view.explanationOpen, problem.id, problem.ideaId, householdId, profileId]);

  function goNext() {
    setIndex((i) => Math.min(i + 1, problems.length - 1));
  }

  async function handleSubmit() {
    if (!hydrated || busy) return;
    if (!draftIsValid(draft)) {
      setError(emptyDraftMessage(draft));
      return;
    }
    // `problem` is this render's problem, closed over for the rest of this async function --
    // every markPending/clearPending/revert below stays pinned to THIS problem even if the
    // child has already moved on to a different one by the time an await here settles (see
    // pendingProblemIds above).
    markPending(problem.id);
    setError(null);
    // Declared outside the try so the catch block below can see whether this attempt was in the
    // middle of an optimistic reveal when it failed (review round 2, finding 2).
    let revealsNow = false;
    try {
      const submitNow = Date.now();
      const input = toUserInput(draft);
      const result = recordAttemptDomain(problem, state, input, submitNow);
      if (result.state === state) {
        // Task 10 fix (review finding 1, part 3): recordAttempt recomputed viewProblem from the
        // freshest `state` this render holds and refused (canSubmit was false by the time this
        // landed -- a cooldown not actually over, a stale "unanswered" from a listener
        // round-trip still in flight, etc.). It returns the very `state` passed in, unchanged,
        // when it refuses, so identity is the signal. Surface the reason and write nothing.
        setError(refusalMessage(result.reason));
        return;
      }
      const newAttempt = result.state.attempts[result.state.attempts.length - 1]!;

      const revealed = result.reason === "not-auto-graded";
      const retry = isRetryCycleFor(problem.id);
      revealsNow = result.state.revealedAt !== undefined && result.state.revealedAt !== state.revealedAt;
      // Task 10 fix (review finding 1, part 1 continued): set the local optimistic override
      // BEFORE the first `await` below, in the same synchronous stretch of this event handler,
      // not after persistAttempt resolves. watchAttemptsForQuest's onSnapshot for this very
      // write can otherwise fire (and re-render with the new, still-wrong-looking attempt) in
      // the gap between that await settling and this code's own continuation -- an ordering
      // race between two independent microtask queues, not something safe to rely on. Setting
      // it here means every subsequent render, however it gets triggered, already has it.
      if (revealsNow) setLocalRevealedAt((prev) => ({ ...prev, [problem.id]: result.state.revealedAt! }));

      // Only carry a confidence mark when one was tapped: Firestore refuses an undefined field.
      const confidence = confidenceByProblem[problem.id];
      const attemptId = await persistAttempt(householdId, profileId, {
        ...(confidence ? { confidence } : {}),
        questId: quest.id,
        problemId: problem.id,
        answer: serializeAnswer(problem, input),
        correct: newAttempt.correct,
        tryNumber: newAttempt.tryNumber,
        hintTier: newAttempt.hintTier,
        ideaIds: [problem.ideaId],
        revealed,
        retry,
        cycleStartedAt: state.firstSeenAt,
        at: newAttempt.at,
      });
      setLastAttemptId((prev) => ({ ...prev, [problem.id]: attemptId }));

      // A partial merge, not a full ProblemProgress: saveQuestProgress's Firestore write
      // (setDoc with merge: true) only ever touches the keys actually present here, but its
      // declared type models the whole document shape, so the cast documents that the merge
      // semantics -- not the type -- are what makes a firstSeenAt-less patch safe.
      const problemPatch: Partial<ProblemProgress> = {};
      if (triedText.trim()) problemPatch.whatYouTried = triedText.trim();
      if (revealsNow) problemPatch.revealedAt = result.state.revealedAt;
      if (Object.keys(problemPatch).length > 0) {
        await saveQuestProgress(householdId, profileId, quest.id, {
          problems: { [problem.id]: problemPatch } as Record<string, ProblemProgress>,
        });
      }

      const newView = viewProblem(problem, result.state, submitNow);
      // Task 10 fix (spec 7.2 "he cannot un-complete anything"): a retry cycle never touches
      // quest-level completion. Its own outcome starts back at "unanswered" the instant "Try it
      // again" is clicked, which would un-complete the step the moment this ran if it were
      // allowed through; the ORIGINAL cycle's recorded outcome is what stays.
      if (!retry) {
        await onUpdate((prev) => ({ ...prev, problemOutcomes: { ...prev.problemOutcomes, [problem.id]: newView.outcome } }));
      }

      // Mistake box (spec 7.4): only a first try schedules or clears a review item, and only
      // for the original cycle -- a voluntary retry is not the "wrong on first try" signal spec
      // 7.4 tracks, and could otherwise re-flag an already-mastered problem just because he
      // chose to practice it again.
      if (newAttempt.tryNumber === 1 && !retry) {
        // Review mode always needs the current item (to update it); the plain quest flow only
        // needs it on a wrong answer (scheduleOnMiss reads the prior miss count), never on a
        // correct one (clearReviewItem needs no prior state) -- kept lazy so a correct-first-try
        // submission in the normal quest flow costs no extra read, same as before this change.
        async function fetchExisting(): Promise<ReviewItem | undefined> {
          const db = getDb();
          const existingSnap = await getDoc(reviewItemRef(db, householdId, profileId, problem.id));
          return existingSnap.exists() ? { problemId: problem.id, ...existingSnap.data() } : undefined;
        }

        if (quest.id === REVIEW_QUEST_ID) {
          // Task 17: this attempt is on a due mistake-box item, not the problem's original
          // quest cycle. clearOnVariantSuccess (lib/domain/review.ts), not scheduleOnMiss, owns
          // what happens next: a first-try correct clears the item outright; anything else
          // reschedules it 7 days out and never punishes beyond that.
          //
          // 15 problems have no authored variant and show the ORIGINAL problem again in review
          // (lib/domain/review.ts's problemForReview). Those are always "text"/rubric problems
          // (schema: every auto-graded kind requires a variant), which checkAnswer never marks
          // correct -- the machine has no notion of "right" for them, exactly as on their very
          // first attempt, where the parent's thumbs-up is the real judgement (spec 7.3). `revealed`
          // is true only for that not-auto-graded path, so treating it as a clearing outcome here
          // gives a second look at an explain-it the same one-submission resolution its first
          // attempt already gets, instead of an item that can never clear itself no matter what
          // he writes.
          const firstTryCorrect = revealed || newAttempt.correct;
          // existing is expected to exist (a due item was, by definition, already in the queue),
          // but the guard keeps this from throwing if it was cleared from another tab mid-review.
          const existing = await fetchExisting();
          if (existing) {
            const updated = clearOnVariantSuccess(existing, firstTryCorrect, submitNow);
            if (updated) await upsertReviewItem(householdId, profileId, updated);
            else await clearReviewItem(householdId, profileId, problem.id);
          }
        } else if (newAttempt.correct) {
          await clearReviewItem(householdId, profileId, problem.id);
        } else {
          const existing = await fetchExisting();
          await upsertReviewItem(householdId, profileId, scheduleOnMiss(problem.id, existing, submitNow));
        }
      }

      await recomputeAndSaveSkills(householdId, profileId);
      setNow(Date.now());
    } catch (err) {
      console.error("Wonderloop: could not save that attempt", err);
      // Review round 2, finding 2: the optimistic revealedAt override was set before the first
      // await above so the render never raced the listener; a rejected write means that
      // optimism was wrong, so it is reverted here rather than left to lie until the next
      // successful round trip overwrites it.
      if (revealsNow) clearLocalRevealedAt(problem.id);
      setError("Could not save just now. Check your connection; it will try again.");
    } finally {
      clearPending(problem.id);
    }
  }

  /**
   * "Try it again" (review finding 2, spec 7.2: "He can retry any problem... history is kept,
   * the newest is shown"). Starts a fresh attempt cycle: a new firstSeenAt, in effect
   * immediately via retryFirstSeen and persisted to problemsProgress alongside retry:true, so
   * every attempt this cycle records is flagged retry:true (skills.ts then scores it at 0,
   * never touching the points already earned). Everything already recorded stays in Firestore
   * untouched -- currentCycleProblemState filters older attempts out of view by cycleStart, it
   * never deletes them.
   */
  async function handleRetry() {
    if (!hydrated || busy) return;
    markPending(problem.id);
    setError(null);
    try {
      const retryAt = Date.now();
      setRetryFirstSeen((prev) => ({ ...prev, [problem.id]: retryAt }));
      setTriedText("");
      setDraft(freshDraft(problem));
      await saveQuestProgress(householdId, profileId, quest.id, {
        problems: { [problem.id]: { firstSeenAt: retryAt, whatYouTried: "", retry: true } } as Record<string, ProblemProgress>,
      });
      setNow(Date.now());
    } catch (err) {
      console.error("Wonderloop: could not start that problem again", err);
      // Review round 2, finding 2: retryFirstSeen was set before the first await above so the
      // fresh cycle showed immediately; a rejected write means the cycle never actually
      // started, so this reverts back to the real, still-persisted previous cycle rather than
      // leaving a blank attempt cycle on screen that Firestore never agreed to.
      clearLocalRetry(problem.id);
      setError("Could not start that again just now. Check your connection; it will try again.");
    } finally {
      clearPending(problem.id);
    }
  }

  function renderInput(): ReactNode {
    const disabled = !view.canSubmit || busy;
    switch (draft.kind) {
      case "number":
        // Task 43: derived purely from the authored answer (numericInputMode), never from what
        // he has typed so far -- the keyboard is right from the very first character.
        return (
          <NumberInput
            value={draft.text}
            onChange={(text) => setDraft({ kind: "number", text })}
            onEnter={() => void handleSubmit()}
            disabled={disabled}
            inputMode={numericInputMode(problem.answer)}
          />
        );
      case "choice":
        return <ChoiceInput options={problem.options ?? []} value={draft.index} onChange={(i) => setDraft({ kind: "choice", index: i })} disabled={disabled} />;
      case "boolean":
        return <TrueFalseInput value={draft.value} onChange={(v) => setDraft({ kind: "boolean", value: v })} disabled={disabled} />;
      case "order":
        return <OrderInput items={problem.items ?? []} order={draft.order} onChange={(order) => setDraft({ kind: "order", order })} disabled={disabled} />;
      case "grid":
        return (
          <GridInput
            rows={problem.rows ?? []}
            cols={problem.cols ?? []}
            cells={draft.cells}
            onChange={(cells) => setDraft({ kind: "grid", cells })}
            disabled={disabled}
          />
        );
      case "text":
        return <TextInput value={draft.text} onChange={(text) => setDraft({ kind: "text", text })} disabled={disabled} />;
    }
  }

  const idea = getIdea(problem.ideaId);
  const showNotYet = view.outcome === "unanswered" && view.triesUsed > 0;
  const buttonLabel =
    view.cooldownEndsAt !== undefined && now < view.cooldownEndsAt ? `Try again in ${formatMMSS(view.cooldownEndsAt - now)}` : "Check";

  if (offerOpen) {
    return (
      <section className="tr-step tr-problem tr-clock-offer" aria-labelledby={`${step.id}-clock-title`}>
        <div className="tr-pnum">
          <span className="tr-eyebrow">{problems.length} problems</span>
          <Chip>{LANE_LABEL[problem.lane]}</Chip>
        </div>
        <h3 id={`${step.id}-clock-title`} className="tr-problem-prompt">
          This set can run with a clock.
        </h3>
        <p className="tr-step__body">
          The clock counts up and writes down how many minutes the whole set took. Nobody scores it, no problem changes,
          and you can say no. It is only there so you can see your own pace.
        </p>
        <div className="tr-step__actions">
          <Button variant="primary" onClick={() => void onUpdate((prev) => startClock(prev, step.id, Date.now()))}>
            Start the clock
          </Button>
          <Button variant="quiet" onClick={() => void onUpdate((prev) => declineClock(prev, step.id))}>
            Do it without the clock
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="tr-step tr-problem" aria-labelledby={`${problem.id}-title`}>
      <div className="tr-pnum">
        {problems.length > 1 ? (
          <span className="tr-eyebrow">
            Problem {Math.min(index, problems.length - 1) + 1} of {problems.length}
          </span>
        ) : null}
        <Chip>{LANE_LABEL[problem.lane]}</Chip>
        {clock && clockRunning(clock) ? (
          <Chip>
            <span aria-live="off">Clock {formatClock(clockSeconds(clock, clockNow))}</span>
          </Chip>
        ) : null}
      </div>
      {reviewNote ? <p className="tr-step__note">{reviewNote}</p> : null}
      {problem.figure ? <ProblemFigure figure={problem.figure} /> : null}
      <h3 id={`${problem.id}-title`} className="tr-problem-prompt">
        {problem.prompt}
      </h3>

      {/* Task 43: one quiet button, per problem id, that opens the working space -- present on
          every problem regardless of outcome, since he might want to work something out before
          ever pressing Check. Keyed by problem.id: switching problems (or reaching the same
          problem again on "Try it again", where the key stays the same on purpose -- a working
          belongs to the problem id, not one attempt cycle) mounts/re-hydrates the right one. */}
      <WorkingSpace
        key={problem.id}
        householdId={householdId}
        profileId={profileId}
        problemId={problem.id}
        onContentChange={handleWorkingContentChange}
        // Fetch immediately, before he has opened the panel, only when something on screen
        // actually needs to know the content right away: the mistake-box "last time" block
        // (review mode, always) or the try-3 gate (once triesUsed reaches 2, right before it
        // would render). An ordinary, freshly-shown problem he never opens the panel on stays
        // lazy -- see WorkingSpace's own eagerLoad comment for why this matters beyond tidiness.
        eagerLoad={quest.id === REVIEW_QUEST_ID || view.triesUsed >= 2}
      />

      {/* Task 43 (spec: "the return is the point"): on a mistake-box return, whatever he wrote
          or drew here before this sitting shows again, read-only, right alongside the variant --
          not tucked inside the working-space panel he would have to think to open. pastWorking
          is frozen at the first load for this problem id (see its own comment above), so
          reopening the panel above and adding to it during THIS sitting never changes what this
          block shows. */}
      {quest.id === REVIEW_QUEST_ID && hasWorkingContent(pastWorking) ? (
        <PastWorking heading="Your working from last time" content={pastWorking!} />
      ) : null}

      {error ? <Toast tone="hint" message={error} onDismiss={() => setError(null)} /> : null}

      {!hydrated ? (
        // Task 10 fix (review finding 1, part 1): a quiet loading state, not the attempt UI,
        // until both watchAttemptsForQuest and QuestShell's watchProgress have delivered.
        // Review round 2, finding 1: that loading state must never be a dead end. Skip stays
        // reachable the whole time, and once the attempts listener has genuinely failed or
        // taken too long (attemptsStuck), the quiet line is replaced by a real message plus a
        // "Try again" that forces a fresh subscription (attemptsRetryKey), so a child is never
        // stuck on a screen with nothing to press.
        <div className="tr-problem__wait">
          <p className={attemptsStuck ? "tr-problem__stuck" : "tr-problem__loading"}>
            {attemptsStuck
              ? "This is taking too long. Check the connection and try again."
              : "Getting this problem ready…"}
          </p>
          <div className="tr-step__actions">
            {attemptsStuck ? (
              <Button variant="quiet" onClick={() => setAttemptsRetryKey((k) => k + 1)}>
                Try again
              </Button>
            ) : null}
            <Button variant="quiet" onClick={goNext} disabled={index >= problems.length - 1}>
              Skip for now
            </Button>
          </div>
        </div>
      ) : (
        <>
          {view.outcome === "unanswered" ? (
            <>
              {renderInput()}
              {view.triesUsed === 2 ? (
                <div className="tr-tried">
                  {/* Task 43: if a working already exists for this problem, the gate asks
                      what he would ADD to it -- with the working itself shown right there
                      -- instead of asking into thin air as if nothing had happened yet.
                      `working` is WorkingSpace's own live content (not the frozen
                      pastWorking used for the mistake-box block above), so this reflects
                      notes he wrote just now, in this same sitting, before reaching try 3.
                      Everything below the `if` is byte-for-byte the original gate, kept
                      exactly for the no-working case. */}
                  {hasWorkingContent(working) ? (
                    <>
                      <p className="tr-tried__has-working">You have some working saved.</p>
                      <PastWorking content={working!} compact />
                      <label htmlFor={`${problem.id}-tried`}>Before try 3: what would you add?</label>
                      <input
                        id={`${problem.id}-tried`}
                        value={triedText}
                        onChange={(e) => setTriedText(e.target.value)}
                        placeholder="I would add..."
                        disabled={busy}
                      />
                    </>
                  ) : (
                    <>
                      <label htmlFor={`${problem.id}-tried`}>Before try 3: what did you try?</label>
                      <input
                        id={`${problem.id}-tried`}
                        value={triedText}
                        onChange={(e) => setTriedText(e.target.value)}
                        placeholder="I tried..."
                        disabled={busy}
                      />
                    </>
                  )}
                  <small>One sentence. It goes in your journal, not a grade.</small>
                </div>
              ) : null}
              {view.triesUsed === 0 ? (
                <div className="tr-confidence" role="group" aria-label="How sure are you?">
                  <span className="tr-confidence__label">How sure are you?</span>
                  {(["sure", "probably", "guessing"] as Confidence[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`tr-pill${confidenceByProblem[problem.id] === c ? " tr-pill--on" : ""}`}
                      aria-pressed={confidenceByProblem[problem.id] === c}
                      onClick={() => setConfidenceByProblem((prev) => ({ ...prev, [problem.id]: c }))}
                    >
                      {CONFIDENCE_LABEL[c]}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="tr-answer__row">
                <Button variant="primary" onClick={() => void handleSubmit()} disabled={!view.canSubmit || busy}>
                  {buttonLabel}
                </Button>
                {view.needsWhatYouTried ? (
                  <span className="tr-tries tr-tries--gate">Write what you tried above, then Check wakes up.</span>
                ) : null}
                {showNotYet ? (
                  // key={view.triesUsed}: Plan 4 task 35's gentle wrong-answer nudge (app/globals.css's
                  // tr-nudge-in) is a CSS entrance animation, which only plays when this element
                  // actually mounts. Without a key here the same DOM node would persist across a
                  // second or third wrong try (only its already-static text content), so the nudge
                  // would play once and never again; keying by triesUsed forces a fresh mount --
                  // and a fresh, gentle nudge -- on every miss.
                  <span className="tr-no-msg" key={view.triesUsed}>
                    {view.triesUsed === 1 && confidenceByProblem[problem.id] === "sure" ? "Not yet. You were sure; what made it feel certain?" : "Not yet."}
                  </span>
                ) : null}
                <span className="tr-tries">
                  Tries used: {view.triesUsed} of 3
                </span>
              </div>
              {view.triesUsed === 1 && lastAttemptId[problem.id] && !isRetryCycleFor(problem.id) ? (
                <div className="tr-confidence" role="group" aria-label="What kind of miss was that?">
                  <span className="tr-confidence__label">What kind of miss was that?</span>
                  {(["misread", "did-not-know", "slipped"] as MissKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`tr-pill${missAnswered[problem.id] === k ? " tr-pill--on" : ""}`}
                      aria-pressed={missAnswered[problem.id] === k}
                      onClick={() => {
                        setMissAnswered((prev) => ({ ...prev, [problem.id]: k }));
                        void setAttemptMissKind(householdId, profileId, lastAttemptId[problem.id]!, k).catch(() => undefined);
                      }}
                    >
                      {MISS_LABEL[k]}
                    </button>
                  ))}
                </div>
              ) : null}
              {view.triesUsed > 0 ? (
                <div className="tr-cool">
                  <div>
                    <HintPanel
                      hints={problem.hints}
                      unlocked={view.hintsUnlocked}
                      socraticHint={problem.socraticHint}
                      tier3Available={view.tier3HintAvailable}
                    />
                    {view.triesUsed === 2 && lessonForIdea ? (
                      <div className="tr-lesson-offer">
                        <p>Want to meet the idea first?</p>
                        <Button variant="secondary" onClick={() => setLessonOfferOpen(true)}>
                          Meet the idea
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {view.cooldownEndsAt !== undefined && now < view.cooldownEndsAt ? (
                    <CooldownTimer targetMs={view.cooldownEndsAt} now={now} label="Think time before your next try. The hint above is yours to use." />
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {view.outcome === "exhausted" && !view.explanationOpen ? (
            <div className="tr-cool">
              <CooldownTimer
                targetMs={view.explanationOpensAt ?? now}
                now={now}
                label="How it works opens after this much more think time on this problem."
              />
            </div>
          ) : null}

          {view.explanationOpen ? (
            <>
              <ExplanationPanel problem={problem} outcome={view.outcome} retry={isRetryCycleFor(problem.id)} />
              {idea ? <IdeaCard idea={idea} count={ideaCount ?? 1} /> : null}
            </>
          ) : null}

          <div className="tr-step__actions">
            {view.outcome === "unanswered" ? (
              <Button variant="quiet" onClick={goNext} disabled={busy || index >= problems.length - 1}>
                Skip for now
              </Button>
            ) : null}
            {view.outcome !== "unanswered" ? (
              <Button variant="quiet" onClick={() => void handleRetry()} disabled={busy}>
                Try it again
              </Button>
            ) : null}
            {view.explanationOpen && index < problems.length - 1 ? (
              <Button variant="primary" onClick={goNext}>
                Next problem
              </Button>
            ) : null}
            {view.explanationOpen && index >= problems.length - 1 ? (
              <>
                <p className="tr-step__done">That was the last problem in this set.</p>
                {clock && minutesToFinish(clock) !== undefined ? (
                  <p className="tr-step__note">
                    Finished in {minutesToFinish(clock)} {minutesToFinish(clock) === 1 ? "minute" : "minutes"} with the clock. Nobody
                    scores that; it is only how long the set took.
                  </p>
                ) : null}
                {onFinished ? (
                  <Button variant="primary" onClick={onFinished}>
                    Next step
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </>
      )}

      {lessonOfferOpen && lessonForIdea ? (
        // The struggle-offer overlay: LessonPlayer mounted fresh (key={lessonForIdea.id}) with
        // its own onDone just closing this overlay -- nothing about opening, playing or
        // finishing a lesson here writes to problemsProgress, attempts, skills or reviewQueue,
        // and closing it (Close, or finishing the last beat) returns to this exact problem with
        // its tries, cooldown and hint state completely untouched.
        <div className="tr-lesson-overlay" role="dialog" aria-label={lessonForIdea.title}>
          <div className="tr-lesson-card">
            <button type="button" className="tr-lesson-card__close" onClick={() => setLessonOfferOpen(false)}>
              Close
            </button>
            <LessonPlayer key={lessonForIdea.id} lesson={lessonForIdea} onDone={() => setLessonOfferOpen(false)} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
