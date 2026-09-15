"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { recomputeAndSaveSkills } from "@/lib/data/skills-recompute";
import { getContent } from "@/lib/content/app-content";
import type { Track } from "@/lib/content/schema";
import { tracksForProfile } from "@/lib/domain/tracks";
import { addParentActivity, watchParentActivities } from "@/lib/data/parentActivities";
import type { Profile } from "@/lib/session";

export type ParentActivitiesProps = {
  profile: Profile;
  householdId: string;
};

function todayInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Parent-entered activities (task 13 brief: "add a dated note against a skill (chess, piano)
 * which then appears in the skills map with source: parent"). lib/domain/skills.ts's
 * recomputeFromAttempts already accepts ParentSkillEntry {skillId, note, at} and treats it as
 * zero-point evidence; this component only collects the three fields, persists them
 * (lib/data/parentActivities.ts's addParentActivity), and immediately recomputes the skills map
 * so the note shows up on /explorer/skills without waiting for the child's next attempt.
 */
export function ParentActivities({ profile, householdId }: ParentActivitiesProps) {
  const content = useMemo(() => getContent(), []);
  const skillOptions = useMemo(() => {
    const tracks: Track[] = profile.kind === "sprout" ? [] : tracksForProfile(profile);
    const wanted = profile.kind === "sprout" ? content.skills.filter((s) => s.track === "sprout") : content.skills.filter((s) => tracks.includes(s.track as Track));
    return wanted;
  }, [content, profile]);

  const [skillId, setSkillId] = useState(() => skillOptions[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => todayInputValue());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<Array<{ id: string; skillId: string; note: string; at: number }>>([]);

  useEffect(() => {
    const unsub = watchParentActivities(householdId, profile.id, (list) => {
      setEntries(list.map(({ id, entry }) => ({ id, skillId: entry.skillId, note: entry.note, at: entry.at })));
    });
    return unsub;
  }, [householdId, profile.id]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!skillId || !note.trim()) {
        setError("Choose a skill and write a short note.");
        return;
      }
      setSaving(true);
      setError(undefined);
      try {
        // A date-only input has no time of day; local midnight on the chosen date keeps the
        // note ordered correctly among the same day's other events without claiming a false
        // precision.
        const at = new Date(`${date}T00:00:00`).getTime();
        await addParentActivity(householdId, profile.id, { skillId, note: note.trim(), at: Number.isNaN(at) ? Date.now() : at });
        await recomputeAndSaveSkills(householdId, profile.id);
        setNote("");
      } catch {
        setError("Could not save that note. Try again.");
      } finally {
        setSaving(false);
      }
    },
    [skillId, note, date, householdId, profile.id],
  );

  return (
    <Card tone="surface" className="pr-activities" aria-labelledby={`activities-${profile.id}`}>
      <p className="tr-eyebrow" id={`activities-${profile.id}`}>
        Parent-entered activities
      </p>
      <p className="pr-activities__lede">
        Chess, piano or anything else outside the app -- add a dated note against a skill and it
        appears in the skills map as evidence.
      </p>
      <form className="pr-activities__form" onSubmit={(e) => void submit(e)}>
        <label>
          Skill
          <select value={skillId} onChange={(e) => setSkillId(e.target.value)} disabled={skillOptions.length === 0}>
            {skillOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Note
          <input
            className="tr-answer__input"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Chess class: learned to spot a fork"
          />
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {/* Task 20: this dashboard card has no single "one thing it's for" the way a quest
            step or a modal does -- it is one of several always-visible parent-view sections, so
            its own submit is Secondary, matching Rename/Mark as bought/Open as Explorer. */}
        <Button variant="secondary" type="submit" disabled={saving || skillOptions.length === 0}>
          {saving ? "Saving…" : "Add activity"}
        </Button>
      </form>
      {error ? <p role="alert" className="pr-confirm__error">{error}</p> : null}

      {entries.length > 0 ? (
        <ul className="pr-activities__list">
          {entries.slice(0, 8).map((entry) => {
            const skill = content.skills.find((s) => s.id === entry.skillId);
            return (
              <li key={entry.id}>
                <strong>{skill?.name ?? entry.skillId}</strong>: {entry.note} ({new Date(entry.at).toLocaleDateString()})
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}
