"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { getSeasonCount } from "@/lib/content/app-content";
import { TRACK_LABEL, TRACK_ORDER, type Track } from "@/lib/content/schema";
import { currentWeekFromDone } from "@/lib/domain/calendar";
import { questTimeLabel } from "@/lib/domain/questTime";
import {
  explorerSeasonIndex,
  sproutSeasonIndex,
  type SeasonIndexKitItem,
  type SeasonIndexStatus,
  type SeasonIndexSproutWeek,
  type SeasonIndexTrackCell,
  type SeasonIndexWeek,
} from "@/lib/domain/seasonIndex";
import type { Profile } from "@/lib/session";

export type SeasonIndexProps = {
  profile: Profile;
  /** This profile's own doneByWeek for its real current season (profile.seasonId): the same
   * array app/parent/page.tsx's explorerDoneByWeek/sproutDoneByWeek already compute, the one
   * This Week itself is built from. Any OTHER season this component shows is never guessed at
   * from this array -- a season before the child's own reads as fully done, a season after as
   * fully upcoming, and neither ever claims a "current" week. */
  doneByWeek: boolean[];
};

const STATUS_LABEL: Record<SeasonIndexStatus, string> = { done: "Done", current: "This week", upcoming: "Coming up" };
const STATUS_TONE: Record<SeasonIndexStatus, ChipTone> = { done: "positive", current: "progress", upcoming: "neutral" };
const STRIP_LABEL: Record<SeasonIndexStatus, string> = { done: "Done", current: "You are here", upcoming: "Coming up" };

const ALL_DONE = Array.from({ length: 12 }, () => true);
const ALL_UPCOMING = Array.from({ length: 12 }, () => false);
const SPRINTS = [1, 2, 3] as const;

type CommonWeek = { week: number; sprint: 1 | 2 | 3; showcase: boolean; status: SeasonIndexStatus };

function sprintRange(sprint: 1 | 2 | 3): string {
  const start = (sprint - 1) * 4 + 1;
  return `Sprint ${sprint}, weeks ${start} to ${start + 3}`;
}

/**
 * The overview strip (polish pass, 15 September 2026: the old version left most of its own
 * panel empty, three short rows of tiny cells). One row of 12 equal cells spanning the full
 * width, grouped into the three sprints by a visible gap between groups and a small label above
 * each; a showcase week says "Showcase" in words, never an asterisk. At narrow widths the groups
 * do not wrap into a ragged mix of two sprints on one line -- the strip scrolls horizontally
 * instead, contained by its own overflow so the page itself never gains a horizontal scrollbar.
 */
function OverviewStrip({ weeks }: { weeks: CommonWeek[] }) {
  return (
    <div className="pr-season-strip">
      <div className="pr-season-strip__groups">
        {SPRINTS.map((sprint) => (
          <div className="pr-season-strip__sprint" key={sprint}>
            <p className="pr-season-strip__sprint-label">Sprint {sprint}</p>
            <div className="pr-season-strip__cells">
              {weeks
                .filter((w) => w.sprint === sprint)
                .map((w) => (
                  <a key={w.week} href={`#season-week-${w.week}`} className={`pr-season-strip__cell pr-season-strip__cell--${w.status}`}>
                    <span className="pr-season-strip__cell-num">{w.week}</span>
                    {w.showcase ? <span className="pr-season-strip__cell-showcase">Showcase</span> : null}
                    <span className="pr-season-strip__cell-status">{STRIP_LABEL[w.status]}</span>
                  </a>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KitLine({ kit }: { kit: SeasonIndexKitItem[] }) {
  if (kit.length === 0) return null;
  return (
    <p className="pr-season-row__kit">
      <span>Kit this week</span> {kit.map((k) => k.name).join(", ")}
    </p>
  );
}

/** A track cell in the season table. Below 1024px this keeps today's combined eyebrow (track
 * name and minutes together, e.g. "BUILD - 60 MIN"); at 1024px and up the column header already
 * names the track once for the whole table, so the per-cell eyebrow drops to just the minutes,
 * in the shared .tr-meta register instead of the mono eyebrow one. Both lines are always in the
 * markup and CSS shows exactly one at a time, so nothing here depends on knowing the viewport. */
function TrackCell({ cell }: { cell: SeasonIndexTrackCell }) {
  return (
    <div className="pr-season-cell">
      <p className="tr-eyebrow pr-season-cell__eyebrow-full">
        {TRACK_LABEL[cell.track]} · {questTimeLabel(cell)}
      </p>
      <p className="tr-meta pr-season-cell__eyebrow-mins">{questTimeLabel(cell)}</p>
      <h4>{cell.title}</h4>
      {cell.skills.length > 0 ? (
        <p className="pr-season-cell__meta">
          <span>Skills</span> {cell.skills.join(", ")}
        </p>
      ) : null}
      {cell.ideas.length > 0 ? (
        <p className="pr-season-cell__meta">
          <span>Ideas</span> {cell.ideas.join(", ")}
        </p>
      ) : null}
      {cell.hasMonster ? (
        <p className="pr-season-cell__meta">
          <span>Monster problem</span> Open all month, does not hold up this week.
        </p>
      ) : null}
    </div>
  );
}

/** A present track with nothing this particular week -- kept as a real (small) cell rather than
 * left out, so the column it sits under stays a column: leaving it out would shift every later
 * track one column to the left for just that one row. */
function EmptyTrackCell({ track }: { track: Track }) {
  return (
    <div className="pr-season-cell pr-season-cell--empty">
      <p className="tr-eyebrow pr-season-cell__eyebrow-full">{TRACK_LABEL[track]}</p>
      <p className="tr-meta">Not this week</p>
    </div>
  );
}

/** The season table's one header row (1024px and up only), naming every present track once.
 * Sticky so it stays visible while a parent scrolls down through the twelve weeks -- once the
 * tab bar above it scrolls out of view this is the next thing pinned to the top of the page. */
function TrackHeaderRow({ tracks }: { tracks: Track[] }) {
  return (
    <div className="pr-season-table-head">
      <span className="pr-season-table-head__week">Week</span>
      {tracks.map((t) => (
        <span key={t} className="pr-season-table-head__col">
          {TRACK_LABEL[t]}
        </span>
      ))}
    </div>
  );
}

function ExplorerWeekRow({ week, presentTracks }: { week: SeasonIndexWeek; presentTracks: Track[] }) {
  return (
    <li id={`season-week-${week.week}`} className={`pr-season-row pr-season-row--${week.status}`}>
      <div className="pr-season-row__left">
        <p className="pr-season-row__week">Week {week.week}</p>
        <Chip tone={STATUS_TONE[week.status]}>{STATUS_LABEL[week.status]}</Chip>
        {week.showcase ? <p className="pr-season-row__showcase">Showcase week</p> : null}
      </div>
      <div className="pr-season-row__body">
        <div className="pr-season-row__tracks">
          {presentTracks.map((t) => {
            const cell = week.tracks.find((c) => c.track === t);
            return cell ? <TrackCell key={t} cell={cell} /> : <EmptyTrackCell key={t} track={t} />;
          })}
        </div>
        {week.game ? (
          <p className="pr-season-row__kit">
            <span>Game of the sprint</span> {week.game.name}
          </p>
        ) : null}
        <KitLine kit={week.kit} />
      </div>
    </li>
  );
}

function SproutWeekRow({ week }: { week: SeasonIndexSproutWeek }) {
  return (
    <li id={`season-week-${week.week}`} className={`pr-season-row pr-season-row--${week.status}`}>
      <div className="pr-season-row__left">
        <p className="pr-season-row__week">Week {week.week}</p>
        <Chip tone={STATUS_TONE[week.status]}>{STATUS_LABEL[week.status]}</Chip>
        {week.showcase ? <p className="pr-season-row__showcase">Showcase week</p> : null}
      </div>
      <div className="pr-season-row__body">
        <div className="pr-season-row__tracks">
          <div className="pr-season-cell">
            <p className="tr-eyebrow">Sprout</p>
            <h4>{week.theme || "Not authored yet"}</h4>
            {week.activityTitles.length > 0 ? (
              <p className="pr-season-cell__meta">
                <span>Activities</span> {week.activityTitles.join(", ")}
              </p>
            ) : null}
            {week.skills.length > 0 ? (
              <p className="pr-season-cell__meta">
                <span>Skills</span> {week.skills.join(", ")}
              </p>
            ) : null}
            {week.parentCardTitle ? (
              <p className="pr-season-cell__meta">
                <span>Parent card</span> {week.parentCardTitle}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * The Season plan (owner ask, 15 September 2026: "an index for the parents view so I can see
 * what will be done in what week at a glance", quest titles plus the skills and ideas each week
 * teaches). Read-only: a season selector, a compact 12-week overview strip, then every week as
 * its own row grouped by sprint -- at 1024px and up an Explorer's rows read as aligned columns,
 * one per present track, under a single sticky header naming each track once (polish pass, 15
 * September 2026: a parent scanning "all the Think weeks" had to re-find the Think cell inside
 * every row's own little grid). All the actual status/title/skill/idea work happens in
 * lib/domain/seasonIndex.ts; this component only lays it out.
 */
export function SeasonIndex({ profile, doneByWeek }: SeasonIndexProps) {
  const seasonCount = useMemo(() => getSeasonCount(), []);
  const [season, setSeason] = useState(profile.seasonId);
  const seasons = useMemo(() => Array.from({ length: seasonCount }, (_, i) => i + 1), [seasonCount]);

  const isOwnSeason = season === profile.seasonId;
  const effectiveDoneByWeek = isOwnSeason ? doneByWeek : season < profile.seasonId ? ALL_DONE : ALL_UPCOMING;
  const currentWeek = isOwnSeason ? currentWeekFromDone(doneByWeek) : undefined;

  const explorerWeeks = useMemo(
    () => (profile.kind === "explorer" ? explorerSeasonIndex(season, profile, effectiveDoneByWeek, currentWeek) : null),
    [season, profile, effectiveDoneByWeek, currentWeek],
  );
  const sproutWeeks = useMemo(
    () => (profile.kind === "sprout" ? sproutSeasonIndex(season, effectiveDoneByWeek, currentWeek) : null),
    [season, profile, effectiveDoneByWeek, currentWeek],
  );
  const weeks: CommonWeek[] = explorerWeeks ?? sproutWeeks ?? [];

  // Every track that appears in at least one of the twelve weeks, in TRACK_ORDER -- the column
  // set for the 1024px-and-up table. A track this profile never has this season (Make before
  // season 2, Play off) never gets an empty column running the whole page down.
  const presentTracks = useMemo(() => {
    if (!explorerWeeks) return [];
    const seen = new Set<Track>();
    for (const w of explorerWeeks) for (const c of w.tracks) seen.add(c.track);
    return TRACK_ORDER.filter((t) => seen.has(t));
  }, [explorerWeeks]);

  const sprintGroups = SPRINTS.map((sprint) => (
    <section key={sprint} className="pr-season-group" aria-labelledby={`season-sprint-${sprint}`}>
      <h3 className="pr-season-group__heading" id={`season-sprint-${sprint}`}>
        {sprintRange(sprint)}
      </h3>
      <ul className="pr-season-group__list">
        {explorerWeeks
          ? explorerWeeks.filter((w) => w.sprint === sprint).map((w) => <ExplorerWeekRow key={w.week} week={w} presentTracks={presentTracks} />)
          : (sproutWeeks ?? []).filter((w) => w.sprint === sprint).map((w) => <SproutWeekRow key={w.week} week={w} />)}
      </ul>
    </section>
  ));

  return (
    <Card tone="surface" shadow className="pr-season-index" aria-labelledby="season-index-heading">
      <p className="tr-eyebrow" id="season-index-heading">
        Season plan
      </p>
      <h2 className="pr-season-index__title">What happens in each week, at a glance</h2>

      {seasons.length > 1 ? (
        <div className="pr-shopping__seasons" role="tablist" aria-label="Season">
          {seasons.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={s === season}
              className={s === season ? "pr-shopping__season pr-shopping__season--on" : "pr-shopping__season"}
              onClick={() => setSeason(s)}
            >
              Season {s}
            </button>
          ))}
        </div>
      ) : null}

      <OverviewStrip weeks={weeks} />

      {explorerWeeks ? (
        <div className="pr-season-table" style={{ "--track-count": presentTracks.length } as CSSProperties}>
          <TrackHeaderRow tracks={presentTracks} />
          {sprintGroups}
        </div>
      ) : (
        sprintGroups
      )}
    </Card>
  );
}
