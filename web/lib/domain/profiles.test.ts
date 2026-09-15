import { describe, it, expect } from "vitest";
import { avatarForNewProfile, inheritedProfileFields } from "./profiles";
import type { ProfileDoc } from "../data/types";

function profile(overrides: Partial<ProfileDoc>): ProfileDoc {
  return {
    name: "Explorer", kind: "explorer", avatar: "fox", birthYear: 2017,
    seasonId: 1, startDate: "2026-09-07", look: "trail",
    ...overrides,
  };
}

describe("inheritedProfileFields", () => {
  it("inherits only the look from an existing explorer profile: a new child starts season 1 on their own clock", () => {
    const parent = profile({ kind: "parent", name: "Parent", seasonId: 1, startDate: "2026-09-07", look: "trail" });
    const explorer = profile({ kind: "explorer", name: "Explorer", seasonId: 2, startDate: "2026-11-30", look: "workbench" });
    const result = inheritedProfileFields([parent, explorer]);
    expect(result).toEqual({ seasonId: 1, look: "workbench" });
  });

  it("prefers a sprout profile over the parent profile when there is no explorer", () => {
    const parent = profile({ kind: "parent", name: "Parent", seasonId: 1, startDate: "2026-09-07", look: "trail" });
    const sprout = profile({ kind: "sprout", name: "Sprout", seasonId: 3, startDate: "2027-02-15", look: "circuit" });
    const result = inheritedProfileFields([parent, sprout]);
    expect(result).toEqual({ seasonId: 1, look: "circuit" });
  });

  it("falls back to the parent profile when it is the only profile in the household", () => {
    const parent = profile({ kind: "parent", name: "Parent", seasonId: 1, startDate: "2026-09-07", look: "trail" });
    const result = inheritedProfileFields([parent]);
    expect(result).toEqual({ seasonId: 1, look: "trail" });
  });

  it("falls back to a fixed default when there is no profile at all to inherit from", () => {
    const result = inheritedProfileFields([]);
    expect(result).toEqual({ seasonId: 1, look: "trail" });
  });
});

describe("avatarForNewProfile", () => {
  it("picks an avatar not already used by another profile of the same kind", () => {
    const existing = [profile({ kind: "explorer", name: "Explorer", avatar: "fox" })];
    const avatar = avatarForNewProfile("explorer", existing);
    expect(avatar).not.toBe("fox");
    expect(["deer", "otter", "hawk"]).toContain(avatar);
  });

  it("ignores avatars used by a different kind of profile", () => {
    const existing = [profile({ kind: "sprout", name: "Sprout", avatar: "fox" })];
    const avatar = avatarForNewProfile("explorer", existing);
    expect(avatar).toBe("fox");
  });

  it("falls back to the palette's first entry once every option is taken", () => {
    const existing = ["fox", "deer", "otter", "hawk"].map((avatar) => profile({ kind: "explorer", avatar }));
    expect(avatarForNewProfile("explorer", existing)).toBe("fox");
  });
});
