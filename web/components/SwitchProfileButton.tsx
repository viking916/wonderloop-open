"use client";

import { Button } from "@/components/ui/Button";
import { useSession } from "@/lib/session";

/**
 * Clears the active profile, which sends the app back to the profile picker (spec 7.1 screen
 * 1). Meant to be passed as a `<Header rightSlot>` on every signed-in screen (This Week, Sprout
 * home, the Parent view, and the three placeholder landings this task adds), so it only needs
 * writing once here.
 *
 * Deliberately the "default" button variant, not "secondary" or "quiet": the Header's background
 * is the dark forest, and every other tier is styled for a light surface (a transparent or
 * muted-text control would lose its contrast against forest). The default variant's own white
 * fill carries its contrast regardless of what it sits on top of -- see components/ui/Button.tsx
 * and app/globals.css's "Button" block for the full taxonomy this is the one exception to.
 */
export function SwitchProfileButton() {
  const { setActiveProfile } = useSession();
  return (
    <Button variant="default" onClick={() => setActiveProfile(undefined)}>
      Switch profile
    </Button>
  );
}
