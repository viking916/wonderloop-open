"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmResetButton } from "@/components/parent/ResetControls";
import { buildSkillInputs } from "@/lib/data/skills-recompute";
import { getQuest } from "@/lib/content/app-content";
import { setParentComment } from "@/lib/data/logs";
import { approveParentReview } from "@/lib/data/progress";
import { resetProblem } from "@/lib/data/resets";
import type { LogDoc } from "@/lib/data/types";
import { coveringResetAt, type ResetRecord } from "@/lib/domain/resets";
import { formatDateTime } from "@/lib/format";
import { useSession, type Profile } from "@/lib/session";
import { PastWorking } from "@/components/quest/PastWorking";
import type { WorkingContent } from "@/components/quest/WorkingSpace";

/** Task 43: one problem's saved working, resolved against its quest for display (a working
 * document itself carries no quest/week -- only lib/content/app-content.ts's getProblem knows
 * that, the same lookup computeExplainItems in app/parent/page.tsx already does for explain-it
 * answers). Read-only here, same as the mistake-box return: nothing on this screen edits or
 * clears a working. */
export type WorkingItem = {
  problemId: string;
  questId: string;
  questTitle: string;
  week: number;
  content: WorkingContent;
  at: number;
};

export type ExplainItItem = {
  problemId: string;
  questId: string;
  questTitle: string;
  week: number;
  answer: string;
  at: number;
  approved: boolean;
};

export type LogListProps = {
  profile: Profile;
  householdId: string;
  logs: Array<{ id: string; log: LogDoc }>;
  explainItems: ExplainItItem[];
  /** Every reset on record for this profile (task 13 fix 1). A quest/week/season reset never
   * deletes logs or artifacts (lib/data/resets.ts's performReset), so a log can outlive a reset
   * that returns its own quest to "Not started"; LogRow uses lib/domain/resets.ts's
   * coveringResetAt to tell whether that happened, so a surviving log never reads as live work
   * against a quest the same screen shows as reset. */
  resets: ResetRecord[];
  /** Task 43: every problem with a saved working (typed notes and/or pen strokes), newest
   * first, shown read-only -- surfacing the working space in the log area the same way the
   * mistake-box return does. */
  workingItems: WorkingItem[];
};

function LogRow({
  hid, pid, id, log, resets,
}: {
  hid: string; pid: string; id: string; log: LogDoc; resets: ResetRecord[];
}) {
  const [comment, setComment] = useState(log.parentComment ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const quest = getQuest(log.questId);
  const resetAt = quest
    ? coveringResetAt(log.at, { questId: quest.id, season: quest.season, week: quest.week }, resets)
    : undefined;

  // Final review, minor finding: this had no catch -- a rejected write left `saving` cleared by
  // the finally below (so the button did revert from "Saving…"), but as an unhandled promise
  // rejection with no way for the parent to tell "saved" from "silently failed". Same shape as
  // ResetControls.tsx's own error handling: catch, show the message, let the parent try again.
  const save = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    setError(undefined);
    try {
      await setParentComment(hid, pid, id, comment);
      setSaved(true);
    } catch (err) {
      console.error("Wonderloop: could not save that comment", err);
      setError(err instanceof Error ? err.message : "Could not save just now. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }, [hid, pid, id, comment]);

  return (
    <li className="pr-log__row">
      <div className="pr-log__row-head">
        <p className="pr-log__title">{quest ? `${quest.title} (week ${quest.week})` : log.questId}</p>
        <p className="pr-log__at">{formatDateTime(log.at)}</p>
      </div>
      {resetAt !== undefined ? (
        <p className="pr-log__stale">From an earlier run, reset on {formatDateTime(resetAt)}.</p>
      ) : null}
      <ol className="pr-log__answers">
        {log.answers.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ol>
      <div className="pr-log__comment">
        <label htmlFor={`log-comment-${id}`}>Parent comment</label>
        <div className="tr-answer__row">
          <input
            id={`log-comment-${id}`}
            className="tr-answer__input"
            type="text"
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              setSaved(false);
            }}
            placeholder="A one-line note for this log"
          />
          <Button variant="secondary" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : saved ? "Saved" : "Save"}
          </Button>
        </div>
        {error ? <p role="alert" className="pr-confirm__error">{error}</p> : null}
      </div>
    </li>
  );
}

/**
 * Explorer detail, third part (task 13 brief): the logs list with a one-line comment field per
 * log (lib/data/logs.ts's setParentComment), plus a thumbs-up or "redo" control on explain-it
 * answers -- the rubric (not-auto-graded) problems spec 7.3 describes ("no auto-grade... parent
 * sees it and can thumbs-up or mark redo"). Thumbs-up persists a quiet acknowledgement
 * (lib/data/progress.ts's approveParentReview); redo is the real, logged, skill-recomputing
 * reset (lib/data/resets.ts's resetProblem) behind the same confirm dialog every other reset
 * uses, not a second, lighter-weight reset path.
 */
export function LogList({ profile, householdId, logs, explainItems, resets, workingItems }: LogListProps) {
  const { user } = useSession();
  const uid = user?.uid ?? "unknown";

  const approve = useCallback(
    (questId: string, problemId: string) => approveParentReview(householdId, profile.id, questId, problemId),
    [householdId, profile.id],
  );
  const redo = useCallback(
    async (questId: string, problemId: string) => {
      const inputs = await buildSkillInputs(householdId, profile.id);
      await resetProblem(householdId, profile.id, questId, problemId, uid, inputs);
    },
    [householdId, profile.id, uid],
  );

  return (
    <Card tone="surface" shadow className="pr-loglist">
      <section aria-labelledby={`explainit-${profile.id}`}>
        <p className="tr-eyebrow" id={`explainit-${profile.id}`}>
          Explain-it answers waiting for a look
        </p>
        {explainItems.length === 0 ? (
          <EmptyState title="Nothing waiting" description="A written proof or explain-it appears here once it is submitted." />
        ) : (
          <ul className="pr-mistakebox__list">
            {explainItems.map((item) => (
              <li key={item.problemId} className="pr-mistakebox__row pr-mistakebox__row--wrap">
                <div>
                  <p className="pr-mistakebox__title">
                    {item.questTitle} (week {item.week})
                  </p>
                  <p className="pr-log__answer-text">&ldquo;{item.answer}&rdquo;</p>
                  <p className="pr-mistakebox__due">{formatDateTime(item.at)}</p>
                </div>
                <div className="pr-mistakebox__actions">
                  {/* Task 20: this used to be a still-clickable button labelled "Approved" once
                      approved (variant="default", a tier meant only for the dark forest header --
                      already a misuse -- reused here on a light card), duplicating the "Approved"
                      text already shown above in the title. approveParentReview is one-way (no
                      unapprove exists), so once true this is a state, not a control: a status
                      Chip, not a button that looks like it might still do something. */}
                  {item.approved ? (
                    <Chip tone="positive">Approved</Chip>
                  ) : (
                    <Button variant="secondary" onClick={() => void approve(item.questId, item.problemId)}>
                      Thumbs up
                    </Button>
                  )}
                  <ConfirmResetButton
                    label="Redo"
                    detail={`This clears this explain-it answer from "${item.questTitle}" (week ${item.week}) so it can be attempted again. The Maker's Log and any artifacts are kept. A record of this reset is kept.`}
                    onConfirm={() => redo(item.questId, item.problemId)}
                    successMessage={() => "Cleared for a redo."}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Task 43: read-only, the same way the mistake-box return is -- nothing here approves,
          clears or grades a working. Placed between explain-it answers and Logs, the two other
          "here is what he actually did" sections this card already shows. */}
      <section aria-labelledby={`workings-${profile.id}`}>
        <p className="tr-eyebrow" id={`workings-${profile.id}`}>
          Working spaces
        </p>
        {workingItems.length === 0 ? (
          <EmptyState title="Nothing saved yet" description="Notes or a drawing from the working space appear here once he saves something." />
        ) : (
          <ul className="pr-mistakebox__list">
            {workingItems.map((item) => (
              <li key={item.problemId} className="pr-mistakebox__row pr-mistakebox__row--wrap">
                <div className="pr-workings__item">
                  <p className="pr-mistakebox__title">
                    {item.questTitle} (week {item.week})
                  </p>
                  <p className="pr-mistakebox__due">{formatDateTime(item.at)}</p>
                  <PastWorking content={item.content} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`logs-${profile.id}`}>
        <p className="tr-eyebrow" id={`logs-${profile.id}`}>
          Logs
        </p>
        {logs.length === 0 ? (
          <EmptyState title="No logs yet" description="A Maker's Log, Speak log or Practice log appears here once it is submitted." />
        ) : (
          <ul className="pr-log__list">
            {logs.map(({ id, log }) => (
              <LogRow key={id} hid={householdId} pid={profile.id} id={id} log={log} resets={resets} />
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}
