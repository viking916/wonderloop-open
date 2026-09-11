"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getSeasonCount } from "@/lib/content/app-content";
import { createProfile, pauseClock, renameProfile, resumeClock, setPlayTrack, startSeason } from "@/lib/data/households";
import { avatarForNewProfile, inheritedProfileFields } from "@/lib/domain/profiles";
import { nextSeasonFor, seasonRollover } from "@/lib/domain/seasons";
import { useSession, type Profile } from "@/lib/session";
import type { ProfileKind } from "@/lib/data/types";

const KIND_LABEL: Record<ProfileKind, string> = { explorer: "Explorer", sprout: "Sprout", parent: "Parent" };

/** "Monday 30 November 2026", for the rollover confirm line. */
function longDate(dateOnly: string): string {
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function defaultBirthYear(kind: ProfileKind): number {
  const thisYear = new Date().getFullYear();
  return kind === "sprout" ? thisYear - 3 : thisYear - 8;
}

/**
 * Task 9 feature 2: "createProfile exists but nothing in the UI calls it... A family that signs
 * up today can never add their children." This is the missing UI: a list of the household's
 * profiles with a rename control on each, and an "add a profile" form.
 *
 * Deliberately offers no delete control (task brief: "Deleting a profile would destroy a
 * child's record and nothing yet asks for it").
 *
 * A new profile always inherits seasonId, startDate and look from an existing profile
 * (lib/domain/profiles.ts's inheritedProfileFields) rather than asking for them, so a second
 * child lands on the same week as their sibling instead of starting the season over. `avatar`
 * is likewise picked automatically (avatarForNewProfile) rather than asked for, since nothing
 * in the app renders it visually yet (every tile shows initials -- lib/session.tsx's
 * profileInitials); the only fields a parent actually types are name, kind and birth year.
 *
 * Season rollover lives here too (owner decision, 4 September 2026): each profile carries its
 * own season, a child's next season starts when the parent says that child is done, and the
 * two children never wait on each other. The control is per row, offered on any season but the
 * last the content ships, behind an inline confirm that names the child, the season and the
 * Monday it counts from. Nothing about the old season is deleted: it stays in the portfolio.
 *
 * Sits behind the same parent-view gate as everything else on this page (ParentPinGate, task 9
 * feature 1), so it needs no gate of its own.
 */
export function ProfileManager({ householdId, profiles }: { householdId: string; profiles: Profile[] }) {
  const { refreshProfiles } = useSession();

  const [renamingId, setRenamingId] = useState<string | undefined>(undefined);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | undefined>(undefined);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ProfileKind>("explorer");
  const [birthYear, setBirthYear] = useState(() => String(defaultBirthYear("explorer")));
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | undefined>(undefined);

  const seasonCount = getSeasonCount();
  const [rolloverId, setRolloverId] = useState<string | undefined>(undefined);
  const [rolloverBusy, setRolloverBusy] = useState(false);
  const [rolloverError, setRolloverError] = useState<string | undefined>(undefined);
  // Read once per confirm so the date on screen is the date written.
  const [rolloverNow, setRolloverNow] = useState(() => Date.now());

  function openRollover(profile: Profile) {
    setRolloverNow(Date.now());
    setRolloverId(profile.id);
    setRolloverError(undefined);
  }

  async function confirmRollover(profile: Profile): Promise<void> {
    const rollover = seasonRollover(profile, seasonCount);
    if (!rollover) return;
    setRolloverBusy(true);
    setRolloverError(undefined);
    try {
      await startSeason(householdId, profile.id, rollover);
      await refreshProfiles();
      setRolloverId(undefined);
    } catch {
      setRolloverError("Could not start the season. Try again.");
    } finally {
      setRolloverBusy(false);
    }
  }

  function startRename(profile: Profile) {
    setRenamingId(profile.id);
    setRenameValue(profile.name);
    setRenameError(undefined);
  }

  async function saveRename(profile: Profile): Promise<void> {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError("Name cannot be empty.");
      return;
    }
    setRenameBusy(true);
    setRenameError(undefined);
    try {
      await renameProfile(householdId, profile.id, trimmed);
      await refreshProfiles();
      setRenamingId(undefined);
    } catch {
      setRenameError("Could not save that name. Try again.");
    } finally {
      setRenameBusy(false);
    }
  }

  function changeAddKind(next: ProfileKind): void {
    setKind(next);
    setBirthYear(String(defaultBirthYear(next)));
  }

  const [pauseBusyId, setPauseBusyId] = useState<string | undefined>(undefined);
  const [pauseError, setPauseError] = useState<string | undefined>(undefined);
  const [pauseErrorId, setPauseErrorId] = useState<string | undefined>(undefined);

  // The week clock (owner decision, 6 September 2026): a child pauses whenever they want and the
  // week waits. Pausing is reversible and loses nothing, so it asks no confirmation; resuming
  // moves the start date forward by the days paused (lib/domain/calendar.ts resumedStartDate).
  async function togglePause(profile: Profile): Promise<void> {
    setPauseBusyId(profile.id);
    setPauseError(undefined);
    try {
      if (profile.pausedAt) await resumeClock(householdId, profile.id, Date.now());
      else await pauseClock(householdId, profile.id, Date.now());
      await refreshProfiles();
    } catch {
      setPauseError("Could not change the week clock. Try again.");
      setPauseErrorId(profile.id);
    } finally {
      setPauseBusyId(undefined);
    }
  }

  const [playBusyId, setPlayBusyId] = useState<string | undefined>(undefined);
  const [playError, setPlayError] = useState<string | undefined>(undefined);
  const [playErrorId, setPlayErrorId] = useState<string | undefined>(undefined);

  // The Play track (instrument practice) is per profile and reversible; turning it off hides the
  // quest cards and nothing else, so it needs no confirmation.
  async function togglePlay(profile: Profile): Promise<void> {
    setPlayBusyId(profile.id);
    setPlayError(undefined);
    try {
      await setPlayTrack(householdId, profile.id, !profile.playTrack);
      await refreshProfiles();
    } catch {
      setPlayError("Could not change the Play track. Try again.");
      setPlayErrorId(profile.id);
    } finally {
      setPlayBusyId(undefined);
    }
  }

  async function submitAdd(e: FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = name.trim();
    const year = Number(birthYear);
    if (!trimmed) {
      setAddError("Give the profile a name.");
      return;
    }
    if (!Number.isInteger(year) || year < 2000 || year > new Date().getFullYear()) {
      setAddError("Enter a real birth year.");
      return;
    }
    setAddBusy(true);
    setAddError(undefined);
    try {
      const existingDocs = profiles.map(({ id: _id, ...rest }) => rest);
      const inherited = inheritedProfileFields(existingDocs);
      const avatar = avatarForNewProfile(kind, existingDocs);
      await createProfile(householdId, { name: trimmed, kind, avatar, birthYear: year, ...inherited });
      await refreshProfiles();
      setName("");
      setAdding(false);
    } catch {
      setAddError("Could not add that profile. Try again.");
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <Card tone="surface" className="pr-profiles" aria-labelledby="profiles-heading">
      <p className="tr-eyebrow" id="profiles-heading">
        Household profiles
      </p>
      <ul className="pr-profiles__list">
        {profiles.map((profile) => (
          <li key={profile.id} className="pr-profiles__item">
            {renamingId === profile.id ? (
              <form
                className="pr-profiles__rename-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveRename(profile);
                }}
              >
                <input
                  className="tr-answer__input"
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  aria-label={`Rename ${profile.name}`}
                  autoFocus
                />
                <Button variant="primary" type="submit" disabled={renameBusy}>
                  {renameBusy ? "Saving…" : "Save"}
                </Button>
                <Button variant="quiet" type="button" onClick={() => setRenamingId(undefined)} disabled={renameBusy}>
                  Cancel
                </Button>
                {renameError ? (
                  <p role="alert" className="pr-confirm__error">
                    {renameError}
                  </p>
                ) : null}
              </form>
            ) : (
              <>
                <span className="pr-profiles__name">{profile.name}</span>
                <span className="pr-profiles__kind">{KIND_LABEL[profile.kind]}</span>
                <Button variant="secondary" onClick={() => startRename(profile)}>
                  Rename
                </Button>
              </>
            )}
            {profile.kind !== "parent" ? (
              <div className="pr-profiles__season">
                {rolloverId === profile.id ? (
                  (() => {
                    const rollover = seasonRollover(profile, seasonCount);
                    if (!rollover) return null;
                    return (
                      <div className="pr-profiles__rollover" role="group" aria-label={`Start ${profile.name}'s season ${rollover.seasonId}`}>
                        <p className="pr-profiles__rollover-text">
                          Start {profile.name}&rsquo;s season {rollover.seasonId}? The week clock starts the day {profile.name} begins
                          its week 1. Anything unfinished in season {profile.seasonId} stays in the portfolio.
                        </p>
                        <div className="pr-pin__row">
                          <Button variant="primary" onClick={() => void confirmRollover(profile)} disabled={rolloverBusy}>
                            {rolloverBusy ? "Starting…" : `Start season ${rollover.seasonId}`}
                          </Button>
                          <Button variant="quiet" type="button" onClick={() => setRolloverId(undefined)} disabled={rolloverBusy}>
                            Cancel
                          </Button>
                        </div>
                        {rolloverError ? (
                          <p role="alert" className="pr-confirm__error">
                            {rolloverError}
                          </p>
                        ) : null}
                      </div>
                    );
                  })()
                ) : (
                  <>
                    <span className="pr-profiles__season-label">
                      Season {profile.seasonId}
                      {nextSeasonFor(profile, seasonCount) === undefined ? ", the last one" : ""}
                      {profile.startDate ? `, from ${longDate(profile.startDate)}` : ", not started yet"}
                      {profile.pausedAt ? `, paused since ${longDate(profile.pausedAt)}` : ""}
                    </span>
                    {profile.startDate ? (
                      <Button variant="secondary" onClick={() => void togglePause(profile)} disabled={pauseBusyId === profile.id}>
                        {pauseBusyId === profile.id ? "Saving…" : profile.pausedAt ? "Resume the week clock" : "Pause the week clock"}
                      </Button>
                    ) : null}
                    {nextSeasonFor(profile, seasonCount) !== undefined ? (
                      <Button variant="secondary" onClick={() => openRollover(profile)} disabled={renamingId === profile.id}>
                        Start season {nextSeasonFor(profile, seasonCount)}
                      </Button>
                    ) : null}
                    {pauseError && pauseErrorId === profile.id ? (
                      <p role="alert" className="pr-confirm__error">
                        {pauseError}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
            {profile.kind === "explorer" ? (
              <div className="pr-profiles__season" role="group" aria-label={`${profile.name}'s Play track`}>
                <span className="pr-profiles__season-label">
                  {profile.playTrack ? "Play track on: instrument practice, one quest a week" : "Play track off: turn it on for a child who takes music lessons"}
                </span>
                <Button variant="secondary" onClick={() => void togglePlay(profile)} disabled={playBusyId === profile.id}>
                  {playBusyId === profile.id ? "Saving…" : profile.playTrack ? "Turn Play off" : "Turn Play on"}
                </Button>
                {playError && playErrorId === profile.id ? (
                  <p role="alert" className="pr-confirm__error">
                    {playError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {adding ? (
        <form className="pr-profiles__add-form" onSubmit={(e) => void submitAdd(e)}>
          <label>
            Name
            <input
              className="tr-answer__input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>
          <label>
            Kind
            <select value={kind} onChange={(e) => changeAddKind(e.target.value as ProfileKind)}>
              <option value="explorer">Explorer</option>
              <option value="sprout">Sprout</option>
            </select>
          </label>
          <label>
            Birth year
            <input
              className="tr-answer__input"
              type="number"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
            />
          </label>
          {addError ? (
            <p role="alert" className="pr-confirm__error">
              {addError}
            </p>
          ) : null}
          <div className="pr-pin__row">
            <Button variant="primary" type="submit" disabled={addBusy}>
              {addBusy ? "Adding…" : "Add profile"}
            </Button>
            <Button variant="quiet" type="button" onClick={() => setAdding(false)} disabled={addBusy}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          Add a profile
        </Button>
      )}
    </Card>
  );
}
