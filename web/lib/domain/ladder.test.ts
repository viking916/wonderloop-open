import { describe, expect, it } from "vitest";
import type { LadderProblem, LadderTopic, LadderTopicMeta } from "../content/schema";
import type { LadderSessionRecord } from "./ladder";
import {
  applyProbe, applyRetrievalResult, asVariant, bandFor, emptyTopicState, fluencyPassed, guessingRun, ladderWeek, masteryBarMet, nextTopic,
  pickFluencyProblems, pickProbeProblems, pickRetrievalProblems, pickStretch, pickTopicProblems, placementCandidates, recordTopicResult,
  retrievalDue, retrievalEntriesFor, roundPlan, shuffle, stageSummary, RETRIEVAL_CAP, SESSIONS_PER_WEEK, WEEK_SESSION_ROUNDS,
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
  it("gives the first round a longer retrieval and keeps every round at 25 minutes", () => {
    const first = roundPlan(0), later = roundPlan(2);
    expect(first.retrievalMinutes).toBe(12);
    expect(later.retrievalMinutes).toBe(6);
    for (const r of [first, later]) expect(r.retrievalMinutes + r.topicMinutes + r.stretchMinutes).toBe(25);
  });
});

describe("ladderWeek", () => {
  const rec = (over: Partial<LadderSessionRecord> & { number: number; rounds: number }): LadderSessionRecord => over;

  it("plans a fresh week from nothing started: three sessions, none begun", () => {
    const week = ladderWeek([]);
    expect(week.weekNumber).toBe(1);
    expect(week.weekComplete).toBe(false);
    expect(week.entries.map((e) => e.rounds)).toEqual([...WEEK_SESSION_ROUNDS]);
    expect(week.entries.every((e) => e.status === "todo" && e.roundsDone === 0)).toBe(true);
    expect(week.next).toEqual({ indexInWeek: 0, rounds: WEEK_SESSION_ROUNDS[0], roundsDone: 0 });
  });

  it("carries a part-done session as open, and offers it as next rather than a later todo", () => {
    const week = ladderWeek([rec({ number: 1, rounds: 4, roundsDone: 2, weekNumber: 1, indexInWeek: 0 })]);
    expect(week.entries[0]).toEqual({ indexInWeek: 0, rounds: 4, roundsDone: 2, status: "open" });
    expect(week.entries[1].status).toBe("todo");
    expect(week.entries[2].status).toBe("todo");
    expect(week.next).toEqual({ indexInWeek: 0, rounds: 4, roundsDone: 2 });
    expect(week.weekComplete).toBe(false);
  });

  it("never skips an unfinished session for a later one, even a later one that somehow also has a record", () => {
    const week = ladderWeek([
      rec({ number: 1, rounds: 2, roundsDone: 2, weekNumber: 1, indexInWeek: 0, endedAt: 1 }),
      rec({ number: 2, rounds: 4, roundsDone: 1, weekNumber: 1, indexInWeek: 1 }),
      rec({ number: 3, rounds: 4, roundsDone: 4, weekNumber: 1, indexInWeek: 2, endedAt: 2 }),
    ]);
    expect(week.entries[0].status).toBe("done");
    expect(week.entries[1].status).toBe("open");
    expect(week.entries[2].status).toBe("done");
    expect(week.next).toEqual({ indexInWeek: 1, rounds: 4, roundsDone: 1 });
  });

  it("is complete only once all three sessions are done, and offers no next session", () => {
    const week = ladderWeek([
      rec({ number: 1, rounds: 2, roundsDone: 2, weekNumber: 1, indexInWeek: 0, endedAt: 1 }),
      rec({ number: 2, rounds: 4, roundsDone: 4, weekNumber: 1, indexInWeek: 1, endedAt: 2 }),
      rec({ number: 3, rounds: 4, roundsDone: 4, weekNumber: 1, indexInWeek: 2, endedAt: 3 }),
    ]);
    expect(week.weekComplete).toBe(true);
    expect(week.next).toBeUndefined();
    expect(week.entries.every((e) => e.status === "done")).toBe(true);
  });

  it("reads a legacy document with no roundsDone: an endedAt means complete, its absence means untouched", () => {
    const week = ladderWeek([
      rec({ number: 1, rounds: 2, endedAt: 100 }),
      rec({ number: 2, rounds: 4, endedAt: 200 }),
      rec({ number: 3, rounds: 4 }),
    ]);
    expect(week.entries[0]).toEqual({ indexInWeek: 0, rounds: 2, roundsDone: 2, status: "done" });
    expect(week.entries[1]).toEqual({ indexInWeek: 1, rounds: 4, roundsDone: 4, status: "done" });
    expect(week.entries[2]).toEqual({ indexInWeek: 2, rounds: 4, roundsDone: 0, status: "open" });
    expect(week.next).toEqual({ indexInWeek: 2, rounds: 4, roundsDone: 0 });
    expect(week.weekComplete).toBe(false);
  });

  it("starts a new week's plan empty and ready once a later week's own records exist", () => {
    const week = ladderWeek([
      rec({ number: 1, rounds: 2, roundsDone: 2, weekNumber: 1, indexInWeek: 0, endedAt: 1 }),
      rec({ number: 2, rounds: 4, roundsDone: 4, weekNumber: 1, indexInWeek: 1, endedAt: 2 }),
      rec({ number: 3, rounds: 4, roundsDone: 4, weekNumber: 1, indexInWeek: 2, endedAt: 3 }),
      rec({ number: 4, rounds: 2, roundsDone: 0, weekNumber: 2, indexInWeek: 0 }),
    ]);
    expect(week.weekNumber).toBe(2);
    expect(week.weekComplete).toBe(false);
    expect(week.entries[1].status).toBe("todo");
    expect(week.entries[2].status).toBe("todo");
    expect(week.next).toEqual({ indexInWeek: 0, rounds: 2, roundsDone: 0 });
  });

  it("SESSIONS_PER_WEEK matches the number of rounds shapes authored", () => {
    expect(SESSIONS_PER_WEEK).toBe(3);
    expect(WEEK_SESSION_ROUNDS).toHaveLength(SESSIONS_PER_WEEK);
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

describe("stage summary", () => {
  const graph = [meta("ar-a", 1), meta("ar-b", 1, ["ar-a"]), meta("pa-c", 2, ["ar-b"]), meta("al-d", 3, ["pa-c"])];

  it("is mastered when every topic in the stage is mastered, even ahead of the current topic", () => {
    const states = {
      "ar-a": { ...emptyTopicState(), state: "mastered" as const },
      "ar-b": { ...emptyTopicState(), state: "mastered" as const },
    };
    const [stage1, stage2, stage3] = stageSummary(graph, states, "pa-c");
    expect(stage1).toEqual({ stage: 1, title: "Arithmetic", total: 2, mastered: 2, status: "mastered" });
    expect(stage2.status).toBe("current");
    expect(stage3.status).toBe("ahead");
  });

  it("marks the current topic's stage current, and every other unmastered stage ahead", () => {
    const states = { "ar-a": { ...emptyTopicState(), state: "current" as const } };
    const summary = stageSummary(graph, states, "ar-a");
    expect(summary.find((s) => s.stage === 1)?.status).toBe("current");
    expect(summary.find((s) => s.stage === 2)?.status).toBe("ahead");
    expect(summary.find((s) => s.stage === 3)?.status).toBe("ahead");
  });

  it("before placement is done, marks the stage of any placed or current topic current", () => {
    const placed = stageSummary(graph, { "pa-c": { ...emptyTopicState(), state: "placed" as const } });
    expect(placed.find((s) => s.stage === 2)?.status).toBe("current");
    expect(placed.find((s) => s.stage === 1)?.status).toBe("ahead");

    const current = stageSummary(graph, { "al-d": { ...emptyTopicState(), state: "current" as const } });
    expect(current.find((s) => s.stage === 3)?.status).toBe("current");
  });

  it("falls back to the first stage when nothing at all is placed", () => {
    const summary = stageSummary(graph, {});
    expect(summary[0]).toEqual({ stage: 1, title: "Arithmetic", total: 2, mastered: 0, status: "current" });
    expect(summary.slice(1).every((s) => s.status === "ahead")).toBe(true);
  });

  it("counts mastered totals per stage and names each stage from the shared titles", () => {
    const states = { "ar-a": { ...emptyTopicState(), state: "mastered" as const } };
    const summary = stageSummary(graph, states, "ar-b");
    expect(summary.find((s) => s.stage === 1)).toMatchObject({ mastered: 1, total: 2, title: "Arithmetic" });
    expect(summary.find((s) => s.stage === 4)).toBeUndefined();
  });
});
