"use client";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { profileInitials, useSession, type Profile } from "@/lib/session";

const KIND_LABEL: Record<Profile["kind"], string> = {
  explorer: "Explorer",
  sprout: "Sprout",
  parent: "Parent",
};

/** Spec 7.1 screen 1: Netflix-style profile tiles. Kids first, parent(s) last -- and the
 * parent tile is visibly distinct (forest fill with a sun ring, not the kids' colours). */
export function ProfilePicker() {
  const { profiles, setActiveProfile, signOut } = useSession();
  const ordered = [...profiles].sort((a, b) => {
    if (a.kind === b.kind) return 0;
    if (a.kind === "parent") return 1;
    if (b.kind === "parent") return -1;
    return 0;
  });

  return (
    <div className="tr-picker">
      <p className="tr-eyebrow">Wonderloop</p>
      <h1 className="tr-picker__title">Who is using Wonderloop?</h1>
      {ordered.length === 0 ? (
        <EmptyState
          title="No profiles yet"
          description="Something went wrong setting up your household. Try signing out and back in."
        />
      ) : (
        <div className="tr-picker__grid">
          {ordered.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className={`tr-tile tr-tile--${profile.kind === "parent" ? "parent" : "kid"}`}
              onClick={() => setActiveProfile(profile.id)}
            >
              <span className="tr-tile__avatar" aria-hidden="true">
                {profileInitials(profile.name, 1)}
              </span>
              <span className="tr-tile__name">{profile.name}</span>
              <span className="tr-tile__kind">{KIND_LABEL[profile.kind]}</span>
            </button>
          ))}
        </div>
      )}
      {/* This screen, not a child's screen (spec-driven ruling): the next person at the laptop
          may be someone else entirely, so signing out belongs where whoever is standing there
          picks who they are, not inside a kid's own quest screen. signOut() also clears the
          stored active profile, so the picker never silently reopens on the last person's tile. */}
      <Button variant="quiet" className="tr-picker__signout" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}
