"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getSeasonCount } from "@/lib/content/app-content";
import { createProfile, renameProfile, setChessPractice, setPlayTrack, startSeason } from "@/lib/data/households";
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
 * last the content ships, behind an inline confirm that names the child, the season and when its
 * week 1 begins. Nothing about the old season is deleted: it stays in the portfolio.
 *
 * Sits behind the same parent-view gate as everything else on this page (ParentPinGate, task 9
 * feature 1), so it needs no gate of its own.
 *
 * The week clock control is gone (owner decision, 13 September 2026): a week is now bounded by
 * finishing it, not by a date, so there is nothing left for a parent to pause or resume. Each
 * profile row instead states its own current week plainly, computed the same completion-derived
 * way as the rest of the app (app/parent/page.tsx's ExplorerChildSection/SproutChildSection,
 * reported up into `weekByProfileId`) -- `startDate` and `pausedAt` stay in Firestore and in
 * lib/data/households.ts untouched, so existing documents and history stay valid, but nothing
 * here reads them to decide the week any more.
 */
export function ProfileManager({
  householdId,
  profiles,
  weekByProfileId,
}: {
  householdId: string;
  profiles: Profile[];
  /** Each profile's own current week, 1 to 12, as computed by app/parent/page.tsx; absent until
   * that profile's own section has reported it once. */
  weekByProfileId: Record<string, number>;
}) {
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

  const [playError, setPlayError] = useState<string | undefined>(undefined);
  const [playErrorId, setPlayErrorId] = useState<string | undefined>(undefined);

  // The Play track (23 September 2026: a piano checkbox, not a quest -- see lib/domain/
  // tracks.ts) is per profile and reversible; turning it off hides the piano row on the Practice
  // this week card and nothing else, so it needs no confirmation. Returns its own Promise (never
  // rethrows -- a failure is reported through playError instead) so the button below can track
  // it automatically, one instance per row, with no shared busy id to key against.
  async function togglePlay(profile: Profile): Promise<void> {
    setPlayError(undefined);
    try {
      await setPlayTrack(householdId, profile.id, !profile.playTrack);
      await refreshProfiles();
    } catch {
      setPlayError("Could not change the Play track. Try again.");
      setPlayErrorId(profile.id);
    }
  }

  const [chessError, setChessError] = useState<string | undefined>(undefined);
  const [chessErrorId, setChessErrorId] = useState<string | undefined>(undefined);

  // Chess practice (23 September 2026) is on by default for every Explorer profile
  // (ProfileDoc.chessPractice absent or true both mean on); this toggle is how a parent turns it
  // off for a profile that does not want the two weekend checkboxes, and back on again. Same
  // reversible, no-confirmation shape as togglePlay above.
  async function toggleChess(profile: Profile): Promise<void> {
    setChessError(undefined);
    const currentlyOn = profile.chessPractice !== false;
    try {
      await setChessPractice(householdId, profile.id, !currentlyOn);
      await refreshProfiles();
    } catch {
      setChessError("Could not change chess practice. Try again.");
      setChessErrorId(profile.id);
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
                <Button variant="primary" type="submit" pending={renameBusy} pendingLabel="Saving the name">
                  Save
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
              // Debugged 15 September 2026: name, kind and Rename used to sit as three loose
              // inline children, so Rename landed wherever the name and kind text happened to
              // end -- a different horizontal spot on every row. The identity text is one group
              // on the left, the action on the right, the same "meta then action" order every
              // other row here already uses (season, Play track). The kind word is hidden when it
              // only repeats the name, case-insensitively (the same rule KidCard and the profile
              // picker's tiles apply).
              <div className="pr-profiles__row">
                <span className="pr-profiles__identity">
                  <span className="pr-profiles__name">{profile.name}</span>
                  {KIND_LABEL[profile.kind].toLowerCase() !== profile.name.trim().toLowerCase() ? (
                    <span className="pr-profiles__kind">{KIND_LABEL[profile.kind]}</span>
                  ) : null}
                </span>
                <Button variant="secondary" onClick={() => startRename(profile)}>
                  Rename
                </Button>
              </div>
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
                          Start {profile.name}&rsquo;s season {rollover.seasonId}? Week 1 begins the day {profile.name} takes its
                          first step. Anything unfinished in season {profile.seasonId} stays in the portfolio.
                        </p>
                        <div className="pr-pin__row">
                          <Button
                            variant="primary"
                            onClick={() => confirmRollover(profile)}
                            pendingLabel={`Starting season ${rollover.seasonId}`}
                          >
                            {`Start season ${rollover.seasonId}`}
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
                    {/* Debugged 15 September 2026: this was mono running text ("Season 1, from
                        Monday..."), the register .tr-meta exists specifically to replace (Package
                        A, app/globals.css). Mono here stays reserved for short uppercase
                        eyebrows. */}
                    <span className="tr-meta">
                      Season {profile.seasonId}
                      {nextSeasonFor(profile, seasonCount) === undefined ? ", the last one" : ""}
                      {profile.startDate ? `, from ${longDate(profile.startDate)}` : ", not started yet"}. Week{" "}
                      {weekByProfileId[profile.id] ?? 1} of 12. The week moves on when its quests are done.
                    </span>
                    {nextSeasonFor(profile, seasonCount) !== undefined ? (
                      <Button variant="secondary" onClick={() => openRollover(profile)} disabled={renamingId === profile.id}>
                        Start season {nextSeasonFor(profile, seasonCount)}
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
            {profile.kind === "explorer" ? (
              <div className="pr-profiles__season" role="group" aria-label={`${profile.name}'s piano practice`}>
                <span className="tr-meta">
                  {profile.playTrack ? "Piano on: a 30 minute practice checkbox each week" : "Piano off: turn it on for a child who takes lessons"}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => togglePlay(profile)}
                  pendingLabel="Saving piano practice"
                >
                  {profile.playTrack ? "Turn piano off" : "Turn piano on"}
                </Button>
                {playError && playErrorId === profile.id ? (
                  <p role="alert" className="pr-confirm__error">
                    {playError}
                  </p>
                ) : null}
              </div>
            ) : null}
            {profile.kind === "explorer" ? (
              <div className="pr-profiles__season" role="group" aria-label={`${profile.name}'s chess practice`}>
                <span className="tr-meta">
                  {profile.chessPractice === false ? "Chess off" : "Chess on: two weekend games a week"}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => toggleChess(profile)}
                  pendingLabel="Saving chess practice"
                >
                  {profile.chessPractice === false ? "Turn chess on" : "Turn chess off"}
                </Button>
                {chessError && chessErrorId === profile.id ? (
                  <p role="alert" className="pr-confirm__error">
                    {chessError}
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
            <Button variant="primary" type="submit" pending={addBusy} pendingLabel="Adding the profile">
              Add profile
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
