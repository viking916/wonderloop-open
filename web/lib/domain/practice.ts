// practice.ts: the piano and chess practice checkboxes (23 September 2026, owner's own words:
// "Keep piano lessons simple a checkbox which says 30min piano practice per week. Add in ladder
// chess game on saturday and sunday as checkbox, Im expecting [the child] to play atleast 2 chess
// games with me or on chess.com per week as a practice."). Pure and Firebase-free, like every
// other module in this folder: it reads a profile's own opt-in flags (ProfileDoc.playTrack,
// ProfileDoc.chessPractice) and a practice/{docId} document as plain data, and decides the
// storage doc id, which rows a profile gets, and a one-line summary.
//
// Deliberately decides nothing about whether a week is done: a week still ends when its quests
// are done, never on a checkbox (owner ruling, 13 September 2026, restated here so it survives a
// truncated context). Nothing in this file is read by currentWeekFromDone or computeDoneByWeek,
// and nothing here should ever be wired into either -- a forgotten checkbox must never stall a
// child on a week they have otherwise finished.

export type PracticeChoice = { playTrack?: boolean; chessPractice?: boolean };

export type PracticeDocInput = { piano?: boolean; chessSat?: boolean; chessSun?: boolean };

/** The storage doc id for one profile's one week of practice: "s{season}w{week}", week
 * zero-padded to two digits (e.g. "s1w03"), the same width the content tree's own week folders
 * use, so a season never rolls two different weeks onto the same id past week 9. */
export function practiceDocId(seasonId: number, week: number): string {
  return `s${seasonId}w${String(week).padStart(2, "0")}`;
}

/** Whether this profile gets the piano row: only when the Play track is on (a parent has said
 * this child takes lessons). */
export function hasPianoRow(choice: PracticeChoice): boolean {
  return choice.playTrack === true;
}

/** Whether this profile gets the two chess rows: on by default for every Explorer profile,
 * off only once a parent has explicitly turned it off (chessPractice === false). */
export function hasChessRows(choice: PracticeChoice): boolean {
  return choice.chessPractice !== false;
}

/** Whether the Practice this week card renders at all: it needs at least one row. */
export function hasPracticeCard(choice: PracticeChoice): boolean {
  return hasPianoRow(choice) || hasChessRows(choice);
}

/** The card's one-line summary, e.g. "Chess 1 of 2, piano done", "Piano done" alone, "Chess 0 of
 * 2" alone, or "Nothing ticked yet" when the card renders but nothing on it is checked yet. */
export function practiceSummary(choice: PracticeChoice, doc: PracticeDocInput | undefined): string {
  const parts: string[] = [];
  if (hasChessRows(choice)) {
    const chessCount = (doc?.chessSat ? 1 : 0) + (doc?.chessSun ? 1 : 0);
    parts.push(`chess ${chessCount} of 2`);
  }
  if (hasPianoRow(choice)) {
    parts.push(doc?.piano ? "piano done" : "piano not yet");
  }
  if (parts.length === 0) return "Nothing ticked yet";
  const joined = parts.join(", ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}
