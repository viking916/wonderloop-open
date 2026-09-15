"use client";

import { Suspense, useMemo } from "react";
import { useParams } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { Header } from "@/components/ui/Header";
import { Button } from "@/components/ui/Button";
import { SwitchProfileButton } from "@/components/SwitchProfileButton";
import { RequireProfile } from "@/components/RequireProfile";
import { LoadingTrail } from "@/components/LoadingTrail";
import { QuestShell } from "@/components/quest/QuestShell";
import { getQuest } from "@/lib/content/app-content";
import { profileInitials, useSession, type Profile } from "@/lib/session";

/** /explorer/quest/[questId] (spec 7.1 screen 3). Guarded the same way This Week is
 * (RequireProfile kind="explorer"); the questId itself comes from the URL, not from session
 * state, so a direct link or a refresh always resolves the same quest. */
export default function QuestPage() {
  return <RequireProfile kind="explorer">{(profile) => <QuestPageContent profile={profile} />}</RequireProfile>;
}

function QuestPageContent({ profile }: { profile: Profile }) {
  const { householdId } = useSession();
  const params = useParams<{ questId: string }>();
  const questId = params.questId;
  const quest = useMemo(() => getQuest(questId), [questId]);

  // Invariant: RequireProfile never renders children before status is "ready", which always
  // carries a householdId (see lib/session.tsx) -- kept as a type-narrowing guard, not a
  // real-world fallback.
  if (!householdId) return null;

  if (!quest) {
    return (
      <div className="flex flex-col flex-1">
        <Header userName={profile.name} initials={profileInitials(profile.name)} rightSlot={<SwitchProfileButton />} />
        <main className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-6">
          <EmptyState
            title="Quest not found"
            description="This quest does not exist, or has not been added yet."
            action={
              <Button variant="primary" href="/explorer">
                Back to This Week
              </Button>
            }
          />
        </main>
      </div>
    );
  }

  return (
    <Suspense fallback={<LoadingTrail />}>
      <QuestShell key={`${householdId}:${profile.id}:${quest.id}`} quest={quest} profile={profile} householdId={householdId} />
    </Suspense>
  );
}
