// Unit tests for session.tsx's onAuthStateChanged handler, factored out as handleAuthEvent so
// it can be driven here with fake callbacks and a fake bootstrapping ref -- no React rendering,
// no DOM, no real Firebase Auth (this suite runs under vitest.config.ts's plain "node"
// environment, the same one every other lib/**/*.test.ts file uses).
//
// Covers Critical bug #2 from the task-6 review: a repeated onAuthStateChanged callback for a
// uid that is already bootstrapped used to call setStatus("loading") unconditionally before the
// bootstrapping-ref guard, and the guard's early return never restored "ready" -- permanently
// stranding the app on the loading screen. Ordinary under cross-tab auth broadcasts, which fire
// a fresh callback for a uid that is already signed in on this tab.

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { User } from "firebase/auth";

vi.mock("./data/households", () => ({
  getHouseholdForUser: vi.fn(),
  createHousehold: vi.fn(),
  createProfile: vi.fn(),
  listProfiles: vi.fn(),
}));

// Task 3b: handleAuthEvent checks the allowlist before it ever touches households.ts. Mocked
// separately so every existing test in this file (none of which is about the allowlist) can
// default to "allowed" in beforeEach below, and the new "not allowlisted" tests can override it.
vi.mock("./data/allowlist", () => ({
  isEmailAllowed: vi.fn(),
}));

import { getHouseholdForUser, createHousehold, createProfile, listProfiles } from "./data/households";
import { isEmailAllowed } from "./data/allowlist";
import { BOOTSTRAP_ERROR_MESSAGE, handleAuthEvent, type AuthEventCallbacks, type SessionStatus, acceptTermsAndCreate, TERMS_VERSION } from "./session";

const mockGetHouseholdForUser = vi.mocked(getHouseholdForUser);
const mockCreateHousehold = vi.mocked(createHousehold);
const mockCreateProfile = vi.mocked(createProfile);
const mockListProfiles = vi.mocked(listProfiles);
const mockIsEmailAllowed = vi.mocked(isEmailAllowed);

function fakeUser(uid: string, email = "parent@example.test"): User {
  return { uid, displayName: "Test Parent", email } as User;
}

/** A fresh set of vi.fn() callbacks plus a fresh bootstrapping ref, and a way to read back
 * exactly what setStatus was called with, in order -- the thing Critical bug #2 got wrong. */
function fakeCallbacks() {
  const bootstrapping: { current: string | undefined } = { current: undefined };
  const statusCalls: SessionStatus[] = [];
  const cb: AuthEventCallbacks = {
    bootstrapping,
    setUser: vi.fn(),
    setHouseholdId: vi.fn(),
    setProfiles: vi.fn(),
    setActiveProfileId: vi.fn(),
    setStatus: vi.fn((s: SessionStatus) => statusCalls.push(s)),
    setError: vi.fn(),
    readStoredActiveProfileId: vi.fn(() => undefined),
  };
  return { bootstrapping, cb, statusCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Every existing describe block below is about the bootstrap/guard logic, not the allowlist
  // gate itself -- default to "allowed" so they exercise exactly what they did before Task 3b.
  // The "not allowlisted" block overrides this per test.
  mockIsEmailAllowed.mockResolvedValue(true);
});

describe("handleAuthEvent: repeated callback for an already-bootstrapped uid", () => {
  it("leaves status at ready and touches nothing else", async () => {
    mockGetHouseholdForUser.mockResolvedValue({
      hid: "home-uid1",
      household: { name: "Home", ownerUid: "uid1", memberUids: ["uid1"], inviteCode: "ABCDEF", createdAt: 1 },
    });
    mockListProfiles.mockResolvedValue([
      { pid: "p1", profile: { name: "Parent", kind: "parent", avatar: "parent", birthYear: 1990, seasonId: 1, startDate: "2026-09-07", look: "trail" } },
    ]);

    const { cb, statusCalls } = fakeCallbacks();
    const user = fakeUser("uid1");

    await handleAuthEvent(user, cb);
    expect(statusCalls).toEqual(["loading", "ready"]);
    expect(cb.setStatus).toHaveBeenCalledTimes(2);

    // A second callback for the very same uid -- e.g. a cross-tab auth broadcast, or React
    // strict mode's dev-only resubscribe -- must not call setStatus again at all: not
    // "loading" (the bug), and not a redundant "ready" either.
    vi.mocked(cb.setStatus).mockClear();
    vi.mocked(cb.setUser).mockClear();
    await handleAuthEvent(user, cb);

    expect(cb.setStatus).not.toHaveBeenCalled();
    expect(cb.setUser).not.toHaveBeenCalled();
    // The real regression check: status must still read as "ready" from the caller's point of
    // view. This suite has no live React state to inspect, so it checks the thing that actually
    // determines status in the app: setStatus was never called with anything else since the
    // first "ready".
    expect(statusCalls).toEqual(["loading", "ready"]);

    // Only the winning (first) callback did any bootstrap work.
    expect(mockGetHouseholdForUser).toHaveBeenCalledTimes(1);
    expect(mockListProfiles).toHaveBeenCalledTimes(1);
  });

  it("a fresh uid with no household stops at consent and creates nothing until the terms are accepted", async () => {
    mockGetHouseholdForUser.mockResolvedValue(null);
    mockCreateHousehold.mockResolvedValue({ hid: "home-uid2", inviteCode: "GHIJKL", created: true });
    mockCreateProfile.mockResolvedValue("p2");
    mockListProfiles.mockResolvedValue([]);

    const { cb, statusCalls } = fakeCallbacks();
    await handleAuthEvent(fakeUser("uid2"), cb);

    expect(statusCalls).toEqual(["loading", "consent"]);
    expect(mockCreateHousehold).not.toHaveBeenCalled();

    await acceptTermsAndCreate(fakeUser("uid2"), cb, 1_700_000_000_000);
    expect(statusCalls).toEqual(["loading", "consent", "loading", "ready"]);
    expect(mockCreateHousehold).toHaveBeenCalledTimes(1);
    expect(mockCreateHousehold.mock.calls[0][2]).toEqual({ termsVersion: TERMS_VERSION, termsAcceptedAt: 1_700_000_000_000 });
    expect(mockCreateProfile).toHaveBeenCalledTimes(1);
  });
});

describe("handleAuthEvent: bootstrap failure", () => {
  it("sets signed-out and a family-facing error message, and resets the bootstrapping ref for a retry", async () => {
    mockGetHouseholdForUser.mockRejectedValue(new Error("network-request-failed"));

    const { cb, bootstrapping, statusCalls } = fakeCallbacks();
    await handleAuthEvent(fakeUser("uid3"), cb);

    expect(statusCalls).toEqual(["loading", "signed-out"]);
    expect(cb.setError).toHaveBeenLastCalledWith(BOOTSTRAP_ERROR_MESSAGE);
    expect(bootstrapping.current).toBeUndefined();
  });
});

describe("handleAuthEvent: not allowlisted", () => {
  it("blocks a signed-in user whose address has no allowedEmails document, and creates nothing", async () => {
    mockIsEmailAllowed.mockResolvedValue(false);

    const { cb, statusCalls } = fakeCallbacks();
    const user = fakeUser("uid5", "stranger@example.test");
    await handleAuthEvent(user, cb);

    expect(statusCalls).toEqual(["loading", "blocked"]);
    expect(mockIsEmailAllowed).toHaveBeenCalledWith("stranger@example.test");
    expect(cb.setUser).toHaveBeenCalledWith(user);
    expect(cb.setHouseholdId).toHaveBeenCalledWith(undefined);
    expect(cb.setProfiles).toHaveBeenCalledWith([]);
    expect(cb.setActiveProfileId).toHaveBeenCalledWith(undefined);
    expect(cb.setError).toHaveBeenCalledWith(undefined);
    // The whole point: a blocked address must never reach the household bootstrap path.
    expect(mockGetHouseholdForUser).not.toHaveBeenCalled();
    expect(mockCreateHousehold).not.toHaveBeenCalled();
    expect(mockCreateProfile).not.toHaveBeenCalled();
    expect(mockListProfiles).not.toHaveBeenCalled();
  });

  it("a later auth event for the same uid, once allowed, still bootstraps (the guard resets like any other retry)", async () => {
    mockIsEmailAllowed.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockGetHouseholdForUser.mockResolvedValue({
      hid: "home-uid6",
      household: { name: "Home", ownerUid: "uid6", memberUids: ["uid6"], inviteCode: "MNOPQR", createdAt: 1 },
    });
    mockListProfiles.mockResolvedValue([]);

    const { cb, bootstrapping, statusCalls } = fakeCallbacks();
    const user = fakeUser("uid6");
    await handleAuthEvent(user, cb);
    expect(statusCalls).toEqual(["loading", "blocked"]);

    // handleAuthEvent's guard is per-callback-for-this-uid, not "blocked forever": clearing it
    // (as sign-out and a real retry both do) and firing again picks the allowlist back up.
    bootstrapping.current = undefined;
    await handleAuthEvent(user, cb);
    expect(statusCalls).toEqual(["loading", "blocked", "loading", "ready"]);
  });
});

describe("handleAuthEvent: sign-out", () => {
  it("clears session state, the error and the bootstrapping ref", async () => {
    const { cb, bootstrapping } = fakeCallbacks();
    bootstrapping.current = "uid4";

    await handleAuthEvent(null, cb);

    expect(cb.setStatus).toHaveBeenCalledWith("signed-out");
    expect(cb.setUser).toHaveBeenCalledWith(undefined);
    expect(cb.setHouseholdId).toHaveBeenCalledWith(undefined);
    expect(cb.setProfiles).toHaveBeenCalledWith([]);
    expect(cb.setActiveProfileId).toHaveBeenCalledWith(undefined);
    expect(cb.setError).toHaveBeenCalledWith(undefined);
    expect(bootstrapping.current).toBeUndefined();
  });
});
