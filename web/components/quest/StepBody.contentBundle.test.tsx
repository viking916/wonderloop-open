// @vitest-environment jsdom
/**
 * Whole-bundle regression for StepBody's two new lesson conventions (docs/content-authoring.md
 * rule 20, added 25 September 2026 for rule 32's "Learn it" lessons): a heading and a callout.
 * Every instruction and science step body in the generated content bundle is rendered, and every
 * paragraph/list block it used to produce is checked against the pre-existing rule: a block only
 * stops being a plain paragraph or ordered list if it actually starts with one of the new
 * markers. Run through `npm test`, not `npx vitest run` directly (docs/content-authoring.md,
 * "Run the tests through npm, not vitest directly"), so the bundle this reads is never stale.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { getContent } from "@/lib/content/app-content";
import type { Step } from "@/lib/content/schema";
import { splitBlocks, StepBody, type Block } from "./StepBody";

afterEach(cleanup);

// A frozen copy of the classifier StepBody used before headings and callouts existed: a block is
// an ordered list only if every one of its lines starts "1. "/"2. " and so on, otherwise it is a
// plain paragraph. This never changes, on purpose, even if StepBody's own rules grow again.
const LEGACY_LIST_ITEM = /^\d+[.)]\s+/;
function legacyKind(lines: string[]): "p" | "ol" {
  return lines.length > 0 && lines.every((l) => LEGACY_LIST_ITEM.test(l)) ? "ol" : "p";
}

const HEADING_BASES = new Set(["the idea", "tricks", "watch out", "worked example", "try one with me", "what to remember"]);
const CALLOUT_LABELS = new Set(["Trick", "Trap", "Check it", "Remember"]);

function rawChunksOf(body: string): string[] {
  return body
    .split(/\n\s*\n+/)
    .map((block) => block.replace(/^\n+|\n+$/g, ""))
    .filter((block) => block.trim().length > 0);
}

function totalChars(blocks: Block[]): number {
  return blocks.reduce((sum, b) => {
    if (b.kind === "p") return sum + b.text.length;
    if (b.kind === "heading") return sum + b.text.length;
    if (b.kind === "ol") return sum + b.items.join("").length;
    return sum + b.label.length + b.text.length + b.items.join("").length;
  }, 0);
}

describe("StepBody against the whole content bundle", () => {
  const content = getContent();
  const bodies: Array<{ id: string; body: string }> = [];
  for (const quest of content.quests) {
    for (const step of quest.steps as Step[]) {
      if (step.kind === "instruction" || step.kind === "science") {
        bodies.push({ id: `${quest.id}/${step.id}`, body: step.body });
      }
    }
  }

  test("the bundle actually has instruction and science steps to check", () => {
    // Guards against this whole suite passing because getContent() came back empty or stale.
    expect(bodies.length).toBeGreaterThan(100);
  });

  test("every instruction/science body renders through StepBody with no error", () => {
    for (const { id, body } of bodies) {
      expect(() => {
        const { unmount } = render(<StepBody text={body} />);
        unmount();
      }, id).not.toThrow();
    }
  });

  test("a block changes away from paragraph/list only where its own text starts a new marker", () => {
    const violations: string[] = [];
    for (const { id, body } of bodies) {
      for (const chunk of rawChunksOf(body)) {
        const lines = chunk.split("\n").map((l) => l.trimEnd());
        const old = legacyKind(lines);
        // splitBlocks on a single, already-isolated chunk has nothing to merge with, so this is
        // exactly the per-chunk classification the real implementation gives that text, with no
        // interference from a neighbour.
        const isolated = splitBlocks(chunk);
        if (isolated.length !== 1) {
          violations.push(`${id}: chunk split into ${isolated.length} blocks in isolation: ${JSON.stringify(chunk)}`);
          continue;
        }
        const now = isolated[0];
        if (now.kind === old) continue; // unchanged: still a plain paragraph or list, as before.
        if (now.kind === "heading") {
          if (!HEADING_BASES.has(now.text.replace(/\s+\d+$/, "").toLowerCase())) {
            violations.push(`${id}: became a heading without matching a known lesson section name: ${JSON.stringify(chunk)}`);
          }
          continue;
        }
        if (now.kind === "callout") {
          const marker = chunk.match(/^(Trick|Trap|Check it|Remember):/)?.[1];
          if (!marker || !CALLOUT_LABELS.has(marker)) {
            violations.push(`${id}: became a callout without a real Trick:/Trap:/Check it:/Remember: prefix: ${JSON.stringify(chunk)}`);
          }
          continue;
        }
        violations.push(`${id}: changed from "${old}" to "${now.kind}" for no known marker: ${JSON.stringify(chunk)}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test("a callout that swallows a following ordered list keeps every one of its items, and nothing else goes missing", () => {
    for (const { id, body } of bodies) {
      const chunks = rawChunksOf(body);
      const independentTotal = chunks.reduce((sum, chunk) => sum + totalChars(splitBlocks(chunk)), 0);
      const mergedTotal = totalChars(splitBlocks(body));
      expect(mergedTotal, id).toBe(independentTotal);
    }
  });
});
