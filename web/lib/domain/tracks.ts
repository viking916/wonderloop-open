// tracks.ts: which of a week's quests a profile actually has (6 September 2026). Build, Make,
// Think and Speak belong to every Explorer (Make only where a week has a Make quest authored). Play (instrument practice) is opt-in per profile, because
// it needs an instrument and a teacher setting the pieces; a parent turns it on in the Parent
// view (ProfileDoc.playTrack). Content is authored for the whole track regardless, so a family
// that turns it on mid-season finds the current week waiting.
import { TRACK_ORDER, type Quest, type Track } from "../content/schema";

export type TrackChoice = { playTrack?: boolean };

/** The tracks this profile sees, in display order. */
export function tracksForProfile(profile: TrackChoice): Track[] {
  return TRACK_ORDER.filter((t) => t !== "play" || profile.playTrack === true);
}

/** The week's quests with the tracks this profile does not have removed. */
export function questsForProfile(quests: Partial<Record<Track, Quest>>, profile: TrackChoice): Partial<Record<Track, Quest>> {
  const out: Partial<Record<Track, Quest>> = {};
  for (const t of tracksForProfile(profile)) if (quests[t]) out[t] = quests[t];
  return out;
}
