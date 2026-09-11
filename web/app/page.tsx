"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingTrail } from "@/components/LoadingTrail";
import { ConsentGate } from "@/components/ConsentGate";
import { NotAllowed } from "@/components/NotAllowed";
import { ProfilePicker } from "@/components/ProfilePicker";
import { SignIn } from "@/components/SignIn";
import { useSession, type Profile } from "@/lib/session";

const ROUTE_BY_KIND: Record<Profile["kind"], string> = {
  explorer: "/explorer",
  sprout: "/sprout",
  parent: "/parent",
};

/** Spec 7.1 screen 1, routed by session state: loading shows a quiet loading state, signed
 * out shows sign-in, blocked (Task 3b: a signed-in address with no allowedEmails document)
 * shows NotAllowed, ready with no active profile shows the picker, and ready with an active
 * profile redirects to that profile's home. */
export default function Home() {
  const { status, activeProfile } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "ready" && activeProfile) {
      router.replace(ROUTE_BY_KIND[activeProfile.kind]);
    }
  }, [status, activeProfile, router]);

  if (status === "signed-out") return <SignIn />;
  if (status === "blocked") return <NotAllowed />;
  if (status === "consent") return <ConsentGate />;
  if (status === "ready" && !activeProfile) return <ProfilePicker />;
  // "loading", and "ready" with an active profile while the redirect above takes effect.
  return <LoadingTrail />;
}
