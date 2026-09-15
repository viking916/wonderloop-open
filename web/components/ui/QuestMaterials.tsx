import { Chip } from "./Chip";

export type QuestMaterialsProps = {
  /** A quest's own `materials` array, in content order. */
  materials: string[];
  /** Entries in `materials` that were not needed by any earlier week of this quest's track --
   * flagged so a returning family notices what changed instead of re-reading the whole list. */
  newMaterials?: Set<string> | string[];
  className?: string;
};

/**
 * "What you need on the desk before you start" (task 14): a quiet checklist, not an alert. Only
 * an item genuinely new to this quest's track gets flagged; when nothing is new, every item
 * renders exactly the same as the last time he saw this list. Purely presentational -- callers
 * (This Week's track cards, the quest screen) decide what counts as new.
 *
 * Polish pass, 15 September 2026: a "New" pill on every item read as a wall of pills, and a pill
 * beside a long name pushed the name out of line with the rest of the list. When every item is
 * new, one quiet "New this week" chip sits beside the list's own label instead. When only some
 * items are new, each of those gets a small sun dot plus visually-hidden "New" text next to its
 * name (still announced to a screen reader, never a second pill fighting the name for width).
 *
 * Second polish pass, same day: the dot rendered after the name with `flex: 1` on the name, which
 * pushed it to the card's far right edge, detached from the item it flagged. Every row now
 * renders the dot first, immediately before the name, and every row (flagged or not) renders the
 * same dot element with its colour toggled off when the item is not new, so the dot's width is
 * reserved on every row and every item's name still starts at one shared left edge.
 */
export function QuestMaterials({ materials, newMaterials, className }: QuestMaterialsProps) {
  if (materials.length === 0) return null;
  const isNew = newMaterials instanceof Set ? newMaterials : new Set(newMaterials ?? []);
  const allNew = isNew.size > 0 && isNew.size === materials.length;
  // The dot column is reserved only when some rows carry a dot; otherwise names sit flush with the
  // label instead of indented under an empty gutter.
  const someFlagged = !allNew && materials.some((item) => isNew.has(item));

  return (
    <div className={["tr-materials", className ?? ""].filter(Boolean).join(" ")}>
      <div className="tr-materials__head">
        <p className="tr-materials__label">Get these ready</p>
        {allNew ? <Chip tone="flag">New this week</Chip> : null}
      </div>
      <ul>
        {materials.map((item) => {
          const flagItem = !allNew && isNew.has(item);
          return (
            <li key={item}>
              {someFlagged ? (
                <span
                  className={`tr-materials__new-dot${flagItem ? "" : " tr-materials__new-dot--hidden"}`}
                  aria-hidden="true"
                />
              ) : null}
              <span className="tr-materials__name">
                {item}
                {flagItem ? <span className="sr-only"> New</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
