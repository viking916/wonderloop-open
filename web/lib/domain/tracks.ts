// tracks.ts: which of a week's quests a profile actually has (6 September 2026; changed 23
// September 2026). Build, Make, Think and Speak belong to every Explorer (Make only where a week
// has a Make quest authored). Play (instrument practice) is no longer a weekly quest: the owner
// asked to keep piano simple, a single "30 minutes of piano practice this week" checkbox
// (lib/domain/practice.ts, the Practice this week card on This Week) rather than a four-sitting
// quest card. tracksForProfile/questsForProfile therefore never return "play" for any profile any
// more. ProfileDoc.playTrack still exists and still means "this child takes lessons"; it now only
// gates the piano checkbox, not a quest. The Play content itself (content/seasons/*/weeks/*/
// play.json) is untouched and still validates -- it is data, not deleted, it is just never
// surfaced as a quest. A caller that still wants Play's tracks for a reason other than "which
// quests does this profile do this week" (the skills map showing skills with evidence, parent-
// entered activities' skill picker) reads TRACK_ORDER and playTrack directly instead of this
// function -- see app/explorer/skills/page.tsx and components/parent/ParentActivities.tsx.
import { TRACK_ORDER, type Quest, type Track } from "../content/schema";

export type TrackChoice = { playTrack?: boolean };

/** The tracks this profile sees as quests, in display order. Play is never included; see the
 * file header. */
export function tracksForProfile(_profile: TrackChoice): Track[] {
  return TRACK_ORDER.filter((t) => t !== "play");
}

/** The week's quests with the tracks this profile does not have removed. */
export function questsForProfile(quests: Partial<Record<Track, Quest>>, profile: TrackChoice): Partial<Record<Track, Quest>> {
  const out: Partial<Record<Track, Quest>> = {};
  for (const t of tracksForProfile(profile)) if (quests[t]) out[t] = quests[t];
  return out;
}
