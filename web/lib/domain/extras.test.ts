import { describe, expect, test } from "vitest";
import { emptyQuestProgress, isStepComplete } from "./completion";
import { extraDone, extrasSummary, withExtraTick } from "./extras";
import type { Quest } from "../content/schema";

const quest = {
  extras: [
    { id: "s1-w01-build-x01", kind: "bonus", title: "Second button", minutes: 15, body: "1. Do a thing." },
    { id: "s1-w01-build-x02", kind: "invent", title: "Your badge", minutes: 30, body: "A brief." },
  ],
} as unknown as Pick<Quest, "extras">;

describe("extras", () => {
  test("a ticked extra counts in the summary and can be unticked", () => {
    let p = emptyQuestProgress();
    expect(extrasSummary(quest, p)).toEqual({ done: 0, total: 2 });
    p = withExtraTick(p, "s1-w01-build-x01", true);
    expect(extraDone(p, "s1-w01-build-x01")).toBe(true);
    expect(extrasSummary(quest, p)).toEqual({ done: 1, total: 2 });
    p = withExtraTick(p, "s1-w01-build-x01", false);
    expect(extrasSummary(quest, p)).toEqual({ done: 0, total: 2 });
  });

  test("an extra's tick never completes a step that shares nothing with it", () => {
    const p = withExtraTick(emptyQuestProgress(), "s1-w01-build-x01", true);
    const step = { kind: "instruction", id: "s1-w01-build-01", title: "t", body: "b" } as unknown as Quest["steps"][number];
    expect(isStepComplete(step, p)).toBe(false);
  });
});
