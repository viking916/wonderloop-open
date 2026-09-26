import { describe, expect, it } from "vitest";
import { ladderHomeFacts, sessionDoneMessage } from "./ladderCopy";

describe("sessionDoneMessage", () => {
  it("says how many rounds the session held and its place in the week", () => {
    expect(sessionDoneMessage({ reason: "session", roundsToday: 4, indexInWeek: 1, weekComplete: false })).toBe(
      "Session 2 of 3 done: 4 rounds. Everything you did is saved."
    );
  });

  it("singularises a single round", () => {
    expect(sessionDoneMessage({ reason: "session", roundsToday: 1, indexInWeek: 0, weekComplete: false })).toBe(
      "Session 1 of 3 done: 1 round. Everything you did is saved."
    );
  });

  it("names the next topic when a session ends mid-week and one is known", () => {
    expect(
      sessionDoneMessage({ reason: "session", roundsToday: 2, indexInWeek: 0, weekComplete: false, nextTopicTitle: "Fractions of a set" })
    ).toBe("Session 1 of 3 done: 2 rounds. Everything you did is saved. Next time: Fractions of a set.");
  });

  it("says the week is complete instead of naming a next topic, when this was the third session", () => {
    expect(
      sessionDoneMessage({ reason: "session", roundsToday: 4, indexInWeek: 2, weekComplete: true, nextTopicTitle: "Fractions of a set" })
    ).toBe("Session 3 of 3 done: 4 rounds. Everything you did is saved. This Ladder week is complete.");
  });

  it("names the placed topic when placement finishes", () => {
    expect(
      sessionDoneMessage({ reason: "placement", roundsToday: 0, indexInWeek: 0, weekComplete: false, nextTopicTitle: "Adding within 20" })
    ).toBe("Placement done. The Ladder starts at Adding within 20. The next session begins the real rounds.");
  });

  it("falls back to a plain place when placement finds no topic", () => {
    expect(sessionDoneMessage({ reason: "placement", roundsToday: 0, indexInWeek: 0, weekComplete: false })).toBe(
      "Placement done. The Ladder starts at the top. The next session begins the real rounds."
    );
  });

  it("names stopping early plainly", () => {
    expect(sessionDoneMessage({ reason: "stopped", roundsToday: 4, indexInWeek: 1, weekComplete: false })).toBe(
      "Stopped for today. Everything you did is saved."
    );
  });

  it("keeps the fluency note and adds the save reassurance", () => {
    expect(
      sessionDoneMessage({
        reason: "fluency",
        roundsToday: 4,
        indexInWeek: 1,
        weekComplete: false,
        note: "Fractions of a set: mastered, 9 of 10 in 84 seconds. Next: Ratios.",
      })
    ).toBe("Fractions of a set: mastered, 9 of 10 in 84 seconds. Next: Ratios. Everything you did is saved.");
  });

  it("still says something when a fluency reason carries no note", () => {
    expect(sessionDoneMessage({ reason: "fluency", roundsToday: 4, indexInWeek: 1, weekComplete: false })).toBe(
      "Everything you did is saved."
    );
  });

  it("names the week's completion when a fluency round happens to end the third session", () => {
    expect(
      sessionDoneMessage({
        reason: "fluency",
        roundsToday: 4,
        indexInWeek: 2,
        weekComplete: true,
        note: "Ratios: mastered, 8 of 10 in 90 seconds.",
      })
    ).toBe("Ratios: mastered, 8 of 10 in 90 seconds. Everything you did is saved. This Ladder week is complete.");
  });
});

describe("ladderHomeFacts", () => {
  it("says only the week number when nothing is mastered and nothing is due", () => {
    expect(ladderHomeFacts(1, 0, 0)).toBe("Ladder week 1.");
  });

  it("adds a singular mastered count", () => {
    expect(ladderHomeFacts(2, 1, 0)).toBe("Ladder week 2. 1 topic mastered.");
  });

  it("adds a plural mastered count and a due count together", () => {
    expect(ladderHomeFacts(3, 4, 2)).toBe("Ladder week 3. 4 topics mastered. 2 skills due for retrieval.");
  });

  it("adds only the due count, singular, when nothing is mastered yet", () => {
    expect(ladderHomeFacts(1, 0, 1)).toBe("Ladder week 1. 1 skill due for retrieval.");
  });
});
