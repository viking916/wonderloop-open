"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getClientAuth } from "@/lib/firebase/client";
import { getBuilderChat, saveBuilderChat } from "@/lib/data/tutor";
import type { TutorChatMessage } from "@/lib/data/types";
import { builderAskStepBrief, MAX_BUILDER_STEP_MESSAGES } from "@/lib/domain/builderAsk";
import type { Quest, Step } from "@/lib/content/schema";
import type { BuilderResponse } from "@/app/api/ai/builder/route";

export type BuilderAskPanelProps = {
  householdId: string;
  profileId: string;
  quest: Quest;
  step: Step;
};

async function postBuilder(body: unknown): Promise<BuilderResponse> {
  const user = getClientAuth().currentUser;
  const token = user ? await user.getIdToken() : "";
  let res: Response;
  try {
    res = await fetch("/api/ai/builder", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: "error", message: "Ask could not be reached. Check the connection and try again." };
  }
  try {
    return (await res.json()) as BuilderResponse;
  } catch {
    return { ok: false, reason: "error", message: "Ask lost the thread. Try again." };
  }
}

function childCountOf(messages: TutorChatMessage[]): number {
  return messages.filter((m) => m.role === "child").length;
}

/**
 * "Stuck? Ask" (A4, year refinement 2026-09-24, owner ruling 0.1): a Build and Make helper a
 * child can open on any instruction, science, task or data step of a Build or Make quest, from
 * season 1 week 5 on (lib/domain/builderAsk.ts's builderAskAvailable/isBuilderAskStep decide
 * whether this even mounts -- QuestShell only renders it when both are true, so this component's
 * own job is purely the open/closed transcript UI and saving every exchange, the same split
 * AskPanel already uses for the Think/Ladder side).
 *
 * Deliberately NOT gated on a miss or on authored hints the way AskPanel is: the owner's ruling
 * is "available at any step, at any time, with no miss required" -- Build and Make steps have no
 * hint system to gate on in the first place. Markup and class names are reused from AskPanel
 * (.tr-ask*, app/globals.css) on purpose, for the visual consistency the brief asked for; this
 * file only adds the two standing lines the owner's ruling requires (AI can be wrong, never type
 * personal information) that AskPanel's own intro line does not carry.
 */
export function BuilderAskPanel({ householdId, profileId, quest, step }: BuilderAskPanelProps) {
  const brief = builderAskStepBrief(step);

  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [messages, setMessages] = useState<TutorChatMessage[]>([]);
  const [remaining, setRemaining] = useState(MAX_BUILDER_STEP_MESSAGES);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // A four-part question (what I am building, what I expected, what happened, what I tried) does
  // not fit one line, so this grows with the draft: reset to "auto" then to the content's own
  // scrollHeight, and app/globals.css's max-height (about 8 rows) plus overflow-y:auto take over
  // from there, so it never grows past a fixed cap.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  // Height fix, 26 September 2026: the transcript is now a fixed-height scroll area
  // (.tr-ask__log, app/globals.css), so a new message needs an explicit scroll to stay visible
  // instead of the whole page growing to reveal it. Fires on every length change, including the
  // very first message and the panel re-opening onto an already-long saved transcript.
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const chat = await getBuilderChat(householdId, profileId, quest.id, step.id);
      if (cancelled) return;
      const priorMessages = chat?.messages ?? [];
      setMessages(priorMessages);
      setRemaining(Math.max(0, MAX_BUILDER_STEP_MESSAGES - childCountOf(priorMessages)));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, householdId, profileId, quest.id, step.id]);

  // A different step (moving on, or Back) starts closed again with an empty transcript, the same
  // "adjust during render" pattern AskPanel's own prevProblemId uses for a different problem id.
  const [prevStepId, setPrevStepId] = useState(step.id);
  if (step.id !== prevStepId) {
    setPrevStepId(step.id);
    setOpen(false);
    setLoaded(false);
    setMessages([]);
    setRemaining(MAX_BUILDER_STEP_MESSAGES);
    setDraft("");
    setError(undefined);
  }

  if (!brief) return null;

  async function send() {
    const text = draft.trim();
    if (!text || busy || remaining <= 0 || !brief) return;
    setBusy(true);
    setError(undefined);
    const res = await postBuilder({
      hid: householdId,
      pid: profileId,
      context: {
        questId: quest.id,
        questTitle: quest.title,
        // QuestShell only mounts this component when lib/domain/builderAsk.ts's
        // builderAskAvailable(quest) is true, which already requires quest.track to be "build"
        // or "make" -- see this component's own doc comment.
        track: quest.track as "build" | "make",
        stepId: step.id,
        stepTitle: brief.title,
        stepBody: brief.body,
        checklist: brief.checklist,
      },
      messages: messages.map((m) => ({ role: m.role, text: m.text })),
      text,
    });
    if (!res.ok) {
      setError(res.message);
      setBusy(false);
      return;
    }
    const now = Date.now();
    const next: TutorChatMessage[] = [...messages, { role: "child", text, at: now }, { role: "tutor", text: res.reply, at: now }];
    setMessages(next);
    setRemaining(res.remaining);
    setDraft("");
    setBusy(false);
    try {
      await saveBuilderChat(householdId, profileId, {
        questId: quest.id,
        stepId: step.id,
        problemId: step.id,
        prompt: brief.title,
        kind: "step",
        messages: next,
        updatedAt: now,
      });
    } catch {
      // The transcript is still on screen for this sitting; a failed save only risks it being
      // gone on a reload, the same risk AskPanel's own save already accepts.
    }
  }

  if (!open) {
    return (
      <Button variant="quiet" className="tr-ask__opener" onClick={() => setOpen(true)}>
        Stuck? Ask
      </Button>
    );
  }

  return (
    <div className="tr-ask" aria-label="Ask, a helper for this step">
      <span className="tr-eyebrow">Ask</span>
      <p className="tr-ask__intro">Ask can explain this step or a mistake. It never writes your program for you.</p>
      <p className="tr-ask__intro">AI can be wrong. Check what it tells you.</p>
      <p className="tr-ask__intro">Never type your name, school or address.</p>

      {loaded || messages.length > 0 ? (
        <div className="tr-ask__log" aria-live="polite" ref={logRef}>
          {messages.map((m, i) => (
            <p key={i} className={`tr-ask__bubble tr-ask__bubble--${m.role}`}>
              {m.text}
            </p>
          ))}
        </div>
      ) : null}

      {error ? <p role="alert" className="tr-ask__message">{error}</p> : null}
      {busy ? <p className="tr-ask__thinking">Ask is thinking</p> : null}

      {remaining <= 0 ? (
        <p className="tr-ask__done">Try the next small piece now, then show a grown-up what you did.</p>
      ) : (
        <>
          <div className="tr-ask__row">
            <textarea
              ref={textareaRef}
              className="tr-ask__input"
              rows={4}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask about this step"
              aria-label="Ask about this step"
              disabled={busy}
            />
            <Button variant="secondary" onClick={send} disabled={!draft.trim()} pending={busy} pendingLabel="Asking">
              Send
            </Button>
          </div>
          <p className="tr-ask__remaining">
            Enter starts a new line; Ctrl or Cmd+Enter sends. {remaining} {remaining === 1 ? "ask" : "asks"} left on
            this step
          </p>
        </>
      )}
    </div>
  );
}
