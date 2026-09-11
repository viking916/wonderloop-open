import { describe, expect, test } from "vitest";
import { ideaEventsFromProgress, metIdeas } from "./ideas";

const T0 = 1_700_000_000_000;

describe("metIdeas", () => {
  test("no events: nothing met", () => {
    expect(metIdeas([])).toEqual([]);
  });

  test("one event: the idea is met, with that one problem", () => {
    const result = metIdeas([{ ideaId: "guess-and-round", problemId: "p1", at: T0 }]);
    expect(result).toEqual([{ ideaId: "guess-and-round", problemIds: ["p1"], firstAt: T0 }]);
  });

  test("the same problem attempted twice contributes one problemIds entry, not two", () => {
    const result = metIdeas([
      { ideaId: "guess-and-round", problemId: "p1", at: T0 },
      { ideaId: "guess-and-round", problemId: "p1", at: T0 + 1000 }, // a retry try
    ]);
    expect(result).toEqual([{ ideaId: "guess-and-round", problemIds: ["p1"], firstAt: T0 }]);
  });

  test("distinct problems for the same idea are kept in first-attempted order", () => {
    const result = metIdeas([
      { ideaId: "guess-and-round", problemId: "p2", at: T0 + 2000 },
      { ideaId: "guess-and-round", problemId: "p1", at: T0 },
    ]);
    expect(result[0]!.problemIds).toEqual(["p1", "p2"]);
  });

  test("ideas are ordered by first meeting, earliest first", () => {
    const result = metIdeas([
      { ideaId: "second-idea", problemId: "p2", at: T0 + 5000 },
      { ideaId: "first-idea", problemId: "p1", at: T0 },
    ]);
    expect(result.map((m) => m.ideaId)).toEqual(["first-idea", "second-idea"]);
  });

  test("an idea never attempted is not returned", () => {
    const result = metIdeas([{ ideaId: "guess-and-round", problemId: "p1", at: T0 }]);
    expect(result.find((m) => m.ideaId === "same-slice")).toBeUndefined();
  });

  test("a wrong-answer attempt still meets the idea (attempts.ideaIds is written regardless of correctness)", () => {
    // metIdeas takes whatever events the caller supplies; it has no notion of correctness at
    // all, which is itself the point -- the caller passes every attempt's ideaIds, not only
    // the correct ones.
    const result = metIdeas([{ ideaId: "guess-and-round", problemId: "p1", at: T0 }]);
    expect(result).toHaveLength(1);
  });
});

describe("ideaEventsFromProgress", () => {
  const quests = [
    {
      id: "s1-w01-build",
      steps: [
        { id: "s1-w01-build-01", kind: "instruction" },
        { id: "s1-w01-build-02", kind: "science", ideaId: "current-is-a-flow" },
      ],
      extras: [{ id: "s1-w01-build-x04", ideaId: "volts-push-current" }],
    },
  ];
  test("a ticked science step and a ticked extra meet their ideas; an unticked one does not", () => {
    const events = ideaEventsFromProgress(quests, [
      { questId: "s1-w01-build", progress: { startedAt: 5, quest: { ticks: [{ stepId: "s1-w01-build-02", done: true }, { stepId: "s1-w01-build-x04", done: false }] } } },
    ]);
    expect(events).toEqual([{ ideaId: "current-is-a-flow", problemId: "s1-w01-build-02", at: 5 }]);
    expect(metIdeas(events).map((m) => m.ideaId)).toEqual(["current-is-a-flow"]);
  });
  test("a step without an idea, or a quest not in content, adds nothing", () => {
    expect(ideaEventsFromProgress(quests, [{ questId: "s1-w01-build", progress: { quest: { ticks: [{ stepId: "s1-w01-build-01", done: true }] } } }])).toEqual([]);
    expect(ideaEventsFromProgress(quests, [{ questId: "nope", progress: { quest: { ticks: [{ stepId: "x", done: true }] } } }])).toEqual([]);
  });
});
