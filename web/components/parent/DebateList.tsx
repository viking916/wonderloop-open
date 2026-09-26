"use client";

import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import type { DebateDoc } from "@/lib/data/types";
import type { Profile } from "@/lib/session";

export type DebateListProps = {
  profile: Profile;
  debates: Array<{ id: string; debate: DebateDoc }>;
};

function whenLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Every debate this child has held with Rebut (Plan 3 task 6 step 6: every conversation is
 * stored and visible in the Parent view). The transcript is the plain text the room saved
 * (lib/domain/debate.ts's transcriptOf), shown whole behind a disclosure so the list stays
 * short. An unfinished debate says so; nothing is scored anywhere.
 */
export function DebateList({ profile, debates }: DebateListProps) {
  return (
    <Card tone="surface" className="pr-debates" aria-labelledby={`debates-${profile.id}`}>
      <p className="tr-eyebrow" id={`debates-${profile.id}`}>
        Debates with Rebut
      </p>
      {debates.length === 0 ? (
        <p className="pr-debates__empty">No debates yet. The first one is in week 5.</p>
      ) : (
        <ul className="pr-debates__list">
          {debates.map(({ id, debate }) => (
            <li key={id} className="pr-debates__item">
              <div className="pr-debates__head">
                <span className="pr-debates__motion">{debate.motion}</span>
                <Chip>{debate.offline ? "Out loud" : debate.status === "done" ? "Done" : "In progress"}</Chip>
                <span className="pr-debates__meta">
                  Week {debate.week}
                  {debate.side ? `, ${profile.name} argued ${debate.side}` : ""}, {whenLabel(debate.updatedAt ?? debate.at)}
                </span>
              </div>
              {debate.coachCard ? (
                <p className="pr-debates__coach">
                  <strong>Coach card.</strong> {debate.coachCard.strength} {debate.coachCard.improvement} ({debate.coachCard.ideaName})
                </p>
              ) : null}
              <details className="pr-debates__details">
                <summary>Read the whole exchange</summary>
                <pre className="pr-debates__transcript">{debate.transcript}</pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
