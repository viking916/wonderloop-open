// GET /api/ai/health: with ?hid= and a signed-in member's token, says whether that family has
// an AI key on record (and its last four characters); without hid, just the model name, for a
// deploy check. No key material ever leaves this process.

import { NextResponse, type NextRequest } from "next/server";
import { authorizeForHousehold } from "@/lib/ai/auth";
import { MODEL } from "@/lib/ai/client";
import { getHouseholdKeyStatus } from "@/lib/ai/keys";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    return await get(req);
  } catch (err) {
    // Temporary diagnostics (6 September 2026): the deployed route answered 500 with an empty
    // body and no reachable log, so the failure is named here until the cause is fixed.
    const e = err as { message?: string; stack?: string };
    return NextResponse.json({ ok: false, error: e?.message ?? String(err), stack: req.nextUrl.searchParams.get("debug") ? e?.stack : undefined }, { status: 500 });
  }
}

async function get(req: NextRequest) {
  const hid = req.nextUrl.searchParams.get("hid");
  if (!hid) return NextResponse.json({ model: MODEL, perFamilyKeys: true });
  const auth = await authorizeForHousehold(req.headers.get("authorization"), hid);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });
  const status = await getHouseholdKeyStatus(hid);
  return NextResponse.json({ ok: true, model: MODEL, ...status });
}
