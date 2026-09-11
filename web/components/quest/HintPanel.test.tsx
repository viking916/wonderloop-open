// @vitest-environment jsdom
//
// The default vitest environment is "node" (vitest.config.ts); component tests opt into jsdom
// per file, the same way ProblemPlayer.test.tsx does.
import { afterEach, describe, expect, test } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HintPanel } from "./HintPanel";

afterEach(cleanup);

// Plan 3 Task 1: tier 3 is the authored Socratic question (schema.ts's socraticHint), shown
// once lib/domain/attempts.ts's tier3HintAvailable goes true after try two -- the same moment
// hint 2 unlocks. These assert the render contract that gating depends on, since the tier-3
// hint must never appear before the child has actually used two tries.

const HINTS: readonly [string, string] = [
  "Check whether the sentence A said is actually true or false in the real world.",
  "One type of person always says something true, and the other type always says something false.",
];
const SOCRATIC = "Would someone who is completely incapable of lying ever feel comfortable saying a sentence that is actually false out loud?";

describe("HintPanel", () => {
  test("renders nothing before the first wrong answer, tier 3 included", () => {
    const { container } = render(<HintPanel hints={HINTS} unlocked={0} socraticHint={SOCRATIC} tier3Available={false} />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByText(SOCRATIC)).toBeNull();
  });

  test("after try one shows hint 1 only, and never the tier-3 question", () => {
    render(<HintPanel hints={HINTS} unlocked={1} socraticHint={SOCRATIC} tier3Available={false} />);
    expect(screen.getByText(HINTS[0])).toBeTruthy();
    expect(screen.queryByText(HINTS[1])).toBeNull();
    expect(screen.queryByText(SOCRATIC)).toBeNull();
    expect(screen.queryByText("Think about it")).toBeNull();
  });

  test("after try two shows both authored hints and the tier-3 question together", () => {
    render(<HintPanel hints={HINTS} unlocked={2} socraticHint={SOCRATIC} tier3Available />);
    expect(screen.getByText(HINTS[0])).toBeTruthy();
    expect(screen.getByText(HINTS[1])).toBeTruthy();
    expect(screen.getByText(SOCRATIC)).toBeTruthy();
    expect(screen.getByText("Think about it")).toBeTruthy();
  });

  test("the tier-3 question is labelled as its own thing, not as a third numbered hint", () => {
    render(<HintPanel hints={HINTS} unlocked={2} socraticHint={SOCRATIC} tier3Available />);
    expect(screen.getByText("Hint 1")).toBeTruthy();
    expect(screen.getByText("Hint 2")).toBeTruthy();
    expect(screen.queryByText("Hint 3")).toBeNull();
  });

  test("the tier-3 question is asked, not told", () => {
    render(<HintPanel hints={HINTS} unlocked={2} socraticHint={SOCRATIC} tier3Available />);
    expect(screen.getByText(SOCRATIC).textContent).toMatch(/\?\s*$/);
  });
});
