import type { ReactElement } from "react";
import { SeasonTrail, type SeasonTrailWeek } from "../ui/SeasonTrail";

export interface SeasonInfo {
  id: number;
  name: string;
}

export const SEASONS: SeasonInfo[] = [
  { id: 1, name: "Forest" },
  { id: 2, name: "Coast" },
  { id: 3, name: "Mountains" },
  { id: 4, name: "Desert" },
];

export const SHOWCASE_WEEKS = [4, 8, 12] as const;

export interface WeekHeaderProps {
  seasonId: number;
  /** The real current week (from the profile's own progress through the calendar), always
   * shown on the season strip and the trail's "you are here" marker, never the picker's jump. */
  currentWeek: number;
  /** The week the cards below are showing; equals currentWeek unless a parent has jumped. */
  displayedWeek: number;
  trailWeeks: SeasonTrailWeek[];
  onPickWeek: (week: number) => void;
  /** True when this profile has the Play track and the displayed week carries its quest, so the
   * Showcase banner can say the recital is part of the demo. */
  hasPlay?: boolean;
}

function ForestTerrain() {
  return (
    <svg viewBox="0 0 200 64" aria-hidden="true">
      <rect width="200" height="64" fill="#b9d3dc" />
      <path d="M0 50 Q60 34 100 48 T200 44 V64 H0z" fill="#6b8f5a" />
      <g fill="#274235">
        <path d="M30 50 l10-22 10 22z" />
        <path d="M60 52 l12-28 12 28z" />
        <path d="M150 50 l9-20 9 20z" />
        <path d="M175 52 l11-26 11 26z" />
      </g>
    </svg>
  );
}

function CoastTerrain() {
  return (
    <svg viewBox="0 0 200 64" aria-hidden="true">
      <rect width="200" height="64" fill="#cfe3ea" />
      <path d="M0 40 Q25 30 50 40 T100 40 T150 40 T200 40 V64 H0z" fill="#5f9bb0" />
      <path d="M0 52 Q25 44 50 52 T100 52 T150 52 T200 52 V64 H0z" fill="#3f7f96" />
      <circle cx="160" cy="18" r="9" fill="#f2b632" />
    </svg>
  );
}

function MountainsTerrain() {
  return (
    <svg viewBox="0 0 200 64" aria-hidden="true">
      <rect width="200" height="64" fill="#dfe7ec" />
      <path d="M0 64 L40 20 L70 44 L110 8 L150 46 L175 28 L200 64z" fill="#7d8c96" />
      <path d="M110 8 l-10 14 h20z" fill="#fff" />
      <path d="M40 20 l-7 10 h14z" fill="#fff" />
    </svg>
  );
}

function DesertTerrain() {
  return (
    <svg viewBox="0 0 200 64" aria-hidden="true">
      <rect width="200" height="64" fill="#f6e3c3" />
      <path d="M0 48 Q50 30 100 46 T200 40 V64 H0z" fill="#e0b46f" />
      <path d="M0 58 Q60 44 120 56 T200 52 V64 H0z" fill="#c9924b" />
      <circle cx="40" cy="16" r="8" fill="#d9432b" />
    </svg>
  );
}

const TERRAIN: Record<number, () => ReactElement> = {
  1: ForestTerrain,
  2: CoastTerrain,
  3: MountainsTerrain,
  4: DesertTerrain,
};

/** Weeks 1 through 12, in order, for the picker's option list. */
const ALL_WEEKS = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * The season strip, the week title, the season trail and the week picker (spec 7.1 screen 2;
 * task 8 brief). Every fact shown here -- which weeks are done, where the flag is planted --
 * arrives already computed in `trailWeeks`; this component only lays it out. Renders as a
 * fragment, not its own card: it shares one continuous frame with TrackCards and SideStrip,
 * which the page composes around all three.
 */
export function WeekHeader({ seasonId, currentWeek, displayedWeek, trailWeeks, onPickWeek, hasPlay }: WeekHeaderProps) {
  const isJump = displayedWeek !== currentWeek;
  const isShowcase = (SHOWCASE_WEEKS as readonly number[]).includes(displayedWeek);

  return (
    <>
      <nav className="tr-seasons" aria-label="Seasons">
        {SEASONS.map((season) => {
          const Terrain = TERRAIN[season.id];
          const on = season.id === seasonId;
          const classes = ["tr-season", on ? "tr-season--on" : "tr-season--locked"].join(" ");
          return (
            <div className={classes} key={season.id}>
              <Terrain />
              <span className="tr-season__label">
                <span>
                  Season {season.id} · {season.name}
                </span>
                <span>{on ? `wk ${currentWeek}` : "locked"}</span>
              </span>
            </div>
          );
        })}
      </nav>

      <div className="tr-map">
        <h1>
          Week {displayedWeek} <em>of twelve.</em>
        </h1>
        <p>
          {isShowcase
            ? "This is a Showcase week. Everything you finish counts toward the demo."
            : "Everything you finish this week counts toward the next Showcase."}
        </p>
        <SeasonTrail weeks={trailWeeks} />

        <div className="tr-week-picker">
          <label htmlFor="tr-week-select">Jump to a different week</label>
          <select id="tr-week-select" value={displayedWeek} onChange={(e) => onPickWeek(Number(e.target.value))}>
            {ALL_WEEKS.map((w) => (
              <option key={w} value={w}>
                Week {w}
                {(SHOWCASE_WEEKS as readonly number[]).includes(w) ? " (Showcase)" : ""}
              </option>
            ))}
          </select>
          {isJump ? (
            <span className="tr-week-picker__jump">
              This is a look at week {displayedWeek}, not real progress.
              <button type="button" className="tr-btn tr-btn--quiet" onClick={() => onPickWeek(currentWeek)}>
                Back to week {currentWeek}
              </button>
            </span>
          ) : null}
        </div>
      </div>

      {isShowcase ? (
        <div className="tr-showcase-banner">
          <strong>Showcase week</strong>
          <span>
            {hasPlay
              ? "Every track feeds the same demo this week, and Play adds a mini recital."
              : "Every track feeds the same demo this week."}
          </span>
        </div>
      ) : null}
    </>
  );
}
