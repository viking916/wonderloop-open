"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoadingTrail } from "@/components/LoadingTrail";
import { useSession, type Profile } from "@/lib/session";

type RequireProfileProps = {
  /** The kind of profile this screen is for (explorer, sprout or parent). A signed-in household
   * member whose active profile is a different kind is sent back to the picker, same as anyone
   * without an active profile at all. */
  kind: Profile["kind"];
  /** Rendered only once the active profile matches `kind`. Takes the profile itself so the
   * screen never has to re-derive or re-guard it. */
  children: (profile: Profile) => ReactNode;
};

/**
 * Guards a profile-scoped route (/explorer, /sprout, /parent): a shared wrapper so each screen
 * inherits the same session-state handling instead of copying its own effect (Critical bug #3:
 * a direct or bookmarked visit to any of these routes while signed out used to render a
 * permanently blank page, because the old copy-pasted redirect effect only ever ran once
 * status reached "ready" -- "loading" and "signed-out" both fell through to `return null`).
 *
 * - "loading": shows the same quiet LoadingTrail the root page shows.
 * - "signed-out": shows LoadingTrail for the one render before the effect below fires, then
 *   redirects to "/" (never renders SignIn itself -- that is the root page's job).
 * - "blocked" (Task 3b: a signed-in address with no allowedEmails document): same as
 *   signed-out -- redirects to "/", which renders NotAllowed; never renders any profile data.
 * - "ready" with no active profile, or an active profile of the wrong kind: redirects to "/"
 *   (the picker lives there).
 * - "ready" with a matching active profile: renders `children(activeProfile)`.
 */
export function RequireProfile({ kind, children }: RequireProfileProps) {
  const { status, activeProfile } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "signed-out" || status === "blocked") {
      router.replace("/");
      return;
    }
    if (status === "ready" && (!activeProfile || activeProfile.kind !== kind)) {
      router.replace("/");
    }
  }, [status, activeProfile, kind, router]);

  if (status === "ready" && activeProfile && activeProfile.kind === kind) {
    return <>{children(activeProfile)}</>;
  }
  return <LoadingTrail />;
}
