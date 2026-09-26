import { describe, expect, test } from "vitest";
import { getContent } from "../content/app-content";
import {
  buildCorrectFeedback,
  buildWrongFeedback,
  capReached,
  checkRound,
  countButtonValues,
  describeItem,
  speechDurationMs,
  starsForWeek,
  type SproutResponse,
} from "./sprout";
import type { SproutItem, SproutRound } from "../content/schema";

function item(id: string, extra: Partial<SproutItem> = {}): SproutItem {
  return { id, shape: "circle", ...extra };
}

function round(items: SproutItem[], correct: SproutRound["correct"]): SproutRound {
  return { id: "sprout-w01-a1-r1", prompt: "Tap the one that comes next.", items, correct };
}

describe("checkRound: pick", () => {
  const r = round(
    [item("i1", { color: "red" }), item("i2", { color: "blue" }), item("i3", { color: "red" }), item("i4", { color: "blue" }), item("i5", { color: "red" }), item("i6", { color: "blue" })],
    { kind: "pick", itemIds: ["i5"] },
  );

  test("the chosen id matches", () => {
    const response: SproutResponse = { kind: "pick", itemIds: ["i5"] };
    expect(checkRound(r, response)).toBe(true);
  });

  test("a different id is wrong", () => {
    const response: SproutResponse = { kind: "pick", itemIds: ["i6"] };
    expect(checkRound(r, response)).toBe(false);
  });

  test("multiple correct ids compare as a set, any order", () => {
    const multi = round([item("i1"), item("i2"), item("i3")], { kind: "pick", itemIds: ["i1", "i2"] });
    expect(checkRound(multi, { kind: "pick", itemIds: ["i2", "i1"] })).toBe(true);
  });

  test("a partial selection when more than one id is required is wrong", () => {
    const multi = round([item("i1"), item("i2"), item("i3")], { kind: "pick", itemIds: ["i1", "i2"] });
    expect(checkRound(multi, { kind: "pick", itemIds: ["i1"] })).toBe(false);
  });

  test("a response of the wrong kind is never correct", () => {
    expect(checkRound(r, { kind: "count", value: 1 })).toBe(false);
  });
});

describe("checkRound: order", () => {
  test("the exact ids in the authored order are correct", () => {
    const r = round(
      [item("i1", { color: "orange", sound: "clap" }), item("i2", { color: "orange", sound: "clap" }), item("i3", { color: "grey", sound: "pause" })],
      { kind: "order", itemIds: ["i1", "i2", "i3"] },
    );
    expect(checkRound(r, { kind: "order", itemIds: ["i1", "i2", "i3"] })).toBe(true);
  });

  test("the same ids in the wrong order are wrong", () => {
    const r = round(
      [item("i1", { color: "orange", sound: "clap" }), item("i2", { color: "orange", sound: "clap" }), item("i3", { color: "grey", sound: "pause" })],
      { kind: "order", itemIds: ["i1", "i2", "i3"] },
    );
    expect(checkRound(r, { kind: "order", itemIds: ["i3", "i2", "i1"] })).toBe(false);
  });

  test("identical-attribute cards are interchangeable (clap, clap, pause)", () => {
    // i1 and i2 are both orange claps, indistinguishable to a 3-year-old and to the checker:
    // tapping i2 then i1 (the authored order is i1, i2) still reproduces clap, clap, pause.
    const r = round(
      [item("i1", { color: "orange", sound: "clap" }), item("i2", { color: "orange", sound: "clap" }), item("i3", { color: "grey", sound: "pause" })],
      { kind: "order", itemIds: ["i1", "i2", "i3"] },
    );
    expect(checkRound(r, { kind: "order", itemIds: ["i2", "i1", "i3"] })).toBe(true);
  });

  test("a card with different attributes swapped in is wrong even if the id slot matches", () => {
    const r = round(
      [item("i1", { color: "orange", sound: "clap" }), item("i2", { color: "orange", sound: "clap" }), item("i3", { color: "grey", sound: "pause" })],
      { kind: "order", itemIds: ["i1", "i2", "i3"] },
    );
    // Swapping the pause card into the second slot changes the actual sequence heard.
    expect(checkRound(r, { kind: "order", itemIds: ["i1", "i3", "i2"] })).toBe(false);
  });

  test("a shorter response is wrong", () => {
    const r = round(
      [item("i1", { sound: "up" }), item("i2", { sound: "right" }), item("i3", { sound: "up" }), item("i4", { sound: "right" })],
      { kind: "order", itemIds: ["i1", "i2", "i3", "i4"] },
    );
    expect(checkRound(r, { kind: "order", itemIds: ["i1", "i2", "i3"] })).toBe(false);
  });
});

describe("checkRound: groups", () => {
  const r = round(
    [item("i1", { shape: "circle" }), item("i2", { shape: "coin" }), item("i3", { shape: "block" }), item("i4", { shape: "cup" })],
    { kind: "groups", groups: [["i1", "i2"], ["i3", "i4"]] },
  );

  test("the exact partition is correct", () => {
    expect(checkRound(r, { kind: "groups", groups: [["i1", "i2"], ["i3", "i4"]] })).toBe(true);
  });

  test("the same partition with the groups given in a different order is still correct", () => {
    expect(checkRound(r, { kind: "groups", groups: [["i3", "i4"], ["i1", "i2"]] })).toBe(true);
  });

  test("the same partition with ids reordered within each group is still correct", () => {
    expect(checkRound(r, { kind: "groups", groups: [["i4", "i3"], ["i2", "i1"]] })).toBe(true);
  });

  test("a wrong partition is wrong", () => {
    expect(checkRound(r, { kind: "groups", groups: [["i1", "i3"], ["i2", "i4"]] })).toBe(false);
  });

  test("a different number of groups is wrong", () => {
    expect(checkRound(r, { kind: "groups", groups: [["i1"], ["i2"], ["i3", "i4"]] })).toBe(false);
  });
});

describe("checkRound: count", () => {
  const r = round([item("i1", { shape: "coin", count: 3 })], { kind: "count", value: 3 });

  test("the matching number is correct", () => {
    expect(checkRound(r, { kind: "count", value: 3 })).toBe(true);
  });

  test("a different number is wrong", () => {
    expect(checkRound(r, { kind: "count", value: 2 })).toBe(false);
  });
});

describe("starsForWeek", () => {
  test("no activities done: 0 stars", () => {
    expect(starsForWeek([false, false, false])).toBe(0);
  });
  test("one activity done: 1 star", () => {
    expect(starsForWeek([true, false, false])).toBe(1);
  });
  test("two activities done: 2 stars", () => {
    expect(starsForWeek([true, false, true])).toBe(2);
  });
  test("all three done: 3 stars", () => {
    expect(starsForWeek([true, true, true])).toBe(3);
  });
});

describe("capReached", () => {
  test("under the cap", () => {
    expect(capReached(0)).toBe(false);
    expect(capReached(14)).toBe(false);
  });
  test("at the cap", () => {
    expect(capReached(15)).toBe(true);
  });
  test("over the cap", () => {
    expect(capReached(20)).toBe(true);
  });
});

describe("describeItem (task 12 brief: the fallback for the two-thirds of items with no `sound`)", () => {
  test("prefers the authored sound when present", () => {
    expect(describeItem(item("i1", { sound: "clap", color: "red" }))).toBe("clap");
  });
  test("falls back to colour and shape when sound is missing", () => {
    expect(describeItem(item("i1", { color: "red", shape: "circle" }))).toBe("red circle");
  });
  test("falls back to shape alone when colour is also missing (shape is always present)", () => {
    expect(describeItem(item("i1", { shape: "leaf" }))).toBe("leaf");
  });
});

describe("buildCorrectFeedback: names what was right, every kind, same sentence shape", () => {
  test("pick: names the correct card's colour and shape", () => {
    const r = round(
      [item("i1", { color: "red" }), item("i2", { color: "blue" })],
      { kind: "pick", itemIds: ["i1"] },
    );
    expect(buildCorrectFeedback(r, { kind: "pick", itemIds: ["i1"] })).toBe("Yes. That is the red circle.");
  });

  test("pick: names the card by its sound when one is authored", () => {
    const r = round(
      [item("i1", { color: "orange", sound: "clap" }), item("i2", { color: "grey", sound: "pause" })],
      { kind: "pick", itemIds: ["i2"] },
    );
    expect(buildCorrectFeedback(r, { kind: "pick", itemIds: ["i2"] })).toBe("Yes. That is the pause.");
  });

  test("order: confirms the right order", () => {
    const r = round(
      [item("i1", { sound: "clap" }), item("i2", { sound: "pause" })],
      { kind: "order", itemIds: ["i1", "i2"] },
    );
    expect(buildCorrectFeedback(r, { kind: "order", itemIds: ["i1", "i2"] })).toBe("Yes. That is the right order.");
  });

  test("groups: confirms the right piles", () => {
    const r = round(
      [item("i1", { color: "red" }), item("i2", { color: "blue" })],
      { kind: "groups", groups: [["i1"], ["i2"]] },
    );
    expect(buildCorrectFeedback(r, { kind: "groups", groups: [["i1"], ["i2"]] })).toBe("Yes. Those are the right piles.");
  });

  test("count: names the number", () => {
    const r = round([item("i1", { shape: "coin", count: 3 })], { kind: "count", value: 3 });
    expect(buildCorrectFeedback(r, { kind: "count", value: 3 })).toBe("Yes. That is 3.");
  });
});

describe("buildWrongFeedback: pick", () => {
  const r = round(
    [item("i1", { color: "red", shape: "circle" }), item("i2", { color: "blue", shape: "circle" })],
    { kind: "pick", itemIds: ["i1"] },
  );
  const wrongResponse: SproutResponse = { kind: "pick", itemIds: ["i2"] };

  test("miss 1: names what was touched and what is wanted", () => {
    expect(buildWrongFeedback(r, wrongResponse, 1)).toBe("That one is the blue circle. Find the red circle.");
  });

  test("miss 2: narrows to just what is wanted, not a repeat of miss 1", () => {
    const miss1 = buildWrongFeedback(r, wrongResponse, 1);
    const miss2 = buildWrongFeedback(r, wrongResponse, 2);
    expect(miss2).toBe("Find the red circle.");
    expect(miss2).not.toBe(miss1);
  });

  test("miss 3 and beyond: replays the round's own authored prompt", () => {
    expect(buildWrongFeedback(r, wrongResponse, 3)).toBe(`Let's listen again. ${r.prompt}`);
    expect(buildWrongFeedback(r, wrongResponse, 7)).toBe(`Let's listen again. ${r.prompt}`);
  });
});

describe("buildWrongFeedback: order", () => {
  const r = round(
    [item("i1", { color: "orange", sound: "clap" }), item("i2", { color: "orange", sound: "clap" }), item("i3", { color: "grey", sound: "pause" })],
    { kind: "order", itemIds: ["i1", "i2", "i3"] },
  );

  test("miss 1: names the card at the first wrong slot and what belongs there", () => {
    const response: SproutResponse = { kind: "order", itemIds: ["i3", "i1", "i2"] };
    expect(buildWrongFeedback(r, response, 1)).toBe("That one is the pause. Find the clap there.");
  });

  test("identical-attribute cards in the wrong slot are not flagged (matches checkRound)", () => {
    // i1 and i2 are both orange claps; swapping them still matches the authored sequence, so
    // the true first mismatch is the pause slot's own tap, not this pair.
    const response: SproutResponse = { kind: "order", itemIds: ["i2", "i1", "i1"] };
    // i1 (clap) tapped twice is wrong only at slot 3 where a "pause" was wanted.
    expect(buildWrongFeedback(r, response, 1)).toBe("That one is the clap. Find the pause there.");
  });
});

describe("buildWrongFeedback: groups", () => {
  const r = round(
    [
      item("i1", { color: "red", shape: "circle" }),
      item("i2", { color: "red", shape: "star" }),
      item("i3", { color: "blue", shape: "circle" }),
      item("i4", { color: "blue", shape: "star" }),
    ],
    { kind: "groups", groups: [["i1", "i2"], ["i3", "i4"]] },
  );

  test("miss 1: names a misplaced card and the pile (by shared colour) it belongs in", () => {
    // i3 (blue) placed in the red pile instead of the blue pile.
    const response: SproutResponse = { kind: "groups", groups: [["i1", "i2", "i3"], ["i4"]] };
    expect(buildWrongFeedback(r, response, 1)).toBe("That one is the blue circle. Find the blue pile.");
  });

  test("miss 2: narrows to just the pile", () => {
    const response: SproutResponse = { kind: "groups", groups: [["i1", "i2", "i3"], ["i4"]] };
    expect(buildWrongFeedback(r, response, 2)).toBe("Find the blue pile.");
  });

  test("falls back to a true, generic pile name when no attribute is shared (no invention)", () => {
    const mixed = round(
      [
        item("i1", { color: "red", shape: "circle" }),
        item("i2", { color: "blue", shape: "star" }),
        item("i3", { color: "green", shape: "square" }),
      ],
      { kind: "groups", groups: [["i1", "i2"], ["i3"]] },
    );
    const response: SproutResponse = { kind: "groups", groups: [["i1"], ["i2", "i3"]] };
    expect(buildWrongFeedback(mixed, response, 1)).toBe("That one is the blue star. Find the other pile.");
  });
});

describe("buildWrongFeedback: count", () => {
  const r = round([item("i1", { shape: "coin", count: 2 })], { kind: "count", value: 2 });

  test("miss 1: names the number tapped and the number wanted", () => {
    expect(buildWrongFeedback(r, { kind: "count", value: 4 }, 1)).toBe("That was 4. Count again. Find 2.");
  });

  test("miss 2: narrows to just the target number", () => {
    expect(buildWrongFeedback(r, { kind: "count", value: 4 }, 2)).toBe("Count again. Find 2.");
  });
});

describe("speechDurationMs: a bounded, deterministic estimate", () => {
  test("a short line still gets a floor so it can be heard", () => {
    expect(speechDurationMs("Yes.")).toBeGreaterThanOrEqual(1100);
  });
  test("a longer line takes proportionally longer", () => {
    const short = speechDurationMs("Yes. That is the red circle.");
    const long = speechDurationMs(
      "Let's listen again. Red, blue, red, blue. What comes next? Tap the one that comes next.",
    );
    expect(long).toBeGreaterThan(short);
  });
  test("an extremely long line is still capped", () => {
    expect(speechDurationMs("word ".repeat(200))).toBeLessThanOrEqual(4200);
  });
});

describe("countButtonValues: the count round's number row, derived from the round", () => {
  test("a round needing no more than 6 keeps the familiar 1..6 row (all of season 1)", () => {
    const r = round([item("i1", { shape: "coin", count: 2 })], { kind: "count", value: 2 });
    expect(countButtonValues(r)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("a correct value above 6 extends the row exactly that far", () => {
    const r = round([item("i1"), item("i2")], { kind: "count", value: 8 });
    expect(countButtonValues(r)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("an item count above the correct value drives the range too", () => {
    const r = round([item("i1", { count: 9 })], { kind: "count", value: 3 });
    expect(countButtonValues(r)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test("a non-count round still returns the floor row", () => {
    const r = round([item("i1")], { kind: "pick", itemIds: ["i1"] });
    expect(countButtonValues(r)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

/**
 * A pile round asks "which pile has more", so its choices differ only in count. The player used to
 * pass showCount solely in the count-round branch and describeItem ignored count entirely, so all
 * sixteen shipped pile rounds drew every choice as one identical glyph and spoke one identical
 * description. For a child who cannot read that is a dead end, and Sprout has no dead ends.
 */
describe("pile rounds are answerable", () => {
  test("describeItem tells two piles apart by their count", () => {
    const four = describeItem({ id: "i1", shape: "flower", color: "red", count: 4 } as SproutItem);
    const two = describeItem({ id: "i2", shape: "flower", color: "red", count: 2 } as SproutItem);
    expect(four).toBe("four red flowers");
    expect(two).toBe("two red flowers");
    expect(four).not.toBe(two);
  });

  test("describeItem leaves single items exactly as they were", () => {
    expect(describeItem({ id: "i1", shape: "flower", color: "red" } as SproutItem)).toBe("red flower");
    expect(describeItem({ id: "i2", shape: "circle", color: "brown", count: 1 } as SproutItem)).toBe("brown circle");
    expect(describeItem({ id: "i3", shape: "bird", sound: "tweet" } as SproutItem)).toBe("tweet");
  });

  test("describeItem names the small and the large one, but never the medium", () => {
    expect(describeItem({ id: "i1", shape: "rock", color: "grey", size: "s" } as SproutItem)).toBe("small grey rock");
    expect(describeItem({ id: "i2", shape: "rock", color: "grey", size: "l" } as SproutItem)).toBe("large grey rock");
    expect(describeItem({ id: "i3", shape: "rock", color: "grey", size: "m" } as SproutItem)).toBe("grey rock");
  });

  test("describeItem pluralises the two shapes that do not take an s", () => {
    expect(describeItem({ id: "i1", shape: "leaf", count: 3 } as SproutItem)).toBe("three leaves");
    expect(describeItem({ id: "i2", shape: "fish", count: 2 } as SproutItem)).toBe("two fish");
  });

  /**
   * Identical distractors are fine: "tap the red circle" beside two identical blue circles is a
   * fair question. The dead end is a RIGHT answer that describes exactly like a WRONG one, which
   * leaves the child guessing with no way in.
   */
  test("no correct choice describes identically to a wrong one", () => {
    const weeks = getContent().sprout;
    expect(weeks.length).toBeGreaterThan(15);
    const clashes: string[] = [];
    for (const week of weeks) {
      for (const activity of week.activities) {
        for (const round of activity.rounds) {
          if (round.correct.kind !== "pick") continue;
          // The same split the player makes: a tap-next round shows everything but the last two
          // items as the trail, which is context and not tappable, so a trail card describing like
          // the answer is not a clash.
          const choices = activity.kind === "tap-next" ? round.items.slice(-2) : round.items;
          const right = new Set(round.correct.itemIds);
          const rightWords = new Set(choices.filter((i) => right.has(i.id)).map((i) => describeItem(i)));
          const wrongWords = choices.filter((i) => !right.has(i.id)).map((i) => describeItem(i));
          if (wrongWords.some((w) => rightWords.has(w))) clashes.push(round.id);
        }
      }
    }
    expect(clashes).toEqual([]);
  });
});
