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
 * an item genuinely new to this quest's track gets the "New" flag; when nothing is new, every
 * item renders exactly the same as the last time he saw this list. Purely presentational --
 * callers (This Week's track cards, the quest screen) decide what counts as new.
 */
export function QuestMaterials({ materials, newMaterials, className }: QuestMaterialsProps) {
  if (materials.length === 0) return null;
  const isNew = newMaterials instanceof Set ? newMaterials : new Set(newMaterials ?? []);

  return (
    <div className={["tr-materials", className ?? ""].filter(Boolean).join(" ")}>
      <p className="tr-materials__label">Get these ready</p>
      <ul>
        {materials.map((item) => (
          <li key={item}>
            <span>{item}</span>
            {isNew.has(item) ? <Chip tone="flag">New</Chip> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
