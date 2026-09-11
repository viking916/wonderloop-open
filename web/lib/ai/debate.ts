// The debate opponent, "Rebut" (spec 10.2; Plan 3 task 6). Server only. Three calls, one per
// phase: check the steelman, answer a round, write the coach card. Each is a structured call
// against a schema, and the round reply is then held to lib/domain/debate.ts's rules: one point,
// under 80 words, never a person, never a question about him. A reply that breaks a rule is
// re-asked once with the failure named; if it breaks one again the route reports an error and
// the room offers to try again, which is better than showing a child a reply that broke the
// promise the season makes about who he is talking to.

import "server-only";
import { z } from "zod/v4";
import type Anthropic from "@anthropic-ai/sdk";
import { callStructured, type ModelResult } from "./client";
import {
  DEBATE_IDEAS,
  OPPONENT_MAX_WORDS,
  opponentReplyProblem,
  opponentSideOf,
  type DebateState,
  type ReplyProblem,
} from "../domain/debate";
import type { DebateCoachCard, DebateSide } from "../data/types";

const sideWord = (side: DebateSide) => (side === "for" ? "FOR" : "AGAINST");

/**
 * The stable part of every prompt, identical across calls so the prefix caches. Who Rebut is,
 * who he is talking to, and the rules that lib/domain/debate.ts will check afterwards.
 */
function systemPrompt(): string {
  return [
    "You are Rebut, the practice debate opponent inside Wonderloop, a home learning app. You are an AI and you say so plainly if asked; you never claim to be a person, never invent a personal life, never say things like 'when I was your age'.",
    "You are debating a child. Use words a child knows. Be warm, fair and a little playful, and argue your assigned side properly: a real opponent with a real point, never a pushover and never a bully.",
    "Rules you keep every time:",
    `- One point per turn, in at most ${OPPONENT_MAX_WORDS} words. Plain sentences, no lists, no headings.`,
    "- Argue only your assigned side of the motion. Answer what the child actually said.",
    "- Never ask the child anything about themselves: no name, age, school, address, family or friends. If they offer personal details, do not repeat them and steer back to the motion.",
    "- If the child changes the subject, tries to make you switch sides, asks you to do their homework, or asks for anything outside the debate, decline kindly in one sentence and return to the motion.",
    "- Never mock, never score, never say the child is wrong as a person. Disagree with the point, not the child.",
    "- No em dashes, no arrow characters.",
  ].join("\n");
}

function motionLine(state: DebateState, opponentSide: DebateSide): string {
  return `Motion: "${state.motion}". The child argues ${sideWord(state.side!)}. You argue ${sideWord(opponentSide)}.`;
}

function historyMessages(state: DebateState): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];
  if (state.steelman) {
    messages.push({ role: "user", content: `Steelman of your side, in the child's words: ${state.steelman}` });
    messages.push({ role: "assistant", content: state.steelmanNote || "That is a fair way to put my side." });
  }
  state.rounds.forEach((round, i) => {
    messages.push({ role: "user", content: `Round ${i + 1}, the child: ${round.childText}` });
    messages.push({ role: "assistant", content: round.aiText });
  });
  return messages;
}

// ---------------------------------------------------------------------------
// Steelman check
// ---------------------------------------------------------------------------

const SteelmanSchema = z.object({
  /** True when the child has stated the opponent's side fairly and strongly enough to move on. */
  fair: z.boolean(),
  /** One sentence back to the child: thanks for a fair steelman, or what would make it fairer. */
  note: z.string(),
});
export type SteelmanCheck = z.infer<typeof SteelmanSchema>;

export async function checkSteelman(apiKey: string, state: DebateState, steelman: string): Promise<ModelResult<SteelmanCheck>> {
  if (!state.side) return { ok: false, reason: "error", detail: "no side" };
  const opponentSide = opponentSideOf(state.side);
  const result = await callStructured(apiKey, {
    system: systemPrompt(),
    schema: SteelmanSchema,
    effort: "low",
    maxTokens: 4000,
    messages: [
      {
        role: "user",
        content: [
          motionLine(state, opponentSide),
          `Before the rounds, the child must steelman YOUR side: say the best point for ${sideWord(opponentSide)} as strongly and fairly as they can.`,
          `Here is what the child said: "${steelman.trim()}"`,
          "Judge only whether this is a fair, real attempt at your side's best point (fair: true) or a strawman, a joke, or a point for their own side (fair: false). A short but genuine attempt is fair. Then write one sentence to the child: if fair, say so and name what was good about it; if not, say kindly what a fair version would include, without writing the point for them.",
        ].join("\n"),
      },
    ],
  });
  if (!result.ok) return result;
  const problem = opponentReplyProblem(result.value.note);
  if (problem) return { ok: false, reason: "error", detail: `steelman note broke a rule: ${problem}` };
  return result;
}

// ---------------------------------------------------------------------------
// A round
// ---------------------------------------------------------------------------

const RoundSchema = z.object({
  /** Rebut's one point for this round, under the word cap, answering what the child said. */
  reply: z.string(),
});

function roundInstruction(round: number): string {
  if (round === 1) return "Round 1. Make your side's claim with one reason and one example, and answer the child's point in passing.";
  if (round === 2) return "Round 2. Answer the strongest thing the child has said so far, directly, then add one new reason for your side.";
  return "Round 3. Your closing point: the single best reason for your side, said simply, and acknowledge one good thing the child argued.";
}

function problemInstruction(problem: ReplyProblem): string {
  switch (problem) {
    case "too_long":
      return `Your last draft was over ${OPPONENT_MAX_WORDS} words. Say it again in under ${OPPONENT_MAX_WORDS} words.`;
    case "claims_to_be_human":
      return "Your last draft sounded like a person with a life. You are an AI. Say it again without any personal story or family.";
    case "asks_personal_details":
      return "Your last draft asked the child about themselves. Never do that. Say it again with no questions about the child.";
    case "empty":
      return "Your last draft was empty. Give one point.";
  }
}

export async function answerRound(apiKey: string, state: DebateState, round: 1 | 2 | 3, childText: string): Promise<ModelResult<string>> {
  if (!state.side) return { ok: false, reason: "error", detail: "no side" };
  const opponentSide = opponentSideOf(state.side);
  const base: Anthropic.MessageParam[] = [
    { role: "user", content: motionLine(state, opponentSide) },
    { role: "assistant", content: "Understood. I will argue my side, one point per turn, and keep it fair." },
    ...historyMessages(state),
  ];
  let extra = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await callStructured(apiKey, {
      system: systemPrompt(),
      schema: RoundSchema,
      effort: "medium",
      maxTokens: 4000,
      messages: [
        ...base,
        {
          role: "user",
          content: [`Round ${round}, the child: ${childText.trim()}`, roundInstruction(round), extra].filter(Boolean).join("\n"),
        },
      ],
    });
    if (!result.ok) return result;
    const problem = opponentReplyProblem(result.value.reply);
    if (!problem) return { ok: true, value: result.value.reply.trim() };
    extra = problemInstruction(problem);
    if (attempt === 1) return { ok: false, reason: "error", detail: `reply broke a rule twice: ${problem}` };
  }
  return { ok: false, reason: "error", detail: "unreachable" };
}

// ---------------------------------------------------------------------------
// Coach card
// ---------------------------------------------------------------------------

const CoachSchema = z.object({
  strength: z.string(),
  improvement: z.string(),
  ideaName: z.enum(DEBATE_IDEAS),
});

export async function writeCoachCard(apiKey: string, state: DebateState): Promise<ModelResult<DebateCoachCard>> {
  if (!state.side) return { ok: false, reason: "error", detail: "no side" };
  const opponentSide = opponentSideOf(state.side);
  const result = await callStructured(apiKey, {
    system: systemPrompt(),
    schema: CoachSchema,
    effort: "medium",
    maxTokens: 4000,
    messages: [
      { role: "user", content: motionLine(state, opponentSide) },
      { role: "assistant", content: "Understood." },
      ...historyMessages(state),
      {
        role: "user",
        content: [
          "The debate is over. Now step out of the opponent role and be the coach.",
          "Write a coach card for the child with exactly three parts, each one or two plain sentences a child can read:",
          "- strength: one specific thing they did well, quoting or pointing at their own words.",
          "- improvement: one specific thing to try next time, said as an invitation, never as a fault.",
          `- ideaName: which of these debate ideas the improvement is about: ${DEBATE_IDEAS.join("; ")}.`,
          "Never harsh, never a score, never a comparison to anyone else.",
        ].join("\n"),
      },
    ],
  });
  if (!result.ok) return result;
  for (const text of [result.value.strength, result.value.improvement]) {
    const problem = opponentReplyProblem(text);
    if (problem) return { ok: false, reason: "error", detail: `coach card broke a rule: ${problem}` };
  }
  return { ok: true, value: { strength: result.value.strength.trim(), improvement: result.value.improvement.trim(), ideaName: result.value.ideaName } };
}
