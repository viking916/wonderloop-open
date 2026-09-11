import type { ReactElement } from "react";
import { Patch } from "@/components/ui/Patch";
import { BADGE_CATALOG, earnedBadges, type Badge, type BadgeProgress } from "@/lib/domain/badges";
import { formatDateTime } from "@/lib/format";

export interface PatchSashProps {
  progress: BadgeProgress;
}

function RobotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="5" y="7" width="14" height="11" rx="2" />
      <circle cx="9" cy="12" r="1.5" fill="currentColor" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" />
      <path d="M12 3v4M9 18v3M15 18v3" />
    </svg>
  );
}

function ProofIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M4 20 L12 4 L20 20z" />
      <path d="M8 20 l4-8 4 8" />
    </svg>
  );
}

function DebateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M4 6h16v9H9l-5 4z" />
    </svg>
  );
}

function SummitIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M3 20 L9 8 l4 7 3-4 5 9z" />
    </svg>
  );
}

function BigBrotherIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M9 12h6" />
    </svg>
  );
}

function BugHunterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <ellipse cx="12" cy="13" rx="5" ry="6" />
      <path d="M12 7V4M8 8l-3-2M16 8l3-2M8 18l-3 2M16 18l3 2M7 13H3M21 13h-4" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M8 6 L3 12 L8 18" />
      <path d="M16 6 L21 12 L16 18" />
      <path d="M14 4 L10 20" />
    </svg>
  );
}

function OwnWordsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M4 5h16v10H10l-4 4v-4H4z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}

function FixedItIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M14.5 6.5a3 3 0 0 1-3.9 3.9L5 16v3h3l5.6-5.6a3 3 0 0 1 3.9-3.9L14.5 6.5 17.5 3.5l1 1L21 6l-3 3-3.5-2.5z" />
    </svg>
  );
}

function IdeaSpotterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M9 21h6M10 18h4" />
      <path d="M12 3a6 6 0 0 0-3 11.2c.6.4 1 1.1 1 1.8h4c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" />
      <circle cx="12" cy="9" r="1.3" fill="currentColor" />
    </svg>
  );
}

function ComebackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PassItOnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="7" cy="8" r="3" />
      <circle cx="17" cy="16" r="3" />
      <path d="M9.5 9.8 14.5 14.2" />
    </svg>
  );
}

const ICONS: Record<string, () => ReactElement> = {
  "first-robot": RobotIcon,
  "first-proof": ProofIcon,
  "first-debate": DebateIcon,
  "summit-1": SummitIcon,
  "summit-2": SummitIcon,
  "summit-3": SummitIcon,
  "big-brother": BigBrotherIcon,
  "bug-hunter": BugHunterIcon,
  "first-code": CodeIcon,
  "own-words": OwnWordsIcon,
  "fixed-it": FixedItIcon,
  "idea-spotter": IdeaSpotterIcon,
  "comeback": ComebackIcon,
  "pass-it-on": PassItOnIcon,
};

/**
 * A plain, one-sentence invitation for what earns a still-locked badge -- what it is FOR, never
 * a task to complete or a count of what is missing (task 33: "telling him is safe and useful...
 * word it as an invitation, not a task list"). Every badge here rewards a real behaviour
 * (lib/domain/badges.ts's own doc comments name the exact signal each one reads), so saying
 * plainly what it is for never risks teaching him to chase the wrong thing.
 */
const INVITATION: Record<string, string> = {
  "first-robot": "For finishing a Build quest in the robot weeks, 5 to 7.",
  "first-proof": "For writing out a full proof, in your own words.",
  "first-debate": "For finishing a debate.",
  "summit-1": "For finishing Build, Think and Speak, all in week 4.",
  "summit-2": "For finishing Build, Think and Speak, all in week 8.",
  "summit-3": "For finishing Build, Think and Speak, all in week 12.",
  "big-brother": "For taking on the Big Brother quest.",
  "bug-hunter": "For writing three Maker's Logs that really dig into what went wrong.",
  "first-code": "For finishing a Build quest in the coding weeks, 9 to 11.",
  "own-words": "For explaining an idea in your own words.",
  "fixed-it": "For telling your Maker's Log both what went wrong and how you fixed it.",
  "idea-spotter": "For spotting the same idea again, in a different problem.",
  "comeback": "For coming back to a mistake and getting it right.",
  "pass-it-on": "For teaching someone else something you learned.",
};

function invitationFor(badgeId: string): string {
  return INVITATION[badgeId] ?? "Still out there.";
}

/** The one icon glyph a badge id renders as, shared with components/portfolio/BadgeCelebration.tsx
 * (Plan 4 task 35) so the sash and the celebration moment never draw two different pictures for
 * the same patch. Undefined for an id ICONS does not recognize (should not happen -- every id in
 * BADGE_CATALOG has an entry above -- but this stays a lookup, not an assumption). */
export function patchIcon(badgeId: string): ReactElement | undefined {
  const Icon = ICONS[badgeId];
  return Icon ? <Icon /> : undefined;
}

/**
 * The sash (spec 7.1 screen 5, the design demo's "Screen 3, Portfolio"): every badge
 * earnedBadges can ever award. Earned badges lead, in the order he earned them, each with the
 * date and time; unearned ones follow as a plain, quiet list of invitations, never a task list
 * and never a shortfall count (task 33). earnedBadges is the only thing that decides earned vs
 * locked here; this component only renders that decision.
 */
export function PatchSash({ progress }: PatchSashProps) {
  const earned = earnedBadges(progress); // already sorted earliest-first
  const earnedIds = new Set(earned.map((b) => b.id));
  const locked = BADGE_CATALOG.filter((b) => !earnedIds.has(b.id));

  return (
    <aside className="tr-sash">
      <h3>{earned.length === 0 ? "Patches" : `Patches · ${earned.length} earned`}</h3>

      {earned.length > 0 ? (
        <div className="tr-sash__section">
          <p className="tr-sash__label">Yours so far</p>
          <div className="tr-patches">
            {earned.map((badge: Badge) => {
              const Icon = ICONS[badge.id];
              return (
                <Patch
                  key={badge.id}
                  label={badge.name}
                  state="earned"
                  icon={Icon ? <Icon /> : undefined}
                  caption={badge.earnedAt !== undefined ? formatDateTime(badge.earnedAt) : undefined}
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {locked.length > 0 ? (
        <div className="tr-sash__section">
          <p className="tr-sash__label">Still out there</p>
          <div className="tr-patches-list">
            {locked.map((badge) => {
              const Icon = ICONS[badge.id];
              return (
                <Patch
                  key={badge.id}
                  label={badge.name}
                  state="locked"
                  icon={Icon ? <Icon /> : undefined}
                  caption={invitationFor(badge.id)}
                />
              );
            })}
          </div>
        </div>
      ) : null}

      <p>Patches are for firsts and for showing up, never for speed.</p>
    </aside>
  );
}
