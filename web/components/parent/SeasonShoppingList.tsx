"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { getContent } from "@/lib/content/app-content";
import { setMaterialBought } from "@/lib/data/households";
import type { HouseholdDoc } from "@/lib/data/types";
import {
  SHOPPING_WARNING_WEEKS,
  arcTotals,
  formatApproxCost,
  seasonShoppingList,
  totalApproxUsd,
  type ShoppingItem,
} from "@/lib/domain/materials";

export type SeasonShoppingListProps = {
  householdId: string;
  household: HouseholdDoc | undefined;
  /** The child's own season: its list is bucketed by the current week. */
  seasonId: number;
  currentWeek: number;
  /** Every season the content ships, for the picker and the arc total. */
  seasonIds: number[];
};

function BucketRows({
  items,
  boughtSet,
  onToggle,
}: {
  items: ShoppingItem[];
  boughtSet: Set<string>;
  onToggle: (key: string, bought: boolean) => void;
}) {
  return (
    <ul className="pr-shopping__list">
      {items.map((item) => {
        const bought = boughtSet.has(item.key);
        return (
          <li key={item.key} className={bought ? "pr-shopping__row pr-shopping__row--bought" : "pr-shopping__row"}>
            <div className="pr-shopping__row-main">
              <h4>{item.name}</h4>
              <p className="pr-shopping__why">{item.why}</p>
              <div className="pr-shopping__meta">
                <span>Needed by week {item.neededByWeek}</span>
                {item.bucket === "soon" ? <Chip tone="flag">Needed soon</Chip> : null}
              </div>
            </div>
            <div className="pr-shopping__row-actions">
              <Chip tone="money">{formatApproxCost(item.approxUsd)}</Chip>
              {bought ? (
                // Task 20: this used to be the exact same dashed "ghost" button whether or not
                // it was bought yet -- the owner's own example of a status label that read as
                // pressable with nothing to tell it apart from a real action next to it. Once
                // bought, "Bought" is a status (Chip, not a button); the only real control left
                // is the low-stakes, easily-reversible "Undo".
                <>
                  <Chip tone="positive">Bought</Chip>
                  <Button variant="quiet" onClick={() => onToggle(item.key, !bought)}>
                    Undo
                  </Button>
                </>
              ) : (
                <Button variant="secondary" onClick={() => onToggle(item.key, !bought)}>
                  Mark as bought
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The season shopping list (task 14): every content/materials.json item plus the season book,
 * grouped by how soon it is needed, with a running total. Household-wide, not per child (the
 * gear and the book are shared), so it renders once in the Parent view rather than inside each
 * child's own section -- and "bought" is stored the same way (HouseholdDoc.boughtMaterials, see
 * lib/data/households.ts's setMaterialBought).
 *
 * Bucketing (lib/domain/materials.ts's seasonShoppingList): "Needed now" is already due,
 * "Buy soon" falls within SHOPPING_WARNING_WEEKS of currentWeek -- the whole point of this list,
 * surfacing an item like the week-5 Maqueen chassis while there is still time to order and
 * receive it -- and "Later this season" is everything else, collapsed by default so the urgent
 * two sections are what a skim actually sees.
 */
export function SeasonShoppingList({ householdId, household, seasonId, currentWeek, seasonIds }: SeasonShoppingListProps) {
  const content = useMemo(() => getContent(), []);
  // The season being looked at: the child's own by default, any other on request (a parent
  // deciding whether to join wants the whole arc's cost up front, 6 September 2026).
  const [shownSeason, setShownSeason] = useState(seasonId);
  const own = shownSeason === seasonId;
  const items = useMemo(() => seasonShoppingList(content, shownSeason, own ? currentWeek : 0), [content, shownSeason, own, currentWeek]);
  const arc = useMemo(() => arcTotals(content, seasonIds), [content, seasonIds]);
  const arcTotal = arc.reduce((sum, s) => sum + s.total, 0);
  const boughtSet = useMemo(() => new Set(household?.boughtMaterials ?? []), [household]);
  const total = useMemo(() => totalApproxUsd(items), [items]);

  const toggle = useCallback(
    (key: string, bought: boolean) => {
      void setMaterialBought(householdId, key, bought);
    },
    [householdId],
  );

  const now = items.filter((i) => i.bucket === "now");
  const soon = items.filter((i) => i.bucket === "soon");
  const later = items.filter((i) => i.bucket === "later");

  return (
    <Card tone="surface" shadow className="pr-shopping" aria-labelledby="shopping-heading">
      <p className="tr-eyebrow" id="shopping-heading">
        What you need, season by season
      </p>
      <p className="pr-shopping__arc">
        All four seasons together come to about ${arcTotal}, spread over the year. Each season lists what it needs and
        roughly what it costs.
      </p>
      <div className="pr-shopping__seasons" role="tablist" aria-label="Season">
        {arc.map((s) => (
          <button
            key={s.seasonId}
            type="button"
            role="tab"
            aria-selected={s.seasonId === shownSeason}
            className={s.seasonId === shownSeason ? "pr-shopping__season pr-shopping__season--on" : "pr-shopping__season"}
            onClick={() => setShownSeason(s.seasonId)}
          >
            Season {s.seasonId}
            <span className="pr-shopping__season-cost">about ${s.total}</span>
          </button>
        ))}
      </div>
      {items.length === 0 ? <EmptyState title="Nothing listed yet" description="This season has not listed any materials yet." /> : null}
      <p className="pr-shopping__total">
        {own
          ? `About $${total} for this season. Tick items off as you buy them.`
          : `About $${total} for season ${shownSeason}, listed by the week each item is first needed.`}
      </p>

      {now.length > 0 ? (
        <section aria-labelledby="shopping-now">
          <p className="pr-shopping__section-label" id="shopping-now">
            Needed now
          </p>
          <BucketRows items={now} boughtSet={boughtSet} onToggle={toggle} />
        </section>
      ) : null}

      {soon.length > 0 ? (
        <section aria-labelledby="shopping-soon">
          <p className="pr-shopping__section-label pr-shopping__section-label--flag" id="shopping-soon">
            Buy soon
          </p>
          <p className="pr-shopping__section-note">
            Needed within the next {SHOPPING_WARNING_WEEKS} weeks. Order now so it arrives in time.
          </p>
          <BucketRows items={soon} boughtSet={boughtSet} onToggle={toggle} />
        </section>
      ) : null}

      {later.length > 0 ? (
        <details className="pr-shopping__later">
          <summary>
            {later.length} more, later this season
          </summary>
          <BucketRows items={later} boughtSet={boughtSet} onToggle={toggle} />
        </details>
      ) : null}
    </Card>
  );
}
