"use client";

import { patchIcon } from "./PatchSash";
import type { Badge } from "@/lib/domain/badges";

export type BadgeCelebrationProps = {
  /** Badges that just flipped from locked to earned, in earnedBadges' own order (earliest
   * first). Almost always exactly one; a page load that crosses two at once (finishing a quest
   * that both completes a sprint and finishes a showcase week) shows every one, never silently
   * drops one. Renders nothing when empty. */
  badges: Badge[];
  onDismiss: () => void;
};

/**
 * The real moment Patch.tsx's own doc comment reserves for "elsewhere" (Plan 4 task 35): a badge
 * is rare and earned -- not something he will see hundreds of times the way a correct answer is
 * -- so unlike ExplanationPanel's quiet check mark, this gets an actual, noticeable arrival. It
 * is still not a blocking modal or a countdown: a plain, dismissible banner he can close and get
 * straight back to his journal, the same as any other Toast in this app. app/explorer/portfolio/
 * page.tsx owns WHEN this has anything to show -- a badge earned before this feature ever
 * shipped, or a badge he has already been shown once, never appears here again; this component
 * only renders whatever it is handed.
 */
export function BadgeCelebration({ badges, onDismiss }: BadgeCelebrationProps) {
  if (badges.length === 0) return null;
  return (
    <div className="tr-celebrate" role="status">
      <button type="button" className="tr-celebrate__dismiss" onClick={onDismiss} aria-label="Dismiss">
        Dismiss
      </button>
      <p className="tr-celebrate__eyebrow">{badges.length === 1 ? "New patch" : "New patches"}</p>
      <div className="tr-celebrate__badges">
        {badges.map((badge) => (
          <div className="tr-celebrate__badge" key={badge.id}>
            <span className="tr-celebrate__icon" aria-hidden="true">
              {patchIcon(badge.id)}
            </span>
            <span className="tr-celebrate__name">{badge.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
