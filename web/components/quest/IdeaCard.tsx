import type { Idea } from "@/lib/content/schema";

export type IdeaCardProps = {
  idea: Idea;
  /** Distinct problems (including this one) where he has used this idea, per the idea box
   * (spec 7.4: "every named idea he has met, with the problems where he used it"). */
  count: number;
};

/** Shown alongside the worked explanation once it opens: the named idea, the kid-language line,
 * and how many problems he has used it in so far. */
export function IdeaCard({ idea, count }: IdeaCardProps) {
  return (
    <div className="tr-idea-card">
      <span className="tr-eyebrow">Idea</span>
      <h4>{idea.name}</h4>
      <p>{idea.kid}</p>
      <p className="tr-idea-card__count">
        {count <= 1 ? "First time you have used this idea." : `You have used this idea in ${count} problems.`}
      </p>
    </div>
  );
}
