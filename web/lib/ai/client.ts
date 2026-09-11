// The server-side model seam (Plan 3 task 4). Server only: this file reads ANTHROPIC_API_KEY
// from the process environment and must never be imported from a client component. Every
// caller gets a value, never an exception: `ModelResult` is a discriminated union, and a
// failure is something the room can show and offer to retry.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
// The SDK's zod helper is written against zod 4's types, which zod 3.25 ships under "zod/v4".
import { z } from "zod/v4";

export const MODEL = "claude-opus-5";

export type ModelFailure = "unconfigured" | "rate_limited" | "timeout" | "refused" | "error";

export type ModelResult<T> = { ok: true; value: T } | { ok: false; reason: ModelFailure; detail?: string };


// One SDK client per distinct key (each family supplies its own, lib/ai/keys.ts), kept small.
const clients = new Map<string, Anthropic>();
function clientFor(apiKey: string): Anthropic {
  let c = clients.get(apiKey);
  if (!c) {
    if (clients.size >= 32) clients.delete(clients.keys().next().value as string);
    c = new Anthropic({ apiKey, timeout: 40_000, maxRetries: 1 });
    clients.set(apiKey, c);
  }
  return c;
}


export type StructuredRequest<T> = {
  system: string;
  messages: Anthropic.MessageParam[];
  schema: z.ZodType<T>;
  /** Defaults to "medium": these are short exchanges with a child, not proofs. */
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
};

/**
 * One structured call. The schema is enforced by the API's output format, so the value is
 * either valid or the call is reported as an error; nobody downstream parses free text.
 *
 * Observed 2026-09-05: the structured-output path intermittently answers 400 "Invalid request
 * data" for a request that succeeds a second later, while the same request without
 * output_config.format has never failed. So a rejected structured call is tried once more, and
 * if it is rejected again the same schema is asked for as plain JSON in the prompt and parsed
 * with zod on this side. A child sees one path or the other, never the flake.
 */
export async function callStructured<T>(apiKey: string, request: StructuredRequest<T>): Promise<ModelResult<T>> {
  if (!apiKey) return { ok: false, reason: "unconfigured" };
  const anthropic = clientFor(apiKey);
  let lastFailure: ModelResult<T> | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await structuredOnce(anthropic, request);
    if (result.ok || !isInvalidRequest(result)) return result;
    lastFailure = result;
  }
  const fallback = await plainJsonOnce(anthropic, request);
  return fallback.ok ? fallback : (lastFailure ?? fallback);
}

function isInvalidRequest<T>(result: ModelResult<T>): boolean {
  return !result.ok && result.reason === "error" && Boolean(result.detail?.startsWith("400"));
}

async function structuredOnce<T>(anthropic: Anthropic, request: StructuredRequest<T>): Promise<ModelResult<T>> {
  try {
    const response = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: request.maxTokens ?? 4000,
      system: request.system,
      messages: request.messages,
      output_config: { format: zodOutputFormat(request.schema), effort: request.effort ?? "medium" },
    });
    if (response.stop_reason === "refusal") return { ok: false, reason: "refused" };
    if (response.parsed_output === null || response.parsed_output === undefined) {
      return { ok: false, reason: "error", detail: `no parsed output (stop_reason ${response.stop_reason})` };
    }
    return { ok: true, value: response.parsed_output as T };
  } catch (err) {
    return failureOf(err, request);
  }
}

/** The same schema, asked for in words and checked with zod: the path that has never flaked. */
async function plainJsonOnce<T>(anthropic: Anthropic, request: StructuredRequest<T>): Promise<ModelResult<T>> {
  try {
    const schemaText = JSON.stringify(z.toJSONSchema(request.schema));
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: request.maxTokens ?? 4000,
      system: `${request.system}

Answer with one JSON object only, no prose before or after it, matching this JSON schema exactly: ${schemaText}`,
      messages: request.messages,
      output_config: { effort: request.effort ?? "medium" },
    });
    if (response.stop_reason === "refusal") return { ok: false, reason: "refused" };
    const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first < 0 || last <= first) return { ok: false, reason: "error", detail: "fallback reply held no JSON object" };
    const parsed = request.schema.safeParse(JSON.parse(text.slice(first, last + 1)));
    if (!parsed.success) return { ok: false, reason: "error", detail: "fallback JSON did not match the schema" };
    return { ok: true, value: parsed.data };
  } catch (err) {
    return failureOf(err, request);
  }
}

async function failureOf<T>(err: unknown, request: StructuredRequest<T>): Promise<ModelResult<T>> {
  if (err instanceof Anthropic.RateLimitError) return { ok: false, reason: "rate_limited" };
  if (err instanceof Anthropic.APIConnectionTimeoutError) return { ok: false, reason: "timeout" };
  if (err instanceof Anthropic.APIError) {
    if (process.env.NODE_ENV !== "production") {
      // Development only: keep the exact failing request beside the build so a 400 can be read
      // rather than guessed at. Never in production, where a child's words stay in Firestore.
      try {
        const fs = await import("node:fs");
        fs.writeFileSync(".next/last-ai-failure.json", JSON.stringify({ status: err.status, message: err.message, request: { system: request.system, messages: request.messages } }, null, 2));
      } catch {
        // Diagnostics only.
      }
    }
    return { ok: false, reason: "error", detail: `${err.status ?? ""} ${err.name}: ${err.message}`.trim() };
  }
  return { ok: false, reason: "error", detail: err instanceof Error ? err.name : "unknown" };
}
