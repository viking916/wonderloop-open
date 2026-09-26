import { describe, expect, test } from "vitest";
import path from "node:path";
import { loadContent, problemsOf } from "../lib/content/load";
import { buildReport } from "./content-report";
import type { Problem } from "../lib/content/schema";

// Plan 3 Task 1. content-report.ts already refuses a socraticHint that states its own answer,
// and validate-content refuses one that is missing or carries an em dash or arrow. What it
// cannot express is the rest of the brief: every problem with a checkable answer has one, it
// asks rather than tells, and it stays short. These lock that in over the real content tree, so
// a later season cannot quietly add a problem with a tier-3 hint that only looks like one.

const root = path.resolve(__dirname, "..", "..", "content");
const result = loadContent(root);
const problems: Problem[] = (result.content?.quests ?? []).flatMap((q) => q.steps.flatMap((s) => problemsOf(s)));

function sentenceCount(s: string): number {
  // Split the way content-report.ts does (never on a decimal point), and additionally never on
  // the "?" inside a placeholder like "?/20", which is notation from the prompt, not an ending.
  return s
    .replace(/\?\//g, "SLASHPLACEHOLDER")
    .split(/(?<!\d)\.(?!\d)|[?!]/)
    .map((x) => x.trim())
    .filter(Boolean).length;
}

describe("authored tier-3 socratic hints", () => {
  test("the content tree loads", () => {
    expect(result.errors).toEqual([]);
    expect(problems.length).toBe(1028);
  });

  test("every problem has one", () => {
    const missing = problems.filter((p) => !p.socraticHint || !p.socraticHint.trim());
    expect(missing.map((p) => p.id)).toEqual([]);
  });

  test("every one asks rather than tells", () => {
    const notAsked = problems.filter((p) => !p.socraticHint.includes("?"));
    expect(notAsked.map((p) => p.id)).toEqual([]);
  });

  test("every one is at most two sentences", () => {
    const tooLong = problems.filter((p) => sentenceCount(p.socraticHint) > 2);
    expect(tooLong.map((p) => `${p.id}: ${p.socraticHint}`)).toEqual([]);
  });

  test("no two problems share the same tier-3 hint", () => {
    const byHint = new Map<string, string[]>();
    for (const p of problems) byHint.set(p.socraticHint, [...(byHint.get(p.socraticHint) ?? []), p.id]);
    const shared = [...byHint.entries()].filter(([, ids]) => ids.length > 1);
    expect(shared).toEqual([]);
  });

  test("the whole tree reports zero hint-leak smells", () => {
    const report = buildReport(result.content!);
    expect(report.smells.filter((s) => s.kind === "hint-leaks-answer")).toEqual([]);
  });
});
