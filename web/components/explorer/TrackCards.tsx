import { EmptyState } from "../ui/EmptyState";
import { TrackCard } from "../ui/TrackCard";
import { getContent } from "../../lib/content/app-content";
import { TRACK_LABEL, TRACK_ORDER, type Quest, type Track } from "../../lib/content/schema";
import { emptyQuestProgress } from "../../lib/domain/completion";
import { newQuestMaterials } from "../../lib/domain/materials";
import { trackCardModel } from "../../lib/domain/trackCard";
import type { ProgressDoc } from "../../lib/data/types";

/** A fixed decorative bitmap for every Build card, the one Circuit-look detail the approved
 * demo (trail-v2.html) borrows for Build tracks; it carries no data, so it never changes. */
const LED_PATTERN = [
  false, true, true, true, false,
  true, false, false, false, true,
  true, false, true, false, true,
  true, false, false, false, true,
  false, true, true, true, false,
];

function stampLabelFor(completedAt: number | undefined): string {
  if (!completedAt) return "done";
  const day = new Date(completedAt).toLocaleDateString(undefined, { weekday: "short" }).toLowerCase();
  return `done\n${day}`;
}

export interface TrackCardsProps {
  quests: Partial<Record<Track, Quest>>;
  /** Keyed by questId; a quest with no document yet is treated as never started. */
  progressDocs: Record<string, ProgressDoc>;
  hrefFor: (questId: string) => string;
}

/**
 * The week's three track cards (spec 7.1 screen 2). Every status, progress percentage, meta
 * line and action label comes from lib/domain/trackCard.ts's trackCardModel, which itself only
 * composes lib/domain/completion.ts's tested questStatus/resumePosition/weekSummary -- nothing
 * here decides completion or resume position on its own.
 */
export function TrackCards({ quests, progressDocs, hrefFor }: TrackCardsProps) {
  const present = TRACK_ORDER.filter((track) => quests[track]);

  if (present.length === 0) {
    return (
      <div className="tr-tracks">
        <EmptyState
          title="Nothing planned yet"
          description="This week's quests have not been loaded yet. Try again soon."
        />
      </div>
    );
  }

  return (
    <div className={present.length >= 5 ? "tr-tracks tr-tracks--five" : present.length === 4 ? "tr-tracks tr-tracks--four" : "tr-tracks"}>
      {present.map((track) => {
        const quest = quests[track]!;
        const doc = progressDocs[quest.id];
        const progress = doc?.quest ?? emptyQuestProgress();
        const model = trackCardModel(quest, progress);
        const newMaterials = newQuestMaterials(getContent().quests, quest);

        return (
          <TrackCard
            key={quest.id}
            eyebrow={`${TRACK_LABEL[track]} · ${quest.minutes} min`}
            title={quest.title}
            description={quest.summary}
            status={model.status}
            progress={model.progress}
            meta={model.meta}
            ctaLabel={model.ctaLabel}
            ctaHref={hrefFor(quest.id)}
            stampLabel={model.status === "done" ? stampLabelFor(doc?.completedAt) : undefined}
            ledPattern={track === "build" ? LED_PATTERN : undefined}
            materials={quest.materials}
            newMaterials={newMaterials}
          />
        );
      })}
    </div>
  );
}
