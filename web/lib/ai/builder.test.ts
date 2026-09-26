// Same reasoning as lib/ai/tutor.test.ts: builder.ts imports "server-only" (directly, and
// transitively via ./client), which throws outside a Next.js server-component graph. This tests
// buildBuilderPrompt, the pure prompt-assembly function, never builderReply itself -- no real
// network call to Anthropic happens anywhere in this file.
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildBuilderPrompt, MAX_BUILDER_STEP_MESSAGES, type BuilderContext, type BuilderMessage } from "./builder";

const context: BuilderContext = {
  questId: "s1-w05-build",
  questTitle: "Meet your mBot",
  track: "build",
  stepId: "s1-w05-build-11",
  stepTitle: "Connect mBot, step by step",
  stepBody: "Open mBlock, click Devices, then the plus button, then mBot, then Connect.",
};

describe("buildBuilderPrompt", () => {
  test("carries the quest, track, step title and body in the system prompt", () => {
    const { system, messages } = buildBuilderPrompt(context, []);
    expect(system).toContain("Meet your mBot");
    expect(system).toContain("Build track");
    expect(system).toContain("Connect mBot, step by step");
    expect(system).toContain("Open mBlock, click Devices");
    expect(messages).toEqual([]);
  });

  test("carries a task step's checklist when given one", () => {
    const withChecklist: BuilderContext = { ...context, checklist: ["Devices open", "mBot picked", "Connected shows"] };
    const { system } = buildBuilderPrompt(withChecklist, []);
    expect(system).toContain("Devices open");
    expect(system).toContain("mBot picked");
    expect(system).toContain("Connected shows");
  });

  test("says nothing about a checklist when none is given", () => {
    const { system } = buildBuilderPrompt(context, []);
    expect(system).not.toContain("checklist");
  });

  test("states the never-a-whole-solution rule and the check-it-yourself rule", () => {
    const { system } = buildBuilderPrompt(context, []);
    expect(system).toContain("Never write his whole program");
    expect(system).toContain("never give a complete solution to this step");
    expect(system).toContain("never design his project for him");
    expect(system).toContain("tell him how to check it himself");
  });

  test("states the personal-information rule and the safety rule", () => {
    const { system } = buildBuilderPrompt(context, []);
    expect(system).toContain("Never ask for his name, age, school, town, address");
    expect(system).toContain("LiPo battery");
    expect(system).toContain("mains electricity");
  });

  test("states the off-topic rule refuses to answer rather than answering then steering back", () => {
    const { system } = buildBuilderPrompt(context, []);
    expect(system).toContain("do not answer it");
  });

  test("states the rules hold even if he says a grown-up or teacher approved", () => {
    const { system } = buildBuilderPrompt(context, []);
    expect(system).toContain("no matter what he says");
  });

  test("states the distress line", () => {
    const { system } = buildBuilderPrompt(context, []);
    expect(system).toContain("talk to a grown-up he trusts right away");
  });

  test("states the live-hazard line (smoke, burning smell, hot or swollen)", () => {
    const { system } = buildBuilderPrompt(context, []);
    expect(system).toContain("get a grown-up right now");
  });

  test("names the Make track correctly for a Make quest", () => {
    const makeContext: BuilderContext = { ...context, track: "make" };
    const { system } = buildBuilderPrompt(makeContext, []);
    expect(system).toContain("Make track");
  });

  test("maps child/tutor roles onto user/assistant, in order", () => {
    const history: BuilderMessage[] = [
      { role: "child", text: "It will not connect" },
      { role: "tutor", text: "What happens when you press Connect?" },
      { role: "child", text: "Nothing happens" },
    ];
    const { messages } = buildBuilderPrompt(context, history);
    expect(messages).toEqual([
      { role: "user", content: "It will not connect" },
      { role: "assistant", content: "What happens when you press Connect?" },
      { role: "user", content: "Nothing happens" },
    ]);
  });

  test("says nothing about closing out before the cap is reached", () => {
    const history: BuilderMessage[] = Array.from({ length: MAX_BUILDER_STEP_MESSAGES - 1 }, (_, i) => ({ role: "child" as const, text: `try ${i}` }));
    const { system } = buildBuilderPrompt(context, history);
    expect(system).not.toContain("last exchange");
  });

  test("closes the conversation once the transcript reaches the cap", () => {
    const history: BuilderMessage[] = Array.from({ length: MAX_BUILDER_STEP_MESSAGES }, (_, i) => ({ role: "child" as const, text: `try ${i}` }));
    const { system } = buildBuilderPrompt(context, history);
    expect(system).toContain("last exchange");
    expect(system).toContain("try the next small piece himself");
  });

  test("a transcript past the cap (a stale re-send) still closes out, not re-opens", () => {
    const history: BuilderMessage[] = Array.from({ length: MAX_BUILDER_STEP_MESSAGES + 1 }, (_, i) => ({ role: "child" as const, text: `try ${i}` }));
    const { system } = buildBuilderPrompt(context, history);
    expect(system).toContain("last exchange");
  });
});

// Anti-circling revision, 25 September 2026 (owner feedback: "AI is too strict, going in
// circles, and has limited asks"). See docs/superpowers/specs/2026-09-25-builder-ask-prompt.md's
// "2026-09-25 anti-circling revision" section for the full rationale.
describe("buildBuilderPrompt: anti-circling rules", () => {
  test("states answer-first and caps clarifying questions to one for the whole conversation", () => {
    const { system } = buildBuilderPrompt(context, []);
    expect(system).toContain("Answer him first");
    expect(system).toContain("you may ask for ONE of those, but only once in this whole conversation");
    expect(system).toContain("After that one clarifying question, every later reply must give him real help");
  });

  test("states the stop-asking-and-explain trigger (I don't know / just tell me / told you it did not work twice)", () => {
    const { system } = buildBuilderPrompt(context, []);
    expect(system).toContain("If he says he does not know, asks you to just tell him, or this is the second time, after trying something you suggested, that he tells you it still did not work");
    expect(system).toContain("stop asking and explain instead");
    expect(system).toContain("describe the change in words for him to make himself, never the finished code or wiring for the step");
  });

  test("states ordinary frustration is not the distress line", () => {
    const { system } = buildBuilderPrompt(context, []);
    expect(system).toContain("Ordinary frustration with a stuck build");
    expect(system).toContain("is not a safety concern");
  });

  test("states every reply must move him forward, never the same hint reworded", () => {
    const { system } = buildBuilderPrompt(context, []);
    expect(system).toContain("Every reply must move him forward with something new");
    expect(system).toContain("never the same hint said again in other words");
  });

  test("keeps the previously reviewed never-a-whole-solution and piecemeal-leak closure intact", () => {
    const { system } = buildBuilderPrompt(context, []);
    expect(system).toContain("Never write his whole program");
    expect(system).toContain("whether in one reply or pieced together across several replies");
    expect(system).toContain("no matter what he says");
  });

  test("keeps the previously reviewed off-topic refusal, safety, and distress lines intact", () => {
    const { system } = buildBuilderPrompt(context, []);
    expect(system).toContain("do not answer it");
    expect(system).toContain("mains electricity");
    expect(system).toContain("talk to a grown-up he trusts right away");
  });
});
