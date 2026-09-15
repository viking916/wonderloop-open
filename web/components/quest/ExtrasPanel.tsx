"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import type { Quest } from "@/lib/content/schema";
import type { QuestProgress } from "@/lib/domain/completion";
import { EXTRA_KIND_LABEL, extraDone, extrasOf, withExtraTick } from "@/lib/domain/extras";
import { ProblemFigure } from "./ProblemFigure";
import { StepBody } from "./StepBody";

export type ExtrasPanelProps = {
  quest: Quest;
  progress: QuestProgress;
  onUpdate: (updater: (prev: QuestProgress) => QuestProgress) => Promise<void>;
  onBackToSteps: () => void;
};

/**
 * The quest's extras (6 September 2026, after a first micro:bit session that felt too short):
 * bonus tracks with more to build when there is time, and a make-your-own brief with
 * constraints but no recipe. Nothing here is required; a finished extra is ticked under its own
 * id and shows in the Parent view's week plan.
 */
export function ExtrasPanel({ quest, progress, onUpdate, onBackToSteps }: ExtrasPanelProps) {
  const extras = extrasOf(quest);
  const [saving, setSaving] = useState<string | undefined>(undefined);

  async function setDone(id: string, done: boolean) {
    setSaving(id);
    try {
      await onUpdate((prev) => withExtraTick(prev, id, done));
    } finally {
      setSaving(undefined);
    }
  }

  return (
    <section className="tr-step tr-extras" aria-labelledby={`${quest.id}-extras-title`}>
      <h3 id={`${quest.id}-extras-title`} className="tr-step__title">
        If there is time
      </h3>
      <p className="tr-step__note">
        None of this is required. Bonus tracks add to what you built; Make your own hands you a brief and the rest is yours.
      </p>
      {extras.map((extra) => {
        const done = extraDone(progress, extra.id);
        return (
          <article key={extra.id} className={done ? "tr-extra tr-extra--done" : "tr-extra"} aria-labelledby={`${extra.id}-title`}>
            <div className="tr-extra__head">
              <Chip tone={extra.kind === "invent" ? "flag" : undefined}>{EXTRA_KIND_LABEL[extra.kind]}</Chip>
              <span className="tr-extra__minutes">About {extra.minutes} minutes</span>
            </div>
            <h4 id={`${extra.id}-title`} className="tr-extra__title">
              {extra.title}
            </h4>
            <StepBody text={extra.body} />
            {extra.figure ? <ProblemFigure figure={extra.figure} /> : null}
            <div className="tr-step__actions">
              {done ? (
                <>
                  <span className="tr-step__done">Done.</span>
                  <Button variant="quiet" onClick={() => void setDone(extra.id, false)} disabled={saving === extra.id}>
                    Undo
                  </Button>
                </>
              ) : (
                <Button variant="secondary" onClick={() => void setDone(extra.id, true)} disabled={saving === extra.id}>
                  {saving === extra.id ? "Saving..." : "I did this"}
                </Button>
              )}
            </div>
          </article>
        );
      })}
      <div className="tr-quest__nav">
        <Button variant="quiet" onClick={onBackToSteps}>
          Back to the steps
        </Button>
      </div>
    </section>
  );
}
