"use client";

import { Header } from "@/components/ui/Header";
import { RequireProfile } from "@/components/RequireProfile";
import { SwitchProfileButton } from "@/components/SwitchProfileButton";
import { ExplorerNav } from "@/components/explorer/ExplorerNav";
import { LadderSession } from "@/components/ladder/LadderSession";
import { profileInitials, useSession, type Profile } from "@/lib/session";

/** The Ladder (docs/superpowers/specs/2026-09-08-math-ladder-design.md): the child's screen. */
export default function LadderPage() {
  return <RequireProfile kind="explorer">{(profile) => <LadderWithHousehold profile={profile} />}</RequireProfile>;
}

function LadderWithHousehold({ profile }: { profile: Profile }) {
  const { householdId } = useSession();
  if (!householdId) return null;
  return (
    <div className="flex flex-col flex-1">
      <Header
        userName={profile.name}
        initials={profileInitials(profile.name)}
        rightSlot={
          <>
            <ExplorerNav current="ladder" />
            <SwitchProfileButton />
          </>
        }
      />
      <main className="tr-page">
        {/* Laptop-width polish, round 2 (15 September 2026): the surface card used to be fixed
            here, always at .tr-page's full width -- fine for the plan and round screens, but the
            single-message break screen read as empty inside a 1360px box. LadderSession now owns
            its own card per phase (see its own comment), narrower and centred for that one
            screen. */}
        <LadderSession key={`${householdId}:${profile.id}`} householdId={householdId} profileId={profile.id} />
      </main>
    </div>
  );
}
