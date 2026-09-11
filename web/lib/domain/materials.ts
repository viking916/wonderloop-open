// The season shopping list and the "what does this quest need" checklist (task 14). Nothing
// here is hardcoded to a particular item or season: every entry comes from content/materials.json
// (season-level items, each carrying its own neededByWeek) and content/books.json (the season
// book, resolved through lib/content/lookup.ts's getSeasonBook), plus each quest's own
// `materials` array. Season 2's content changing these files changes what this module returns
// without a single line here changing.

import { getSeasonBook, type Content } from "../content/lookup";
import type { Quest } from "../content/schema";

export type ShoppingBucket = "now" | "soon" | "later";

export type ShoppingItem = {
  /** Stable across a season: the material's own name from materials.json, or `book:{id}` for
   * the season book. Used as the tick key when a household marks an item bought. */
  key: string;
  name: string;
  why: string;
  /** Whole dollars, approximate. 0 means the family is assumed to already own it. null means no
   * price data exists at all (the season book: content/books.json carries no cost field) -- see
   * formatApproxCost, which is the only place that turns this into words. Never render this
   * number directly as a price. */
  approxUsd: number | null;
  neededByWeek: number;
  bucket: ShoppingBucket;
};

/**
 * How many weeks of lead time counts as "soon" rather than "later". This season's content only
 * ever introduces a new item at week 1 or week 5 (content/materials.json), four weeks apart, so
 * a 2-week window gives a full week where the week-5 items (the Maqueen Lite chassis chief among
 * them) are flagged before they are due without flagging the whole season's list at once from
 * week 1. Two weeks is also enough real time to order a physical part and have it arrive before
 * the Saturday it is needed, which is the whole point of this list (see the task brief: a parent
 * who discovers a robot chassis is due on week 5 on the Friday before has already lost the
 * weekend).
 */
export const SHOPPING_WARNING_WEEKS = 2;

function bucketFor(neededByWeek: number, currentWeek: number): ShoppingBucket {
  if (neededByWeek <= currentWeek) return "now";
  if (neededByWeek <= currentWeek + SHOPPING_WARNING_WEEKS) return "soon";
  return "later";
}

/** The season book is assumed needed from week 1: it takes the whole season to read (week 12's
 * Speak quest talks about it, spread across 12 weeks of reading, not crammed into the last
 * week), so a parent should buy or borrow it at the very start, same as the rest of the week-1
 * gear. */
const BOOK_NEEDED_BY_WEEK = 1;

/**
 * Everything a household needs to buy or gather for the season: every content/materials.json
 * item plus the season's book (if content has one), each bucketed against `currentWeek` by how
 * urgent it is. Sorted by neededByWeek so "now" items lead and "later" items trail, ties broken
 * alphabetically so the order is stable.
 */
export function seasonShoppingList(content: Content, seasonId: number, currentWeek: number): ShoppingItem[] {
  const registry = content.materials[String(seasonId)] ?? [];
  const items: ShoppingItem[] = registry.map((m) => ({
    // Season 1 keeps bare names as keys (households already ticked those); later seasons are
    // prefixed so the same item name in two seasons is two ticks.
    key: seasonId === 1 ? m.name : `s${seasonId}:${m.name}`,
    name: m.name,
    why: m.why,
    approxUsd: m.approxUsd,
    neededByWeek: m.neededByWeek,
    bucket: bucketFor(m.neededByWeek, currentWeek),
  }));

  const book = getSeasonBook(content, seasonId);
  if (book) {
    items.push({
      key: `book:${book.id}`,
      name: book.title,
      why: `This season's book, by ${book.author}. ${book.why}`,
      approxUsd: null,
      neededByWeek: BOOK_NEEDED_BY_WEEK,
      bucket: bucketFor(BOOK_NEEDED_BY_WEEK, currentWeek),
    });
  }

  return items.sort((a, b) => a.neededByWeek - b.neededByWeek || a.name.localeCompare(b.name));
}

/** Every season's approximate total, for the arc line on the parent landing page. */
export function arcTotals(content: Content, seasonIds: number[]): { seasonId: number; total: number; items: number }[] {
  return seasonIds.map((seasonId) => {
    const items = seasonShoppingList(content, seasonId, 0);
    return { seasonId, total: totalApproxUsd(items), items: items.length };
  });
}

/** approxUsd is an estimate, and 0 does not mean free, it means "the family is assumed to
 * already have this" -- neither should ever be printed as a bare dollar amount (task brief:
 * "do not present approximations as prices"). null (the season book: no price data at all) gets
 * its own plain-English words instead of a number too. */
export function formatApproxCost(approxUsd: number | null): string {
  if (approxUsd === null) return "Borrow or buy";
  if (approxUsd === 0) return "Already have this";
  return `About $${approxUsd}`;
}

/** The season total, in whole dollars: every item with a real (non-null) approxUsd, added up.
 * Items already owned (approxUsd 0) contribute nothing, same as a real receipt would. */
export function totalApproxUsd(items: ShoppingItem[]): number {
  return items.reduce((sum, item) => sum + (item.approxUsd ?? 0), 0);
}

/**
 * Which of a quest's own `materials` entries are new to its track this season: not named in any
 * earlier week's quest on the same track. This is the child-facing signal (task brief: "an item
 * ... has not been needed before") -- week 1's Build quest, having no earlier week to compare
 * against, reports everything it lists as new; week 2's Build quest, which repeats week 1's
 * exact list, reports nothing, so the checklist stays quiet unless something genuinely changed.
 */
export function newQuestMaterials(allQuests: Quest[], quest: Quest): Set<string> {
  const seenBefore = new Set<string>();
  for (const q of allQuests) {
    if (q.season !== quest.season || q.track !== quest.track || q.week >= quest.week) continue;
    for (const m of q.materials) seenBefore.add(m);
  }
  return new Set(quest.materials.filter((m) => !seenBefore.has(m)));
}
