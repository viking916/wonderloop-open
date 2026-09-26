// Sprout mode's pure rules (spec 6 and 7.1 screen 7; plan-2-notes-from-content.md "Sprout").
// No Firebase, no React, no speechSynthesis: everything here is deterministic and testable in
// isolation, matching the rest of lib/domain/. The screens (app/sprout/**) are the only place
// that touches the DOM, the clock, or Firestore.

import type { SproutCorrect, SproutItem, SproutRound } from "../content/schema";

/**
 * What the child's tap-based interaction resolves to for one round, one variant per
 * `correct.kind`. A `pick` response carries every item currently selected (usually one, but the
 * content schema allows `correct.itemIds` to name more than one acceptable card, so the response
 * shape mirrors it) rather than a single id, so checkRound can compare both sides as sets (Plan
 * 1 ruling, task brief step 1).
 */
export type SproutResponse =
  | { kind: "pick"; itemIds: string[] }
  | { kind: "order"; itemIds: string[] }
  | { kind: "groups"; groups: string[][] }
  | { kind: "count"; value: number };

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((v, i) => v === bs[i]);
}

/** The perceivable attributes that make two cards interchangeable for an `order` check (Plan 1
 * ruling, plan-2-notes-from-content.md "Sprout"): shape, colour, size and sound, never the id. */
type ItemAttrs = Pick<SproutItem, "shape" | "color" | "size" | "sound">;

function itemAttrs(item: SproutItem): ItemAttrs {
  return { shape: item.shape, color: item.color, size: item.size, sound: item.sound };
}

function attrsEqual(a: ItemAttrs, b: ItemAttrs): boolean {
  return a.shape === b.shape && a.color === b.color && a.size === b.size && a.sound === b.sound;
}

/** Sorted, comma-joined ids: a group's identity for partition comparison, independent of the
 * order the ids were placed in. */
function groupKey(ids: string[]): string {
  return [...ids].sort().join(",");
}

/** Two partitions match when they contain the same set of groups, regardless of which order the
 * groups themselves were given in (Plan 1 ruling: "a `groups` partition given in a different
 * order" is still correct) and regardless of the order of ids within each group. */
function sameGroupPartition(a: string[][], b: string[][]): boolean {
  if (a.length !== b.length) return false;
  const ak = a.map(groupKey).sort();
  const bk = b.map(groupKey).sort();
  return ak.every((v, i) => v === bk[i]);
}

/**
 * Checks one round's response against its authored `correct` (Plan 1 rulings, task 12 brief):
 * - `pick`: the chosen ids match `correct.itemIds` as a set (order and count of extra taps do
 *   not matter, only the final selection).
 * - `order`: the sequence of item **attributes** (shape, colour, size, sound) the child built
 *   matches the sequence for `correct.itemIds`, so two cards with identical perceivable
 *   attributes but different ids are interchangeable (the clap-rhythm rounds depend on this).
 * - `groups`: the partition matches `correct.groups` as a set of sets, independent of the order
 *   either the groups or the ids within a group were given in.
 * - `count`: the tapped number equals `correct.value`.
 *
 * A response of the wrong kind (should never happen -- the player only ever builds the response
 * shape matching `round.correct.kind`) is simply not correct, never throws: nothing here is a
 * fail state, only a boolean the caller uses to decide whether to advance or say "try another
 * one" (spec 6: "no fail state").
 */
export function checkRound(round: SproutRound, response: SproutResponse): boolean {
  const correct: SproutCorrect = round.correct;
  switch (correct.kind) {
    case "pick":
      return response.kind === "pick" && sameIdSet(response.itemIds, correct.itemIds);
    case "order": {
      if (response.kind !== "order") return false;
      if (response.itemIds.length !== correct.itemIds.length) return false;
      const byId = new Map(round.items.map((it) => [it.id, it]));
      const expected = correct.itemIds.map((id) => {
        const item = byId.get(id);
        return item ? itemAttrs(item) : undefined;
      });
      const actual = response.itemIds.map((id) => {
        const item = byId.get(id);
        return item ? itemAttrs(item) : undefined;
      });
      return expected.every((attrs, i) => {
        const other = actual[i];
        return attrs !== undefined && other !== undefined && attrsEqual(attrs, other);
      });
    }
    case "groups":
      return response.kind === "groups" && sameGroupPartition(response.groups, correct.groups);
    case "count":
      return response.kind === "count" && response.value === correct.value;
  }
}

/**
 * A card's spoken/readable description (task 12 brief; moved here from ActivityPlayer so the
 * sentence builder below and the player's aria-labels share one definition, never two that can
 * drift). Prefers the authored `sound` -- the actual meaning the card carries -- and falls back
 * to colour and shape, which the content audit (task-11) confirmed every one of the 544 Sprout
 * items has at least one of (`shape` is required by the schema, so this can never return "").
 */
const NUMBER_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** The twelve shapes are a closed enum, and only these two do not simply take an s. */
const IRREGULAR_PLURALS: Record<string, string> = { leaf: "leaves", fish: "fish" };

export function describeItem(item: SproutItem): string {
  // A pile is its count first. Rounds like "tap the pile with more flowers" put the whole question
  // in how many, so a description that says only "red flower" describes every choice on screen
  // identically and leaves a child who cannot read with nothing to go on. No authored item carries
  // both a sound and a count above one, so this branch never steals a card's authored meaning.
  if (item.count && item.count > 1) {
    const counted = NUMBER_WORDS[item.count] ?? String(item.count);
    const shape = IRREGULAR_PLURALS[item.shape] ?? `${item.shape}s`;
    return [counted, item.color, shape].filter(Boolean).join(" ");
  }
  if (item.sound) return item.sound;
  // Size only when it is the small or the large one. Those cards do differ on screen, since the
  // glyph scales, so a size round is answerable by eye either way; but "tap the bigger one" spoken
  // over two cards both called "grey rock" tells a child nothing, and the word is the whole point
  // of the question. Medium is left unsaid: it is the ordinary size and no child calls it that.
  const sized = item.size === "s" ? "small" : item.size === "l" ? "large" : undefined;
  return [sized, item.color, item.shape].filter(Boolean).join(" ");
}

/** The attribute (colour, then shape, then size) every item in a group shares -- the thing that
 * makes it "a pile" a 3-year-old can name ("the red pile", "the circle pile"). Colour is checked
 * first because every authored `groups` round in the content sorts by colour; shape and size stay
 * as fallbacks for any future round that sorts by something else, and `undefined` covers a group
 * with no shared attribute at all, so the caller has a true, if generic, thing to say instead of
 * inventing a description. */
function commonAttribute(items: readonly SproutItem[]): { attr: "color" | "shape" | "size"; value: string } | undefined {
  const attrs = ["color", "shape", "size"] as const;
  for (const attr of attrs) {
    const first = items[0]?.[attr];
    if (first !== undefined && items.every((it) => it[attr] === first)) return { attr, value: first };
  }
  return undefined;
}

/** Every ordering of 0..n-1, used to find the best match between the piles the child actually
 * built and the authored piles (small n -- at most 4 groups in any authored round -- so brute
 * force is simplest and plenty fast). */
function permutations(n: number): number[][] {
  const out: number[][] = [];
  function permute(remaining: number[], acc: number[]) {
    if (remaining.length === 0) {
      out.push(acc);
      return;
    }
    for (let i = 0; i < remaining.length; i++) {
      permute([...remaining.slice(0, i), ...remaining.slice(i + 1)], [...acc, remaining[i]!]);
    }
  }
  permute(Array.from({ length: n }, (_, i) => i), []);
  return out;
}

/** Matches each pile the child built to whichever authored pile it overlaps most with, so a
 * partially-right sort (2 of 4 cards correct) still finds a sensible "you meant this pile"
 * pairing instead of comparing piles in whatever order they happen to be listed. Returns
 * `matched[actualIndex] = correctIndex`. */
function bestGroupMatching(actual: readonly string[][], correct: readonly string[][]): number[] {
  const n = correct.length;
  let best = Array.from({ length: n }, (_, i) => i);
  let bestScore = -1;
  for (const perm of permutations(n)) {
    let score = 0;
    for (let i = 0; i < n; i++) {
      const actualSet = new Set(actual[i] ?? []);
      for (const id of correct[perm[i]!] ?? []) if (actualSet.has(id)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = perm;
    }
  }
  return best;
}

/** The first card that ended up in the wrong pile, plus the pile it actually belongs in (task 12
 * brief: "name what he touched and restate what is wanted"). Undefined only if the response is
 * somehow wrong in a way no single misplaced card explains (defensive; `checkRound` having
 * already said "wrong" means at least one card differs from its authored pile). */
function findMisplacedGroupItem(
  round: SproutRound,
  response: Extract<SproutResponse, { kind: "groups" }>,
): { item: SproutItem; wantedGroup: SproutItem[] } | undefined {
  const correct = round.correct as Extract<SproutCorrect, { kind: "groups" }>;
  const itemById = new Map(round.items.map((it) => [it.id, it]));
  const matching = bestGroupMatching(response.groups, correct.groups);
  for (let actualIndex = 0; actualIndex < response.groups.length; actualIndex++) {
    const correctSet = new Set(correct.groups[matching[actualIndex]!] ?? []);
    for (const id of response.groups[actualIndex] ?? []) {
      if (correctSet.has(id)) continue;
      const item = itemById.get(id);
      const trueGroup = correct.groups.find((g) => g.includes(id));
      if (!item || !trueGroup) continue;
      const wantedGroup = trueGroup.map((gid) => itemById.get(gid)).filter((it): it is SproutItem => Boolean(it));
      return { item, wantedGroup };
    }
  }
  return undefined;
}

/** The first slot in an `order` sequence where what the child built differs from what was
 * authored, compared by the same perceivable attributes `checkRound` uses (so two
 * attribute-identical cards never get flagged as "different" here either). */
function findOrderMismatch(
  round: SproutRound,
  response: Extract<SproutResponse, { kind: "order" }>,
): { touched: SproutItem; wanted: SproutItem } | undefined {
  const correct = round.correct as Extract<SproutCorrect, { kind: "order" }>;
  const itemById = new Map(round.items.map((it) => [it.id, it]));
  const len = Math.min(response.itemIds.length, correct.itemIds.length);
  for (let i = 0; i < len; i++) {
    const touched = itemById.get(response.itemIds[i]!);
    const wanted = itemById.get(correct.itemIds[i]!);
    if (!touched || !wanted) continue;
    if (!attrsEqual(itemAttrs(touched), itemAttrs(wanted))) return { touched, wanted };
  }
  return undefined;
}

/** What went right and what to say about it, one sentence, the same shape every time ("Yes. That
 * is the X.") so the line becomes predictable to a small child (task 12 brief: "warm, brief, and
 * the same shape of sentence every time"). Every branch names the actual thing that was right --
 * never a bare "Yes!" -- because for a non-reader, that name IS the feedback. */
export function buildCorrectFeedback(round: SproutRound, response: SproutResponse): string {
  const correct = round.correct;
  const itemById = new Map(round.items.map((it) => [it.id, it]));
  switch (correct.kind) {
    case "pick": {
      const id = correct.itemIds[0] ?? (response.kind === "pick" ? response.itemIds[0] : undefined);
      const item = id ? itemById.get(id) : undefined;
      return item ? `Yes. That is the ${describeItem(item)}.` : "Yes. That is right.";
    }
    case "order":
      return "Yes. That is the right order.";
    case "groups":
      return "Yes. Those are the right piles.";
    case "count":
      return `Yes. That is ${correct.value}.`;
  }
}

/** One round's "what happened and why" for a wrong tap, before the miss-count escalation below
 * decides how much of it to say. Every branch names the thing the child touched and the thing
 * that is actually wanted, built only from `shape`/`color`/`size`/`sound` -- never a guess -- and
 * every branch has a true, useful fallback for the (should-not-happen, but never crash) case
 * where the response can't be resolved back to an item at all. */
function wrongTarget(round: SproutRound, response: SproutResponse): { touched: string; wanted: string } {
  const correct = round.correct;
  const itemById = new Map(round.items.map((it) => [it.id, it]));
  switch (correct.kind) {
    case "pick": {
      const touchedItem = response.kind === "pick" ? itemById.get(response.itemIds[0] ?? "") : undefined;
      const wantedItem = itemById.get(correct.itemIds[0] ?? "");
      if (touchedItem && wantedItem) {
        return { touched: `That one is the ${describeItem(touchedItem)}.`, wanted: `Find the ${describeItem(wantedItem)}.` };
      }
      return { touched: "That is not it.", wanted: "Look again and find the right one." };
    }
    case "order": {
      const mismatch = response.kind === "order" ? findOrderMismatch(round, { kind: "order", itemIds: response.itemIds }) : undefined;
      if (mismatch) {
        return {
          touched: `That one is the ${describeItem(mismatch.touched)}.`,
          wanted: `Find the ${describeItem(mismatch.wanted)} there.`,
        };
      }
      return { touched: "That is not the order yet.", wanted: "Listen again and try the order." };
    }
    case "groups": {
      const found = response.kind === "groups" ? findMisplacedGroupItem(round, { kind: "groups", groups: response.groups }) : undefined;
      if (found) {
        const common = commonAttribute(found.wantedGroup);
        const pile = common ? `${common.value} pile` : "other pile";
        return { touched: `That one is the ${describeItem(found.item)}.`, wanted: `Find the ${pile}.` };
      }
      return { touched: "That is not quite right.", wanted: "Try sorting them again." };
    }
    case "count": {
      const touchedValue = response.kind === "count" ? response.value : undefined;
      return {
        touched: touchedValue !== undefined ? `That was ${touchedValue}.` : "That is not the number.",
        wanted: `Count again. Find ${correct.value}.`,
      };
    }
  }
}

/**
 * A wrong tap's spoken feedback (task 12 brief): never a fail state, never the same line forever.
 * Escalates over consecutive misses on the SAME round (the caller resets its counter whenever the
 * round changes or a tap succeeds):
 * - miss 1: the full "what you touched, what's wanted" sentence -- the child's first chance to
 *   hear the difference.
 * - miss 2: just the "what's wanted" half. Repeating the touched-item half a second time is not
 *   more help, it's the same information again; dropping it narrows the child's attention
 *   straight onto the goal.
 * - miss 3 and beyond: re-teaches from the top by replaying the round's own authored prompt
 *   (every `SproutRound` has one, so this never needs new copy) -- for a pattern round the prompt
 *   IS the pattern ("Red, blue, red, blue. What comes next?"), so re-hearing it is real help, not
 *   a repeat, and it generalizes to every round kind without a kind-specific "hint" needing to be
 *   authored.
 */
export function buildWrongFeedback(round: SproutRound, response: SproutResponse, missCount: number): string {
  const { touched, wanted } = wrongTarget(round, response);
  if (missCount <= 1) return `${touched} ${wanted}`;
  if (missCount === 2) return wanted;
  return `Let's listen again. ${round.prompt}`;
}

/** A rough, deterministic estimate of how long an utterance takes to finish at the app's fixed
 * speech rate (`useSpeak`'s 0.95), so the player can hold off advancing to the next round/star
 * until the "Yes, that is the red one" line has actually been heard, without depending on the
 * browser firing a speechSynthesis "end" event (which some browsers/headless test runners never
 * fire at all -- and advancing must never depend on that, or a silent browser would soft-lock a
 * correct answer, which spec 6 forbids as much as it forbids failing a wrong one). Clamped to a
 * sane range so a long line still advances within a few seconds and a one-word line still gives
 * the child a moment to hear it. */
export function speechDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(4200, Math.max(1100, 450 + words * 320));
}

/**
 * A week's star row (spec 7.1 screen 7 / the design demo's "2 of 3 stars"): one star per
 * finished activity, in the same order the week lists its three activities. Always length 3
 * (spec 6: "3 tablet activities... a star at the end" -- a week always has exactly three), so a
 * caller can render three star slots and fill the first N.
 */
export function starsForWeek(activityStates: readonly boolean[]): 0 | 1 | 2 | 3 {
  const earned = activityStates.filter(Boolean).length;
  if (earned >= 3) return 3;
  if (earned === 2) return 2;
  if (earned === 1) return 1;
  return 0;
}

/** Sprout's daily screen-time cap (spec 2: "capped at 15 minutes per day"). */
export const SPROUT_DAILY_CAP_MINUTES = 15;

/** Whether today's accrued minutes have reached the cap. Used only to gate *starting* a new
 * activity from the hill (spec 6, task 12 brief: "the cap blocks new activities but never
 * interrupts one in progress"); the activity player never calls this mid-round. */
export function capReached(minutesToday: number): boolean {
  return minutesToday >= SPROUT_DAILY_CAP_MINUTES;
}

/**
 * The number buttons a `count` round offers, derived from the round itself rather than
 * hardcoded in the player (season 2's counting curve passes 6: week 5 reaches 8 and the design
 * reaches 10 by week 9, so a fixed 1..6 row would leave every answer above 6 unreachable).
 * The range always starts at 1 and runs to the largest number the round can need, meaning the
 * `correct.value` and every item's own `count`, floored at COUNT_BUTTONS_MIN so the familiar
 * six-button row stays exactly as it always was for every round that needs no more (all of
 * season 1 tops out at 5, so every season 1 screen renders unchanged).
 */
export const COUNT_BUTTONS_MIN = 6;
export function countButtonValues(round: SproutRound): number[] {
  let max = COUNT_BUTTONS_MIN;
  if (round.correct.kind === "count") max = Math.max(max, round.correct.value);
  for (const item of round.items) if (item.count !== undefined) max = Math.max(max, item.count);
  return Array.from({ length: max }, (_, i) => i + 1);
}
