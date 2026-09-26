import { describe, expect, test } from "vitest";
import {
  builderAskAvailable,
  builderAskStepBrief,
  builderChatId,
  isBuilderAskStep,
  MAX_BUILDER_STEP_MESSAGES,
  type BuilderAskQuestInfo,
} from "./builderAsk";
import type { Step } from "../content/schema";

describe("builderAskAvailable", () => {
  test("excludes season 1 weeks 1 to 4 on Build", () => {
    for (let week = 1; week <= 4; week++) {
      const quest: BuilderAskQuestInfo = { track: "build", season: 1, week };
      expect(builderAskAvailable(quest)).toBe(false);
    }
  });

  test("includes season 1 weeks 5 to 12 on Build", () => {
    for (let week = 5; week <= 12; week++) {
      const quest: BuilderAskQuestInfo = { track: "build", season: 1, week };
      expect(builderAskAvailable(quest)).toBe(true);
    }
  });

  test("includes every season 2, 3 and 4 week on Build and Make, even week 1", () => {
    for (const season of [2, 3, 4]) {
      for (const track of ["build", "make"] as const) {
        expect(builderAskAvailable({ track, season, week: 1 })).toBe(true);
        expect(builderAskAvailable({ track, season, week: 12 })).toBe(true);
      }
    }
  });

  test("excludes Think, Speak and Play regardless of season or week", () => {
    for (const track of ["think", "speak", "play"] as const) {
      expect(builderAskAvailable({ track, season: 2, week: 6 })).toBe(false);
      expect(builderAskAvailable({ track, season: 1, week: 12 })).toBe(false);
    }
  });

  test("Make on season 1 week 5 is included too (Make does not exist before season 2 in practice, but the rule itself does not special-case it)", () => {
    expect(builderAskAvailable({ track: "make", season: 1, week: 5 })).toBe(true);
  });
});

function stepOf(kind: Step["kind"]): Step {
  const base = { id: "s2-w06-build-05" as const };
  switch (kind) {
    case "instruction":
      return { kind: "instruction", ...base, title: "t", body: "b" };
    case "science":
      return { kind: "science", ...base, title: "t", body: "b" };
    case "task":
      return { kind: "task", ...base, title: "t", body: "b", checklist: ["a", "b", "c"] };
    case "data":
      return { kind: "data", ...base, title: "t", body: "b", columns: ["run", "value"], minRows: 3, question: "q" };
    case "typing":
      return { kind: "typing", ...base, minutes: 5, body: "b" };
    case "artifact":
      return { kind: "artifact", ...base, title: "t", prompt: "p", accepts: ["photo"] };
    case "log":
      return { kind: "log", ...base, variant: "maker" };
    default:
      throw new Error(`stepOf: unhandled kind ${kind} in this test helper`);
  }
}

describe("isBuilderAskStep / builderAskStepBrief", () => {
  test("briefs instruction, science and data steps with title and body, no checklist", () => {
    for (const kind of ["instruction", "science", "data"] as const) {
      const step = stepOf(kind);
      expect(isBuilderAskStep(step)).toBe(true);
      expect(builderAskStepBrief(step)).toEqual({ title: "t", body: "b", checklist: undefined });
    }
  });

  test("briefs a task step with its checklist too", () => {
    const step = stepOf("task");
    expect(isBuilderAskStep(step)).toBe(true);
    expect(builderAskStepBrief(step)).toEqual({ title: "t", body: "b", checklist: ["a", "b", "c"] });
  });

  test("gives no brief for typing, artifact or log steps", () => {
    for (const kind of ["typing", "artifact", "log"] as const) {
      const step = stepOf(kind);
      expect(isBuilderAskStep(step)).toBe(false);
      expect(builderAskStepBrief(step)).toBeUndefined();
    }
  });
});

describe("builderChatId", () => {
  test("carries a __step__ marker distinct from a problem chat id's plain __ join", () => {
    expect(builderChatId("s1-w05-build", "s1-w05-build-11")).toBe("s1-w05-build__step__s1-w05-build-11");
  });

  test("two different steps of the same quest get two different ids", () => {
    const a = builderChatId("s1-w05-build", "s1-w05-build-11");
    const b = builderChatId("s1-w05-build", "s1-w05-build-12");
    expect(a).not.toBe(b);
  });
});

test("MAX_BUILDER_STEP_MESSAGES is a positive integer, raised from the owner's original 10 to 25 on 25 September 2026", () => {
  expect(MAX_BUILDER_STEP_MESSAGES).toBe(25);
  expect(Number.isInteger(MAX_BUILDER_STEP_MESSAGES)).toBe(true);
});
