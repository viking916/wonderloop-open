// tutor.ts imports "server-only" (directly, and transitively via ./client), which throws the
// instant it is required outside a Next.js server-component graph (see its own package: the
// "react-server" export condition resolves to a no-op, everything else -- including plain
// Node/Vitest -- falls through to an index.js that throws unconditionally). That is exactly why
// this file tests buildTutorPrompt, the pure prompt-assembly function, rather than tutorReply
// itself: callStructured is the one impure piece (a real network call to Anthropic), and
// stubbing it would still require importing this module, which the mock below makes safe to do.
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildTutorPrompt, MAX_CHILD_MESSAGES, type TutorContext, type TutorMessage } from "./tutor";

const context: TutorContext = {
  questId: "s1-w01-think",
  stepId: "s1-w01-think-01",
  problemId: "s1-w01-think-01-p01",
  prompt: "What is 2 + 4?",
  hints: ["Count up from 2.", "Use your fingers if it helps."],
  explanation: "Add the two numbers. 2 + 4 is 6.",
  attempts: ["5", "7"],
};

describe("buildTutorPrompt", () => {
  test("carries the problem, hints, attempts and explanation, and the never-the-answer rule, in the system prompt", () => {
    const { system, messages } = buildTutorPrompt(context, []);
    expect(system).toContain("What is 2 + 4?");
    expect(system).toContain("Count up from 2.");
    expect(system).toContain("Use your fingers if it helps.");
    expect(system).toContain('try 1: "5"');
    expect(system).toContain('try 2: "7"');
    expect(system).toContain("Add the two numbers. 2 + 4 is 6.");
    expect(system).toContain("never state the final answer");
    expect(messages).toEqual([]);
  });

  test("states plainly when no tries are on record yet, rather than an empty list", () => {
    const { system } = buildTutorPrompt({ ...context, attempts: [] }, []);
    expect(system).toContain("has not written down any tries yet");
  });

  test("maps child/tutor roles onto user/assistant, in order", () => {
    const history: TutorMessage[] = [
      { role: "child", text: "I do not get it" },
      { role: "tutor", text: "What have you tried so far?" },
      { role: "child", text: "I tried counting" },
    ];
    const { messages } = buildTutorPrompt(context, history);
    expect(messages).toEqual([
      { role: "user", content: "I do not get it" },
      { role: "assistant", content: "What have you tried so far?" },
      { role: "user", content: "I tried counting" },
    ]);
  });

  test("says nothing about closing out before the sixth child message", () => {
    const history: TutorMessage[] = Array.from({ length: MAX_CHILD_MESSAGES - 1 }, (_, i) => ({ role: "child" as const, text: `try ${i}` }));
    const { system } = buildTutorPrompt(context, history);
    expect(system).not.toContain("last exchange");
  });

  test("closes the conversation once the transcript reaches the sixth child message", () => {
    const history: TutorMessage[] = Array.from({ length: MAX_CHILD_MESSAGES }, (_, i) => ({ role: "child" as const, text: `try ${i}` }));
    const { system } = buildTutorPrompt(context, history);
    expect(system).toContain("last exchange");
    expect(system).toContain("try the problem now");
  });

  test("a seventh child message (a stale transcript re-sent) still closes out, not re-opens", () => {
    const history: TutorMessage[] = Array.from({ length: MAX_CHILD_MESSAGES + 1 }, (_, i) => ({ role: "child" as const, text: `try ${i}` }));
    const { system } = buildTutorPrompt(context, history);
    expect(system).toContain("last exchange");
  });
});
