"use client";

import { useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { ConfirmResetButton } from "@/components/parent/ResetControls";
import { getWeek } from "@/lib/content/app-content";
import { problemsOf } from "@/lib/content/lookup";
import { TRACK_LABEL, type Quest } from "@/lib/content/schema";
import { questsForProfile } from "@/lib/domain/tracks";
import { questTimeLabel } from "@/lib/domain/questTime";
import { buildSkillInputs } from "@/lib/data/skills-recompute";
import { resetQuest } from "@/lib/data/resets";
import { useSession, type Profile } from "@/lib/session";

export type QuestResetsProps = {
  profile: Profile;
  householdId: string;
  /** The selected child's own current week (app/parent/page.tsx's weekByProfileId), the same
   * source WeekPlan reads its quests from. */
  currentWeek: number;
};

/**
 * Settings > Resets: one confirm-guarded reset per quest in the selected child's current week
 * (polish pass, 15 September 2026: this used to sit inside WeekPlan's own row, one destructive
 * button beside Open as Explorer on every one of the week's four quests, crowding the row and
 * making the progress bar's width vary with how many controls shared the row). Same confirm
 * copy WeekPlan used to show; Explorer only (a Sprout week has no quests to reset one at a time
 * -- see ResetControls' own whole-week/whole-season scope, which already covers Sprout).
 *
 * Debugged 15 September 2026: tone="kraft" here (kraft-on-kraft, since this sits on the Settings
 * tab's own kraft ground) made this card look unlike every other settings card, which are all
 * tone="surface". See ResetControls' own note: the destructive tier already reads from the
 * button and dialog, not the card background.
 */
export function QuestResets({ profile, householdId, currentWeek }: QuestResetsProps) {
  const { user } = useSession();
  const uid = user?.uid ?? "unknown";

  const resetOneQuest = useCallback(
    async (quest: Quest) => {
      const problemIds = quest.steps.flatMap((s) => problemsOf(s).map((p) => p.id));
      const inputs = await buildSkillInputs(householdId, profile.id);
      await resetQuest(householdId, profile.id, quest.id, problemIds, uid, inputs);
    },
    [householdId, profile.id, uid],
  );

  if (profile.kind !== "explorer") return null;
  const weekQuests = questsForProfile(getWeek(profile.seasonId, currentWeek), profile);
  const quests = Object.values(weekQuests).filter((q): q is Quest => Boolean(q));
  if (quests.length === 0) return null;

  return (
    <Card tone="surface" className="pr-quest-resets" aria-labelledby={`quest-resets-${profile.id}`}>
      <p className="tr-eyebrow" id={`quest-resets-${profile.id}`}>
        Reset a single quest, week {currentWeek}
      </p>
      <ul className="pr-quest-resets__list">
        {quests.map((quest) => (
          <li key={quest.id} className="pr-quest-resets__row">
            <div>
              <p className="tr-meta">{TRACK_LABEL[quest.track]} · {questTimeLabel(quest)}</p>
              <h4>{quest.title}</h4>
            </div>
            <ConfirmResetButton
              label="Reset this quest"
              detail={`This deletes every attempt for "${quest.title}" (week ${quest.week}) and clears its mistake-box entries. The Maker's Log and any artifacts are kept, but will be marked as being from before this reset. A record of this reset is kept.`}
              onConfirm={() => resetOneQuest(quest)}
              successMessage={() => `${quest.title} has been reset.`}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
