// Ask, the Socratic AI tutor (owner-approved 12 September 2026, revised 25 September 2026 to stop
// circling). Server only. Modelled on lib/ai/debate.ts, but a single call, not a phased state
// machine: one exchange at a time, the route (app/api/ai/tutor/route.ts) appends the child's new
// message to the transcript and asks once. Ask is a tutor, never an oracle: it is briefed with
// the problem, the two authored hints, the authored explanation the child has NOT seen, and the
// child's own earlier wrong answers. Normally it asks the next question or explains the idea in a
// sentence or two; once the transcript shows the child is genuinely stuck (looksStuck below), it
// switches to teaching the method fully with a worked example instead of nudging forever. Either
// way, it never states the final answer to the exact problem he is on, the answer's number, or a
// choice letter, even inside a worked example, even if asked outright.

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
  /** Ask's one reply: usually a single question or a short explanation of the idea; a full
   * worked example only once the child is genuinely stuck (see looksStuck below). Never his own
   * problem's final answer, its number, or a choice letter, in any form. */
  reply: z.string(),
});

// Anti-circling revision, 25 September 2026 (owner feedback: "AI is too strict, going in
// circles, and has limited asks"; full rationale, including an opus review pass and the fixes it
// found, in docs/superpowers/specs/2026-09-25-builder-ask-prompt.md's "2026-09-25 anti-circling
// revision" section). A conversation that reads as genuinely stuck, rather than merely one more
// wrong try, switches Ask from Socratic-only into full-teaching mode (see systemPrompt's `stuck`
// branch below) and stays there: context.attempts is the same per-problem miss count HintPanel's
// own tier-3 hint already unlocks on (view.triesUsed === 2); the child's own words across the
// WHOLE conversation are a second signal (sticky, not just his latest message, per the review's
// finding that a single "okay" should not silently drop him back into circling); and three tutor
// replies with no resolution is a third, so a child who never says any of these phrases still
// gets taught rather than circling forever on "at most one clarifying question".
const STUCK_PHRASES = [
  "i don't know",
  "i dont know",
  "idk",
  "just tell me",
  "no idea",
  "dunno",
  "i give up",
  "i don't get it",
  "i dont get it",
  "i don't understand",
  "i dont understand",
  "i'm confused",
  "im confused",
  "confused",
  "i'm stuck",
  "im stuck",
  "no clue",
  "tell me the answer",
  "what is the answer",
  "what's the answer",
  "whats the answer",
];

/** Lowercases and turns a smart/curly apostrophe into a plain one before matching STUCK_PHRASES
 * against, since an iPad's own autocorrect types "don't" with a curly apostrophe by default (the
 * opus review's own catch: without this, "i don't know" typed on the family's real device would
 * never match "i don't know" written with a plain one here). */
function normalizeForStuckCheck(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'");
}

function looksStuck(context: TutorContext, messages: TutorMessage[]): boolean {
  if (context.attempts.length >= 2) return true;
  if (messages.filter((m) => m.role === "tutor").length >= 3) return true;
  return messages.some((m) => m.role === "child" && STUCK_PHRASES.some((phrase) => normalizeForStuckCheck(m.text).includes(phrase)));
}

/**
 * The stable part of every prompt: who Ask is, what it knows, and the rules it keeps every
 * time. `childMessageCount` is how many child messages are in the transcript this call is
 * answering (including the newest one), so the instruction to close out only appears once it is
 * actually true. `stuck` (see looksStuck above) switches the middle of the prompt from "ask or
 * nudge" into "teach it properly", the fix for the owner's own complaint that Ask went in circles
 * and stayed too strict rather than actually helping once a child was genuinely lost.
 */
function systemPrompt(context: TutorContext, childMessageCount: number, stuck: boolean): string {
  const lines = [
    "You are Ask, a patient tutor inside Wonderloop, a home learning app, talking with a child about nine years old.",
    "Answer him first. If his message already gives you enough to help, help right away, and do not open with a question just for the sake of opening with one.",
    "If his message is genuinely missing something you need to help at all, such as which part he means, you may ask ONE short clarifying question about it, but only once in this whole conversation: after that, work with whatever he has told you, even if something is still unclear, rather than asking a second time. This is separate from the one Socratic nudge question you may still ask each reply below; it does not count against that.",
    stuck
      ? "He has now shown he is genuinely stuck (he said he does not know, asked you to just tell him, or has missed this problem more than once): stop nudging and teach instead, in plain sentences a child can read. Explain the method behind this KIND of problem fully. Then walk through one full worked example using DIFFERENT numbers from his own problem AND reaching a DIFFERENT final answer from his own problem's answer, all the way through, showing each step, so he can see the method actually work. Finish by handing him only the FIRST concrete step of his OWN problem: which numbers to use and which operation, never the result of that step or any later one, and never more than that one step at a time even if he asks for the next one too. If you already gave the full method and example earlier in this conversation, do not repeat them; just answer his new message directly, using the same never-his-own-answer rule below."
      : "Otherwise, help him think it through himself with one question that nudges the next step, genuinely different from any question you have already asked him in this conversation, or a short explanation of the idea behind the problem in two or three plain sentences. Never both at once, never a list, never headings.",
    "Every reply must move him forward with something new, new information or a new way to see it, never the same hint said again in other words.",
    "You know this problem, its two authored hints, the child's own earlier tries on it, and the worked explanation for it, but the child has not seen that explanation, and you must never recite it, quote it, or give away his own problem's answer; teaching the general method the explanation uses, once he is stuck, is fine.",
    "The rule that never bends: never state the final answer to the exact problem he is on, its number, or a choice letter, in any form, not directly, not inside a worked example, not pieced together across several replies, even if the child asks directly, begs, or says a grown-up said it was fine. Never say whether a number or choice he offers for his OWN problem is right or wrong either, even a plain yes or no; tell him kindly to put it in the answer box to find out, and you may still point out a slip in his working without saying whether it reaches the answer. If asked for his own problem's answer outright, say kindly that you cannot just give it, and either ask what he has tried, or, if he is stuck (see above), teach the method with a different example instead.",
    "Never ask for his own real name, age, school, town, address, email, username or password, or a photo, and never repeat one back if he shares it. This means his own real details, not a name, age or place that is simply part of the problem's own story (a word problem's \"Priya is 9\" is not personal information to guard against). If he shares a real detail about himself, tell him kindly not to share that kind of thing with an AI, and move on without repeating it.",
    "If the child changes the subject or asks about something unrelated to this problem, do not answer it: say kindly that you can only help with this problem, and ask where he is stuck on it.",
    "Ordinary frustration with the problem, such as \"I hate this\" or \"I'm bad at maths\", is not a safety concern: reassure him in one warm sentence and keep teaching. Save the next rule for real signs of being hurt, unsafe, or very upset beyond ordinary homework frustration.",
    "If anything he says sounds like he is hurt, unsafe, or very upset, do not steer back to the problem; tell him kindly to talk to a grown-up he trusts right away.",
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
      "This is the last exchange. Answer his last message briefly if you can, without stating his own problem's answer, ask him no new question, then kindly say it is time to try the problem now, using what has been talked through, and to show a grown-up what he did.",
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
  return { system: systemPrompt(context, childMessageCount, looksStuck(context, messages)), messages: historyMessages(messages) };
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
