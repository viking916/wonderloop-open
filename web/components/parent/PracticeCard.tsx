"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { setPractice, watchPractice } from "@/lib/data/practice";
import type { PracticeDoc } from "@/lib/data/types";
import {
  hasChessRows,
  hasPianoRow,
  hasPracticeCard,
  practiceDocId,
  practiceSummary,
  type PracticeChoice,
} from "@/lib/domain/practice";

export type PracticeCardProps = {
  householdId: string;
  profileId: string;
  seasonId: number;
  /** The child's real CURRENT week (never a jumped/displayed week -- the Parent view has no week
   * picker), the same value app/parent/page.tsx's ExplorerChildSection already computes. */
  currentWeek: number;
  choice: PracticeChoice;
};

/**
 * The Parent view's own Practice this week card (23 September 2026): the same two checkboxes
 * This Week shows the child, tickable by the parent too -- the chess games are played with a
 * parent or on chess.com, so a parent ticking them here is exactly how the owner described using
 * this ("Im expecting [my child] to play atleast 2 chess games with me"). Always the child's real
 * current week; unlike This Week's own card there is no week picker here to look back with.
 * Renders nothing for a profile with neither row on, and is never mounted for a Sprout profile at
 * all (app/parent/page.tsx only renders it inside ExplorerChildSection).
 *
 * Shares its Firestore layer and pure logic with components/explorer/PracticeCard.tsx
 * (lib/data/practice.ts, lib/domain/practice.ts) so a tick made by either the child or the
 * parent is the exact same document and can never disagree with the other view.
 */
export function PracticeCard({ householdId, profileId, seasonId, currentWeek, choice }: PracticeCardProps) {
  const docId = useMemo(() => practiceDocId(seasonId, currentWeek), [seasonId, currentWeek]);
  const [doc, setDoc] = useState<PracticeDoc | undefined>(undefined);
  useEffect(() => watchPractice(householdId, profileId, docId, setDoc), [householdId, profileId, docId]);

  if (!hasPracticeCard(choice)) return null;

  const piano = hasPianoRow(choice);
  const chess = hasChessRows(choice);

  function toggle(field: "piano" | "chessSat" | "chessSun", checked: boolean) {
    void setPractice(householdId, profileId, docId, { [field]: checked });
  }

  return (
    <Card tone="surface" shadow className="pr-practice" aria-labelledby={`pr-practice-${profileId}`}>
      <p className="tr-eyebrow" id={`pr-practice-${profileId}`}>Practice this week</p>
      <p className="tr-meta tr-practice-card__summary">{practiceSummary(choice, doc)}</p>
      <ul className="tr-practice-card__list">
        {piano ? (
          <li className="tr-practice-card__row">
            <label>
              <input
                type="checkbox"
                checked={doc?.piano === true}
                onChange={(e) => toggle("piano", e.target.checked)}
              />
              <span>30 minutes of piano practice this week</span>
            </label>
          </li>
        ) : null}
        {chess ? (
          <>
            <li className="tr-practice-card__row">
              <label>
                <input
                  type="checkbox"
                  checked={doc?.chessSat === true}
                  onChange={(e) => toggle("chessSat", e.target.checked)}
                />
                <span>Chess game on Saturday</span>
              </label>
            </li>
            <li className="tr-practice-card__row">
              <label>
                <input
                  type="checkbox"
                  checked={doc?.chessSun === true}
                  onChange={(e) => toggle("chessSun", e.target.checked)}
                />
                <span>Chess game on Sunday</span>
              </label>
            </li>
          </>
        ) : null}
      </ul>
      {chess ? <p className="tr-meta tr-practice-card__note">Two games a week, with a parent or on chess.com.</p> : null}
    </Card>
  );
}
