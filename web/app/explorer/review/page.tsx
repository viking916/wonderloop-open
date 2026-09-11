"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Header } from "@/components/ui/Header";
import { Button } from "@/components/ui/Button";
import { RequireProfile } from "@/components/RequireProfile";
import { SwitchProfileButton } from "@/components/SwitchProfileButton";
import { ProblemPlayer } from "@/components/quest/ProblemPlayer";
import { getProblem } from "@/lib/content/app-content";
import type { Problem, Step } from "@/lib/content/schema";
import { emptyQuestProgress } from "@/lib/domain/completion";
import { REVIEW_QUEST_ID, dueItems, problemForReview, type ReviewItem } from "@/lib/domain/review";
import { watchProgress, watchReviewQueue } from "@/lib/data/progress";
import type { ProgressDoc } from "@/lib/data/types";
import { formatDate } from "@/lib/format";
import { profileInitials, useSession, type Profile } from "@/lib/session";

// Task 17 (final review finding C2): a wrong first try schedules an authored variant of the
// same problem, in a new shape, 14 days later (spec 7.4); this is the screen that actually
// serves it. Before this, dueItems/clearOnVariantSuccess/problem.variant had no reader at all --
// This Week's "N coming back" and SideStrip's "N ready to try again" named a promise the app
// could not keep.
//
// One item at a time, not a "Problem X of Y" set like a quest's problem-set step: a mistake-box
// item is deliberately a single, short return to one thing he already met, not a new practice
// set, and it is capped at MAX_REVIEW_BATCH per visit (see below) rather than showing every due
// item at once, since a real mistake box can hold dozens.

/** How many due items one visit works through, soonest-due first. A due item can genuinely be
 * dozens deep (every miss across 12 weeks lands here); this caps a single sitting to a length a
 * 9-year-old working alone will actually finish, matching a problem-set step's usual size.
 * Anything past this is still due and still counted on This Week -- opening review again picks
 * up the next ones. */
const MAX_REVIEW_BATCH = 5;

export default function ReviewPage() {
  return <RequireProfile kind="explorer">{(profile) => <ReviewWithHousehold profile={profile} />}</RequireProfile>;
}

function ReviewWithHousehold({ profile }: { profile: Profile }) {
  const { householdId } = useSession();
  // Invariant: session.tsx never sets status "ready" without a householdId (matches every other
  // Explorer screen's own guard) -- a type-narrowing guard, not a real-world fallback.
  if (!householdId) return null;
  return <ReviewHome key={`${householdId}:${profile.id}`} profile={profile} householdId={householdId} />;
}

function ReviewHome({ profile, householdId }: { profile: Profile; householdId: string }) {
  const [now] = useState(() => Date.now());

  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  useEffect(() => {
    const unsub = watchReviewQueue(householdId, profile.id, (items) => {
      setReviewQueue(items);
      setQueueLoaded(true);
    });
    return unsub;
  }, [householdId, profile.id]);

  // The review progress doc (progress/review, never a real quest id -- see
  // lib/domain/review.ts's REVIEW_QUEST_ID doc comment for why that keeps a variant attempt
  // cycle from ever touching the same problem's real quest progress).
  const [reviewProgressDoc, setReviewProgressDoc] = useState<ProgressDoc | undefined>(undefined);
  const [progressLoaded, setProgressLoaded] = useState(false);
  useEffect(() => {
    const unsub = watchProgress(householdId, profile.id, (list) => {
      setReviewProgressDoc(list.find((p) => p.questId === REVIEW_QUEST_ID)?.progress);
      setProgressLoaded(true);
    });
    return unsub;
  }, [householdId, profile.id]);

  // The batch is snapshotted once, the first time the queue has loaded, and never recomputed
  // from there: reviewQueue keeps updating live as items clear or reschedule (so This Week's
  // count and this page's own "done for now" screen both stay honest), but re-deriving the
  // batch from that live list on every render would let an item vanish out from under an index
  // the moment it clears, reshuffling whatever is still on screen. batch === null means "not
  // decided yet"; [] is a real, decided "nothing was due".
  // Adjusted during render rather than in an effect: the `batch === null` guard makes this
  // idempotent (fires only once, the first render where the queue is loaded and no batch has
  // been decided yet), same as the effect it replaces, without an extra commit+effect cycle.
  const [batch, setBatch] = useState<ReviewItem[] | null>(null);
  if (queueLoaded && batch === null) {
    const due = dueItems(reviewQueue, now).filter((item) => Boolean(getProblem(item.problemId)));
    setBatch(due.slice(0, MAX_REVIEW_BATCH));
  }

  const [reviewIndex, setReviewIndex] = useState(0);
  const current = batch?.[reviewIndex];
  const resolved = current ? getProblem(current.problemId) : undefined;

  const reviewProblem = useMemo<Problem | undefined>(
    () => (resolved ? problemForReview(resolved.problem) : undefined),
    [resolved],
  );
  const hasVariant = Boolean(resolved?.problem.variant);

  const step: Extract<Step, { kind: "problem-set" }> | undefined = useMemo(() => {
    if (!current || !reviewProblem) return undefined;
    return { kind: "problem-set", id: `review-${current.problemId}`, title: "Second look", lane: "skills", problems: [reviewProblem] };
  }, [current, reviewProblem]);

  // The whole review doc's `quest` (problemOutcomes) is never persisted here: with exactly one
  // problem per ProblemPlayer instance, ProblemPlayer only ever reads that prop to pick which
  // problem to open first in a multi-problem step, which is moot at length 1 (see
  // ProblemPlayer.tsx's own index initializer). onUpdate stays a genuine no-op for the same
  // reason -- the real, load-bearing writes (the attempt, problemsProgress, and the mistake-box
  // item itself) all still happen, inside ProblemPlayer, exactly as they do in a real quest.
  const onUpdate = useMemo(() => async () => {}, []);

  function goToNext() {
    setReviewIndex((i) => i + 1);
  }

  const nextUpcoming = [...reviewQueue].sort((a, b) => a.dueAt - b.dueAt)[0];

  return (
    <div className="flex flex-col flex-1">
      <Header
        userName={profile.name}
        initials={profileInitials(profile.name)}
        rightSlot={<SwitchProfileButton />}
      />
      <main className="mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6">
        <Card tone="surface" shadow className="!p-0">
          <div className="tr-quest__main">
            <p className="tr-eyebrow">Mistake box</p>
            <h2 className="tr-quest__title">Second look</h2>
            {/* Always reachable, not only once a batch finishes -- QuestShell's own Back/
                Continue bar stays visible the same way, so a child is never left on a finished
                item's screen with nothing to press (final review, minor finding, about a
                permanently-disabled in-player "Skip for now" on a one-problem step: real
                navigation living outside the player is what keeps that from being a dead end). */}
            <Button variant="quiet" href="/explorer" className="tr-quest__park">
              Back to This week
            </Button>

            {!queueLoaded || !progressLoaded || batch === null ? null : batch.length === 0 ? (
              <EmptyState
                title={reviewQueue.length === 0 ? "Mistake box is empty" : "Nothing ready yet"}
                description={
                  reviewQueue.length === 0
                    ? "A wrong first try comes back here for a second look, in a new shape."
                    : nextUpcoming
                      ? `The next one comes back ${formatDate(nextUpcoming.dueAt)}.`
                      : "Come back another day."
                }
                action={
                  <Button variant="primary" href="/explorer">
                    Back to This week
                  </Button>
                }
              />
            ) : current && step && reviewProblem ? (
              <>
                <p className="tr-tries">
                  Item {reviewIndex + 1} of {batch.length}
                </p>
                <ProblemPlayer
                  key={current.problemId}
                  step={step}
                  quest={{ ...resolved!.quest, id: REVIEW_QUEST_ID }}
                  progress={emptyQuestProgress()}
                  problemsProgress={reviewProgressDoc?.problems ?? {}}
                  progressLoaded={progressLoaded}
                  householdId={householdId}
                  profileId={profile.id}
                  onUpdate={onUpdate}
                  onFinished={goToNext}
                  reviewNote={
                    hasVariant
                      ? undefined
                      : "This one does not have a new version yet, so here it is again. Give it another look."
                  }
                />
              </>
            ) : (
              <EmptyState
                title="All done for now"
                description="Nice work. Come back to This week for what is next."
                action={
                  <Button variant="primary" href="/explorer">
                    Back to This week
                  </Button>
                }
              />
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
