import { Card } from "@/components/ui/Card";
import { profileInitials, type Profile } from "@/lib/session";

export type KidCardProps = {
  profile: Profile;
  currentWeek: number;
  /** What is finished this week, in one plain phrase, e.g. "Build and Speak done" or "2 of 3
   * activities done". Never invented here -- the caller derives it from
   * lib/domain/completion.ts's questStatus (Explorer) or a profile's progress docs (Sprout). */
  doneLabel: string;
  /** What is left this week, e.g. "Think left, about 40 min" or "1 activity left" -- empty
   * string when nothing is left. */
  leftLabel: string;
  /** For an Explorer child this is completion.ts's own step-completion estimate, not a
   * measured elapsed time (see its doc comment: "an estimate for display, not a measured
   * elapsed time") -- shown with "About" below rather than as a bare figure, so the label never
   * overclaims (task 13 review, Minor #2). For a Sprout child this is genuinely summed screen
   * time, and "about" still reads honestly there too. */
  minutesSpentThisWeek: number;
};

/**
 * The Parent view's top card, one per child (spec 7.1 screen 8, task 13 brief: "the current
 * week, what is done and what is left, and time spent this week"). Every number it shows
 * arrives already decided; this component only lays them out.
 */
export function KidCard({ profile, currentWeek, doneLabel, leftLabel, minutesSpentThisWeek }: KidCardProps) {
  return (
    <Card tone="surface" shadow className="pr-kid-card">
      <div className="pr-kid-card__head">
        <div className="tr-header__avatar" aria-hidden="true">
          {profileInitials(profile.name, 1)}
        </div>
        <div>
          <h2>{profile.name}</h2>
          <p className="tr-eyebrow">
            {profile.kind === "explorer" ? "Explorer" : "Sprout"} · Week {currentWeek} of 12
          </p>
        </div>
      </div>
      <dl className="pr-kid-card__stats">
        <div>
          <dt>Done this week</dt>
          <dd>{doneLabel}</dd>
        </div>
        <div>
          <dt>Left this week</dt>
          <dd>{leftLabel || "Nothing left"}</dd>
        </div>
        <div>
          <dt>Time this week</dt>
          <dd>About {minutesSpentThisWeek} min</dd>
        </div>
      </dl>
    </Card>
  );
}
