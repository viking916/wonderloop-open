import { describe, expect, it } from "vitest";
import type { Step } from "../content/schema";
import { emptyQuestProgress, type QuestProgress } from "./completion";
import {
  clockOfferOpen,
  clockRunning,
  clockSeconds,
  declineClock,
  finishClock,
  finishedClocks,
  formatClock,
  isTimedStep,
  minutesToFinish,
  setComplete,
  startClock,
} from "./clock";

const problem = (id: string) =>
  ({
    id,
    kind: "number",
    lane: "check",
    prompt: "p",
    answer: { kind: "number", value: "1" },
    explanation: ["a", "b"],
    ideaId: "guess-and-round",
    useAgain: "when",
    hints: ["h1", "h2"],
    skills: ["think.number-sense"],
    thinkMinutes: 4,
    difficulty: 2,
    variant: { prompt: "v", answer: { kind: "number", value: "1" } },
  }) as unknown as Extract<Step, { kind: "problem-set" }>["problems"][number];

const timed = { kind: "problem-set", id: "s1-w04-think-03", title: "Summit", lane: "check", timed: true, problems: [problem("a"), problem("b")] } as unknown as Step;
const plain = { ...(timed as object), id: "s1-w04-think-09", timed: undefined } as unknown as Step;

describe("timed steps and the offer", () => {
  it("only a problem-set marked timed is timed", () => {
    expect(isTimedStep(timed)).toBe(true);
    expect(isTimedStep(plain)).toBe(false);
    expect(isTimedStep({ kind: "log", id: "x", variant: "maker" } as Step)).toBe(false);
  });

  it("the offer shows on an untouched timed set and nowhere else", () => {
    const p = emptyQuestProgress();
    expect(clockOfferOpen(timed, p)).toBe(true);
    expect(clockOfferOpen(plain, p)).toBe(false);
    expect(clockOfferOpen(timed, startClock(p, "s1-w04-think-03", 1000))).toBe(false);
    expect(clockOfferOpen(timed, declineClock(p, "s1-w04-think-03"))).toBe(false);
    const halfDone: QuestProgress = { ...p, problemOutcomes: { a: "correct" } };
    expect(clockOfferOpen(timed, halfDone)).toBe(false);
  });
});

describe("running and finishing", () => {
  it("starts once, runs, and stops when told", () => {
    let p = startClock(emptyQuestProgress(), "s", 10_000);
    expect(clockRunning(p.clocks!.s)).toBe(true);
    expect(startClock(p, "s", 99_000).clocks!.s.startedAt).toBe(10_000);
    expect(clockSeconds(p.clocks!.s, 73_500)).toBe(63);
    p = finishClock(p, "s", 10_000 + 14 * 60_000 + 20_000);
    expect(clockRunning(p.clocks!.s)).toBe(false);
    expect(minutesToFinish(p.clocks!.s)).toBe(14);
    expect(finishClock(p, "s", 999_999_999).clocks!.s.finishedAt).toBe(p.clocks!.s.finishedAt);
  });

  it("a declined clock never starts or finishes", () => {
    const p = declineClock(emptyQuestProgress(), "s");
    expect(startClock(p, "s", 5).clocks!.s.declined).toBe(true);
    expect(finishClock(p, "s", 5).clocks!.s.finishedAt).toBeUndefined();
    expect(minutesToFinish(p.clocks!.s)).toBeUndefined();
  });

  it("minutes to finish rounds to whole minutes and never below one", () => {
    expect(minutesToFinish({ startedAt: 0, finishedAt: 20_000 })).toBe(1);
    expect(minutesToFinish({ startedAt: 0, finishedAt: 89_000 })).toBe(1);
    expect(minutesToFinish({ startedAt: 0, finishedAt: 91_000 })).toBe(2);
    expect(minutesToFinish({ startedAt: 0 })).toBeUndefined();
  });

  it("a clock cannot finish before it started, even with a skewed clock", () => {
    const p = finishClock(startClock(emptyQuestProgress(), "s", 50_000), "s", 40_000);
    expect(p.clocks!.s.finishedAt).toBe(50_000);
  });
});

describe("setComplete", () => {
  it("is true once every problem has any outcome", () => {
    const step = timed as Extract<Step, { kind: "problem-set" }>;
    const p = emptyQuestProgress();
    expect(setComplete(step, p)).toBe(false);
    expect(setComplete(step, { ...p, problemOutcomes: { a: "correct" } })).toBe(false);
    expect(setComplete(step, { ...p, problemOutcomes: { a: "correct", b: "revealed" } })).toBe(true);
  });
});

describe("formatClock and finishedClocks", () => {
  it("formats minutes and seconds", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3600)).toBe("60:00");
  });

  it("lists only finished clocks on timed steps, in step order", () => {
    const quest = { steps: [plain, timed] };
    let p = startClock(emptyQuestProgress(), "s1-w04-think-03", 0);
    expect(finishedClocks(quest, p)).toEqual([]);
    p = finishClock(p, "s1-w04-think-03", 12 * 60_000);
    expect(finishedClocks(quest, p)).toEqual([{ stepId: "s1-w04-think-03", title: "Summit", minutes: 12 }]);
  });
});
