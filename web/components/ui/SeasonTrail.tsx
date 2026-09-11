export type WeekStatus = "done" | "current" | "todo";

export interface SeasonTrailWeek {
  week: number;
  status: WeekStatus;
  showcase: boolean;
  /** Set on a completed showcase week: what was presented and when, e.g. "Gadget demo, October 2". */
  flag?: string;
}

export interface SeasonTrailProps {
  weeks: SeasonTrailWeek[];
  className?: string;
}

/**
 * The twelve fixed waypoint positions from the approved demo (trail-v2.html),
 * matched 1:1 to week numbers 1-12. Showcase weeks (always 4, 8 and 12, per
 * the content schema) render as peaks; every other week is a plain waypoint.
 */
const POSITIONS: { x: number; baseY: number }[] = [
  { x: 30, baseY: 120 },
  { x: 115, baseY: 98 },
  { x: 180, baseY: 58 },
  { x: 230, baseY: 60 }, // peak, week 4
  { x: 320, baseY: 105 },
  { x: 400, baseY: 120 },
  { x: 480, baseY: 70 },
  { x: 560, baseY: 60 }, // peak, week 8
  { x: 650, baseY: 110 },
  { x: 730, baseY: 120 },
  { x: 820, baseY: 65 },
  { x: 900, baseY: 60 }, // peak, week 12
];
const PEAK_APEX_OFFSET = 28;
const PEAK_HALF_WIDTH = 18;

/** Longest flag text drawn before truncation, so it cannot reach the neighbouring waypoint. */
const FLAG_LABEL_MAX_CHARS = 22;
const ELLIPSIS = "…";

/** Clamps a flag string for on-trail rendering; the full text still reaches assistive tech via aria-label and <title>. */
function truncateFlagLabel(flag: string): string {
  if (flag.length <= FLAG_LABEL_MAX_CHARS) return flag;
  return `${flag.slice(0, FLAG_LABEL_MAX_CHARS)}${ELLIPSIS}`;
}

/** The dashed full trail, exactly as drawn in trail-v2.html. */
const FULL_PATH_D =
  "M30 120 C 120 120, 140 50, 230 50 S 330 130, 400 120 S 480 40, 560 50 S 660 130, 730 120 S 820 40, 900 50 S 960 100, 975 120";

/** Walked (solid) sub-paths, keyed by the last fully-done anchor week. */
const WALKED_SEGMENTS: { throughWeek: number; d: string }[] = [
  { throughWeek: 4, d: "M30 120 C 120 120, 140 50, 230 50" },
  { throughWeek: 6, d: "M30 120 C 120 120, 140 50, 230 50 S 330 130, 400 120" },
  { throughWeek: 8, d: "M30 120 C 120 120, 140 50, 230 50 S 330 130, 400 120 S 480 40, 560 50" },
  {
    throughWeek: 10,
    d: "M30 120 C 120 120, 140 50, 230 50 S 330 130, 400 120 S 480 40, 560 50 S 660 130, 730 120",
  },
  {
    throughWeek: 12,
    d: "M30 120 C 120 120, 140 50, 230 50 S 330 130, 400 120 S 480 40, 560 50 S 660 130, 730 120 S 820 40, 900 50",
  },
];

function summitLabel(week: number): string {
  return week === 12 ? "Season end" : "Showcase";
}

function describeTrail(weeks: SeasonTrailWeek[]): string {
  const total = weeks.length;
  const done = weeks.filter((w) => w.status === "done").map((w) => w.week);
  const current = weeks.find((w) => w.status === "current");
  const summitsDone = weeks.filter((w) => w.showcase && w.status === "done");
  const nextSummit = weeks.find((w) => w.showcase && w.status !== "done");

  const parts: string[] = [];
  parts.push(
    `Season trail, week ${current?.week ?? done[done.length - 1] ?? weeks[0]?.week ?? 1} of ${total}.`
  );
  if (done.length > 0) {
    parts.push(`Weeks ${done.join(", ")} done.`);
  }
  for (const s of summitsDone) {
    parts.push(s.flag ? `Summit reached at week ${s.week}: ${s.flag}.` : `Summit reached at week ${s.week}.`);
  }
  if (nextSummit) {
    parts.push(`Next summit at week ${nextSummit.week}.`);
  }
  return parts.join(" ");
}

/**
 * The season trail: twelve waypoints, summits on showcase weeks, a flag
 * planted at each completed showcase. Degrades to a plain week list under
 * 640px (see the .tr-trail-list / .tr-trail-svg-wrap rules in globals.css).
 */
export function SeasonTrail({ weeks, className }: SeasonTrailProps) {
  const byWeek = new Map(weeks.map((w) => [w.week, w]));
  const lastDoneWeek = Math.max(0, ...weeks.filter((w) => w.status === "done").map((w) => w.week));
  const currentWeek = weeks.find((w) => w.status === "current");

  const walkedSegment = [...WALKED_SEGMENTS].reverse().find((s) => s.throughWeek <= lastDoneWeek);
  let walkedD = walkedSegment?.d ?? null;
  if (currentWeek) {
    const pos = POSITIONS[currentWeek.week - 1];
    if (pos) {
      const base = walkedD ?? `M${POSITIONS[0].x} ${POSITIONS[0].baseY}`;
      walkedD = `${base} L ${pos.x} ${pos.baseY - 20}`;
    }
  }

  const you = currentWeek ? POSITIONS[currentWeek.week - 1] : undefined;
  const label = describeTrail(weeks);
  const classes = ["tr-trail-wrap", className ?? ""].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <div className="tr-trail-svg-wrap">
        <svg className="tr-trail-svg" viewBox="0 0 1000 170" role="img" aria-label={label}>
          <g aria-hidden="true">
            <path className="tr-tree-shadow" d="M70 150 l10-24 10 24z" fill="var(--moss)" opacity={0.5} />
            <rect x="78" y="150" width="4" height="8" fill="var(--forest)" opacity={0.5} />
            <path d="M260 155 l12-28 12 28z" fill="var(--moss)" opacity={0.5} />
            <rect x="270" y="155" width="4" height="8" fill="var(--forest)" opacity={0.5} />
            <path d="M610 150 l10-24 10 24z" fill="var(--moss)" opacity={0.5} />
            <rect x="618" y="150" width="4" height="8" fill="var(--forest)" opacity={0.5} />
            <path d="M960 150 l11-26 11 26z" fill="var(--moss)" opacity={0.5} />
            <rect x="969" y="150" width="4" height="8" fill="var(--forest)" opacity={0.5} />
          </g>

          <path className="tr-path" d={FULL_PATH_D} />
          {walkedD ? <path className="tr-walked" d={walkedD} /> : null}

          {POSITIONS.map((pos, i) => {
            const week = i + 1;
            const w = byWeek.get(week);
            if (!w) return null;
            const on = w.status === "done";
            const numY = 150;

            if (w.showcase) {
              const apexY = pos.baseY - PEAK_APEX_OFFSET;
              const points = `${pos.x},${apexY} ${pos.x + PEAK_HALF_WIDTH},${pos.baseY} ${pos.x - PEAK_HALF_WIDTH},${pos.baseY}`;
              return (
                <g key={week}>
                  <polygon className={`tr-peak${on ? " on" : ""}`} points={points} />
                  {on && w.flag ? (
                    <g>
                      <title>{w.flag}</title>
                      <line className="tr-pole" x1={pos.x} y1={apexY} x2={pos.x} y2={apexY - 26} />
                      <path className="tr-flag" d={`M${pos.x} ${apexY - 26} h22 l-6 6 6 6 h-22z`} />
                      <text className="tr-lbl" x={pos.x} y={pos.baseY + 20} textAnchor="middle">
                        {truncateFlagLabel(w.flag)}
                      </text>
                    </g>
                  ) : (
                    <text className="tr-lbl" x={pos.x} y={pos.baseY + 20} textAnchor="middle">
                      {summitLabel(week)}
                    </text>
                  )}
                  <text x={pos.x} y={numY} textAnchor="middle">
                    {week}
                  </text>
                </g>
              );
            }

            return (
              <g key={week}>
                <circle className={`tr-wp${on ? " on" : ""}`} cx={pos.x} cy={pos.baseY} r={8} />
                <text x={pos.x} y={numY} textAnchor="middle">
                  {week}
                </text>
              </g>
            );
          })}

          {you ? (
            <g className="tr-you" transform={`translate(${you.x},${you.baseY - 30})`}>
              <path d="M0-14 l8 14 h-16z" />
              <circle cx={0} cy={4} r={5} />
            </g>
          ) : null}
        </svg>
      </div>

      <ol className="tr-trail-list" aria-label={label}>
        {weeks.map((w) => (
          <li key={w.week} data-status={w.status}>
            <span className="tr-trail-list__dot" aria-hidden="true" />
            <span>
              Week {w.week}
              {w.showcase ? ` · ${summitLabel(w.week)}` : ""}
              {w.status === "done" ? " · done" : w.status === "current" ? " · in progress" : ""}
              {w.status === "done" && w.showcase && w.flag ? ` · ${w.flag}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
