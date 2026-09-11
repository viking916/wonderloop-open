import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { TalkOutline } from "@/lib/domain/talkOutline";

export type TalkOutlineCardProps = { outline: TalkOutline };

/**
 * The Showcase talk outline (Plan 3 Task 3), surfaced on weeks 4, 8 and 12. Every fact here was
 * already decided by lib/domain/talkOutline.ts's pure talkOutline: this component only lays out
 * the beats, it never assembles or reorders them itself. Renders as reminders he can glance at
 * while he talks, not a script -- each beat shows a short cue and his own quoted words
 * underneath, never phrased as something to read aloud verbatim. Only the "made" beat repeats
 * the week/project per quote (it is the one beat that spans more than one project); the other
 * four already share the one project named in the subtitle just above the list.
 */
export function TalkOutlineCard({ outline }: TalkOutlineCardProps) {
  if (!outline.hasLogs) {
    return (
      <Card tone="kraft" className="tr-talk-outline">
        <p className="tr-eyebrow">Your Showcase talk</p>
        <EmptyState title="Nothing to build a talk from yet" description={outline.guidance} />
      </Card>
    );
  }

  return (
    <Card tone="kraft" className="tr-talk-outline">
      <p className="tr-eyebrow">Your Showcase talk</p>
      <p className="tr-talk-outline__sub">
        Five things to glance at, not read out loud. Mostly about {outline.anchorQuestTitle}, from week {outline.anchorWeek}.
      </p>
      <ol className="tr-talk-outline__beats">
        {outline.beats.map((beat) => (
          <li key={beat.id} className="tr-talk-outline__beat">
            <span className="tr-talk-outline__cue">{beat.cue}</span>
            <ul className="tr-talk-outline__quotes">
              {beat.quotes.map((q, i) => (
                <li key={`${beat.id}-${q.week}-${i}`}>
                  <span className="tr-talk-outline__quote-text">&ldquo;{q.words}&rdquo;</span>
                  {beat.id === "made" ? (
                    <span className="tr-talk-outline__quote-meta">
                      {" "}
                      Week {q.week}, {q.questTitle}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </Card>
  );
}
