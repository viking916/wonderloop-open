// POST /api/ai/builder: one exchange with Builder Ask, the Build and Make helper (A4, year
// refinement 2026-09-24, owner ruling 0.1). Same auth/family-key/rate-limit shape as
// app/api/ai/tutor/route.ts, and shares its rate-limit pool (lib/ai/usage.ts's reserveCall is
// keyed by household and profile, not by route, since the owner's ruling groups "rate limits"
// under the AI feature as a whole, not per panel). `remaining` counts down from
// lib/ai/builder.ts's MAX_BUILDER_STEP_MESSAGES so the panel can close the conversation the same
// way on a reload as it would mid-sitting.

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeForProfile } from "@/lib/ai/auth";
import { MAX_BUILDER_STEP_MESSAGES, builderReply, type BuilderContext, type BuilderMessage } from "@/lib/ai/builder";
import type { ModelFailure } from "@/lib/ai/client";
import { reserveCall } from "@/lib/ai/usage";
import { getHouseholdKey } from "@/lib/ai/keys";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ContextSchema = z.object({
  questId: z.string().min(1),
  questTitle: z.string().min(1).max(200),
  track: z.enum(["build", "make"]),
  stepId: z.string().min(1),
  stepTitle: z.string().min(1).max(200),
  stepBody: z.string().min(1).max(4000),
  checklist: z.array(z.string().max(300)).max(5).optional(),
});

const MessageSchema = z.object({
  role: z.enum(["child", "tutor"]),
  text: z.string().max(1000),
});

const BodySchema = z.object({
  hid: z.string().min(1),
  pid: z.string().min(1),
  context: ContextSchema,
  // Same reasoning as app/api/ai/tutor/route.ts's own messages cap: 2*(MAX_BUILDER_STEP_MESSAGES-1)
  // plus a small margin. Raised from 24 (when MAX_BUILDER_STEP_MESSAGES was 10) alongside that
  // cap's own rise to 25, 25 September 2026.
  messages: z.array(MessageSchema).max(50),
  text: z.string().min(1).max(1000),
});

export type BuilderResponse =
  | { ok: true; reply: string; remaining: number }
  | { ok: false; reason: ModelFailure | "bad_request" | "unauthorized"; message: string; retryAt?: number; detail?: string };

const FAILURE_MESSAGE: Record<ModelFailure, string> = {
  unconfigured: "Ask is not switched on for your family yet. Ask a grown-up to add an AI key in the Parent view.",
  rate_limited: "Ask needs a breather. Try again in a little while.",
  timeout: "Ask took too long to answer. Try again.",
  refused: "Ask could not answer that one. Try asking a different way.",
  error: "Ask lost the thread. Try again.",
};

function json(body: BuilderResponse, status = 200) {
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

  const context: BuilderContext = body.context;
  const messages: BuilderMessage[] = [...body.messages, { role: "child", text: body.text.trim() }];

  const result = await builderReply(apiKey, context, messages);
  if (!result.ok) {
    console.error(`[ai/builder] failed: ${result.reason}${result.detail ? ` (${result.detail})` : ""}`);
    const detail = process.env.NODE_ENV === "production" ? undefined : result.detail;
    return json({ ok: false, reason: result.reason, message: FAILURE_MESSAGE[result.reason], ...(detail ? { detail } : {}) }, 502);
  }

  const childMessageCount = messages.filter((m) => m.role === "child").length;
  const remaining = Math.max(0, MAX_BUILDER_STEP_MESSAGES - childMessageCount);
  return json({ ok: true, reply: result.value.reply, remaining });
}
