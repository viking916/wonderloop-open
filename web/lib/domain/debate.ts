// The debate room's state machine (spec 7.1 screen 4, 10.2; Plan 3 task 6). Pure: no React, no
// Firebase, no model, no Date.now(). The room (components/quest/DebateRoom.tsx) renders whatever
// phase this says, the server route (app/api/ai/debate) answers one phase at a time, and the
// saved document (lib/data/debates.ts) is this state written down after every child utterance,
// so an argument he already made is never lost to a dropped connection or a closed tab.
//
// Shape of a debate: pick a side if the step says "choose"; steelman the other side first; three
// rounds, each the child's point then the opponent's one point; a coach card at the end. A round
// with the child's words saved and no opponent reply yet is "pending": the room offers to send
// it again rather than asking him to say it twice.

import type { DebateCoachCard, DebateRound, DebateSide } from "../data/types";

export type DebatePhase = "side" | "steelman" | "round1" | "round2" | "round3" | "coach" | "done";

export type DebateState = {
  motionId: string;
  motion: string;
  side?: DebateSide;
  /** What he said the other side's best point is, once accepted. */
  steelman?: string;
  /** The opponent's one-line reaction to the steelman ("That is fair" or a nudge). */
  steelmanNote?: string;
  rounds: DebateRound[];
  /** The child's words for the round in progress, saved before the opponent has answered. */
  pendingChildText?: string;
  coachCard?: DebateCoachCard;
};

export const MAX_ROUNDS = 3;
export const OPPONENT_MAX_WORDS = 80;

export function emptyDebate(motionId: string, motion: string, side: DebateSide | undefined): DebateState {
  return { motionId, motion, side, rounds: [] };
}

export function opponentSideOf(side: DebateSide): DebateSide {
  return side === "for" ? "against" : "for";
}

export function phaseOf(state: DebateState): DebatePhase {
  if (!state.side) return "side";
  if (state.steelman === undefined) return "steelman";
  if (state.coachCard) return "done";
  if (state.rounds.length >= MAX_ROUNDS) return "coach";
  return (`round${state.rounds.length + 1}`) as DebatePhase;
}

/** 1, 2 or 3 while a round is open; undefined otherwise. */
export function currentRound(state: DebateState): 1 | 2 | 3 | undefined {
  const phase = phaseOf(state);
  if (phase === "round1") return 1;
  if (phase === "round2") return 2;
  if (phase === "round3") return 3;
  return undefined;
}

export function isDebateComplete(state: DebateState): boolean {
  return phaseOf(state) === "done";
}

export function withSide(state: DebateState, side: DebateSide): DebateState {
  if (state.side) return state;
  return { ...state, side };
}

/** Records the steelman once the server has accepted it, with the opponent's note. */
export function withSteelman(state: DebateState, steelman: string, note: string): DebateState {
  const text = steelman.trim();
  if (!text) return state;
  return { ...state, steelman: text, steelmanNote: note.trim() };
}

/** The child spoke for the open round. Saved before any reply exists, which is the whole point. */
export function withChildTurn(state: DebateState, text: string): DebateState {
  const trimmed = text.trim();
  if (!trimmed || currentRound(state) === undefined) return state;
  return { ...state, pendingChildText: trimmed };
}

/** The opponent answered the pending words: the round closes. Ignored if nothing was pending. */
export function withOpponentReply(state: DebateState, reply: string): DebateState {
  const childText = state.pendingChildText;
  if (!childText || currentRound(state) === undefined) return state;
  const { pendingChildText: _pending, ...rest } = state;
  return { ...rest, rounds: [...state.rounds, { childText, aiText: reply.trim() }] };
}

/** Drops the pending words so he can say the round differently. */
export function withoutPending(state: DebateState): DebateState {
  const { pendingChildText: _pending, ...rest } = state;
  return rest;
}

export function withCoachCard(state: DebateState, card: DebateCoachCard): DebateState {
  if (phaseOf(state) !== "coach") return state;
  return { ...state, coachCard: card };
}

/** The whole exchange as plain text: what the Parent view reads and what the portfolio keeps. */
export function transcriptOf(state: DebateState, childName = "Child", opponentName = "Rebut"): string {
  const lines: string[] = [`Motion: ${state.motion}`];
  if (state.side) lines.push(`${childName} argues ${state.side === "for" ? "for" : "against"}.`);
  if (state.steelman) {
    lines.push("", `${childName} (steelman): ${state.steelman}`);
    if (state.steelmanNote) lines.push(`${opponentName}: ${state.steelmanNote}`);
  }
  state.rounds.forEach((round, i) => {
    lines.push("", `Round ${i + 1}`, `${childName}: ${round.childText}`, `${opponentName}: ${round.aiText}`);
  });
  if (state.pendingChildText) {
    lines.push("", `Round ${state.rounds.length + 1}`, `${childName}: ${state.pendingChildText}`, `${opponentName}: (no reply yet)`);
  }
  if (state.coachCard) {
    lines.push("", "Coach card", `Strength: ${state.coachCard.strength}`, `Try next: ${state.coachCard.improvement}`, `Idea: ${state.coachCard.ideaName}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// The opponent's rules, checked on the server after every reply (Plan 3 task 6 step 2). The
// prompt asks for them; this is what enforces them, and lib/ai/debate.ts re-asks once with the
// failure named before giving up. A guard that only lives in a prompt is a hope.
// ---------------------------------------------------------------------------

export type ReplyProblem = "too_long" | "claims_to_be_human" | "asks_personal_details" | "empty";

const HUMAN_CLAIMS = [
  /\bi(?:'m| am) (?:a )?(?:real )?(?:person|human|kid|child|boy|girl|man|woman)\b/i,
  /\bi(?:'m| am) not (?:an? )?(?:ai|robot|computer|program|bot)\b/i,
  /\bwhen i was (?:a )?(?:kid|child|little|young|your age)\b/i,
  /\bmy (?:mum|mom|dad|parents|teacher|school|brother|sister)\b/i,
];

const PERSONAL_ASKS = [
  /\bwhat(?:'s| is) your (?:name|address|school|phone|email|age|birthday|last name|surname)\b/i,
  /\bwhere do you live\b/i,
  /\bhow old are you\b/i,
  /\bwhich school\b/i,
  /\btell me your (?:name|address|school|phone|email|age)\b/i,
];

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Undefined when the reply keeps every rule; otherwise the first rule it breaks. */
export function opponentReplyProblem(reply: string): ReplyProblem | undefined {
  const text = reply.trim();
  if (!text) return "empty";
  if (wordCount(text) > OPPONENT_MAX_WORDS) return "too_long";
  if (HUMAN_CLAIMS.some((re) => re.test(text))) return "claims_to_be_human";
  if (PERSONAL_ASKS.some((re) => re.test(text))) return "asks_personal_details";
  return undefined;
}

/** The debate moves a coach card may name. A closed list so the card always points at something
 * the season actually teaches, never a term invented on the spot. */
export const DEBATE_IDEAS = [
  "Claim, reason, example",
  "Steelman",
  "Rebuttal",
  "Evidence",
  "Closing point",
  "Listening for the strongest point",
] as const;
export type DebateIdea = (typeof DEBATE_IDEAS)[number];
