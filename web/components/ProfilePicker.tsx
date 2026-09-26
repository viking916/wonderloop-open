"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useDelayedPending } from "@/lib/pendingTiming";
import { profileInitials, useSession, type Profile } from "@/lib/session";

const KIND_LABEL: Record<Profile["kind"], string> = {
  explorer: "Explorer",
  sprout: "Sprout",
  parent: "Parent",
};

/** Spec 7.1 screen 1: Netflix-style profile tiles. Kids first, parent(s) last -- and the
 * parent tile is visibly distinct (forest fill with a sun ring, not the kids' colours).
 *
 * The very first tap a new family makes after sign-in (owner report: "nothing happens instantly
 * so it makes me feel like something is broken"). setActiveProfile itself is synchronous, but
 * what follows -- app/page.tsx's own redirect effect, then RequireProfile settling on the new
 * route -- is not, so a tapped tile needs its own pending state; these are plain <button>s, not
 * Button.tsx, so this reuses the same lib/pendingTiming.ts timing directly rather than inventing
 * a second anti-flicker rule. Only one tile can ever be "selecting" at a time, so a single
 * useDelayedPending call at the top (never inside the .map below, which would call a hook a
 * variable number of times) covers every tile. */
export function ProfilePicker() {
  const { profiles, setActiveProfile, signOut } = useSession();
  const [selectingId, setSelectingId] = useState<string | undefined>(undefined);
  const showIndicator = useDelayedPending(selectingId !== undefined);
  const ordered = [...profiles].sort((a, b) => {
    if (a.kind === b.kind) return 0;
    if (a.kind === "parent") return 1;
    if (b.kind === "parent") return -1;
    return 0;
  });

  function selectProfile(profile: Profile) {
    // Blocks a second tile activation once one is already under way, the same "ignore, never
    // disable" rule Button.tsx applies to a repeat click while pending.
    if (selectingId !== undefined) return;
    setSelectingId(profile.id);
    setActiveProfile(profile.id);
  }

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
          {ordered.map((profile) => {
            const isSelecting = selectingId === profile.id;
            const showSpinner = isSelecting && showIndicator;
            return (
              <button
                key={profile.id}
                type="button"
                className={`tr-tile tr-tile--${profile.kind === "parent" ? "parent" : "kid"}${isSelecting ? " tr-tile--pending" : ""}`}
                onClick={() => selectProfile(profile)}
                aria-busy={isSelecting ? "true" : undefined}
              >
                <span className="tr-tile__avatar" aria-hidden="true">
                  {/* Never greyed out or swapped for a disabled look (styleguide 1: a pending
                      control keeps its own tier's colour) -- the spinner replaces the initials in
                      place, on the tile's own full-colour fill. */}
                  {showSpinner ? <span className="tr-tile__spinner" /> : profileInitials(profile.name, 1)}
                </span>
                <span className="tr-tile__name">{profile.name}</span>
                {/* Polish pass, 15 September 2026: a family that names an Explorer profile
                    "Explorer" used to see the same word twice, once as the name and once as the
                    mono kind label right under it ("Explorer / EXPLORER"). Hide the kind line when
                    it is only repeating the name. */}
                {KIND_LABEL[profile.kind].toLowerCase() !== profile.name.trim().toLowerCase() ? (
                  <span className="tr-tile__kind">{KIND_LABEL[profile.kind]}</span>
                ) : null}
                <span className="sr-only" aria-live="polite">
                  {showSpinner ? "Loading" : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {/* This screen, not a child's screen (spec-driven ruling): the next person at the laptop
          may be someone else entirely, so signing out belongs where whoever is standing there
          picks who they are, not inside a kid's own quest screen. signOut() also clears the
          stored active profile, so the picker never silently reopens on the last person's tile. */}
      <Button
        variant="quiet"
        className="tr-picker__signout"
        onClick={() => void signOut()}
        disabled={selectingId !== undefined}
      >
        Sign out
      </Button>
    </div>
  );
}
