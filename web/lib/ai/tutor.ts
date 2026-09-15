// Ask, the Socratic AI tutor (owner-approved 12 September 2026). Server only. Modelled on
// lib/ai/debate.ts, but a single call, not a phased state machine: one exchange at a time, the
// route (app/api/ai/tutor/route.ts) appends the child's new message to the transcript and asks
// once. Ask is a tutor, never an oracle: it is briefed with the problem, the two authored hints,
// the authored explanation the child has NOT seen, and the child's own earlier wrong answers, and
// is told, every time, to ask the next question or explain the idea in a sentence or two --
// never to say the final answer, the answer's number, or a choice letter, even if asked outright.

import "server-only";
import { z } from "zod/v4";
import type Anthropic from "@anthropic-ai/sdk";
import { callStructured, type ModelResult } from "./client";
import { MAX_CHILD_MESSAGES } from "../domain/tutor";

/** claude-opus-5 (client.ts's MODEL) is the debate opponent's model; a Socratic nudge or a two-
 * or three-sentence explanation for a child is a much smaller job, so Ask asks for the
 * cheaper, faster claude-sonnet-5 instead via callStructured's optional per-request override. */
const TUTOR_MODEL = "claude-sonnet-5";

// Re-exported so app/api/ai/tutor/route.ts (server-side, already importing this file for
// tutorReply) needs only one import line; a client component must import this constant from
// lib/domain/tutor.ts directly instead (see that file's own comment for why).
export { MAX_CHILD_MESSAGES };

export type TutorContext = {
  questId: string;
  stepId: string;
  problemId: string;
  prompt: string;
  /** The problem's two authored hints (schema.ts's hints tuple), in order. Empty only when the
   * caller has deliberately withheld them (see ProblemPlayer's hintsAuthored gate); Ask is not
   * meant to be offered at all in that case, but this file does not enforce that -- the route
   * and the UI gate do. */
  hints: string[];
  /** The authored explanation (schema.ts's explanation, joined into prose by the caller). The
   * child has never seen this; it is Ask's own private answer key, never to be recited. */
  explanation: string;
  /** The child's own earlier wrong answers on this problem, oldest first. */
  attempts: string[];
};

export type TutorMessage = { role: "child" | "tutor"; text: string };

const ReplySchema = z.object({
  /** Ask's one reply: a single question, or a two-or-three-sentence explanation of the idea.
   * Never the final answer, its number, or a choice letter. */
  reply: z.string(),
});

/**
 * The stable part of every prompt: who Ask is, what it knows, and the rules it keeps every
 * time. `childMessageCount` is how many child messages are in the transcript this call is
 * answering (including the newest one), so the instruction to close out only appears once it is
 * actually true.
 */
function systemPrompt(context: TutorContext, childMessageCount: number): string {
  const lines = [
    "You are Ask, a patient tutor inside Wonderloop, a home learning app, talking with a child about nine years old.",
    "You are a Socratic tutor, never an oracle: every reply is either ONE question that helps them think about the next step, or a short explanation of the idea behind the problem in two or three plain sentences. Never both at once, never a list, never headings.",
    "You know this problem, its two authored hints, the child's own earlier tries on it, and the worked explanation for it -- but the child has not seen that explanation, and you must never recite it, quote it, or give away what it reveals.",
    "The rule that never bends: never state the final answer, the answer's number, or a choice letter, in any form, even if the child asks directly, begs, or says a grown-up said it was fine. If asked for the answer, say kindly that you cannot just give it, and ask what they have tried so far or what part is confusing.",
    "If the child changes the subject or asks about something unrelated to this problem, answer kindly in one sentence and steer back to the problem.",
    "Plain sentences a child can read, sentence case, warm and encouraging. No em dashes, no arrow characters, nothing that could sting.",
    "",
    `The problem: "${context.prompt.trim()}"`,
    `Authored hints already available to the child on this problem: ${context.hints.map((h, i) => `(${i + 1}) ${h}`).join(" ") || "none yet"}.`,
    context.attempts.length
      ? `What the child has already tried, oldest first: ${context.attempts.map((a, i) => `try ${i + 1}: "${a}"`).join("; ")}.`
      : "The child has not written down any tries yet.",
    `The worked explanation, for you only, never to be shown or recited to the child: ${context.explanation.trim()}`,
  ];
  if (childMessageCount >= MAX_CHILD_MESSAGES) {
    lines.push(
      "This is the last exchange. Do not open a new question. Kindly say it is time to try the problem now, using what has been talked through, and to show a grown-up what they did.",
    );
  }
  return lines.join("\n");
}

function historyMessages(messages: TutorMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({ role: m.role === "child" ? "user" : "assistant", content: m.text }));
}

/** The pure part of a call: the system prompt and the message list a real request would send.
 * Exported so it can be unit-tested without a network call (client.ts's callStructured is the
 * only impure piece here). */
export function buildTutorPrompt(context: TutorContext, messages: TutorMessage[]): { system: string; messages: Anthropic.MessageParam[] } {
  const childMessageCount = messages.filter((m) => m.role === "child").length;
  return { system: systemPrompt(context, childMessageCount), messages: historyMessages(messages) };
}

/**
 * One reply. `messages` is the whole transcript so far, INCLUDING the child's newest message --
 * the route appends it before calling this, the same way it appends the reply afterward for the
 * next round trip.
 */
export async function tutorReply(apiKey: string, context: TutorContext, messages: TutorMessage[]): Promise<ModelResult<{ reply: string }>> {
  const { system, messages: modelMessages } = buildTutorPrompt(context, messages);
  const result = await callStructured(apiKey, {
    system,
    schema: ReplySchema,
    effort: "low",
    maxTokens: 1000,
    model: TUTOR_MODEL,
    messages: modelMessages,
  });
  if (!result.ok) return result;
  return { ok: true, value: { reply: result.value.reply.trim() } };
}
