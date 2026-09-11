// The family's own AI key (owner decision, 6 September 2026). GET says whether one is set and
// its last four characters; POST checks the key against Anthropic once and stores it
// server-side (lib/ai/keys.ts); DELETE removes it. Every method needs a signed-in member of
// the household. The key itself never comes back out.

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeForHousehold } from "@/lib/ai/auth";
import { clearHouseholdKey, getHouseholdKeyStatus, looksLikeAnthropicKey, setHouseholdKey } from "@/lib/ai/keys";

export const dynamic = "force-dynamic";

export type KeyStatusResponse = { ok: true; configured: boolean; last4?: string; addedAt?: number } | { ok: false; message: string };

const BodySchema = z.object({ hid: z.string().min(1), key: z.string().min(1).max(400) });

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message } satisfies KeyStatusResponse, { status });
}

export async function GET(req: NextRequest) {
  const hid = req.nextUrl.searchParams.get("hid") ?? "";
  const auth = await authorizeForHousehold(req.headers.get("authorization"), hid);
  if (!auth.ok) return fail(auth.message, auth.status);
  const status = await getHouseholdKeyStatus(hid);
  return NextResponse.json({ ok: true, ...status } satisfies KeyStatusResponse);
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return fail("Paste the key first.", 400);
  }
  const auth = await authorizeForHousehold(req.headers.get("authorization"), body.hid);
  if (!auth.ok) return fail(auth.message, auth.status);
  const key = body.key.trim();
  if (!looksLikeAnthropicKey(key)) return fail("That does not look like an Anthropic key. It starts with sk-ant-.", 400);
  // One cheap call proves the key works before it is kept, so a typo is caught now, not in
  // the middle of a child's debate.
  try {
    await new Anthropic({ apiKey: key, timeout: 15_000, maxRetries: 0 }).models.list({ limit: 1 });
  } catch (err) {
    const status = typeof err === "object" && err !== null && "status" in err ? (err as { status?: number }).status : undefined;
    if (status === 401 || status === 403) return fail("Anthropic did not accept that key. Check it and try again.", 400);
    return fail("Could not reach Anthropic to check the key. Try again in a moment.", 502);
  }
  await setHouseholdKey(body.hid, key, auth.caller.uid);
  const status = await getHouseholdKeyStatus(body.hid);
  return NextResponse.json({ ok: true, ...status } satisfies KeyStatusResponse);
}

export async function DELETE(req: NextRequest) {
  const hid = req.nextUrl.searchParams.get("hid") ?? "";
  const auth = await authorizeForHousehold(req.headers.get("authorization"), hid);
  if (!auth.ok) return fail(auth.message, auth.status);
  await clearHouseholdKey(hid);
  return NextResponse.json({ ok: true, configured: false } satisfies KeyStatusResponse);
}
