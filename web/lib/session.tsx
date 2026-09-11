"use client";

// The session layer (spec 7.1 screen 1): who is signed in, which household they belong to,
// which profiles that household has, and which profile is active right now. Everything here
// is client-only (Firebase Auth's popup flow and localStorage both require a browser), and it
// is the one place that decides whether a signed-in user needs a household bootstrapped for
// them. Components never call firebase/auth or lib/data/households.ts directly for any of
// this; they call useSession().

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { getClientAuth } from "./firebase/client";
import { isEmailAllowed } from "./data/allowlist";
import {
  createHousehold,
  createProfile,
  getHouseholdForUser,
  listProfiles,
  type NewProfile,
} from "./data/households";
import type { ProfileDoc } from "./data/types";

export type Profile = ProfileDoc & { id: string };

// "blocked": Task 3b. A signed-in Google account whose address has no allowedEmails document.
// Authentication itself always succeeds; this status exists because authorisation did not.
// `user` is still set so the blocked screen can show which address they signed in as.
// "consent": allowlisted, signed in, and no household yet -- the parent reads the terms and the
// privacy notice and confirms they are a parent or guardian before the household is created.
export type SessionStatus = "loading" | "signed-out" | "blocked" | "consent" | "ready";

/** Bumped whenever the terms or the privacy notice change in substance; stored on the household. */
export const TERMS_VERSION = "2026-09-06";

export type Session = {
  status: SessionStatus;
  /** Set when a signed-in user's household could not be loaded or created (e.g. offline).
   * Cleared on the next sign-in attempt or the next successful bootstrap. SignIn shows it. */
  error?: string;
  user?: User;
  householdId?: string;
  profiles: Profile[];
  activeProfile?: Profile;
  /** Pass undefined to clear the active profile (the "Switch profile" control). */
  setActiveProfile: (id: string | undefined) => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Creates the household after the parent accepts the terms (status "consent"). */
  acceptTerms: () => Promise<void>;
  /**
   * Task 9 feature 2: re-fetches this household's profile list and replaces `profiles` with
   * it. `profiles` is otherwise only ever set once, from the auth-event bootstrap
   * (handleAuthEvent), so a profile created or renamed from the Parent view (ProfileManager)
   * would not otherwise appear anywhere else in the app -- the picker, the Header -- until the
   * next full sign-in. A no-op while there is no household yet.
   */
  refreshProfiles: () => Promise<void>;
};

const SessionContext = createContext<Session | undefined>(undefined);

// Spec 3: "Season 1 is assumed to start the week of 2026-09-07." The bootstrap parent profile
// is stamped with that assumed date; nothing in this task reads or edits it, so it is only ever
// a placeholder until a later profile-settings screen lets a household change it.

function activeProfileStorageKey(hid: string): string {
  return `wonderloop:activeProfile:${hid}`;
}

function readStoredActiveProfileId(hid: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage.getItem(activeProfileStorageKey(hid)) ?? undefined;
  } catch {
    // Private browsing / storage disabled: fall back to no persisted choice.
    return undefined;
  }
}

function writeStoredActiveProfileId(hid: string, id: string | undefined): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(activeProfileStorageKey(hid), id);
    else window.localStorage.removeItem(activeProfileStorageKey(hid));
  } catch {
    // Ignore: losing the persisted choice just means the next reload opens on the picker.
  }
}

/**
 * "John Smith" -> "The Smith household"; a single-word or empty display name -> "Home" (task
 * brief's own examples). Used only once, on first sign-in, to name the household this user is
 * about to create.
 */
export function householdNameFor(displayName: string | null | undefined): string {
  const words = (displayName ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return "Home";
  return `The ${words[words.length - 1]} household`;
}

/**
 * Initials for an avatar. maxLetters 1 gives the Netflix-tile "large initial" (spec 7.1);
 * maxLetters 2 gives the Header's compact two-letter avatar.
 */
export function profileInitials(name: string, maxLetters: 1 | 2 = 2): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (maxLetters === 1) return parts[0][0]!.toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[1]![0]).toUpperCase();
}

function newParentProfile(displayName: string | null | undefined): NewProfile {
  return {
    name: displayName?.trim() || "Parent",
    kind: "parent",
    avatar: "parent",
    // Google sign-in never reveals a birth year; this is a placeholder no screen reads yet
    // (see lib/data/types.ts's ProfileDoc -- nothing in the app derives logic from it today).
    birthYear: new Date().getFullYear() - 35,
    seasonId: 1,
    look: "trail",
  };
}

/** The family-facing message SignIn shows when a signed-in user's household could not be
 * loaded or created (Important bug: this used to fail silently, dropping the user back to a
 * bare sign-in screen with no explanation). */
export const BOOTSTRAP_ERROR_MESSAGE =
  "We could not reach your family's data. Check your connection and try again.";

/** The React state setters (and the one non-React ref) `handleAuthEvent` needs to react to an
 * auth event. Broken out as its own type, rather than inlined in SessionProvider, so the
 * handler below can be unit tested (lib/session.test.ts) without rendering a component. */
export type AuthEventCallbacks = {
  bootstrapping: { current: string | undefined };
  setUser: (user: User | undefined) => void;
  setHouseholdId: (hid: string | undefined) => void;
  setProfiles: (profiles: Profile[]) => void;
  setActiveProfileId: (id: string | undefined) => void;
  setStatus: (status: SessionStatus) => void;
  setError: (error: string | undefined) => void;
  readStoredActiveProfileId: (hid: string) => string | undefined;
};

/**
 * The onAuthStateChanged handler's actual logic, factored out of SessionProvider's effect so it
 * can be driven directly by a test with fake callbacks and a fake bootstrapping ref -- no
 * rendering, no DOM, no real Firebase Auth needed (see lib/session.test.ts). Exported only for
 * that; components must go through useSession(), never call this directly.
 *
 * onAuthStateChanged can fire more than once for the same uid (React strict mode's
 * subscribe/unsubscribe/resubscribe in dev, cross-tab auth broadcasts, or a stray extra event in
 * production). `cb.bootstrapping` is a ref checked-and-set synchronously, before any await, so
 * of any two callbacks racing for the same uid only the first actually runs the "does this
 * household exist yet" read and the household-creating write.
 *
 * The guard is checked FIRST, before any status transition. This used to be Critical bug #2:
 * `setStatus("loading")` ran unconditionally before the guard, and the early return for an
 * already-bootstrapped uid never restored "ready" -- so a second callback for a uid that was
 * already `ready` (ordinary under cross-tab auth broadcasts) permanently stranded the app on
 * the loading screen. Checking the guard first means a repeat callback for an already-bootstrapped
 * uid touches nothing and returns immediately, leaving status exactly as it was.
 *
 * The ref resets to undefined on sign-out (so signing into a different account bootstraps
 * correctly) and on a failed bootstrap (so the next auth event, or a manual retry via
 * signInWithGoogle, can try again).
 */
export async function handleAuthEvent(firebaseUser: User | null, cb: AuthEventCallbacks): Promise<void> {
  if (!firebaseUser) {
    cb.bootstrapping.current = undefined;
    cb.setUser(undefined);
    cb.setHouseholdId(undefined);
    cb.setProfiles([]);
    cb.setActiveProfileId(undefined);
    cb.setError(undefined);
    cb.setStatus("signed-out");
    return;
  }

  if (cb.bootstrapping.current === firebaseUser.uid) return;
  cb.bootstrapping.current = firebaseUser.uid;

  cb.setUser(firebaseUser);
  cb.setStatus("loading");
  cb.setError(undefined);

  try {
    // Task 3b: the allowlist check happens before anything else. A non-allowlisted address
    // must create nothing, join nothing and read nothing -- so this never calls
    // getHouseholdForUser or createHousehold at all. (firestore.rules enforces the same thing
    // independently; this check exists only so the app can show NotAllowed instead of a
    // permission-denied crash.)
    const allowed = await isEmailAllowed(firebaseUser.email);
    if (!allowed) {
      cb.setHouseholdId(undefined);
      cb.setProfiles([]);
      cb.setActiveProfileId(undefined);
      cb.setError(undefined);
      cb.setStatus("blocked");
      return;
    }

    const existing = await getHouseholdForUser(firebaseUser.uid);
    if (!existing) {
      // No household yet: the parent accepts the terms first (components/ConsentGate.tsx), and
      // acceptTermsAndCreate below finishes what this function would otherwise do here.
      cb.setHouseholdId(undefined);
      cb.setProfiles([]);
      cb.setActiveProfileId(undefined);
      cb.setError(undefined);
      cb.setStatus("consent");
      return;
    }
    await loadHousehold(existing.hid, cb);
  } catch (err) {
    cb.bootstrapping.current = undefined;
    console.error("Wonderloop: could not load or create this household", err);
    cb.setStatus("signed-out");
    cb.setError(BOOTSTRAP_ERROR_MESSAGE);
  }
}

/** Creates the household and its parent profile once the terms are accepted, then loads it. */
export async function acceptTermsAndCreate(firebaseUser: User, cb: AuthEventCallbacks, now = Date.now()): Promise<void> {
  cb.setStatus("loading");
  try {
    const created = await createHousehold(firebaseUser.uid, householdNameFor(firebaseUser.displayName), { termsVersion: TERMS_VERSION, termsAcceptedAt: now });
    // Only the tab that actually created the household (Firestore's transaction-level
    // dedup, not this client's own guard -- a second tab racing the same fresh sign-in can
    // reach this branch too) creates its first profile, so two tabs bootstrapping the same
    // new account never end up with two parent profiles under the one household they share.
    if (created.created) {
      await createProfile(created.hid, newParentProfile(firebaseUser.displayName));
    }
    await loadHousehold(created.hid, cb);
  } catch (err) {
    console.error("Wonderloop: could not create this household", err);
    cb.setStatus("consent");
    cb.setError(BOOTSTRAP_ERROR_MESSAGE);
  }
}

async function loadHousehold(hid: string, cb: AuthEventCallbacks): Promise<void> {
  {
    const list = await listProfiles(hid);
    const mapped: Profile[] = list.map(({ pid, profile }) => ({ id: pid, ...profile }));

    cb.setHouseholdId(hid);
    cb.setProfiles(mapped);
    const storedId = cb.readStoredActiveProfileId(hid);
    cb.setActiveProfileId(mapped.some((p) => p.id === storedId) ? storedId : undefined);
    cb.setError(undefined);
    cb.setStatus("ready");
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [error, setError] = useState<string | undefined>(undefined);
  const [user, setUser] = useState<User | undefined>(undefined);
  const [householdId, setHouseholdId] = useState<string | undefined>(undefined);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | undefined>(undefined);

  // See handleAuthEvent's own doc comment for what this ref guards against.
  const bootstrapping = useRef<string | undefined>(undefined);

  useEffect(() => {
    const auth = getClientAuth();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) =>
      handleAuthEvent(firebaseUser, {
        bootstrapping,
        setUser,
        setHouseholdId,
        setProfiles,
        setActiveProfileId,
        setStatus,
        setError,
        readStoredActiveProfileId,
      }),
    );
    return () => unsubscribe();
  }, []);

  const setActiveProfile = useCallback(
    (id: string | undefined) => {
      setActiveProfileId(id);
      if (householdId) writeStoredActiveProfileId(householdId, id);
    },
    [householdId],
  );

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(getClientAuth(), new GoogleAuthProvider());
  }, []);

  const acceptTerms = useCallback(async () => {
    const current = getClientAuth().currentUser;
    if (!current) return;
    await acceptTermsAndCreate(current, {
      bootstrapping,
      setUser,
      setHouseholdId,
      setProfiles,
      setActiveProfileId,
      setStatus,
      setError,
      readStoredActiveProfileId,
    });
  }, []);

  // Clears the stored active profile before Firebase actually signs out: the next person at the
  // laptop may be someone else, so the picker must not silently reopen on this household's last
  // active profile. Reads the current householdId from this callback's own closure (rebuilt
  // every render, unlike the auth-event effect above, which subscribes once) rather than from
  // onAuthStateChanged's null-user branch, which has no reliable way to know which household's
  // stored key to clear.
  const signOut = useCallback(async () => {
    if (householdId) writeStoredActiveProfileId(householdId, undefined);
    await firebaseSignOut(getClientAuth());
  }, [householdId]);

  const refreshProfiles = useCallback(async () => {
    if (!householdId) return;
    const list = await listProfiles(householdId);
    setProfiles(list.map(({ pid, profile }) => ({ id: pid, ...profile })));
  }, [householdId]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId),
    [profiles, activeProfileId],
  );

  const value = useMemo<Session>(
    () => ({
      status,
      error,
      user,
      householdId,
      profiles,
      activeProfile,
      setActiveProfile,
      signInWithGoogle,
      signOut,
      acceptTerms,
      refreshProfiles,
    }),
    [status, error, user, householdId, profiles, activeProfile, setActiveProfile, signInWithGoogle, signOut, acceptTerms, refreshProfiles],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside a <SessionProvider>");
  return ctx;
}
