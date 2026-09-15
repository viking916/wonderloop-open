"use client";

import { useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmResetButton } from "@/components/parent/ResetControls";
import { buildSkillInputs } from "@/lib/data/skills-recompute";
import { getIdea, getProblem } from "@/lib/content/app-content";
import { dueItems, type ReviewItem } from "@/lib/domain/review";
import { resetProblem } from "@/lib/data/resets";
import { formatDate, formatDateTime } from "@/lib/format";
import { useSession, type Profile } from "@/lib/session";

export type FastFailFlag = { problemId: string; questId: string; at: number };

export type MistakeBoxProps = {
  profile: Profile;
  householdId: string;
  reviewQueue: ReviewItem[];
  now: number;
  ideaCount: number;
  fastFailFlags: FastFailFlag[];
};

/**
 * Explorer detail, second half: the mistake box (what is due and when, and the idea each item
 * practises), the idea box count, and the fast-fail flags from attempts.ts's viewProblem
 * (task 13 brief). Every scheduling fact -- dueAt, whether an item is ready today, the
 * fast-fail flag itself -- was already decided by lib/domain/review.ts and lib/domain/attempts.ts
 * before this renders; this component only resolves ids to readable text and offers a
 * per-problem reset.
 */
export function MistakeBox({ profile, householdId, reviewQueue, now, ideaCount, fastFailFlags }: MistakeBoxProps) {
  const { user } = useSession();
  const uid = user?.uid ?? "unknown";
  const ready = dueItems(reviewQueue, now);
  const readyIds = new Set(ready.map((i) => i.problemId));

  const resetOneProblem = useCallback(
    async (questId: string, problemId: string) => {
      const inputs = await buildSkillInputs(householdId, profile.id);
      await resetProblem(householdId, profile.id, questId, problemId, uid, inputs);
    },
    [householdId, profile.id, uid],
  );

  return (
    <Card tone="surface" shadow className="pr-mistakebox">
      <section aria-labelledby={`mistakebox-${profile.id}`}>
        <p className="tr-eyebrow" id={`mistakebox-${profile.id}`}>
          Mistake box · {reviewQueue.length} coming back
        </p>
        {reviewQueue.length === 0 ? (
          <EmptyState title="Mistake box is empty" description="A wrong first try comes back here for a second look." />
        ) : (
          <ul className="pr-mistakebox__list">
            {reviewQueue.map((item) => {
              const resolved = getProblem(item.problemId);
              const idea = resolved ? getIdea(resolved.problem.ideaId) : undefined;
              return (
                <li key={item.problemId} className="pr-mistakebox__row">
                  <div>
                    <p className="pr-mistakebox__title">{resolved ? `${resolved.quest.title} (week ${resolved.quest.week})` : item.problemId}</p>
                    <p className="pr-mistakebox__due">
                      {readyIds.has(item.problemId) ? "Ready now" : `Due back ${formatDate(item.dueAt)}`}
                      {idea ? ` · practises ${idea.name}` : ""}
                    </p>
                  </div>
                  {resolved ? (
                    <ConfirmResetButton
                      label="Reset this problem"
                      detail={`This deletes every attempt on this problem from "${resolved.quest.title}" (week ${resolved.quest.week}) and removes it from the mistake box. The Maker's Log and any artifacts are kept. A record of this reset is kept.`}
                      onConfirm={() => resetOneProblem(resolved.quest.id, item.problemId)}
                      successMessage={() => "That problem has been reset."}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby={`ideabox-${profile.id}`}>
        <p className="tr-eyebrow" id={`ideabox-${profile.id}`}>
          Idea box
        </p>
        <p className="pr-mistakebox__idea-count">{ideaCount} ideas met so far</p>
      </section>

      <section aria-labelledby={`fastfail-${profile.id}`}>
        <p className="tr-eyebrow" id={`fastfail-${profile.id}`}>
          Fast-fail flags
        </p>
        {fastFailFlags.length === 0 ? (
          <EmptyState title="No fast-fail flags" description="Flagged when three wrong answers come with under 30 seconds of real thinking time." />
        ) : (
          <ul className="pr-mistakebox__list">
            {fastFailFlags.map((flag) => {
              const resolved = getProblem(flag.problemId);
              return (
                <li key={flag.problemId} className="pr-mistakebox__row">
                  <div>
                    <p className="pr-mistakebox__title">{resolved ? `${resolved.quest.title} (week ${resolved.quest.week})` : flag.problemId}</p>
                    <p className="pr-mistakebox__due">Three wrong tries, {formatDateTime(flag.at)}</p>
                  </div>
                  {resolved ? (
                    <ConfirmResetButton
                      label="Reset this problem"
                      detail={`This deletes every attempt on this problem from "${resolved.quest.title}" (week ${resolved.quest.week}) and removes it from the mistake box. The Maker's Log and any artifacts are kept. A record of this reset is kept.`}
                      onConfirm={() => resetOneProblem(flag.questId, flag.problemId)}
                      successMessage={() => "That problem has been reset."}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Card>
  );
}
