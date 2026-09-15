import { describe, expect, test } from "vitest";
import path from "node:path";
import { loadContent } from "../lib/content/load";
import { buildReport, canonicalForms, findStandaloneToken } from "./content-report";

const good = path.join(__dirname, "..", "lib", "content", "__fixtures__", "good");
const leak = path.join(__dirname, "..", "lib", "content", "__fixtures__", "leak");
const leakSocratic = path.join(__dirname, "..", "lib", "content", "__fixtures__", "leak-socratic");
const long = path.join(__dirname, "..", "lib", "content", "__fixtures__", "long");

describe("buildReport", () => {
  test("counts problems by kind and finds no smells in clean content", () => {
    const r = loadContent(good);
    expect(r.ok).toBe(true);
    const report = buildReport(r.content!);
    expect(report.weeks[6]!.think!.problems.number).toBe(2);
    expect(report.smells).toEqual([]);
  });

  test("flags a hint that leaks the answer", () => {
    const r = loadContent(leak);
    expect(r.ok).toBe(true);
    const report = buildReport(r.content!);
    expect(report.smells).toHaveLength(1);
    expect(report.smells[0]!.kind).toBe("hint-leaks-answer");
    expect(report.smells[0]!.problemId).toBe("s1-w06-think-04-p03");
  });

  test("flags the tier-3 socratic hint when it leaks the answer", () => {
    const r = loadContent(leakSocratic);
    expect(r.ok).toBe(true);
    const report = buildReport(r.content!);
    expect(report.smells).toHaveLength(1);
    expect(report.smells[0]!.kind).toBe("hint-leaks-answer");
    expect(report.smells[0]!.problemId).toBe("s1-w06-think-04-p03");
    expect(report.smells[0]!.detail).toMatch(/socratic hint states/);
  });

  test("flags an explanation sentence over 25 words", () => {
    const r = loadContent(long);
    expect(r.ok).toBe(true);
    const report = buildReport(r.content!);
    expect(report.smells).toHaveLength(1);
    expect(report.smells[0]!.kind).toBe("long-sentence");
    expect(report.smells[0]!.problemId).toBe("s1-w06-think-04-p03");
    expect(report.smells[0]!.detail).toMatch(/31 words/);
  });
});

describe("canonicalForms", () => {
  test("converts a mixed number to its decimal form", () => {
    expect(canonicalForms("7 1/2")).toContain("7.5");
  });
});

describe("findStandaloneToken", () => {
  test("matches a token ended by a sentence period", () => {
    expect(findStandaloneToken("the answer is 3.", "3")).toBe(true);
  });

  test("does not match a token glued inside a bigger number", () => {
    expect(findStandaloneToken("the answer is 13.", "3")).toBe(false);
  });
});
