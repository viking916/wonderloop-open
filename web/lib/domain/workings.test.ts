import { describe, expect, test } from "vitest";
import { hasWorkingContent } from "./workings";

describe("hasWorkingContent", () => {
  test("no document at all (never opened the working space) has no content", () => {
    expect(hasWorkingContent(undefined)).toBe(false);
  });

  test("a document with blank text and no strokes has no content", () => {
    expect(hasWorkingContent({ text: "", strokes: [], updatedAt: 1 })).toBe(false);
  });

  test("whitespace-only text still counts as no content", () => {
    expect(hasWorkingContent({ text: "   \n  ", strokes: [], updatedAt: 1 })).toBe(false);
  });

  test("real typed text counts as content even with no strokes", () => {
    expect(hasWorkingContent({ text: "3/4 plus 1/4 is one whole", strokes: [], updatedAt: 1 })).toBe(true);
  });

  test("a pen stroke with no typed text still counts as content", () => {
    expect(
      hasWorkingContent({
        text: "",
        strokes: [{ tool: "pen", points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] }],
        updatedAt: 1,
      }),
    ).toBe(true);
  });

  test("both text and strokes present counts as content", () => {
    expect(
      hasWorkingContent({
        text: "tried splitting it",
        strokes: [{ tool: "eraser", points: [{ x: 0, y: 0 }] }],
        updatedAt: 1,
      }),
    ).toBe(true);
  });
});
