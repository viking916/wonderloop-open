"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequireProfile } from "@/components/RequireProfile";
import { Hill } from "@/components/sprout/Hill";
import { ParentGate } from "@/components/sprout/ParentGate";
import { Star } from "@/components/sprout/Star";
import { getSproutWeek } from "@/lib/content/app-content";
import { capReached, starsForWeek } from "@/lib/domain/sprout";
import { currentWeekFromDone } from "@/lib/domain/calendar";
import { doneActivityIds, watchProgress, watchScreenTimeToday } from "@/lib/data/progress";
import type { ProgressDoc } from "@/lib/data/types";
import { useSession, type Profile } from "@/lib/session";
import { useSpeak } from "@/components/sprout/useSpeak";

/**
 * Which of the twelve Sprout weeks are done for this profile (owner decision, 13 September
 * 2026: a week is bounded by finishing it, not by a date): every activity in that week done,
 * the same doneActivityIds rule the Hill and the Parent view's SproutCard already use to draw
 * stars. A week with no authored activities counts as not done, same as nothing having started.
 */
function computeDoneByWeek(seasonId: number, progressDocs: Record<string, ProgressDoc>): boolean[] {
  const doneByWeek: boolean[] = [];
  for (let week = 1; week <= 12; week++) {
    const weekContent = getSproutWeek(seasonId, week);
    if (!weekContent || weekContent.activities.length === 0) {
      doneByWeek.push(false);
      continue;
    }
    const doneIds = doneActivityIds(weekContent.activities, progressDocs);
    doneByWeek.push(doneIds.size === weekContent.activities.length);
  }
  return doneByWeek;
}

/**
 * Sprout home (spec 7.1 screen 7, design demo "Screen 4"): the sky-and-hill scene, no text a
 * child must read, and the daily 15-minute cap's "all done for today" screen when it is
 * reached. Guarded the same way every profile-scoped route is (RequireProfile).
 */
export default function SproutPage() {
  return <RequireProfile kind="sprout">{(profile) => <SproutWithHousehold profile={profile} />}</RequireProfile>;
}

function SproutWithHousehold({ profile }: { profile: Profile }) {
  const { householdId } = useSession();
  // Invariant: session.tsx never sets status "ready" without a householdId (see the same
  // pattern in app/explorer/page.tsx).
  if (!householdId) return null;
  return <SproutHome key={`${householdId}:${profile.id}`} profile={profile} householdId={householdId} />;
}

function SproutHome({ profile, householdId }: { profile: Profile; householdId: string }) {
  const router = useRouter();
  const { setActiveProfile } = useSession();
  const { speak } = useSpeak();

  const [progressDocs, setProgressDocs] = useState<Record<string, ProgressDoc>>({});
  const [minutesToday, setMinutesToday] = useState(0);

  useEffect(() => {
    const unsubProgress = watchProgress(householdId, profile.id, (list) => {
      setProgressDocs(Object.fromEntries(list.map((p) => [p.questId, p.progress])));
    });
    const unsubScreenTime = watchScreenTimeToday(householdId, profile.id, setMinutesToday);
    return () => {
      unsubProgress();
      unsubScreenTime();
    };
  }, [householdId, profile.id]);

  // The current week is which of the twelve is done, not which date it is (owner decision, 13
  // September 2026): see computeDoneByWeek above.
  const doneByWeek = useMemo(() => computeDoneByWeek(profile.seasonId, progressDocs), [profile.seasonId, progressDocs]);
  const currentWeek = useMemo(() => currentWeekFromDone(doneByWeek), [doneByWeek]);
  const week = useMemo(() => getSproutWeek(profile.seasonId, currentWeek), [profile.seasonId, currentWeek]);

  // capReached only depends on minutesToday (never on `week`), so it is computed here, above
  // the `!week` early return below, and the speech effect that follows can stay an
  // unconditional hook call instead of living after a conditional return.
  const capped = capReached(minutesToday);

  // The daily-limit screen (spec 6/2's "no reading") speaks itself the moment the cap is
  // (re)reached -- not on every unrelated re-render of this component, hence the [capped]-only
  // dependency -- in the same warm register as the rest of Sprout's spoken lines.
  useEffect(() => {
    if (capped) speak("That is all for today. See you tomorrow.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capped]);

  if (!week) {
    return (
      <div className="sp-world sp-world--empty">
        <EmptyState title="No activities yet" description="This week's Sprout activities have not been added yet." />
      </div>
    );
  }

  const doneIds = doneActivityIds(week.activities, progressDocs);
  const stars = starsForWeek(week.activities.map((a) => doneIds.has(a.id)));

  // Clearing the active profile (not just navigating to "/") is what actually lands a parent on
  // the profile picker: RequireProfile (components/RequireProfile.tsx) watches activeProfile and
  // redirects to "/" itself once it is gone, the same pattern SwitchProfileButton.tsx uses. The
  // previous `router.push("/")` alone left activeProfile set, so app/page.tsx's own redirect
  // (routing a ready session with an active profile straight back to its ROUTE_BY_KIND) bounced
  // the parent right back to /sprout -- a dead loop.
  const parentGate = (
    <ParentGate parentCard={week.parentCard} householdId={householdId} onExit={() => setActiveProfile(undefined)} />
  );

  if (capped) {
    return (
      <div className="sp-world sp-cap">
        <div className="sp-cap__card">
          <Star earned size={72} />
          <p className="sp-cap__label" aria-label="All done for today. Come back tomorrow.">
            All done for today
          </p>
        </div>
        <div className="sp-foot">{parentGate}</div>
      </div>
    );
  }

  return (
    <Hill
      activities={week.activities}
      doneIds={doneIds}
      stars={stars}
      onOpenActivity={(activityId) => router.push(`/sprout/activity/${activityId}`)}
      parentGate={parentGate}
    />
  );
}
