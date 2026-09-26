"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { extrasSummary } from "@/lib/domain/extras";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { TRACK_LABEL, TRACK_ORDER, type Quest, type Track } from "@/lib/content/schema";
import { emptyQuestProgress } from "@/lib/domain/completion";
import { finishedClocks } from "@/lib/domain/clock";
import { trackCardModel, type TrackCardStatus } from "@/lib/domain/trackCard";
import { questTimeLabel } from "@/lib/domain/questTime";
import type { ProgressDoc } from "@/lib/data/types";
import { useSession, type Profile } from "@/lib/session";


const STATUS_LABEL: Record<TrackCardStatus, string> = { done: "Done", current: "In progress", todo: "Not started" };
// Task 20: a status chip's tone should carry the same meaning as elsewhere in the app --
// tone="positive" already reads as "finished" (LogList's "Approved", the shopping list's
// "Bought"), tone="progress" as "under way" -- rather than every status looking identical.
const STATUS_TONE: Record<TrackCardStatus, "positive" | "progress" | "neutral"> = {
  done: "positive",
  current: "progress",
  todo: "neutral",
};

/** True for a Think quest that carries a monster problem-set (lane "monster"). A1 (2026-09-24):
 * the monster is visible on This Week for its whole sprint and never holds the week up, so this
 * week's own plan says so beside it rather than leaving a parent to wonder why the week reads
 * done while a problem is still open. */
function hasMonsterStep(quest: Quest): boolean {
  return quest.steps.some((s) => s.kind === "problem-set" && s.lane === "monster");
}

export type WeekPlanProps = {
  profile: Profile;
  quests: Partial<Record<Track, Quest>>;
  progressDocs: Record<string, ProgressDoc>;
};

/**
 * Explorer detail, top half (task 13 brief: "the week's three quests with status and a link
 * into each"). Status, progress and the resume/done wording come entirely from
 * lib/domain/trackCard.ts's trackCardModel (the same model This Week's own TrackCards use);
 * this component adds only the parent-facing extra, a direct link into the quest. The per-quest
 * reset used to live in this row too (a status chip, a bonus count, Open as Explorer and a
 * destructive Reset all crowded into one cluster, repeated four times, and the progress bar's
 * width varied row to row because it sat inside a flex item that grew or shrank with its
 * neighbour); polish pass, 15 September 2026, moved every quest reset to Settings > Resets
 * (components/parent/QuestResets.tsx) so this row stays a single read: eyebrow, title beside its
 * status chip, the bonus count as a quiet meta line, a full-width progress bar, and one action.
 *
 * The link into each quest (task 13 review, Important #2): RequireProfile gates
 * /explorer/quest/{questId} on the *active* profile being kind "explorer" (see
 * components/RequireProfile.tsx), so a plain href here bounced the parent straight back to the
 * picker -- a control that never once worked for the only profile that sees it. "Open as
 * Explorer" instead switches the active profile to this child (the same client-side state
 * SwitchProfileButton and the profile picker already use) and then navigates, which is how a
 * parent would actually use it: dropping into the child's own view to see the quest for real,
 * one tap away from switching back.
 *
 * The navigation is a real page load (window.location, not next/navigation's client router) on
 * purpose: setActiveProfile's React state update and this component's own unmount (we are
 * leaving /parent, which RequireProfile gates on kind "parent") both happen asynchronously, so a
 * client-side router.push here raced RequireProfile's own away-effect on /parent -- confirmed
 * live, it fired first and stomped the navigation, landing on /explorer instead of the quest. A
 * full navigation sidesteps the race entirely: setActiveProfile's localStorage write (synchronous,
 * see lib/session.tsx) completes before the browser starts unloading, so the fresh page mounts
 * with the *already-switched* profile from the very first render, before RequireProfile ever sees
 * a mismatch to redirect away from.
 *
 * This is exactly the gap RouteProgressBar.tsx's own doc comment names: a plain <button onClick>
 * that navigates via window.location, invisible to that shared bar's anchor-click listener. So
 * this button carries its own pending state instead, set the instant it is pressed and left on
 * (there is no "settled" to clear it to -- the page unloads out from under it): aria-busy and the
 * blocked-repeat-click behaviour are immediate, same as everywhere else Button.tsx is used, and
 * the browser's own navigation is what eventually ends it, not this component.
 */
export function WeekPlan({ profile, quests, progressDocs }: WeekPlanProps) {
  const { setActiveProfile } = useSession();
  const present = TRACK_ORDER.filter((track) => quests[track]);
  const [openingQuestId, setOpeningQuestId] = useState<string | undefined>(undefined);

  const openQuest = useCallback(
    (questId: string) => {
      if (openingQuestId !== undefined) return;
      setOpeningQuestId(questId);
      setActiveProfile(profile.id);
      window.location.href = `/explorer/quest/${questId}`;
    },
    [profile.id, setActiveProfile, openingQuestId],
  );

  if (present.length === 0) {
    return (
      <Card tone="surface" shadow className="pr-weekplan">
        <EmptyState title="Nothing planned yet" description="This week's quests have not been loaded yet." />
      </Card>
    );
  }

  return (
    <Card tone="surface" shadow className="pr-weekplan" aria-labelledby={`weekplan-${profile.id}`}>
      <p className="tr-eyebrow" id={`weekplan-${profile.id}`}>
        This week&apos;s quests
      </p>
      <ul className="pr-weekplan__list">
        {present.map((track) => {
          const quest = quests[track]!;
          const progress = progressDocs[quest.id]?.quest ?? emptyQuestProgress();
          const model = trackCardModel(quest, progress);
          const extras = extrasSummary(quest, progress);
          return (
            <li key={quest.id} className="pr-weekplan__row">
              <span className="tr-eyebrow">
                {TRACK_LABEL[track]} · {questTimeLabel(quest)}
              </span>
              <div className="pr-weekplan__row-title">
                <div className="pr-weekplan__row-title-text">
                  <h3>{quest.title}</h3>
                  <Chip tone={STATUS_TONE[model.status]}>{STATUS_LABEL[model.status]}</Chip>
                </div>
                <Button
                  variant="secondary"
                  className="pr-weekplan__open-btn"
                  onClick={() => openQuest(quest.id)}
                  pending={openingQuestId === quest.id}
                  pendingLabel="Opening as Explorer"
                >
                  Open as Explorer
                </Button>
              </div>
              {extras.total > 0 ? <p className="tr-meta">Bonus tracks: {extras.done} of {extras.total}</p> : null}
              {/* The chip above already says the status; a meta line that repeats it word for
                  word ("Not started" beside a "Not started" chip) said the same thing twice
                  (polish pass, 15 September 2026). Only a meta line that adds real information
                  (progress, time left) is shown. */}
              {model.meta !== STATUS_LABEL[model.status] ? <p className="pr-weekplan__meta">{model.meta}</p> : null}
              {track === "think" && hasMonsterStep(quest) ? (
                <p className="pr-weekplan__meta">Monster problem: open all month, does not hold up this week.</p>
              ) : null}
              {finishedClocks(quest, progress).map((c) => (
                <p key={c.stepId} className="pr-weekplan__meta">
                  {c.title}: {c.minutes} {c.minutes === 1 ? "minute" : "minutes"} with the clock, used by choice, never as a score.
                </p>
              ))}
              <ProgressBar
                className="pr-weekplan__row-bar"
                value={model.progress}
                tone={model.status === "done" ? "moss" : "blaze"}
                label={`${quest.title} progress`}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
