"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getContent, getSproutWeek, getWeek } from "@/lib/content/app-content";
import { problemsOf } from "@/lib/content/lookup";
import { resetSeason, resetWeek } from "@/lib/data/resets";
import { buildSkillInputs, recomputeAndSaveSkills } from "@/lib/data/skills-recompute";
import { useSession, type Profile } from "@/lib/session";

/** Every quest id and every problem id a week or a season touches (Explorer profiles only --
 * a Sprout week/season reset passes its three activity ids per week as "quest ids" with no
 * problems, built by the caller). */
export function weekScope(seasonId: number, week: number): { questIds: string[]; problemIds: string[] } {
  const quests = Object.values(getWeek(seasonId, week)).filter((q): q is NonNullable<typeof q> => Boolean(q));
  const questIds = quests.map((q) => q.id);
  const problemIds = quests.flatMap((q) => q.steps.flatMap((s) => problemsOf(s).map((p) => p.id)));
  return { questIds, problemIds };
}

export function seasonScope(seasonId: number): { questIds: string[]; problemIds: string[] } {
  const quests = getContent().quests.filter((q) => q.season === seasonId);
  const questIds = quests.map((q) => q.id);
  const problemIds = quests.flatMap((q) => q.steps.flatMap((s) => problemsOf(s).map((p) => p.id)));
  return { questIds, problemIds };
}

/** A Sprout week has no problems: its three activity ids stand in for "quest ids" here, since
 * lib/data/resets.ts's performReset only ever deletes a progress doc per id in questIds and
 * clears reviewQueue entries per id in problemIds -- an activity's progress doc is deleted the
 * same way a quest's is, and there is simply nothing in problemIds to pass. */
export function sproutWeekScope(season: number, week: number): { questIds: string[]; problemIds: string[] } {
  const w = getSproutWeek(season, week);
  return { questIds: w ? w.activities.map((a) => a.id) : [], problemIds: [] };
}

export function sproutSeasonScope(season: number): { questIds: string[]; problemIds: string[] } {
  const questIds: string[] = [];
  for (let week = 1; week <= 12; week++) {
    const w = getSproutWeek(season, week);
    if (w) questIds.push(...w.activities.map((a) => a.id));
  }
  return { questIds, problemIds: [] };
}

export type ConfirmResetButtonProps = {
  /** The trigger's own label, e.g. "Reset this quest". */
  label: string;
  /** Exactly what will be deleted, named plainly, shown inside the confirm dialog (spec 7.2:
   * "a confirm dialog naming exactly what will be deleted"). */
  detail: string;
  onConfirm: () => Promise<void>;
  /** onConfirm's result, shown once it settles (e.g. a recomputed skill count). */
  successMessage?: (result: void) => string;
  disabled?: boolean;
};

/**
 * A single reset action behind a native <dialog> confirm (spec 7.2 and task 13 brief: "each
 * behind a confirm dialog naming exactly what will be deleted and cannot be triggered by a
 * stray click"). Opening the dialog needs a real activation (a click, or Tab-then-Enter) on the
 * destructive trigger button below; showModal() then moves focus inside the dialog and makes the
 * rest of the page inert, and Cancel sits before Confirm in DOM/tab order, so a second, unrelated
 * Enter press on the page can never reach Confirm in one shot -- reaching it needs its own
 * deliberate Tab or click once the dialog is already open.
 *
 * Task 20: this is the ONLY place in the app that ever renders variant="destructive" -- both the
 * trigger and the dialog's own "Yes, reset" confirm, since both are the same real reset action,
 * just one click apart. Nothing else in this component (Cancel, the post-confirm "Close") is
 * destructive: Cancel is the quiet, reversible way out, and once a reset has actually happened
 * "Close" is just dismissing an acknowledgement, not doing anything further to a child's work.
 */
export function ConfirmResetButton({ label, detail, onConfirm, successMessage, disabled }: ConfirmResetButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [done, setDone] = useState<string | undefined>(undefined);

  const open = useCallback(() => {
    setError(undefined);
    setDone(undefined);
    dialogRef.current?.showModal();
  }, []);
  const close = useCallback(() => dialogRef.current?.close(), []);

  const confirm = useCallback(async () => {
    setPending(true);
    setError(undefined);
    try {
      await onConfirm();
      setDone(successMessage ? successMessage(undefined) : "Done.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset. Try again.");
    } finally {
      setPending(false);
    }
  }, [onConfirm, successMessage]);

  return (
    <>
      <Button variant="destructive" onClick={open} disabled={disabled}>
        {label}
      </Button>
      <dialog ref={dialogRef} className="pr-confirm" aria-label={label}>
        {done ? (
          <>
            <p className="tr-eyebrow">Done</p>
            <p>{done}</p>
            <div className="pr-confirm__row">
              <Button variant="primary" onClick={close}>
                Close
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="tr-eyebrow">Are you sure</p>
            <p>{detail}</p>
            <div className="pr-confirm__row">
              <Button variant="quiet" onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void confirm()} disabled={pending}>
                {pending ? "Resetting…" : "Yes, reset"}
              </Button>
            </div>
            {error ? (
              <p role="alert" className="pr-confirm__error">
                {error}
              </p>
            ) : null}
          </>
        )}
      </dialog>
    </>
  );
}

export type ResetControlsProps = {
  profile: Profile;
  householdId: string;
  currentWeek: number;
  /** Explorer only: passed so the week/season buttons can name exactly how many quests and
   * problems they will delete, without recomputing the scope twice. */
  children?: ReactNode;
};

/**
 * The two coarse, whole-week / whole-season reset actions (spec 7.2, task 13 brief: "reset a
 * problem, a quest, a week or a season for a profile"). Problem- and quest-scoped resets live
 * next to the item they apply to (MistakeBox, LogList, WeekPlan) so the confirm dialog can name
 * the one problem or quest in question; this panel only ever offers the two whole-scope resets,
 * since those need a summary the caller builds once (weekScope/seasonScope above), not a
 * per-item control.
 */
export function ResetControls({ profile, householdId, currentWeek, children }: ResetControlsProps) {
  const { user } = useSession();
  const uid = user?.uid ?? "unknown";
  const seasonId = profile.seasonId;

  const runWeekReset = useCallback(async () => {
    const { questIds, problemIds } =
      profile.kind === "sprout" ? sproutWeekScope(seasonId, currentWeek) : weekScope(seasonId, currentWeek);
    const inputs = await buildSkillInputs(householdId, profile.id);
    await resetWeek(householdId, profile.id, `s${seasonId}-w${String(currentWeek).padStart(2, "0")}`, questIds, problemIds, uid, inputs);
  }, [profile.kind, profile.id, seasonId, currentWeek, householdId, uid]);

  const runSeasonReset = useCallback(async () => {
    const { questIds, problemIds } = profile.kind === "sprout" ? sproutSeasonScope(seasonId) : seasonScope(seasonId);
    const inputs = await buildSkillInputs(householdId, profile.id);
    await resetSeason(householdId, profile.id, `s${seasonId}`, questIds, problemIds, uid, inputs);
  }, [profile.kind, profile.id, seasonId, householdId, uid]);

  const weekLabel = profile.kind === "sprout" ? "activities" : "quests, attempts and the mistake box";
  const seasonLabel = profile.kind === "sprout" ? "every week's activities" : "every quest, attempt and the mistake box";
  // Sprout activities never produce a Maker's Log or an artifact (only Explorer quests do), so
  // this reassurance only needs saying for Explorer -- for Sprout it would be reassuring about
  // something that was never at stake (task 13 fix 1: every reset dialog must name exactly what
  // it removes and say plainly that the Maker's Log and any artifacts are kept).
  const keptNote = profile.kind === "sprout" ? "" : " The Maker's Log and any artifacts are kept, but will be marked as being from before this reset.";

  return (
    <Card tone="kraft" className="pr-resets" aria-labelledby={`reset-controls-${profile.id}`}>
      <p className="tr-eyebrow" id={`reset-controls-${profile.id}`}>
        Reset controls
      </p>
      <p className="pr-resets__lede">
        A reset is logged and cannot be undone. Skills recompute from what is left afterward.
      </p>
      <div className="pr-resets__row">
        <ConfirmResetButton
          label={`Reset week ${currentWeek}`}
          detail={`This deletes week ${currentWeek}'s ${weekLabel} for ${profile.name}.${keptNote} A record of this reset is kept.`}
          onConfirm={runWeekReset}
          successMessage={() => `Week ${currentWeek} has been reset.`}
        />
        <ConfirmResetButton
          label={`Reset season ${seasonId}`}
          detail={`This deletes ${seasonLabel} for ${profile.name}, for the whole season.${keptNote} A record of this reset is kept.`}
          onConfirm={runSeasonReset}
          successMessage={() => `Season ${seasonId} has been reset.`}
        />
      </div>
      {children}
    </Card>
  );
}
