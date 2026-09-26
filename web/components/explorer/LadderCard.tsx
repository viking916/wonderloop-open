"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { getLadderGraph } from "@/lib/content/app-content";
import { ladderWeek, SESSIONS_PER_WEEK, stageSummary, type LadderState, type TopicState } from "@/lib/domain/ladder";
import { watchLadderState, watchSessions, watchTopicStates, type SessionDoc } from "@/lib/data/ladder";

/** A decorative tick, not a text glyph, for the mastered badge: plain "moss" is a fill/border
 * colour, not a text-safe one (see app/globals.css's own note on --moss-text), so the mastered
 * mark is drawn rather than set as a low-contrast character on a moss background. */
function MasteredTick() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M3 8.5 6.5 12 13 4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Where the child sits in the week on the Ladder (13 September 2026, replacing the old
 * weekday-bound line): a plan of three sessions, finished in order, that waits instead of
 * expiring, never a day of the week. */
function weekLine(sessions: SessionDoc[]): string {
  const week = ladderWeek(sessions);
  if (week.weekComplete) return `This Ladder week is complete (${SESSIONS_PER_WEEK} of ${SESSIONS_PER_WEEK} sessions done).`;
  const entry = week.entries[week.next!.indexInWeek];
  const statusText = entry.status === "open" ? `${entry.roundsDone} of ${entry.rounds} rounds done` : "to come";
  return `Session ${week.next!.indexInWeek + 1} of ${SESSIONS_PER_WEEK} this Ladder week, ${statusText}`;
}

/**
 * The Ladder as seen from This Week (12 September 2026, the owner's request): a child looking
 * at their weekly quests should see where they sit on the separate math sequence too, not just
 * find it through a nav link. Shows the six spine stages as rungs, coloured by
 * lib/domain/ladder.ts's stageSummary, the current topic (or the placement/not-started line),
 * and where the child sits in the week on the Ladder's plan of three sessions (13 September
 * 2026, replacing the old weekday-bound line), with one link into the Ladder itself. Never a
 * grade label (principle 3 of the design doc: placement, not grade), and never a day of the
 * week either: the week waits for the child instead of expiring.
 */
export function LadderCard({ householdId, profileId, now }: { householdId: string; profileId: string; now: number }) {
  // `now` decides nothing here any more (the week on the Ladder stopped running on the calendar
  // clock on 13 September 2026); kept only because app/explorer/page.tsx, owned by another agent,
  // still passes it.
  void now;
  const graph = useMemo(() => getLadderGraph(), []);
  const [state, setState] = useState<LadderState | undefined>(undefined);
  const [topics, setTopics] = useState<Record<string, TopicState>>({});
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  useEffect(() => watchLadderState(householdId, profileId, setState), [householdId, profileId]);
  useEffect(() => watchTopicStates(householdId, profileId, setTopics), [householdId, profileId]);
  useEffect(() => watchSessions(householdId, profileId, setSessions), [householdId, profileId]);

  if (graph.length === 0) return null;

  const stages = stageSummary(graph, topics, state?.currentTopic);
  const currentTopicTitle = state?.currentTopic ? graph.find((t) => t.id === state.currentTopic)?.title : undefined;

  let topicLine: string;
  if (!state) {
    topicLine = "Not started: the first session is a placement, short probes to find where you are.";
  } else if (!state.placementDone) {
    topicLine = "Placement in progress.";
  } else if (currentTopicTitle) {
    topicLine = currentTopicTitle;
  } else {
    topicLine = "The sequence is finished for now.";
  }

  // The Ladder screen itself decides Start vs Continue vs Start the next week (its own week plan
  // is right there); this card stays a plain link into it rather than duplicating that decision
  // in a second place it could drift out of sync with.
  const ctaLabel = "Open the Ladder";

  return (
    <Card tone="kraft" className="tr-ladder-card">
      <p className="tr-eyebrow">The Ladder</p>
      <div className="tr-ladder-card__rungs">
        {stages.map((s) => (
          <div key={s.stage} className={`tr-ladder-card__rung tr-ladder-card__rung--${s.status}`}>
            {/* Always rendered, not just on the current rung (package C item 2, 15 September
                2026): every rung reserves this line's height so the current tile is never taller
                than its neighbours; --hidden keeps the reserved space while hiding the text from
                sighted and assistive readers on the five rungs that are not "you are here". */}
            <span className={`tr-ladder-card__here${s.status === "current" ? "" : " tr-ladder-card__here--hidden"}`} aria-hidden={s.status !== "current"}>
              You are here
            </span>
            <span className="tr-ladder-card__badge">
              {s.status === "mastered" ? <MasteredTick /> : <span aria-hidden="true">{s.stage}</span>}
            </span>
            <span className="tr-ladder-card__title">{s.title}</span>
            <span className="tr-ladder-card__count">{s.mastered} of {s.total}</span>
          </div>
        ))}
      </div>
      <p className="tr-ladder-card__topic">{topicLine}</p>
      <p className="tr-ladder-card__today">{weekLine(sessions)}</p>
      <Button variant="primary" href="/explorer/ladder">{ctaLabel}</Button>
    </Card>
  );
}
