import { describe, expect, test } from "vitest";
import { getContent } from "../content/app-content";
import type { Content } from "../content/lookup";
import type { Quest } from "../content/schema";
import {
  SHOPPING_WARNING_WEEKS,
  formatApproxCost,
  newQuestMaterials,
  arcTotals,
  seasonShoppingList,
  totalApproxUsd,
} from "./materials";

const content = getContent();

function quest(id: string): Quest {
  const q = content.quests.find((x) => x.id === id);
  if (!q) throw new Error(`quest ${id} not in content`);
  return q;
}

// A hand-built content fixture for the bucketing tests, independent of season 1's real data
// (which only ever uses neededByWeek 1 and 5): three items spread across the season so "now",
// "soon" and "later" are all exercised at once.
function fixtureContent(): Content {
  return {
    skills: [],
    ideas: [],
    motions: [],
    lessons: [],
    ladder: { graph: [], topics: {} },
    games: [],
    books: [
      { id: "b1", title: "Book One", author: "Author One", why: "Reason one.", forWhom: "explorer" },
      { id: "b2", title: "Book Two", author: "Author Two", why: "Reason two.", forWhom: "explorer" },
    ],
    materials: {
      "1": [
        { name: "Item A", why: "Needed early.", approxUsd: 10, neededByWeek: 1 },
        { name: "Item B", why: "Needed in the middle.", approxUsd: 0, neededByWeek: 6 },
        { name: "Item C", why: "Needed late.", approxUsd: 20, neededByWeek: 12 },
      ],
      "2": [{ name: "Item A", why: "Again, more of it.", approxUsd: 5, neededByWeek: 2 }],
    },
    calendar: { seasonStart: "2026-09-07", competitions: [] },
    quests: [],
    sprout: [],
  };
}

describe("seasonShoppingList", () => {
  test("buckets an item already due as now", () => {
    const list = seasonShoppingList(fixtureContent(), 1, 6);
    expect(list.find((i) => i.name === "Item B")?.bucket).toBe("now");
  });

  test("buckets an item within the warning window as soon", () => {
    // currentWeek 4, Item B due week 6: 6 - 4 = 2, exactly SHOPPING_WARNING_WEEKS.
    const list = seasonShoppingList(fixtureContent(), 1, 4);
    expect(list.find((i) => i.name === "Item B")?.bucket).toBe("soon");
  });

  test("buckets an item outside the warning window as later", () => {
    const list = seasonShoppingList(fixtureContent(), 1, 1);
    expect(list.find((i) => i.name === "Item C")?.bucket).toBe("later");
  });

  test("the warning window is 2 weeks", () => {
    expect(SHOPPING_WARNING_WEEKS).toBe(2);
  });

  test("adds the season's book, needed from week 1, keyed distinctly from any material", () => {
    const list = seasonShoppingList(fixtureContent(), 1, 1);
    const book = list.find((i) => i.key === "book:b1");
    expect(book).toBeDefined();
    expect(book?.name).toBe("Book One");
    expect(book?.bucket).toBe("now");
  });

  test("season 2 picks the second explorer book, the same rotation This Week's side strip uses", () => {
    const list = seasonShoppingList(fixtureContent(), 2, 1);
    expect(list.some((i) => i.key === "book:b2")).toBe(true);
  });

  test("is sorted by neededByWeek", () => {
    const list = seasonShoppingList(fixtureContent(), 1, 1);
    const weeks = list.map((i) => i.neededByWeek);
    expect(weeks).toEqual([...weeks].sort((a, b) => a - b));
  });

  // Deliberately finds the week-5 item by its week rather than by its name: the robot itself
  // changed once already (Maqueen to the mBot the family owns) and naming it here made this
  // test fail for a legitimate content edit. What matters is the transition, not the product.
  test("real season 1 content: an item first needed at week 5 moves later, then soon, then now", () => {
    const weekFiveItem = seasonShoppingList(content, 1, 5).find((i) => i.neededByWeek === 5);
    expect(weekFiveItem, "season 1 should still have an item first needed at week 5").toBeDefined();
    const name = weekFiveItem!.name;
    expect(seasonShoppingList(content, 1, 1).find((i) => i.name === name)?.bucket).toBe("later");
    expect(seasonShoppingList(content, 1, 3).find((i) => i.name === name)?.bucket).toBe("soon");
    expect(seasonShoppingList(content, 1, 5).find((i) => i.name === name)?.bucket).toBe("now");
  });
});

describe("formatApproxCost", () => {
  test("a positive amount reads as approximate, not a bare price", () => {
    expect(formatApproxCost(18)).toBe("About $18");
  });

  test("zero reads as already owned, never as free or $0", () => {
    expect(formatApproxCost(0)).toBe("Already have this");
  });

  test("null (no price data, the season book) reads as borrow or buy", () => {
    expect(formatApproxCost(null)).toBe("Borrow or buy");
  });
});

describe("totalApproxUsd", () => {
  test("sums real amounts and skips already-owned and priceless items", () => {
    const list = seasonShoppingList(fixtureContent(), 1, 12);
    // Item A ($10) + Item C ($20) + Item B ($0, already owned) + the book (no price) = 30.
    expect(totalApproxUsd(list)).toBe(30);
  });
});

describe("newQuestMaterials", () => {
  test("week 1's Build quest, with no earlier week to compare against, reports everything as new", () => {
    const w1 = quest("s1-w01-build");
    const news = newQuestMaterials(content.quests, w1);
    expect(news).toEqual(new Set(w1.materials));
  });

  test("week 2's Build quest repeats week 1's exact list, so nothing is new", () => {
    const w2 = quest("s1-w02-build");
    const news = newQuestMaterials(content.quests, w2);
    expect(news.size).toBe(0);
  });

  test("week 5's Build quest introduces mBot v1.2 for the first time", () => {
    const w5 = quest("s1-w05-build");
    const news = newQuestMaterials(content.quests, w5);
    expect(news.has("mBot v1.2")).toBe(true);
    // micro:bit v2 and laptop with Chrome were both already needed from week 1.
    expect(news.has("micro:bit v2")).toBe(false);
    expect(news.has("laptop with Chrome")).toBe(false);
  });

  test("week 6's Build quest still lists mBot v1.2 but it is no longer new", () => {
    const w6 = quest("s1-w06-build");
    const news = newQuestMaterials(content.quests, w6);
    expect(w6.materials).toContain("mBot v1.2");
    expect(news.has("mBot v1.2")).toBe(false);
  });

  test("a Think quest is never compared against a Build quest's materials", () => {
    const thinkW5 = quest("s1-w05-think");
    const news = newQuestMaterials(content.quests, thinkW5);
    // "graph paper" and "pencil" were already used by Think in week 1, so only the two
    // week-5-only items (5 coins, 15 small cups or lids) should be new.
    expect(news.has("graph paper")).toBe(false);
    expect(news.has("pencil")).toBe(false);
    expect(news.has("5 coins")).toBe(true);
    expect(news.has("15 small cups or lids")).toBe(true);
  });
});

describe("materials by season", () => {
  test("a later season's items are keyed by season so the same name is a separate tick", () => {
    const list = seasonShoppingList(fixtureContent(), 2, 0);
    expect(list.map((i) => i.key)).toContain("s2:Item A");
    expect(seasonShoppingList(fixtureContent(), 1, 0).map((i) => i.key)).toContain("Item A");
  });

  test("arcTotals adds each season up and skips a season with no registry", () => {
    expect(arcTotals(fixtureContent(), [1, 2, 3]).map((s) => s.total)).toEqual([30, 5, 0]);
  });
});
