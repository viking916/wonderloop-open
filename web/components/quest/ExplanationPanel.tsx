import { ProblemFigure } from "./ProblemFigure";
import type { Problem } from "@/lib/content/schema";
import type { ProblemView } from "@/lib/domain/attempts";

export type ExplanationPanelProps = {
  problem: Problem;
  outcome: ProblemView["outcome"];
  /** Task 10 fix (spec 7.2 "he can retry any problem"): true while the explanation just opened
   * belongs to a "Try it again" cycle, not the problem's original one. skills.ts never credits
   * a retry attempt, so a retry that lands on "correct" needs its own note here -- without it,
   * a correct outcome shows no note at all (the normal, first-time-correct case), which would
   * wrongly read as "that counted." */
  retry?: boolean;
};

/**
 * Task 10 fix (Critical finding 2, ux-audit.md): before this, a plain first/later-try correct
 * answer rendered no acknowledgement at all -- the exact same panel as a used-all-your-tries
 * reveal, distinguished only by which italic note happened to be present underneath (and for
 * plain-correct, none was). outcomeStatus names the three states ExplanationPanel can actually
 * show (correct/exhausted/revealed both cover the retry sub-case, since a retry is still
 * genuinely correct -- the "does not add to your skill points" nuance stays in the note below,
 * not in whether it says it was right) and gives each a short label plus an icon KIND. The icon
 * itself, in the JSX below, is a distinct glyph per kind (check / hourglass / eye) and the CSS
 * (.tr-outcome--*) pairs each with its own border STYLE (solid / dashed / dotted), not just a
 * different colour -- so the three read apart at a glance for a colour-blind reader too, not
 * only for one who can see the hue.
 */
function outcomeStatus(outcome: ProblemView["outcome"]): { kind: "correct" | "exhausted" | "revealed"; label: string } | null {
  switch (outcome) {
    case "correct":
      return { kind: "correct", label: "That's right." };
    case "exhausted":
      return { kind: "exhausted", label: "Out of tries for now." };
    case "revealed":
      return { kind: "revealed", label: "Not auto-checked." };
    case "unanswered":
      return null;
  }
}

function OutcomeIcon({ kind }: { kind: "correct" | "exhausted" | "revealed" }) {
  switch (kind) {
    case "correct":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12.5l5 5L20 6" />
        </svg>
      );
    case "exhausted":
      // An hourglass: this outcome is about think-time run out, not a wrong-answer buzzer.
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 3h10M7 21h10M8 3c0 4 4 5.5 4 9s-4 5-4 9M16 3c0 4-4 5.5-4 9s4 5 4 9" />
        </svg>
      );
    case "revealed":
      // An eye: this outcome means "look at this together," not "right" or "wrong."
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
}

/**
 * The worked explanation ("How it works", spec 7.3), shown once viewProblem says
 * explanationOpen is true. The tr-outcome badge above it (Task 10 fix, Critical finding 2)
 * says plainly which of the three things just happened -- correct, out of tries, or not
 * auto-checked -- so a child working alone always gets a real answer to "did I get it right,"
 * not just the same worked-example panel every time. The note underneath (unchanged) then names
 * the actual reason it opened without credit -- "revealed" (a not-auto-graded text/proof
 * problem, which always opens on its first submission) reads differently from "exhausted"
 * (three wrong tries plus the think-time floor) -- so a family reading it never sees a vague
 * "no credit" line that does not match what actually happened. A rubric problem's mustMention
 * phrases (spec 7.4: "the rubric phrases stay hidden until the explanation opens") only ever
 * render here, never before.
 */
export function ExplanationPanel({ problem, outcome, retry = false }: ExplanationPanelProps) {
  const status = outcomeStatus(outcome);
  return (
    <div className="tr-explanation">
      {status ? (
        <div className={`tr-outcome tr-outcome--${status.kind}`}>
          <span className="tr-outcome__icon" aria-hidden="true">
            <OutcomeIcon kind={status.kind} />
          </span>
          <span>{status.label}</span>
        </div>
      ) : null}
      <span className="tr-eyebrow">How it works</span>
      <ol>
        {problem.explanation.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
      {problem.explanationFigure ? <ProblemFigure figure={problem.explanationFigure} /> : null}
      {outcome === "exhausted" ? (
        <p className="tr-step__note">
          This one opened after three tries, so it does not count toward your skill points yet. It will come back
          another day for another try.
        </p>
      ) : null}
      {outcome === "revealed" ? (
        <p className="tr-step__note">This kind of question is not auto-checked yet. A grown-up can look at your answer with you.</p>
      ) : null}
      {outcome === "correct" && retry ? (
        <p className="tr-step__note">This was a try it again round, so it does not add to your skill points. Good practice all the same.</p>
      ) : null}
      <p className="tr-explanation__use-again">Use it again {problem.useAgain}</p>
      {problem.answer.kind === "rubric" ? (
        <div className="tr-explanation__mentions">
          <span className="tr-eyebrow">A strong answer mentions</span>
          <ul>
            {problem.answer.mustMention.map((phrase, i) => (
              <li key={i}>{phrase}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
