"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequireProfile } from "@/components/RequireProfile";
import { ActivityPlayer } from "@/components/sprout/ActivityPlayer";
import { getSproutActivity } from "@/lib/content/app-content";
import { useSession, type Profile } from "@/lib/session";

/**
 * /sprout/activity/[activityId] (spec 7.1 screen 7). The activity id in the URL carries its own
 * week (getSproutActivity parses it), so a direct link or a refresh always resolves the same
 * activity without any session state.
 */
export default function SproutActivityPage() {
  return <RequireProfile kind="sprout">{(profile) => <SproutActivityContent profile={profile} />}</RequireProfile>;
}

function SproutActivityContent({ profile }: { profile: Profile }) {
  const { householdId } = useSession();
  const params = useParams<{ activityId: string }>();
  const resolved = useMemo(() => getSproutActivity(params.activityId), [params.activityId]);

  // Invariant: RequireProfile only ever renders with a householdId (see app/sprout/page.tsx's
  // own comment on the same guard).
  if (!householdId) return null;

  if (!resolved) {
    return (
      <div className="sp-world sp-world--empty">
        <EmptyState
          title="Activity not found"
          description="This activity does not exist, or has not been added yet."
          action={
            <Button variant="primary" href="/sprout">
              Back to the hill
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <ActivityPlayer
      key={`${householdId}:${profile.id}:${resolved.activity.id}`}
      activity={resolved.activity}
      householdId={householdId}
      profileId={profile.id}
    />
  );
}
