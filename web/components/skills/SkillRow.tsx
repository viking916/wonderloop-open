import { ProgressBar } from "@/components/ui/ProgressBar";
import { getProblem } from "@/lib/content/app-content";
import type { Skill } from "@/lib/content/schema";
import type { SkillProgress } from "@/lib/domain/skills";

export type SkillRowProps = {
  skill: Skill;
  /** The stored skill doc (lib/data/progress.ts's watchSkills), or undefined for a skill with
   * no evidence at all yet -- SkillRow never invents a level for that case; the caller passes
   * whatever lib/domain/skills.ts's own zero-evidence default already is. */
  progress: SkillProgress;
};

/** A single evidence-list entry, resolved through app-content.ts: a problem id becomes its
 * quest and step titles; the literal "log" (lib/domain/skills.ts's applyLog) becomes a plain
 * Maker's Log note; anything else is a parent-entered note (lib/domain/skills.ts's
 * ParentSkillEntry), verbatim -- the app has no other source of an unresolvable evidence
 * string. */
function describeEvidence(evidence: string): { kind: "problem" | "log" | "parent"; text: string } {
  if (evidence === "log") return { kind: "log", text: "A Maker's Log entry" };
  const resolved = getProblem(evidence);
  if (resolved) {
    const stepTitle =
      resolved.step.kind === "problem-set"
        ? resolved.step.title
        : resolved.step.kind === "puzzle-of-week"
          ? "Puzzle of the week"
          : "Warm-up";
    return { kind: "problem", text: `${stepTitle} · ${resolved.quest.title} (week ${resolved.quest.week})` };
  }
  return { kind: "parent", text: evidence };
}

/**
 * One skill row (spec 7.1 screen 6): level (1 to 5), the level's own descriptor from
 * content/skills.json, a small bar, and an expandable list of the evidence behind it. Level and
 * points are never computed here -- lib/domain/skills.ts's recomputeFromAttempts decided them
 * before this ever renders; this component only displays skill.levels[progress.level - 1] and
 * progress.evidence, resolved to something readable.
 */
export function SkillRow({ skill, progress }: SkillRowProps) {
  const descriptor = skill.levels[progress.level - 1];
  const parentNotes = progress.evidence.map(describeEvidence).filter((e) => e.kind === "parent");
  const otherEvidence = progress.evidence.map(describeEvidence).filter((e) => e.kind !== "parent");

  return (
    <div className="tr-skill-row">
      <div className="tr-skill-row__head">
        <h3>{skill.name}</h3>
        <span className="tr-skill-row__level">Level {progress.level} of 5</span>
      </div>
      <ProgressBar value={(progress.level / 5) * 100} tone="moss" label={`${skill.name} level`} />
      <p className="tr-skill-row__desc">{descriptor}</p>
      {parentNotes.length > 0 ? (
        <p className="tr-skill-row__note">{parentNotes.map((n) => n.text).join(" ")}</p>
      ) : null}
      {otherEvidence.length > 0 ? (
        <details>
          <summary>
            {otherEvidence.length} {otherEvidence.length === 1 ? "piece" : "pieces"} of evidence
          </summary>
          <ul className="tr-skill-row__evidence">
            {otherEvidence.map((e, i) => (
              <li key={i}>{e.text}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
