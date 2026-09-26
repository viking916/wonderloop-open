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

// Anti-circling revision, 25 September 2026 (owner feedback: "AI is too strict, going in
// circles, and has limited asks"), then hardened by an opus review pass. See
// docs/superpowers/specs/2026-09-25-builder-ask-prompt.md's "2026-09-25 anti-circling revision"
// section for the full rationale. `freshContext` (0 recorded wrong tries) isolates the
// message-content and tutor-reply-count stuck signals from the shared top-of-file `context`
// fixture, which already carries two attempts and so is ALWAYS "stuck" on its own.
const freshContext: TutorContext = { ...context, attempts: [] };

describe("buildTutorPrompt: anti-circling rules", () => {
  test("states answer-first and the one-clarifying-question-per-conversation rule", () => {
    const { system } = buildTutorPrompt(freshContext, []);
    expect(system).toContain("Answer him first");
    expect(system).toContain("you may ask ONE short clarifying question about it, but only once in this whole conversation");
    expect(system).toContain("rather than asking a second time");
  });

  test("states every reply must move him forward, never the same hint reworded", () => {
    const { system } = buildTutorPrompt(freshContext, []);
    expect(system).toContain("Every reply must move him forward with something new");
    expect(system).toContain("never the same hint said again in other words");
  });

  test("not stuck (no attempts, no stuck phrase, fewer than 3 tutor replies): stays Socratic, no full teaching mode", () => {
    const { system } = buildTutorPrompt(freshContext, []);
    expect(system).toContain("Otherwise, help him think it through himself");
    expect(system).not.toContain("stop nudging and teach instead");
  });

  test("stuck after two recorded wrong tries on the problem itself: switches to full teaching mode", () => {
    const stuckContext: TutorContext = { ...context, attempts: ["5", "7"] };
    const { system } = buildTutorPrompt(stuckContext, []);
    expect(system).toContain("stop nudging and teach instead");
    expect(system).toContain("walk through one full worked example using DIFFERENT numbers from his own problem AND reaching a DIFFERENT final answer");
    expect(system).toContain("only the FIRST concrete step of his OWN problem");
  });

  test("stuck when any child message in the conversation says he does not know, even typed with a curly apostrophe", () => {
    const history: TutorMessage[] = [{ role: "child", text: "I don’t know, sorry" }];
    const { system } = buildTutorPrompt(freshContext, history);
    expect(system).toContain("stop nudging and teach instead");
  });

  test("stuck when the child asks to just be told", () => {
    const history: TutorMessage[] = [{ role: "child", text: "can you just tell me the answer" }];
    const { system } = buildTutorPrompt(freshContext, history);
    expect(system).toContain("stop nudging and teach instead");
  });

  test("stays stuck for the rest of the conversation once triggered, even if a later message does not repeat it", () => {
    const history: TutorMessage[] = [
      { role: "child", text: "I don't know" },
      { role: "tutor", text: "Let's look at it together." },
      { role: "child", text: "okay, it is an addition problem" },
    ];
    const { system } = buildTutorPrompt(freshContext, history);
    expect(system).toContain("stop nudging and teach instead");
  });

  test("falls back to teaching mode after three tutor replies with no resolution, even with no stuck phrase and no misses", () => {
    const history: TutorMessage[] = [
      { role: "child", text: "it is a fraction problem" },
      { role: "tutor", text: "What do you notice about the denominators?" },
      { role: "child", text: "they are different" },
      { role: "tutor", text: "Right. What could you do about that?" },
      { role: "child", text: "not sure" },
      { role: "tutor", text: "Think about a common denominator." },
      { role: "child", text: "still not sure" },
    ];
    const { system } = buildTutorPrompt(freshContext, history);
    expect(system).toContain("stop nudging and teach instead");
  });

  test("never confirms or denies a guess for his own problem, even when stuck", () => {
    const stuckContext: TutorContext = { ...context, attempts: ["5", "7"] };
    const { system } = buildTutorPrompt(stuckContext, []);
    expect(system).toContain("Never say whether a number or choice he offers for his OWN problem is right or wrong either, even a plain yes or no");
    expect(system).toContain("put it in the answer box to find out");
  });

  test("even while teaching a worked example, the never-state-his-own-answer rule still names the worked-example case explicitly", () => {
    const stuckContext: TutorContext = { ...context, attempts: ["5", "7"] };
    const { system } = buildTutorPrompt(stuckContext, []);
    expect(system).toContain("not inside a worked example");
  });

  test("states the personal-information rule (new to this prompt), calibrated to not flag a word problem's own story", () => {
    const { system } = buildTutorPrompt(freshContext, []);
    expect(system).toContain("his own real name, age, school, town, address");
    expect(system).toContain("not a name, age or place that is simply part of the problem's own story");
  });

  test("off-topic rule refuses rather than answering then steering back (new to this prompt)", () => {
    const { system } = buildTutorPrompt(freshContext, []);
    expect(system).toContain("do not answer it");
  });

  test("states ordinary frustration is not the distress line, and the distress escalation line (both new to this prompt)", () => {
    const { system } = buildTutorPrompt(freshContext, []);
    expect(system).toContain("Ordinary frustration with the problem");
    expect(system).toContain("is not a safety concern");
    expect(system).toContain("talk to a grown-up he trusts right away");
  });
});
