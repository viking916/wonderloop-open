"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProblemPlayer } from "@/components/quest/ProblemPlayer";
import { ProblemFigure } from "@/components/quest/ProblemFigure";
import { StepBody } from "@/components/quest/StepBody";
import { getLadderGraph, getLadderTopic, ladderQuestFor } from "@/lib/content/app-content";
import type { LadderProblem, LadderTopic, LadderTopicMeta, Step } from "@/lib/content/schema";
import { emptyQuestProgress, type QuestProgress } from "@/lib/domain/completion";
import {
  BREAK_MINUTES, FIRST_RETRIEVAL_COUNT, RETRIEVAL_COUNT, TOPIC_COUNT,
  applyProbe, applyRetrievalResult, emptyLadderState, emptyTopicState, fluencyPassed, guessingRun, markMastered, masteryBarMet,
  nextTopic, pickFluencyProblems, pickProbeProblems, pickRetrievalProblems, pickStretch, pickTopicProblems, placementCandidates,
  recordTopicResult, retrievalDue, retrievalEntriesFor, roundsForDay,
  type LadderState, type SkillRetrieval, type TopicState,
} from "@/lib/domain/ladder";
import { saveLadderState, saveRetrieval, saveSession, saveTopicState, watchLadderState, watchRetrieval, watchTopicStates } from "@/lib/data/ladder";
import { watchAttemptsForQuest, watchProgress } from "@/lib/data/progress";
import type { AttemptDoc, ProgressDoc } from "@/lib/data/types";

/**
 * A Ladder session (docs/superpowers/specs/2026-09-08-math-ladder-design.md): rounds of
 * retrieval, the current topic, and one stretch problem, with a break between rounds. During
 * placement the rounds are probes instead. Every problem is served through the ordinary
 * ProblemPlayer, one problem per instance, under a per-session synthetic quest id so a problem
 * served again in a later session starts a fresh attempt cycle. Results are read back from the
 * session's attempts (first try correct, confidence), which is also what calibration, the
 * skills map and the mistake box read.
 */
type Phase = "idea" | "retrieval" | "topic" | "fluency" | "stretch" | "probe" | "break" | "done";
type Queued = { problem: LadderProblem; phase: Phase; entry?: SkillRetrieval; topicId: string };

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function LadderSession({ householdId, profileId }: { householdId: string; profileId: string }) {
  const graph = useMemo(() => getLadderGraph(), []);
  const authored = useMemo(() => graph.filter((t) => getLadderTopic(t.id)), [graph]);
  const topicsById = useMemo(() => Object.fromEntries(authored.map((t) => [t.id, getLadderTopic(t.id)!])) as Record<string, LadderTopic>, [authored]);

  const [state, setState] = useState<LadderState | undefined>(undefined);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [topicStates, setTopicStates] = useState<Record<string, TopicState>>({});
  const [retrieval, setRetrieval] = useState<SkillRetrieval[]>([]);
  useEffect(() => watchLadderState(householdId, profileId, (s) => { setState(s); setStateLoaded(true); }), [householdId, profileId]);
  useEffect(() => watchTopicStates(householdId, profileId, setTopicStates), [householdId, profileId]);
  useEffect(() => watchRetrieval(householdId, profileId, setRetrieval), [householdId, profileId]);

  // The session in progress on this screen.
  const [session, setSession] = useState<{ number: number; questId: string; day: number; rounds: number; round: number; startedAt: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("idea");
  const [queue, setQueue] = useState<Queued[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [probeTopic, setProbeTopic] = useState<LadderTopicMeta | undefined>(undefined);
  const [fluencyStart, setFluencyStart] = useState<number | undefined>(undefined);
  const [note, setNote] = useState<string | undefined>(undefined);
  const [breakUntil, setBreakUntil] = useState<number | undefined>(undefined);
  const [tick, setTick] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Attempts and the progress doc for this session's quest id.
  const [attempts, setAttempts] = useState<Array<{ id: string; attempt: AttemptDoc }>>([]);
  const [progressDoc, setProgressDoc] = useState<ProgressDoc | undefined>(undefined);
  const [progressLoaded, setProgressLoaded] = useState(false);
  useEffect(() => {
    if (!session) return;
    const unsubA = watchAttemptsForQuest(householdId, profileId, session.questId, setAttempts);
    const unsubP = watchProgress(householdId, profileId, (list) => { setProgressDoc(list.find((p) => p.questId === session.questId)?.progress); setProgressLoaded(true); });
    return () => { unsubA(); unsubP(); };
  }, [householdId, profileId, session]);

  const current = queue[queueIndex];
  const currentTopicMeta = state?.currentTopic ? graph.find((t) => t.id === state.currentTopic) : undefined;
  const currentTopic = state?.currentTopic ? topicsById[state.currentTopic] : undefined;

  // Local quest progress for the player: one problem per instance, reset per problem.
  const [questProgress, setQuestProgress] = useState<QuestProgress>(() => emptyQuestProgress());
  const onUpdate = useMemo(() => async (updater: (prev: QuestProgress) => QuestProgress) => { setQuestProgress((p) => updater(p)); }, []);

  const seedRef = useRef(0);
  const seed = () => (seedRef.current = (seedRef.current + 7919) % 1_000_003) + (session?.number ?? 0) * 101;

  async function startSession() {
    const now = Date.now();
    const base = state ?? emptyLadderState(now);
    const number = base.sessionCount + 1;
    const day = new Date(now).getDay();
    const rounds = roundsForDay(day);
    const next: LadderState = { ...base, sessionCount: number, openSession: { number, day: DAY_NAMES[day], round: 0, startedAt: now } };
    if (!next.currentTopic && next.placementDone) next.currentTopic = nextTopic(graph.filter((t) => topicsById[t.id]), topicStates)?.id;
    await saveLadderState(householdId, profileId, next);
    await saveSession(householdId, profileId, { number, day: DAY_NAMES[day], startedAt: now, rounds, minutes: 0 });
    setAttempts([]);
    setSession({ number, questId: `ladder-${number}`, day, rounds, round: 0, startedAt: now });
    beginRound(0, next, number);
  }

  function beginRound(round: number, s: LadderState, sessionNumber: number) {
    setQueueIndex(0);
    setQuestProgress(emptyQuestProgress());
    setNote(undefined);
    if (!s.placementDone) {
      const candidates = placementCandidates(graph.filter((t) => topicsById[t.id]), topicStates);
      if (candidates.length === 0) { void finishPlacement(s); return; }
      const t = candidates[0];
      setProbeTopic(t);
      setQueue(pickProbeProblems(topicsById[t.id], seed()).map((problem) => ({ problem, phase: "probe" as Phase, topicId: t.id })));
      setPhase("probe");
      return;
    }
    const topicId = s.currentTopic;
    const topic = topicId ? topicsById[topicId] : undefined;
    const ts = topicId ? (topicStates[topicId] ?? emptyTopicState()) : emptyTopicState();
    const dueEntries = retrievalDue(retrieval, sessionNumber);
    const retrievalItems = pickRetrievalProblems(dueEntries, topicsById, round === 0 ? FIRST_RETRIEVAL_COUNT : RETRIEVAL_COUNT, seed())
      .map(({ entry, problem }) => ({ problem, phase: "retrieval" as Phase, entry, topicId: entry.topicId }));
    const topicItems = topic ? pickTopicProblems(topic, ts, TOPIC_COUNT, seed()).map((problem) => ({ problem, phase: "topic" as Phase, topicId: topic.id })) : [];
    const stretchProblem = topic ? pickStretch(topic, ts.served, seed()) : undefined;
    const stretchItems = stretchProblem ? [{ problem: unhinted(stretchProblem), phase: "stretch" as Phase, topicId: topic!.id }] : [];
    setQueue([...retrievalItems, ...topicItems, ...stretchItems]);
    // The idea card opens a topic the first time it is worked in this session.
    const firstTimeToday = topic && !ts.sessions.includes(sessionNumber);
    setPhase(firstTimeToday ? "idea" : retrievalItems.length ? "retrieval" : topicItems.length ? "topic" : "done");
  }

  async function finishPlacement(s: LadderState) {
    const first = nextTopic(graph.filter((t) => topicsById[t.id]), topicStates);
    const next = { ...s, placementDone: true, currentTopic: first?.id };
    await saveLadderState(householdId, profileId, next);
    setNote("Placement done. The Ladder starts at " + (first?.title ?? "the top") + ".");
    setPhase("done");
  }

  /** The first-try result for a problem in this session, from its attempts. */
  function resultFor(problemId: string): { correct: boolean; confidence?: AttemptDoc["confidence"] } | undefined {
    const first = attempts.map((a) => a.attempt).filter((a) => a.problemId === problemId && a.tryNumber === 1).sort((a, b) => a.at - b.at)[0];
    return first ? { correct: first.correct, confidence: first.confidence } : undefined;
  }

  async function onProblemFinished() {
    if (!session || !current) return;
    const result = resultFor(current.problem.id) ?? { correct: false };
    const ts = topicStates[current.topicId] ?? emptyTopicState();
    if (current.phase === "probe") {
      const isLast = queueIndex + 1 >= queue.length;
      if (isLast && probeTopic) {
        const hits = queue.filter((q) => resultFor(q.problem.id)?.correct).length;
        const updated = applyProbe(ts, hits, session.number);
        await saveTopicState(householdId, profileId, probeTopic.id, updated);
        if (updated.state === "mastered") for (const e of retrievalEntriesFor(probeTopic, session.number, retrieval)) await saveRetrieval(householdId, profileId, e);
        const nextStates = { ...topicStates, [probeTopic.id]: updated };
        const candidates = updated.state === "current" ? [] : placementCandidates(graph.filter((t) => topicsById[t.id]), nextStates);
        if (candidates.length === 0) { await finishPlacement({ ...(state ?? emptyLadderState(Date.now())), currentTopic: updated.state === "current" ? probeTopic.id : undefined }); return; }
        const t = candidates[0];
        setProbeTopic(t);
        setQueue(pickProbeProblems(topicsById[t.id], seed()).map((problem) => ({ problem, phase: "probe" as Phase, topicId: t.id })));
        setQueueIndex(0);
        setQuestProgress(emptyQuestProgress());
        return;
      }
      advance();
      return;
    }
    if (current.phase === "retrieval" && current.entry) {
      await saveRetrieval(householdId, profileId, applyRetrievalResult(current.entry, result.correct, session.number));
      advance();
      return;
    }
    if (current.phase === "topic") {
      const updated = recordTopicResult(ts, { correct: result.correct, confidence: result.confidence, session: session.number, problemId: current.problem.id });
      await saveTopicState(householdId, profileId, current.topicId, updated);
      if (guessingRun(updated)) { setNote("Three guesses in a row. Back to the idea for a minute."); setPhase("idea"); return; }
      if (masteryBarMet(updated) && currentTopic) {
        setQueue(pickFluencyProblems(currentTopic, seed()).map((problem) => ({ problem, phase: "fluency" as Phase, topicId: currentTopic.id })));
        setQueueIndex(0);
        setQuestProgress(emptyQuestProgress());
        setFluencyStart(Date.now());
        setPhase("fluency");
        return;
      }
      advance();
      return;
    }
    if (current.phase === "fluency") {
      const isLast = queueIndex + 1 >= queue.length;
      if (isLast && currentTopicMeta && currentTopic) {
        const correct = queue.filter((q) => resultFor(q.problem.id)?.correct).length;
        const seconds = Math.round((Date.now() - (fluencyStart ?? Date.now())) / 1000);
        if (fluencyPassed(correct, seconds, currentTopicMeta.fluencySeconds)) {
          const mastered = markMastered(ts, session.number);
          await saveTopicState(householdId, profileId, currentTopic.id, mastered);
          for (const e of retrievalEntriesFor(currentTopicMeta, session.number, retrieval)) await saveRetrieval(householdId, profileId, e);
          const nextStates = { ...topicStates, [currentTopic.id]: mastered };
          const following = nextTopic(graph.filter((t) => topicsById[t.id]), nextStates);
          await saveLadderState(householdId, profileId, { currentTopic: following?.id });
          setNote(`${currentTopicMeta.title}: mastered, ${correct} of 10 in ${seconds} seconds.` + (following ? ` Next: ${following.title}.` : " The authored sequence is finished for now."));
        } else {
          setNote(`Fluency round: ${correct} of 10 in ${seconds} seconds. The bar is 8 within ${currentTopicMeta.fluencySeconds}. It comes round again.`);
        }
        setPhase("done");
        return;
      }
      advance();
      return;
    }
    if (current.phase === "stretch") {
      const updated = { ...ts, served: [...ts.served, current.problem.id] };
      await saveTopicState(householdId, profileId, current.topicId, updated);
      endRound();
    }
  }

  function advance() {
    const next = queueIndex + 1;
    if (next >= queue.length) { endRound(); return; }
    const nextPhase = queue[next].phase;
    setQueueIndex(next);
    setQuestProgress(emptyQuestProgress());
    if (nextPhase !== phase) setPhase(nextPhase);
  }

  function endRound() {
    if (!session) return;
    const nextRound = session.round + 1;
    void saveSession(householdId, profileId, { number: session.number, day: DAY_NAMES[session.day], startedAt: session.startedAt, rounds: session.rounds, minutes: Math.round((Date.now() - session.startedAt) / 60000), endedAt: nextRound >= session.rounds ? Date.now() : undefined });
    if (nextRound >= session.rounds) { setPhase("done"); setNote((n) => n ?? "That is the session. Everything you did is saved."); return; }
    setBreakUntil(Date.now() + BREAK_MINUTES * 60_000);
    setSession({ ...session, round: nextRound });
    setPhase("break");
  }

  function nextRoundAfterBreak() {
    if (!session || !state) return;
    setBreakUntil(undefined);
    void saveLadderState(householdId, profileId, { openSession: { ...(state.openSession ?? { number: session.number, day: DAY_NAMES[session.day], startedAt: session.startedAt }), round: session.round } });
    beginRound(session.round, state, session.number);
  }

  function stopForToday() {
    if (!session) return;
    void saveSession(householdId, profileId, { number: session.number, day: DAY_NAMES[session.day], startedAt: session.startedAt, rounds: session.rounds, minutes: Math.round((Date.now() - session.startedAt) / 60000), endedAt: Date.now() });
    setPhase("done");
    setNote("Stopped for today. Everything you did is saved.");
  }

  // ---- render ----
  if (!stateLoaded) return null;
  if (authored.length === 0) {
    return <EmptyState title="The Ladder opens soon" description="The first topics are being written. Check back in November." action={<Button variant="primary" href="/explorer">Back to This week</Button>} />;
  }
  if (!session) {
    const day = new Date(tick).getDay();
    const rounds = roundsForDay(day);
    const mastered = Object.values(topicStates).filter((t) => t.state === "mastered").length;
    return (
      <div className="ld-home">
        <p className="tr-eyebrow">The Ladder</p>
        {!state ? (
          <>
            <h2 className="tr-quest__title">Start the Ladder</h2>
            <p>The first session is a placement: short probes to find where you are. After that, every session is rounds of 25 minutes with a break between.</p>
          </>
        ) : (
          <>
            <h2 className="tr-quest__title">{currentTopicMeta ? currentTopicMeta.title : state.placementDone ? "The sequence is finished for now" : "Placement in progress"}</h2>
            <p className="ld-home__facts">
              Session {state.sessionCount + 1}. {mastered} topic{mastered === 1 ? "" : "s"} mastered. {retrievalDue(retrieval, state.sessionCount + 1).length} skills due for retrieval.
            </p>
            {currentTopicMeta ? <p className="ld-home__summary">{currentTopicMeta.summary}</p> : null}
          </>
        )}
        <p className="ld-home__day">{DAY_NAMES[day]}: {rounds} round{rounds === 1 ? "" : "s"} of 25 minutes{rounds === 1 ? ", a weekday taster" : ""}.</p>
        <Button variant="primary" onClick={() => void startSession()}>Start today&apos;s session</Button>
        <Button variant="quiet" href="/explorer" className="tr-quest__park">Back to This week</Button>
      </div>
    );
  }

  const roundLabel = `Round ${session.round + 1} of ${session.rounds}`;
  const elapsed = Math.max(0, Math.round((tick - session.startedAt) / 60000));

  if (phase === "break") {
    const left = Math.max(0, Math.ceil(((breakUntil ?? tick) - tick) / 1000));
    return (
      <div className="ld-break">
        <p className="tr-eyebrow">Break</p>
        <h2 className="tr-quest__title">{left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "Ready"}</h2>
        <p>Stand up, water, look out of a window. The next round waits for you.</p>
        <div className="ld-actions">
          <Button variant="primary" onClick={nextRoundAfterBreak} disabled={left > 0}>Next round</Button>
          <Button variant="quiet" onClick={stopForToday}>Stop for today</Button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <EmptyState title="Done for now" description={note ?? "Everything you did is saved."} action={<Button variant="primary" href="/explorer">Back to This week</Button>} />
    );
  }

  if (phase === "idea" && currentTopic && currentTopicMeta) {
    return (
      <div className="ld-idea">
        <p className="tr-eyebrow">{roundLabel} · The idea</p>
        <h2 className="tr-quest__title">{currentTopicMeta.title}</h2>
        {note ? <p className="tr-step__note">{note}</p> : null}
        <StepBody text={currentTopic.idea.body} />
        {currentTopic.idea.figure ? <ProblemFigure figure={currentTopic.idea.figure} /> : null}
        <Card tone="surface" className="ld-worked">
          <p className="tr-eyebrow">Worked example</p>
          <p className="ld-worked__prompt">{currentTopic.workedExample.prompt}</p>
          <ol>{currentTopic.workedExample.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          {currentTopic.workedExample.figure ? <ProblemFigure figure={currentTopic.workedExample.figure} /> : null}
        </Card>
        {currentTopic.ways?.length ? (
          <WaysChooser
            ways={currentTopic.ways}
            favourite={(topicStates[currentTopic.id] ?? emptyTopicState()).favouriteWay}
            onPick={(wayId) => {
              const ts = topicStates[currentTopic.id] ?? emptyTopicState();
              void saveTopicState(householdId, profileId, currentTopic.id, { ...ts, favouriteWay: wayId });
            }}
          />
        ) : null}
        <Button variant="primary" onClick={() => { setNote(undefined); setPhase(queue.length && queue[queueIndex]?.phase === "retrieval" ? "retrieval" : queue.length ? queue[queueIndex].phase : "done"); }}>Got it</Button>
      </div>
    );
  }

  if (!current) return null;
  const favouriteWayName = currentTopic?.ways?.find((w) => w.id === (topicStates[current.topicId]?.favouriteWay))?.name;
  const step: Extract<Step, { kind: "problem-set" }> = { kind: "problem-set", id: `${session.questId}-${current.problem.id}`, title: phaseTitle(current.phase), lane: "skills", problems: [current.problem] };
  const quest = ladderQuestFor(current.topicId, step);
  const phaseCount = queue.filter((q) => q.phase === current.phase).length;
  const phaseIndex = queue.slice(0, queueIndex + 1).filter((q) => q.phase === current.phase).length;

  return (
    <div className="ld-round">
      <div className="ld-round__bar">
        <span className="tr-eyebrow">{roundLabel} · {phaseTitle(current.phase)} {phaseIndex} of {phaseCount}</span>
        <span className="ld-round__clock">{elapsed} min</span>
      </div>
      {current.phase === "probe" && probeTopic ? <p className="tr-step__note">Placement: {probeTopic.title}. Just try; this only finds where to start.</p> : null}
      {current.phase === "fluency" && currentTopicMeta ? <p className="tr-step__note">Fluency round: ten in a row, aim for under {currentTopicMeta.fluencySeconds} seconds.</p> : null}
      {current.phase === "stretch" ? <p className="tr-step__note">Stretch: no hints on this one. Unsolved is fine; it comes back.</p> : null}
      {current.phase === "topic" && favouriteWayName ? <p className="tr-step__note">Your way: {favouriteWayName}. Try it that way first.</p> : null}
      <ProblemPlayer
        key={`${session.questId}-${queueIndex}-${current.problem.id}`}
        step={step}
        quest={{ ...quest, id: session.questId }}
        progress={questProgress}
        problemsProgress={progressDoc?.problems ?? {}}
        progressLoaded={progressLoaded}
        householdId={householdId}
        profileId={profileId}
        onUpdate={onUpdate}
        onFinished={() => void onProblemFinished()}
      />
      <Button variant="quiet" onClick={stopForToday} className="tr-quest__park">Stop for today</Button>
    </div>
  );
}

/**
 * The ways chooser: every method for the topic, each opened on tap to its worked steps and
 * its trap, and one marked as his. The favourite is a fact about him, not a score; it changes
 * nothing about which problems come, only which method the explanations name first.
 */
function WaysChooser({ ways, favourite, onPick }: { ways: NonNullable<LadderTopic["ways"]>; favourite?: string; onPick: (wayId: string) => void }) {
  const [open, setOpen] = useState<string | undefined>(favourite ?? ways[0]?.id);
  const [frame, setFrame] = useState(0);
  const onFrame = useCallback((i: number) => setFrame(i), []);
  return (
    <Card tone="surface" className="ld-ways">
      <p className="tr-eyebrow">Ways to do it</p>
      <p className="ld-ways__intro">Same problems, different roads. Try each one and mark the one that fits you. You can change your mind any time.</p>
      <div className="ld-ways__tabs" role="tablist" aria-label="Ways">
        {ways.map((w) => (
          <button key={w.id} type="button" role="tab" aria-selected={open === w.id} className={open === w.id ? "ld-ways__tab ld-ways__tab--open" : "ld-ways__tab"} onClick={() => { setOpen(w.id); setFrame(0); }}>
            {w.name}{favourite === w.id ? " (yours)" : ""}
          </button>
        ))}
      </div>
      {ways.filter((w) => w.id === open).map((w) => (
        <div key={w.id} className="ld-way" role="tabpanel">
          <p className="ld-way__when">{w.when}</p>
          <p className="ld-way__example">{w.example}</p>
          <ol>{w.steps.map((s, i) => <li key={i} className={w.figure && frame === i + stepOffset(w) ? "ld-way__step ld-way__step--now" : "ld-way__step"}>{s}</li>)}</ol>
          {w.figure ? <ProblemFigure figure={w.figure} onFrame={onFrame} /> : null}
          <p className="ld-way__answer">Answer: {w.answer}</p>
          <p className="ld-way__trap">Watch for: {w.trap}</p>
          <Button variant={favourite === w.id ? "secondary" : "primary"} onClick={() => onPick(w.id)} disabled={favourite === w.id}>
            {favourite === w.id ? "This is your way" : "Make this my way"}
          </Button>
        </div>
      ))}
    </Card>
  );
}

/** Frame k belongs to step k when a way has one frame per step, and to step k minus one when
 * it also has a resting frame before the first step. */
function stepOffset(w: NonNullable<LadderTopic["ways"]>[number]): number {
  const frames = Array.isArray((w.figure?.spec as { frames?: unknown[] } | undefined)?.frames) ? ((w.figure!.spec as { frames: unknown[] }).frames.length) : 0;
  return frames > w.steps.length ? 1 : 0;
}

function phaseTitle(p: Phase): string {
  switch (p) {
    case "retrieval": return "Retrieval";
    case "topic": return "The topic";
    case "fluency": return "Fluency";
    case "stretch": return "Stretch";
    case "probe": return "Placement";
    default: return "The Ladder";
  }
}

/** A stretch problem keeps its shape but its hints say there are none. */
function unhinted(p: LadderProblem): LadderProblem {
  return { ...p, hints: ["No hint on a stretch problem. Try another way in.", "Still no hint. Write down what you tried; it comes back in two sessions."], socraticHint: "What would a smaller version of this problem look like?" };
}
