import { describe, expect, it } from "vitest";
import type { LadderProblem, LadderTopic, LadderTopicMeta } from "../content/schema";
import {
  applyProbe, applyRetrievalResult, asVariant, bandFor, emptyTopicState, fluencyPassed, guessingRun, masteryBarMet, nextTopic,
  pickFluencyProblems, pickProbeProblems, pickRetrievalProblems, pickStretch, pickTopicProblems, placementCandidates, recordTopicResult,
  retrievalDue, retrievalEntriesFor, roundPlan, roundsForDay, shuffle, RETRIEVAL_CAP,
} from "./ladder";

const meta = (id: string, stage: number, needs: string[] = [], skills = ["think.number-sense"]): LadderTopicMeta => ({
  id, stage, title: id, needs, skills, fluencySeconds: 120, thread: "spine", summary: "can",
});

function problem(id: string, difficulty: 1 | 2 | 3, skills = ["think.number-sense"]): LadderProblem {
  return {
    id, kind: "number", lane: "skills", prompt: `What is ${id}?`, answer: { kind: "number", value: "1" },
    explanation: ["one", "two"], ideaId: "ar-x", useAgain: "when it comes back", hints: ["a", "b"], socraticHint: "Why?",
    skills, thinkMinutes: 2, difficulty, variant: { prompt: `variant ${id}`, answer: { kind: "number", value: "2" } },
  } as LadderProblem;
}

function topic(id: string, n = 15): LadderTopic {
  const bank: LadderProblem[] = [];
  for (const d of [1, 2, 3] as const) for (let i = 0; i < n; i++) bank.push(problem(`ladder-${id}-p${String(bank.length + 1).padStart(2, "0")}`, d));
  const stretch = [1, 2, 3].map((i) => problem(`ladder-${id}-p${String(bank.length + i).padStart(2, "0")}`, 3));
  return { id, idea: { body: "idea" }, workedExample: { prompt: "p", steps: ["a", "b", "c"] }, bank, stretch };
}

describe("the week", () => {
  it("offers two rounds on Friday, four at the weekend, one on a weekday", () => {
    expect(roundsForDay(5)).toBe(2);
    expect(roundsForDay(6)).toBe(4);
    expect(roundsForDay(0)).toBe(4);
    expect(roundsForDay(2)).toBe(1);
  });
  it("gives the first round a longer retrieval and keeps every round at 25 minutes", () => {
    const first = roundPlan(0), later = roundPlan(2);
    expect(first.retrievalMinutes).toBe(12);
    expect(later.retrievalMinutes).toBe(6);
    for (const r of [first, later]) expect(r.retrievalMinutes + r.topicMinutes + r.stretchMinutes).toBe(25);
  });
});

describe("the sequence", () => {
  const graph = [meta("ar-a", 1), meta("ar-b", 1, ["ar-a"]), meta("pa-c", 2, ["ar-b"])];
  it("walks the graph in stage order, only into topics whose needs are mastered", () => {
    expect(nextTopic(graph, {})?.id).toBe("ar-a");
    const states = { "ar-a": { ...emptyTopicState(), state: "mastered" as const } };
    expect(nextTopic(graph, states)?.id).toBe("ar-b");
    expect(nextTopic(graph, states, "ar-b")?.id).toBe("ar-b");
  });
  it("keeps the current topic until it is mastered", () => {
    const states = { "ar-a": { ...emptyTopicState(), state: "current" as const } };
    expect(nextTopic(graph, states, "ar-a")?.id).toBe("ar-a");
  });
  it("returns undefined when everything is mastered", () => {
    const states = Object.fromEntries(graph.map((t) => [t.id, { ...emptyTopicState(), state: "mastered" as const }]));
    expect(nextTopic(graph, states)).toBeUndefined();
  });
  it("placement probes roots first and stops once a topic is current", () => {
    expect(placementCandidates(graph, {}).map((t) => t.id)).toEqual(["ar-a"]);
    const mastered = { "ar-a": applyProbe(emptyTopicState(), 4, 1) };
    expect(mastered["ar-a"].state).toBe("mastered");
    expect(placementCandidates(graph, mastered).map((t) => t.id)).toEqual(["ar-b"]);
    const current = { ...mastered, "ar-b": applyProbe(emptyTopicState(), 2, 1) };
    expect(current["ar-b"].state).toBe("current");
    expect(placementCandidates(graph, current)).toEqual([]);
  });
});

describe("mastery", () => {
  const hit = (session: number, confidence: "sure" | "probably" | "guessing" = "sure", correct = true) =>
    ({ correct, confidence, session, problemId: `p${session}` });
  it("needs eight of ten, none guessing, over two sessions", () => {
    let s = emptyTopicState();
    for (let i = 0; i < 10; i++) s = recordTopicResult(s, hit(1));
    expect(masteryBarMet(s)).toBe(false);
    s = emptyTopicState();
    for (let i = 0; i < 5; i++) s = recordTopicResult(s, hit(1));
    for (let i = 0; i < 5; i++) s = recordTopicResult(s, hit(2));
    expect(masteryBarMet(s)).toBe(true);
    s = recordTopicResult(s, hit(2, "guessing"));
    expect(masteryBarMet(s)).toBe(false);
    s = emptyTopicState();
    for (let i = 0; i < 5; i++) s = recordTopicResult(s, hit(1, "sure", i < 3));
    for (let i = 0; i < 5; i++) s = recordTopicResult(s, hit(2, "sure", i < 4));
    expect(masteryBarMet(s)).toBe(false);
  });
  it("stops a round on three guesses in a row, right or wrong", () => {
    let s = emptyTopicState();
    s = recordTopicResult(s, hit(1, "guessing"));
    s = recordTopicResult(s, hit(1, "guessing", false));
    expect(guessingRun(s)).toBe(false);
    s = recordTopicResult(s, hit(1, "guessing"));
    expect(guessingRun(s)).toBe(true);
  });
  it("passes fluency at eight right within the time", () => {
    expect(fluencyPassed(8, 100, 120)).toBe(true);
    expect(fluencyPassed(7, 100, 120)).toBe(false);
    expect(fluencyPassed(10, 130, 120)).toBe(false);
  });
  it("climbs a band on three right and drops on two misses", () => {
    let s = emptyTopicState();
    expect(bandFor(s)).toBe(1);
    for (let i = 0; i < 3; i++) s = recordTopicResult(s, hit(1));
    expect(bandFor(s)).toBe(2);
    for (let i = 0; i < 3; i++) s = recordTopicResult(s, hit(1));
    expect(bandFor(s)).toBe(3);
    s = recordTopicResult(s, hit(1, "sure", false));
    s = recordTopicResult(s, hit(1, "sure", false));
    expect(bandFor(s)).toBe(2);
  });
});

describe("retrieval", () => {
  it("enters at the first interval and doubles on hits up to the cap, halves on a miss", () => {
    const [e] = retrievalEntriesFor(meta("ar-a", 1), 5, []);
    expect(e.dueSession).toBe(7);
    let x = applyRetrievalResult(e, true, 7);
    expect(x.interval).toBe(4);
    expect(x.dueSession).toBe(11);
    for (let i = 0; i < 6; i++) x = applyRetrievalResult(x, true, x.dueSession);
    expect(x.interval).toBe(RETRIEVAL_CAP);
    const missed = applyRetrievalResult(x, false, x.dueSession);
    expect(missed.interval).toBe(15);
    expect(missed.lapses).toBe(1);
  });
  it("does not duplicate an entry for a skill already tracked", () => {
    const existing = retrievalEntriesFor(meta("ar-a", 1), 1, []);
    expect(retrievalEntriesFor(meta("ar-b", 1), 2, existing)).toEqual([]);
  });
  it("lists what is due, most overdue first", () => {
    const a = { skillId: "a", topicId: "ar-a", interval: 2, dueSession: 3, lapses: 0 };
    const b = { skillId: "b", topicId: "ar-a", interval: 2, dueSession: 2, lapses: 0 };
    const c = { skillId: "c", topicId: "ar-a", interval: 2, dueSession: 9, lapses: 0 };
    expect(retrievalDue([a, b, c], 4).map((e) => e.skillId)).toEqual(["b", "a"]);
  });
  it("serves one problem per due skill from its topic", () => {
    const t = topic("ar-a");
    const due = [{ skillId: "think.number-sense", topicId: "ar-a", interval: 2, dueSession: 1, lapses: 0 }];
    const out = pickRetrievalProblems(due, { "ar-a": t }, 6, 3);
    expect(out).toHaveLength(1);
    expect(out[0].problem.difficulty).toBeLessThanOrEqual(2);
  });
});

describe("picking problems", () => {
  const t = topic("ar-a");
  it("serves unseen problems from the band first and never repeats one while unseen remain", () => {
    const s = { ...emptyTopicState(), served: t.bank.filter((p) => p.difficulty === 1).slice(0, 14).map((p) => p.id) };
    const picked = pickTopicProblems(t, s, 3, 7);
    expect(picked[0].difficulty).toBe(1);
    expect(s.served).not.toContain(picked[0].id);
    expect(new Set(picked.map((p) => p.id)).size).toBe(3);
  });
  it("is deterministic for a seed", () => {
    expect(pickTopicProblems(t, emptyTopicState(), 5, 11).map((p) => p.id)).toEqual(pickTopicProblems(t, emptyTopicState(), 5, 11).map((p) => p.id));
    expect(shuffle([1, 2, 3, 4, 5], 9)).toEqual(shuffle([1, 2, 3, 4, 5], 9));
  });
  it("probes across the bands and fluency stays in the easy bands", () => {
    const probe = pickProbeProblems(t, 1);
    expect(probe.map((p) => p.difficulty).sort()).toEqual([1, 2, 2, 3]);
    const fluency = pickFluencyProblems(t, 4);
    expect(fluency).toHaveLength(10);
    expect(fluency.every((p) => p.difficulty <= 2)).toBe(true);
  });
  it("stretch prefers an unseen problem", () => {
    const first = pickStretch(t, [], 1)!;
    const second = pickStretch(t, [first.id], 1)!;
    expect(second.id).not.toBe(first.id);
    expect(pickStretch(t, t.stretch.map((p) => p.id), 2)).toBeDefined();
  });
  it("swaps in the variant on odd seeds only", () => {
    const p = t.bank[0];
    expect(asVariant(p, 2).prompt).toBe(p.prompt);
    expect(asVariant(p, 3).prompt).toBe(p.variant!.prompt);
    expect(asVariant(p, 3).answer).toEqual(p.variant!.answer);
  });
});
