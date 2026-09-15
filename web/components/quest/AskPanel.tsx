"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getClientAuth } from "@/lib/firebase/client";
import { getTutorChat, saveTutorChat } from "@/lib/data/tutor";
import type { TutorChatMessage } from "@/lib/data/types";
import { MAX_CHILD_MESSAGES } from "@/lib/domain/tutor";
import type { Problem, Quest } from "@/lib/content/schema";
import type { TutorResponse } from "@/app/api/ai/tutor/route";

export type AskPanelProps = {
  householdId: string;
  profileId: string;
  quest: Quest;
  stepId: string;
  problem: Problem;
  /** The child's own earlier wrong answers on this problem, oldest first (serialized the same
   * way ProblemPlayer already serializes an answer for Firestore). */
  attempts: string[];
};

async function postTutor(body: unknown): Promise<TutorResponse> {
  const user = getClientAuth().currentUser;
  const token = user ? await user.getIdToken() : "";
  let res: Response;
  try {
    res = await fetch("/api/ai/tutor", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: "error", message: "Ask could not be reached. Check the connection and try again." };
  }
  try {
    return (await res.json()) as TutorResponse;
  } catch {
    return { ok: false, reason: "error", message: "Ask lost the thread. Try again." };
  }
}

function childCountOf(messages: TutorChatMessage[]): number {
  return messages.filter((m) => m.role === "child").length;
}

/**
 * "Still stuck? Ask" (owner-approved 12 September 2026): a Socratic AI tutor a child can open
 * beyond the authored hints. Closed, it is one quiet button directly under HintPanel; open, it
 * is a small transcript plus a text input, never a second primary control on the screen (the
 * problem's own Check stays the one primary). ProblemPlayer only mounts this component once its
 * own gate (authored hints on this problem, at least one miss, and the family's AI key
 * configured) is already true -- this component's job is the open/closed transcript UI and
 * saving every exchange, not deciding whether Ask should be offered at all.
 */
export function AskPanel({ householdId, profileId, quest, stepId, problem, attempts }: AskPanelProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [messages, setMessages] = useState<TutorChatMessage[]>([]);
  const [remaining, setRemaining] = useState(MAX_CHILD_MESSAGES);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Loads the saved transcript every time the panel opens (spec: "keep the transcript across
  // reloads by loading the doc on open"), for THIS problem id -- a problem change always closes
  // the panel first (the render-time reset just below), so by the time this effect's `open`
  // dependency flips true again, `problem.id` already names the right document.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const chat = await getTutorChat(householdId, profileId, quest.id, problem.id);
      if (cancelled) return;
      const priorMessages = chat?.messages ?? [];
      setMessages(priorMessages);
      setRemaining(Math.max(0, MAX_CHILD_MESSAGES - childCountOf(priorMessages)));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, householdId, profileId, quest.id, problem.id]);

  // A different problem id (a fresh AskPanel instance, or "Try it again" on the same one) starts
  // closed again with an empty transcript, rather than showing the previous problem's chat --
  // adjusted here during render (React's "adjusting state when a prop changes" pattern), the
  // same pattern ProblemPlayer's own prevProblemId already uses, so the reset lands in the same
  // commit as the problem switch instead of one commit+effect cycle later.
  const [prevProblemId, setPrevProblemId] = useState(problem.id);
  if (problem.id !== prevProblemId) {
    setPrevProblemId(problem.id);
    setOpen(false);
    setLoaded(false);
    setMessages([]);
    setRemaining(MAX_CHILD_MESSAGES);
    setDraft("");
    setError(undefined);
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy || remaining <= 0) return;
    setBusy(true);
    setError(undefined);
    const res = await postTutor({
      hid: householdId,
      pid: profileId,
      context: {
        questId: quest.id,
        stepId,
        problemId: problem.id,
        prompt: problem.prompt,
        hints: [...problem.hints],
        explanation: problem.explanation.join(" "),
        attempts,
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
      await saveTutorChat(householdId, profileId, {
        questId: quest.id,
        stepId,
        problemId: problem.id,
        prompt: problem.prompt,
        messages: next,
        updatedAt: now,
      });
    } catch {
      // The transcript is still on screen for this sitting; a failed save only risks it being
      // gone on a reload, the same risk lib/data/debates.ts's own saveDebate accepts.
    }
  }

  if (!open) {
    return (
      <Button variant="quiet" className="tr-ask__opener" onClick={() => setOpen(true)}>
        Still stuck? Ask
      </Button>
    );
  }

  return (
    <div className="tr-ask" aria-label="Ask, a tutor that asks questions">
      <span className="tr-eyebrow">Ask</span>
      <p className="tr-ask__intro">
        Ask asks you the next question. It never gives the answer. A grown-up can read this later.
      </p>

      {loaded || messages.length > 0 ? (
        <div className="tr-ask__log" aria-live="polite">
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
        <p className="tr-ask__done">Try it now, then show a grown-up what you did.</p>
      ) : (
        <>
          <div className="tr-ask__row">
            <input
              className="tr-ask__input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send();
              }}
              placeholder="Ask about this problem"
              aria-label="Ask about this problem"
              disabled={busy}
            />
            <Button variant="secondary" onClick={() => void send()} disabled={!draft.trim() || busy}>
              Send
            </Button>
          </div>
          <p className="tr-ask__remaining">
            {remaining} {remaining === 1 ? "ask" : "asks"} left
          </p>
        </>
      )}
    </div>
  );
}
