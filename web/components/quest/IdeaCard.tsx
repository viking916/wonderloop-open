import type { Idea } from "@/lib/content/schema";

export type IdeaCardProps = {
  idea: Idea;
  /** Distinct problems (including this one) where he has used this idea, per the idea box
   * (spec 7.4: "every named idea he has met, with the problems where he used it"). */
  count: number;
};

/** Shown alongside the worked explanation once it opens: the named idea, the kid-language line,
 * and how many problems he has used it in so far.
 *
 * Polish pass (Package B, 15 September 2026): some ideas' kid-language line is just the idea's
 * own name again with a few more words tacked on ("Fold it in your head" / "Fold it in your
 * head, one square at a time"), which read as the card repeating itself. When the kid line
 * starts with the idea's own name, the name (already shown as the heading) is not shown a
 * second time as its own sentence underneath -- content authoring is never changed to fix this,
 * the display just stops saying the same thing twice. */
export function IdeaCard({ idea, count }: IdeaCardProps) {
  const kidRepeatsName = idea.kid.trim().toLowerCase().startsWith(idea.name.trim().toLowerCase());
  return (
    <div className="tr-idea-card">
      <span className="tr-eyebrow">Idea</span>
      <h4>{idea.name}</h4>
      {kidRepeatsName ? null : <p>{idea.kid}</p>}
      <p className="tr-idea-card__count">
        {count <= 1 ? "First time you have used this idea." : `You have used this idea in ${count} problems.`}
      </p>
    </div>
  );
}
