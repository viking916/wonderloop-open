"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { setPractice, watchPractice } from "@/lib/data/practice";
import type { PracticeDoc } from "@/lib/data/types";
import { hasChessRows, hasPianoRow, hasPracticeCard, practiceDocId, type PracticeChoice } from "@/lib/domain/practice";

export type PracticeCardProps = {
  householdId: string;
  profileId: string;
  seasonId: number;
  /** The DISPLAYED week (This Week's own picker), not necessarily the real current week, so a
   * parent looking back at a past week can still tick what actually happened that week. */
  week: number;
  choice: PracticeChoice;
};

/**
 * Practice this week (23 September 2026, the owner's own words: "Keep piano lessons simple a
 * checkbox which says 30min piano practice per week. Add in ladder chess game on saturday and
 * sunday as checkbox... Im expecting [my child] to play atleast 2 chess games with me or on
 * chess.com per week as a practice."). Real checkboxes, large tap targets. Piano only when the
 * profile has the Play track on; chess is on by default for every Explorer profile and can be
 * turned off per profile in the Parent view (components/parent/ProfileManager.tsx). Renders
 * nothing when neither row applies.
 *
 * A box's checked state mirrors the watched Firestore document directly, the same shape
 * components/quest/TaskStep.tsx's own checklist already uses -- Firestore's local cache echoes a
 * write in well under 120ms (components/ui/Button.tsx's own doc comment on why a fast write never
 * even shows a spinner), so the press is answered the instant it lands without this component
 * needing a second, separately-tracked optimistic layer that could itself drift from what actually
 * saved.
 *
 * Deliberately does NOT gate the week: a week still ends when its quests are done (owner ruling,
 * 13 September 2026), never on a checkbox. Nothing here is read by computeDoneByWeek or
 * currentWeekFromDone -- a forgotten tick must never stall a child on an otherwise-finished week.
 * See lib/domain/practice.ts's own header for the same rule, stated where the pure logic lives.
 */
export function PracticeCard({ householdId, profileId, seasonId, week, choice }: PracticeCardProps) {
  const docId = useMemo(() => practiceDocId(seasonId, week), [seasonId, week]);
  const [doc, setDoc] = useState<PracticeDoc | undefined>(undefined);
  useEffect(() => watchPractice(householdId, profileId, docId, setDoc), [householdId, profileId, docId]);

  if (!hasPracticeCard(choice)) return null;

  const piano = hasPianoRow(choice);
  const chess = hasChessRows(choice);

  function toggle(field: "piano" | "chessSat" | "chessSun", checked: boolean) {
    void setPractice(householdId, profileId, docId, { [field]: checked });
  }

  return (
    <Card tone="surface" className="tr-practice-card" aria-labelledby={`practice-${profileId}`}>
      <p className="tr-eyebrow" id={`practice-${profileId}`}>Practice this week</p>
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
