import { describe, it, expect } from "vitest";
import { resolveProjectId } from "../admin";
import { resolveProjectId as resolveClientProjectId } from "../client";

// Task 1 (plan 4): both lib/firebase/admin.ts and lib/firebase/client.ts fell back to the
// wonderloop-dev project id whenever the real project id variable was unset, even outside the
// emulator. In production that would silently point a real family's data at the wrong project
// with no error at all. Both now throw naming the missing variable unless emulated.
describe("resolveProjectId (admin)", () => {
  it("falls back to the dev project only when emulated", () => {
    expect(resolveProjectId(true)).toBe("wonderloop-dev");
  });

  it("throws rather than silently using the dev project when not emulated", () => {
    const saved = process.env.FIREBASE_PROJECT_ID;
    const savedGcp = process.env.GOOGLE_CLOUD_PROJECT;
    const savedGcloud = process.env.GCLOUD_PROJECT;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    try {
      expect(() => resolveProjectId(false)).toThrow(/FIREBASE_PROJECT_ID/);
    } finally {
      if (saved !== undefined) process.env.FIREBASE_PROJECT_ID = saved;
      if (savedGcp !== undefined) process.env.GOOGLE_CLOUD_PROJECT = savedGcp;
      if (savedGcloud !== undefined) process.env.GCLOUD_PROJECT = savedGcloud;
    }
  });
});

describe("resolveProjectId (client)", () => {
  it("falls back to the dev project only when emulated", () => {
    expect(resolveClientProjectId(true)).toBe("wonderloop-dev");
  });

  it("throws rather than silently using the dev project when not emulated", () => {
    const saved = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    try {
      expect(() => resolveClientProjectId(false)).toThrow(/NEXT_PUBLIC_FIREBASE_PROJECT_ID/);
    } finally {
      if (saved !== undefined) process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = saved;
    }
  });
});
