"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import type { Quest, Step } from "@/lib/content/schema";
import { isStepComplete, type QuestProgress } from "@/lib/domain/completion";
import {
  currentRound,
  emptyDebate,
  phaseOf,
  transcriptOf,
  withChildTurn,
  withCoachCard,
  withOpponentReply,
  withSide,
  withSteelman,
  withoutPending,
  type DebateState,
} from "@/lib/domain/debate";
import { getMotion } from "@/lib/content/app-content";
import { uploadArtifact } from "@/lib/data/artifacts";
import { saveDebate, saveOfflineDebate, stateFromDoc, watchDebate } from "@/lib/data/debates";
import type { DebateSide } from "@/lib/data/types";
import { getClientAuth } from "@/lib/firebase/client";
import { useSession } from "@/lib/session";
import type { DebateResponse } from "@/app/api/ai/debate/route";
import { useSpeechInput } from "./useSpeechInput";
import { StepBody } from "./StepBody";

export type DebateRoomProps = {
  step: Extract<Step, { kind: "debate" }>;
  quest: Quest;
  progress: QuestProgress;
  householdId: string;
  profileId: string;
  onUpdate: (updater: (prev: QuestProgress) => QuestProgress) => Promise<void>;
  /** Task 41 (one-primary audit): whether this room currently shows a live primary control, so
   * QuestShell hides its own "Continue" until the debate is done. */
  onOwnPrimaryChange?: (visible: boolean) => void;
};

const SIDE_LABEL: Record<DebateSide, string> = { for: "For", against: "Against" };
const OPPONENT = "Rebut";

type Busy = "idle" | "sending" | "coach";

async function postDebate(body: unknown): Promise<DebateResponse> {
  const user = getClientAuth().currentUser;
  const token = user ? await user.getIdToken() : "";
  let res: Response;
  try {
    res = await fetch("/api/ai/debate", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: "error", message: "Rebut could not be reached. Your points are saved; check the connection and try again." };
  }
  try {
    return (await res.json()) as DebateResponse;
  } catch {
    return { ok: false, reason: "error", message: "Rebut lost the thread. Your points are saved; try again." };
  }
}

/**
 * The debate room (spec 7.1 screen 4, 10.2; Plan 3 task 6). Side, steelman, three rounds, coach
 * card, each a phase of lib/domain/debate.ts's state machine. Every utterance is saved to
 * Firestore before the opponent is asked (lib/data/debates.ts), so a failed or slow reply shows a
 * "Try again" that resends the saved words rather than asking him to say them twice. "Talk"
 * fills the box through the browser's speech recognition where it exists; the box is always
 * there to type into. One primary at a time: the one thing to do in this phase.
 */
export function DebateRoom({ step, quest, progress, householdId, profileId, onUpdate, onOwnPrimaryChange }: DebateRoomProps) {
  const motion = getMotion(step.motionId);
  const motionText = motion?.text ?? step.motionId;
  const { activeProfile } = useSession();
  const childName = activeProfile?.name ?? "Explorer";
  const meta = { questId: quest.id, stepId: step.id, week: quest.week };

  const [state, setState] = useState<DebateState | undefined>(undefined);
  const [firstSavedAt, setFirstSavedAt] = useState<number | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<Busy>("idle");
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [steelmanNote, setSteelmanNote] = useState<string | undefined>(undefined);
  // Whether this family has an AI key on record (owner decision, 6 September 2026: AI features
  // are off until a parent adds one). undefined while asking; a failed check counts as on, so
  // the server's own answer decides rather than a network blip.
  const [aiOn, setAiOn] = useState<boolean | undefined>(undefined);
  const [markingOffline, setMarkingOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = getClientAuth().currentUser;
        const token = user ? await user.getIdToken() : "";
        const res = await fetch(`/api/ai/health?hid=${encodeURIComponent(householdId)}`, { headers: { authorization: `Bearer ${token}` } });
        const data = (await res.json()) as { ok?: boolean; configured?: boolean };
        if (!cancelled) setAiOn(data.ok ? Boolean(data.configured) : true);
      } catch {
        if (!cancelled) setAiOn(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  async function markDebatedOutLoud() {
    setMarkingOffline(true);
    try {
      await saveOfflineDebate(householdId, profileId, meta, step.motionId, motionText);
      await onUpdate((prev) => ({ ...prev, debates: prev.debates.includes(step.id) ? prev.debates : [...prev.debates, step.id] }));
    } catch {
      setMessage("That did not save. Check your connection and try again.");
    } finally {
      setMarkingOffline(false);
    }
  }
  const speech = useSpeechInput();
  const draftBeforeSpeech = useRef("");
  const stepDone = isStepComplete(step, progress);

  useEffect(() => {
    const unsub = watchDebate(householdId, profileId, step.id, (d) => {
      if (d) {
        setState(stateFromDoc(d));
        setFirstSavedAt(d.at);
      } else {
        setState((prev) => prev ?? emptyDebate(step.motionId, motionText, step.side === "choose" ? undefined : step.side));
      }
      setLoaded(true);
    });
    return unsub;
    // motionText is derived from step.motionId, fixed per step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, profileId, step.id, step.motionId, step.side]);

  // While listening, what is heard lands after whatever was typed before Talk was pressed.
  useEffect(() => {
    if (speech.status === "listening" || speech.heard) {
      setDraft((draftBeforeSpeech.current + " " + speech.heard).trim());
    }
  }, [speech.heard, speech.status]);

  const persist = useCallback(
    async (next: DebateState) => {
      setState(next);
      await saveDebate(householdId, profileId, meta, next, childName, firstSavedAt);
    },
    // meta is rebuilt each render from fixed ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [householdId, profileId, quest.id, step.id, quest.week, childName, firstSavedAt],
  );

  const phase = state ? phaseOf(state) : undefined;
  const round = state ? currentRound(state) : undefined;
  const pending = state?.pendingChildText;

  const draftReady = Boolean(draft.trim()) && busy === "idle";
  const primaryLive =
    !stepDone &&
    busy === "idle" &&
    (phase === "steelman" ? draftReady : phase?.startsWith("round") ? draftReady || Boolean(pending) : phase === "coach");
  useEffect(() => {
    onOwnPrimaryChange?.(primaryLive);
    return () => onOwnPrimaryChange?.(false);
  }, [primaryLive, onOwnPrimaryChange]);

  function fail(res: Extract<DebateResponse, { ok: false }>) {
    setMessage(res.message);
  }

  async function chooseSide(side: DebateSide) {
    if (!state) return;
    await persist(withSide(state, side));
  }

  async function sendSteelman() {
    if (!state || !draft.trim()) return;
    setBusy("sending");
    setMessage(undefined);
    const text = draft.trim();
    const res = await postDebate({ hid: householdId, pid: profileId, state, action: { kind: "steelman", text } });
    if (!res.ok) {
      fail(res);
    } else if (res.kind === "steelman" && res.fair) {
      await persist(withSteelman(state, text, res.note));
      setSteelmanNote(undefined);
      setDraft("");
    } else if (res.kind === "steelman") {
      setSteelmanNote(res.note);
    }
    setBusy("idle");
  }

  async function keepSteelmanAnyway() {
    if (!state || !draft.trim()) return;
    await persist(withSteelman(state, draft.trim(), steelmanNote ?? "Noted. Let us begin."));
    setSteelmanNote(undefined);
    setDraft("");
  }

  async function sendRound(text: string) {
    if (!state || round === undefined) return;
    setBusy("sending");
    setMessage(undefined);
    const withWords = state.pendingChildText === text ? state : withChildTurn(state, text);
    if (withWords !== state) await persist(withWords);
    setDraft("");
    const res = await postDebate({ hid: householdId, pid: profileId, state: withWords, action: { kind: "round", text } });
    if (!res.ok) fail(res);
    else if (res.kind === "round") await persist(withOpponentReply(withWords, res.reply));
    setBusy("idle");
  }

  async function sayItDifferently() {
    if (!state?.pendingChildText) return;
    setDraft(state.pendingChildText);
    setMessage(undefined);
    await persist(withoutPending(state));
  }

  const requestCoach = useCallback(async () => {
    if (!state || phaseOf(state) !== "coach") return;
    setBusy("coach");
    setMessage(undefined);
    const res = await postDebate({ hid: householdId, pid: profileId, state, action: { kind: "coach" } });
    if (!res.ok) {
      setMessage(res.message);
      setBusy("idle");
      return;
    }
    if (res.kind === "coach") {
      const finished = withCoachCard(state, res.card);
      await persist(finished);
      try {
        await uploadArtifact(householdId, profileId, { kind: "transcript", questId: quest.id, week: quest.week, text: transcriptOf(finished, childName) });
      } catch {
        // The transcript lives in the debate document either way; the artifact is the portfolio's copy.
      }
      await onUpdate((prev) => ({ ...prev, debates: prev.debates.includes(step.id) ? prev.debates : [...prev.debates, step.id] }));
    }
    setBusy("idle");
    // persist and the ids are stable per render of this step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, householdId, profileId, quest.id, quest.week, childName, step.id, onUpdate, persist]);

  // The coach card asks itself once the third round closes; a failure leaves a Try again.
  const coachAsked = useRef(false);
  useEffect(() => {
    if (phase === "coach" && busy === "idle" && !coachAsked.current && !message) {
      coachAsked.current = true;
      void requestCoach();
    }
  }, [phase, busy, message, requestCoach]);

  function toggleTalk() {
    if (speech.status === "listening") {
      speech.stop();
    } else {
      draftBeforeSpeech.current = draft;
      speech.start();
    }
  }

  if (!loaded || !state || !phase || aiOn === undefined) {
    return (
      <section className="tr-step" aria-labelledby={`${step.id}-title`}>
        <h3 id={`${step.id}-title`} className="tr-step__title">The debate</h3>
        <p className="tr-step__note">Opening the debate room...</p>
      </section>
    );
  }

  if (aiOn === false) {
    return (
      <section className="tr-step tr-debate" aria-labelledby={`${step.id}-title`}>
        <h3 id={`${step.id}-title`} className="tr-step__title">The debate</h3>
        <p className="tr-debate__motion">{motionText}</p>
        <StepBody
          text={
            "The AI opponent is off for your family, so debate this out loud with a grown-up.\n\n1. Pick a side.\n2. Say the best point for the other side first, fairly.\n3. Give your strongest point, hear theirs, and answer it. Three times.\n4. Ask them: which of your points was strongest, and what would make it stronger?"
          }
        />
        {message ? (
          <p role="alert" className="tr-debate__message">{message}</p>
        ) : null}
        {stepDone ? (
          <p className="tr-step__done">Done. You debated it out loud.</p>
        ) : (
          <div className="tr-step__actions">
            <Button variant="primary" onClick={() => void markDebatedOutLoud()} disabled={markingOffline}>
              {markingOffline ? "Saving..." : "We debated it out loud"}
            </Button>
          </div>
        )}
        <p className="tr-step__note">A parent can switch the AI opponent on in the Parent view.</p>
      </section>
    );
  }

  const talkControl =
    speech.status === "unsupported" || speech.status === "checking" ? null : (
      <Button variant="secondary" onClick={toggleTalk} disabled={busy !== "idle" || speech.status === "denied"} aria-pressed={speech.status === "listening"}>
        {speech.status === "listening" ? "Stop talking" : "Talk"}
      </Button>
    );
  const talkNote =
    speech.status === "denied" ? "The microphone was not allowed, so type instead." : speech.status === "listening" ? "Listening. Press Stop talking when you are done, then check the words." : undefined;

  return (
    <section className="tr-step tr-debate" aria-labelledby={`${step.id}-title`}>
      <h3 id={`${step.id}-title`} className="tr-step__title">The debate</h3>
      <p className="tr-debate__motion">{motionText}</p>
      {state.side ? <Chip>{childName}: {SIDE_LABEL[state.side]}. {OPPONENT}: {SIDE_LABEL[state.side === "for" ? "against" : "for"]}</Chip> : null}

      {message ? (
        <p role="alert" className="tr-debate__message">{message}</p>
      ) : null}

      {phase === "side" ? (
        <div className="tr-debate__side-pick">
          <span>Pick your side.</span>
          <Button variant="primary" onClick={() => void chooseSide("for")}>For</Button>
          <Button variant="secondary" onClick={() => void chooseSide("against")}>Against</Button>
        </div>
      ) : null}

      {phase === "steelman" ? (
        <>
          <div className="tr-debate__steelman">
            <h4>Steelman it first</h4>
            <p>
              Before you argue your side, say the best point for the other side out loud, as strongly and fairly as you
              can. That is called a steelman. {OPPONENT} will tell you if it is fair.
            </p>
          </div>
          {steelmanNote ? <p className="tr-debate__turn tr-debate__turn--rebut"><strong>{OPPONENT}:</strong> {steelmanNote}</p> : null}
          <label htmlFor={`${step.id}-draft`} className="tr-artifact-block__label">The other side&rsquo;s best point</label>
          <textarea id={`${step.id}-draft`} className="tr-textarea" rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="The best point for the other side is..." disabled={busy !== "idle"} />
          {talkNote ? <p className="tr-step__note">{talkNote}</p> : null}
          <div className="tr-step__actions">
            <Button variant="primary" onClick={() => void sendSteelman()} disabled={!draftReady}>
              {busy === "sending" ? "Sending..." : `Send to ${OPPONENT}`}
            </Button>
            {talkControl}
            {steelmanNote ? (
              <Button variant="quiet" onClick={() => void keepSteelmanAnyway()} disabled={!draftReady}>Keep it and move on</Button>
            ) : null}
          </div>
        </>
      ) : null}

      {state.steelman && phase !== "steelman" ? (
        <div className="tr-debate__log" aria-label="The debate so far">
          <p className="tr-debate__turn tr-debate__turn--child"><strong>{childName} (steelman):</strong> {state.steelman}</p>
          {state.steelmanNote ? <p className="tr-debate__turn tr-debate__turn--rebut"><strong>{OPPONENT}:</strong> {state.steelmanNote}</p> : null}
          {state.rounds.map((r, i) => (
            <div key={i} className="tr-debate__round">
              <p className="tr-eyebrow">Round {i + 1}</p>
              <p className="tr-debate__turn tr-debate__turn--child"><strong>{childName}:</strong> {r.childText}</p>
              <p className="tr-debate__turn tr-debate__turn--rebut"><strong>{OPPONENT}:</strong> {r.aiText}</p>
            </div>
          ))}
          {pending ? (
            <div className="tr-debate__round">
              <p className="tr-eyebrow">Round {state.rounds.length + 1}</p>
              <p className="tr-debate__turn tr-debate__turn--child"><strong>{childName}:</strong> {pending}</p>
              <p className="tr-debate__turn tr-debate__turn--rebut tr-debate__turn--waiting">
                <strong>{OPPONENT}:</strong> {busy === "sending" ? "thinking..." : "no reply yet"}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {round !== undefined ? (
        pending ? (
          busy === "idle" ? (
            <div className="tr-step__actions">
              <Button variant="primary" onClick={() => void sendRound(pending)}>Try again</Button>
              <Button variant="quiet" onClick={() => void sayItDifferently()}>Say it differently</Button>
            </div>
          ) : null
        ) : (
          <>
            <p className="tr-step__body">
              {round === 1 ? "Round 1: your claim, your reason and your example." : round === 2 ? `Round 2: answer the strongest point ${OPPONENT} made.` : "Round 3: your best closing point."}
            </p>
            <label htmlFor={`${step.id}-draft`} className="tr-artifact-block__label">Your point</label>
            <textarea id={`${step.id}-draft`} className="tr-textarea" rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Say your point here." disabled={busy !== "idle"} />
            {talkNote ? <p className="tr-step__note">{talkNote}</p> : null}
            <div className="tr-step__actions">
              <Button variant="primary" onClick={() => void sendRound(draft.trim())} disabled={!draftReady}>
                {busy === "sending" ? "Sending..." : `Send to ${OPPONENT}`}
              </Button>
              {talkControl}
            </div>
          </>
        )
      ) : null}

      {phase === "coach" ? (
        busy === "coach" ? (
          <p className="tr-step__note">Three rounds done. {OPPONENT} is writing your coach card...</p>
        ) : (
          <div className="tr-step__actions">
            <Button variant="primary" onClick={() => void requestCoach()}>Get the coach card</Button>
          </div>
        )
      ) : null}

      {state.coachCard ? (
        <div className="tr-debate__coach" aria-label="Coach card">
          <p className="tr-eyebrow">Coach card</p>
          <p><strong>What you did well:</strong> {state.coachCard.strength}</p>
          <p><strong>Try next time:</strong> {state.coachCard.improvement}</p>
          <p><strong>Idea:</strong> {state.coachCard.ideaName}</p>
          <p className="tr-step__done">Debate done. The whole exchange is in your portfolio.</p>
        </div>
      ) : null}
    </section>
  );
}
