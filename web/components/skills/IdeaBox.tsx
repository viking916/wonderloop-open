import { EmptyState } from "@/components/ui/EmptyState";
import { getIdea, getProblem, getQuest } from "@/lib/content/app-content";
import type { MetIdea } from "@/lib/domain/ideas";

export type IdeaBoxProps = {
  /** Every idea met so far, earliest first (lib/domain/ideas.ts's metIdeas). An idea not yet
   * met simply never appears here -- it is hidden, not shown locked or greyed (spec 7.4). */
  ideas: MetIdea[];
};

function describeProblem(problemId: string): string {
  const resolved = getProblem(problemId);
  if (!resolved) {
    // A science step or an extra (the physics thread): "<quest title>: <step title>".
    const quest = getQuest(problemId.split("-").slice(0, 3).join("-"));
    const step = quest?.steps.find((s) => s.id === problemId);
    const extra = quest?.extras?.find((e) => e.id === problemId);
    if (quest && step && "title" in step) return `${quest.title}: ${step.title}`;
    if (quest && extra) return `${quest.title}: ${extra.title}`;
    return problemId;
  }
  const stepTitle =
    resolved.step.kind === "problem-set"
      ? resolved.step.title
      : resolved.step.kind === "puzzle-of-week"
        ? "Puzzle of the week"
        : "Warm-up";
  return `${stepTitle} · ${resolved.quest.title} (week ${resolved.quest.week})`;
}

/**
 * The idea box (spec 7.4): every named idea he has met, its kid-language line, and the problems
 * where he used it. "Met" is decided entirely by lib/domain/ideas.ts's metIdeas before this
 * renders; an idea this component has never been handed is one he has not met, and it is left
 * out of the list rather than shown locked or greyed.
 */
export function IdeaBox({ ideas }: IdeaBoxProps) {
  return (
    <section className="tr-idea-box" aria-labelledby="idea-box-heading">
      <h2 id="idea-box-heading">Idea box</h2>
      {ideas.length === 0 ? (
        <EmptyState
          title="No ideas yet"
          description="An idea lights up here the first time you use it in a problem."
        />
      ) : (
        <div className="tr-idea-list">
          {ideas.map((met) => {
            const idea = getIdea(met.ideaId);
            if (!idea) return null; // an unresolvable idea id: nothing truthful to show
            return (
              <article key={met.ideaId} className="tr-idea-list__item">
                <h3>{idea.name}</h3>
                <p>{idea.kid}</p>
                <ul className="tr-idea-list__problems">
                  {met.problemIds.map((pid) => (
                    <li key={pid}>{describeProblem(pid)}</li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
