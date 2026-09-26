// Pure helpers for adding a new profile to a household (task 9 feature 2). No Firestore --
// components/parent/ProfileManager.tsx builds a lib/data/households.ts NewProfile from these,
// and createProfile takes the exact shape they produce.

import type { ProfileDoc, ProfileKind } from "../data/types";

export type InheritedProfileFields = Pick<ProfileDoc, "seasonId" | "look">;

// Matches session.tsx's ASSUMED_SEASON_1_START/"trail" default. Used only if a household
// somehow has no existing profile to inherit from at all -- defensive: the screen that calls
// this is itself gated behind an existing parent profile (RequireProfile, ParentPinGate), so in
// practice `existing` always has at least that one profile.
const FALLBACK_SEASON_FIELDS: InheritedProfileFields = { seasonId: 1, look: "trail" };

/**
 * A new sibling profile inherits seasonId, startDate and look from an existing profile in the
 * household (task brief: "so a new child lands on the same week as their sibling"), rather than
 * asking the parent to re-enter values the household already has. Prefers an existing
 * explorer/sprout profile over the parent profile, since those are the profiles a season
 * actually plays out on, but falls back to whatever profile exists so this never has nothing to
 * inherit from as long as the household has any profile at all.
 */
export function inheritedProfileFields(existing: ProfileDoc[]): InheritedProfileFields {
  const source = existing.find((p) => p.kind === "explorer" || p.kind === "sprout") ?? existing[0];
  if (!source) return FALLBACK_SEASON_FIELDS;
  // Owner decision, 6 September 2026: seasons and their clocks belong to the individual
  // profile. A new child starts season 1, and their week clock starts on their own first step;
  // only the look is shared with the household.
  return { seasonId: 1, look: source.look };
}

const AVATAR_PALETTE: Record<ProfileKind, readonly string[]> = {
  explorer: ["fox", "deer", "otter", "hawk"],
  sprout: ["rabbit", "duckling", "fawn", "chick"],
  parent: ["owl"],
};

/**
 * Picks an avatar id for a new profile of the given kind, preferring one not already used by
 * another profile of the same kind in the household, falling back to the palette's first entry
 * once every option is taken. Nothing in the app renders `avatar` visually yet -- every tile
 * shows initials instead (lib/session.tsx's profileInitials) -- so this only needs to produce a
 * value that fits ProfileDoc's shape, not a value the parent chose; a small per-kind palette
 * just keeps two siblings of the same kind from carrying an identical value for no reason.
 */
export function avatarForNewProfile(kind: ProfileKind, existing: ProfileDoc[]): string {
  const used = new Set(existing.filter((p) => p.kind === kind).map((p) => p.avatar));
  const palette = AVATAR_PALETTE[kind];
  return palette.find((a) => !used.has(a)) ?? palette[0];
}
