// POST /api/ai/debate: one phase of a debate at a time (Plan 3 task 6). The browser sends the
// debate state it holds (lib/domain/debate.ts's DebateState, the same thing it saves to
// Firestore after every utterance) plus what to do next; this checks who is asking, spends one
// slot of the per-profile rate limit, asks the model, and returns a value the room can render.
// Failure is always a JSON value with a reason, never a bare 500 the room cannot explain.

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeForProfile } from "@/lib/ai/auth";
import { answerRound, checkSteelman, writeCoachCard } from "@/lib/ai/debate";
import type { ModelFailure } from "@/lib/ai/client";
import { reserveCall } from "@/lib/ai/usage";
import { getHouseholdKey } from "@/lib/ai/keys";
import { currentRound, phaseOf, type DebateState } from "@/lib/domain/debate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const StateSchema = z.object({
  motionId: z.string().min(1),
  motion: z.string().min(1).max(300),
  side: z.enum(["for", "against"]).optional(),
  steelman: z.string().max(2000).optional(),
  steelmanNote: z.string().max(2000).optional(),
  rounds: z.array(z.object({ childText: z.string().max(2000), aiText: z.string().max(2000) })).max(3),
  pendingChildText: z.string().max(2000).optional(),
  coachCard: z.object({ strength: z.string(), improvement: z.string(), ideaName: z.string() }).optional(),
});

const BodySchema = z.object({
  hid: z.string().min(1),
  pid: z.string().min(1),
  state: StateSchema,
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("steelman"), text: z.string().min(1).max(2000) }),
    z.object({ kind: z.literal("round"), text: z.string().min(1).max(2000) }),
    z.object({ kind: z.literal("coach") }),
  ]),
});

export type DebateResponse =
  | { ok: true; kind: "steelman"; fair: boolean; note: string }
  | { ok: true; kind: "round"; round: 1 | 2 | 3; reply: string }
  | { ok: true; kind: "coach"; card: { strength: string; improvement: string; ideaName: string } }
  | { ok: false; reason: ModelFailure | "bad_request" | "wrong_phase" | "unauthorized"; message: string; retryAt?: number; detail?: string };

const FAILURE_MESSAGE: Record<ModelFailure, string> = {
  unconfigured: "Rebut is not switched on for your family yet. Your points are saved; a parent can add an AI key in the Parent view.",
  rate_limited: "Rebut needs a breather. Your points are saved; try again in a little while.",
  timeout: "Rebut took too long to answer. Your points are saved; try again.",
  refused: "Rebut could not answer that one. Your points are saved; try saying it a different way.",
  error: "Rebut lost the thread. Your points are saved; try again.",
};

function json(body: DebateResponse, status = 200) {
  return NextResponse.json(body, { status });
}

/** A failure is answered to the room in words for a child; its cause is logged here for the
 * grown-ups, since the room deliberately never shows it. Never includes the child's text. */
function failed(kind: string, result: { reason: ModelFailure; detail?: string }) {
  console.error(`[ai/debate] ${kind} failed: ${result.reason}${result.detail ? ` (${result.detail})` : ""}`);
  // The cause rides along only in development, where the verification scripts read it.
  const detail = process.env.NODE_ENV === "production" ? undefined : result.detail;
  return json({ ok: false, reason: result.reason, message: FAILURE_MESSAGE[result.reason], ...(detail ? { detail } : {}) }, 502);
}

export async function POST(request: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return json({ ok: false, reason: "bad_request", message: "That request did not make sense." }, 400);
  }
  const auth = await authorizeForProfile(request.headers.get("authorization"), body.hid, body.pid);
  if (!auth.ok) return json({ ok: false, reason: "unauthorized", message: auth.message }, auth.status);
  const apiKey = await getHouseholdKey(body.hid);
  if (!apiKey) return json({ ok: false, reason: "unconfigured", message: FAILURE_MESSAGE.unconfigured });

  const state = body.state as DebateState;
  const phase = phaseOf(state);
  const action = body.action;
  if (action.kind === "steelman" && phase !== "steelman") return json({ ok: false, reason: "wrong_phase", message: "The steelman is already done." }, 409);
  if (action.kind === "round" && currentRound(state) === undefined) return json({ ok: false, reason: "wrong_phase", message: "No round is open." }, 409);
  if (action.kind === "coach" && phase !== "coach") return json({ ok: false, reason: "wrong_phase", message: "The rounds are not finished." }, 409);

  const now = Date.now();
  const slot = await reserveCall(body.hid, body.pid, now);
  if (!slot.allowed) return json({ ok: false, reason: "rate_limited", message: FAILURE_MESSAGE.rate_limited, retryAt: slot.retryAt }, 429);

  if (action.kind === "steelman") {
    const result = await checkSteelman(apiKey, state, action.text);
    if (!result.ok) return failed("steelman", result);
    return json({ ok: true, kind: "steelman", fair: result.value.fair, note: result.value.note });
  }
  if (action.kind === "round") {
    const round = currentRound(state)!;
    const result = await answerRound(apiKey, state, round, action.text);
    if (!result.ok) return failed(`round ${round}`, result);
    return json({ ok: true, kind: "round", round, reply: result.value });
  }
  const result = await writeCoachCard(apiKey, state);
  if (!result.ok) return failed("coach", result);
  return json({ ok: true, kind: "coach", card: result.value });
}
