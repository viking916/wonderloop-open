"use client";

import { useCallback, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ConfirmResetButton } from "@/components/parent/ResetControls";
import { buildSkillInputs } from "@/lib/data/skills-recompute";
import { Star } from "@/components/sprout/Star";
import type { SproutWeek } from "@/lib/content/schema";
import { capReached, SPROUT_DAILY_CAP_MINUTES } from "@/lib/domain/sprout";
import { resetQuest } from "@/lib/data/resets";
import { useSession, type Profile } from "@/lib/session";

export type SproutCardProps = {
  profile: Profile;
  householdId: string;
  week: SproutWeek;
  doneIds: Set<string>;
  stars: 0 | 1 | 2 | 3;
  minutesToday: number;
};

/**
 * Sprout detail (spec 7.1 screen 8, task 13 brief): this week's parent card rendered in full
 * (title, minutes, the steps, the notice questions as a checklist), the week's three activities
 * and stars, and today's screen time against the 15-minute cap (lib/domain/sprout.ts's own
 * SPROUT_DAILY_CAP_MINUTES -- never a second, re-typed "15" here). The notice checklist is a
 * during-the-activity aid for the parent, not a tracked fact anywhere in the data model (spec 9
 * has no field for it), so ticking a box here is plain component state: useful while doing the
 * card together, not meant to survive a reload.
 */
export function SproutCard({ profile, householdId, week, doneIds, stars, minutesToday }: SproutCardProps) {
  const { user } = useSession();
  const uid = user?.uid ?? "unknown";
  const [noticed, setNoticed] = useState<boolean[]>(() => week.parentCard.notice.map(() => false));

  const toggleNotice = useCallback((i: number) => {
    setNoticed((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }, []);

  const resetActivity = useCallback(
    async (activityId: string) => {
      const inputs = await buildSkillInputs(householdId, profile.id);
      await resetQuest(householdId, profile.id, activityId, [], uid, inputs);
    },
    [householdId, profile.id, uid],
  );

  const overCap = capReached(minutesToday);

  return (
    <div className="pr-sprout">
      <Card tone="kraft" className="pr-sprout__card">
        <p className="tr-eyebrow">This week&apos;s parent card</p>
        <h3>{week.parentCard.title}</h3>
        <p className="pr-sprout__minutes">{week.parentCard.minutes} minutes together</p>
        <ol className="pr-sprout__steps">
          {week.parentCard.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <p className="pr-sprout__notice-label">Notice</p>
        <ul className="pr-sprout__notice">
          {week.parentCard.notice.map((n, i) => (
            <li key={i}>
              <label>
                <input type="checkbox" checked={noticed[i]} onChange={() => toggleNotice(i)} />
                {n}
              </label>
            </li>
          ))}
        </ul>
      </Card>

      <Card tone="surface" shadow className="pr-sprout__activities" aria-labelledby={`sprout-activities-${profile.id}`}>
        <p className="tr-eyebrow" id={`sprout-activities-${profile.id}`}>
          This week&apos;s activities
        </p>
        <div className="pr-sprout__stars" aria-label={`${stars} of 3 stars earned`}>
          {[0, 1, 2].map((i) => (
            <Star key={i} earned={i < stars} size={28} />
          ))}
        </div>
        <ul className="pr-weekplan__list">
          {week.activities.map((activity) => {
            const done = doneIds.has(activity.id);
            return (
              <li key={activity.id} className="pr-weekplan__row">
                <div className="pr-weekplan__row-main">
                  <h4>{activity.title}</h4>
                  <p className="pr-weekplan__meta">{activity.intro}</p>
                </div>
                <div className="pr-weekplan__row-actions">
                  <Chip>{done ? "Done" : "Not done"}</Chip>
                  <ConfirmResetButton
                    label="Reset this activity"
                    detail={`This deletes "${activity.title}"'s progress for ${profile.name}. A record of this reset is kept.`}
                    onConfirm={() => resetActivity(activity.id)}
                    successMessage={() => `${activity.title} has been reset.`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card tone="surface" shadow aria-labelledby={`sprout-screentime-${profile.id}`}>
        <p className="tr-eyebrow" id={`sprout-screentime-${profile.id}`}>
          Today&apos;s screen time
        </p>
        <p className={overCap ? "pr-sprout__cap pr-sprout__cap--over" : "pr-sprout__cap"}>
          {minutesToday} of {SPROUT_DAILY_CAP_MINUTES} minutes {overCap ? "(cap reached)" : ""}
        </p>
      </Card>
    </div>
  );
}
