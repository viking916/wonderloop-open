// POST /api/ai/tutor: one exchange with Ask, the Socratic tutor (owner-approved 12 September
// 2026). Modelled on app/api/ai/debate/route.ts: checks who is asking, spends one slot of the
// per-profile rate limit (shared with every other AI route, lib/ai/usage.ts), asks the model,
// and always answers with a value the panel can render -- never a bare 500 a child cannot
// explain. `remaining` counts down from lib/ai/tutor.ts's MAX_CHILD_MESSAGES so the panel can
// close the conversation the same way on a reload as it would mid-session.

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeForProfile } from "@/lib/ai/auth";
import { MAX_CHILD_MESSAGES, tutorReply, type TutorContext, type TutorMessage } from "@/lib/ai/tutor";
import type { ModelFailure } from "@/lib/ai/client";
import { reserveCall } from "@/lib/ai/usage";
import { getHouseholdKey } from "@/lib/ai/keys";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ContextSchema = z.object({
  questId: z.string().min(1),
  stepId: z.string().min(1),
  problemId: z.string().min(1),
  prompt: z.string().min(1).max(2000),
  hints: z.array(z.string().max(1000)).max(4),
  explanation: z.string().max(4000),
  attempts: z.array(z.string().max(500)).max(20),
});

const MessageSchema = z.object({
  role: z.enum(["child", "tutor"]),
  text: z.string().max(1000),
});

const BodySchema = z.object({
  hid: z.string().min(1),
  pid: z.string().min(1),
  context: ContextSchema,
  // 2*(MAX_CHILD_MESSAGES-1) plus a small margin: the array is the transcript BEFORE this call's
  // own new child message (sent separately as `text`), so at the cap's last allowed exchange it
  // holds 14 child + 14 tutor messages. Raised from 12 (when MAX_CHILD_MESSAGES was 6) alongside
  // that cap's own rise to 15, 25 September 2026.
  messages: z.array(MessageSchema).max(32),
  text: z.string().min(1).max(1000),
});

export type TutorResponse =
  | { ok: true; reply: string; remaining: number }
  | { ok: false; reason: ModelFailure | "bad_request" | "unauthorized"; message: string; retryAt?: number; detail?: string };

const FAILURE_MESSAGE: Record<ModelFailure, string> = {
  unconfigured: "Ask is not switched on for your family yet. Ask a grown-up to add an AI key in the Parent view.",
  rate_limited: "Ask needs a breather. Try again in a little while.",
  timeout: "Ask took too long to answer. Try again.",
  refused: "Ask could not answer that one. Try asking a different way.",
  error: "Ask lost the thread. Try again.",
};

function json(body: TutorResponse, status = 200) {
  return NextResponse.json(body, { status });
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

  const now = Date.now();
  const slot = await reserveCall(body.hid, body.pid, now);
  if (!slot.allowed) return json({ ok: false, reason: "rate_limited", message: FAILURE_MESSAGE.rate_limited, retryAt: slot.retryAt }, 429);

  const context: TutorContext = body.context;
  const messages: TutorMessage[] = [...body.messages, { role: "child", text: body.text.trim() }];

  const result = await tutorReply(apiKey, context, messages);
  if (!result.ok) {
    console.error(`[ai/tutor] failed: ${result.reason}${result.detail ? ` (${result.detail})` : ""}`);
    const detail = process.env.NODE_ENV === "production" ? undefined : result.detail;
    return json({ ok: false, reason: result.reason, message: FAILURE_MESSAGE[result.reason], ...(detail ? { detail } : {}) }, 502);
  }

  const childMessageCount = messages.filter((m) => m.role === "child").length;
  const remaining = Math.max(0, MAX_CHILD_MESSAGES - childMessageCount);
  return json({ ok: true, reply: result.value.reply, remaining });
}
