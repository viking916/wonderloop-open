"use client";

import { Card } from "@/components/ui/Card";
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
      <main className="mx-auto w-full max-w-[760px] px-4 py-6 sm:px-6">
        <Card tone="surface" shadow className="!p-0">
          <div className="tr-quest__main ld-main">
            <LadderSession key={`${householdId}:${profile.id}`} householdId={householdId} profileId={profile.id} />
          </div>
        </Card>
      </main>
    </div>
  );
}
