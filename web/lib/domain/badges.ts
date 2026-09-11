// Pure badge rules (spec 14: "earned for firsts and showing up, never for speed"). No
// Firebase, no React, no Date.now() inside functions: every event the caller supplies already
// carries its own "at" timestamp, so this module only ever compares and sorts what it is given.

import type { Track } from "../content/schema";
import type { IdeaEvent } from "./ideas";

export type Badge = { id: string; name: string; earnedAt?: number };

/** One quest reaching "done" (from completion.ts's questStatus), or a showcase-week track. */
export type QuestCompletion = { track: Track; week: number; at: number };

/**
 * The raw events earnedBadges needs, scoped to badge-worthiness only. Each list is the
 * qualifying occurrences of one kind of event; earnedBadges finds the earliest (or, for
 * Summit, the completing, or for Idea Spotter, the reusing) one per badge. showcaseCompletions
 * carries every quest completion in a showcase week (any track, any week) so Summit can verify
 * all three tracks itself rather than trusting a pre-aggregated flag.
 *
 * Every new field added for task 33 reads an event this app already records for another
 * purpose (a step completion, a logged Maker's Log, an idea tag on an attempt, a review
 * success, a parent-entered note) -- nothing here introduces new tracking of its own. See each
 * badge's own comment in earnedBadges below for exactly which existing record it comes from.
 */
export type BadgeProgress = {
  buildQuestsDone: QuestCompletion[];
  showcaseCompletions: QuestCompletion[];
  textProofSubmissions: { at: number }[];
  debatesCompleted: { at: number }[];
  bigBrotherTicks: { at: number }[];
  /** howFixed is optional so older test fixtures (and any caller not yet supplying it) still
   * typecheck; Fixed It treats a missing value the same as an empty string (not qualifying). */
  makerLogs: { whatWentWrong: string; howFixed?: string; at: number }[];
  /** An explain step finished with no problemId (spec: a free-form "in your own words"
   * reflection, not tied to grading any one problem) -- distinct from textProofSubmissions,
   * which is an explain step paired with a specific text-kind problem. `text` is the saved
   * answer (components/quest/ExplainStep.tsx's textarea, trimmed): earnedBadges holds it to
   * OWN_WORDS_MIN_LENGTH below so a one-word non-answer never qualifies. */
  ownWordsExplains: { text: string; at: number }[];
  /** Every idea tag on record for every attempt (lib/data/types.ts's AttemptDoc.ideaIds, the
   * same raw event lib/domain/ideas.ts's metIdeas already reduces for the idea box), so Idea
   * Spotter can find the moment an idea was met in a second, different problem. */
  ideaEvents: IdeaEvent[];
  /** A mistake-box variant answered correctly on its first try (an attempt recorded under
   * lib/domain/review.ts's REVIEW_QUEST_ID, tryNumber 1, correct). */
  reviewSuccesses: { at: number }[];
  /** A parent-entered skill note (lib/domain/skills.ts's ParentSkillEntry), first one on record. */
  parentSkillNotes: { at: number }[];
};

export const BUG_HUNTER_MIN_LENGTH = 20;
export const BUG_HUNTER_LOGS_NEEDED = 3;
/** Fixed It's threshold for "how did you fix it": the same bar Bug Hunter already holds "what
 * went wrong" to -- a real sentence, not one word -- so a caller never has to guess whether the
 * two badges disagree on what counts as a real answer. */
export const FIXED_IT_MIN_LENGTH = BUG_HUNTER_MIN_LENGTH;
/** Idea Spotter's bar: the idea shows up in at least this many distinct problems. */
export const IDEA_SPOTTER_MIN_PROBLEMS = 2;
/** Own Words' floor: the same bar this file already holds Bug Hunter's and Fixed It's answers
 * to -- "a real sentence, not one word" is one bar, reused, not three separate secret numbers.
 * Without it, "yes" or "ok" earned the badge, which undercut the point: Own Words is for
 * explaining an idea, and one word is not an explanation. 20 characters is short enough that a
 * genuine but terse child's answer clears it without effort -- "because I used a loop"
 * (21 characters) or "it moves the arm up and down" (28) both pass easily -- while a shrug like
 * "yes", "ok", "good job" or "idk" (3 to 8 characters) does not. The borderline case is a short
 * fragment that names the idea but does not yet say what it does: "loops" (5, fails) and "I
 * used loops" (12, still fails -- naming the idea is not explaining it) both fall short, while
 * "I used loops to repeat it" (25, passes) is a real explanation even though it is short. */
export const OWN_WORDS_MIN_LENGTH = 20;

const SUMMIT_WEEKS: Record<number, { id: string; name: string }> = {
  4: { id: "summit-1", name: "Summit 1" },
  8: { id: "summit-2", name: "Summit 2" },
  12: { id: "summit-3", name: "Summit 3" },
};

/**
 * Every badge id/name earnedBadges can ever produce (spec 7.1 screen 5's "First Robot", "First
 * Proof", "First Debate" plus Summit and the two showing-up badges, plus task 33's six). The
 * single source of names for the sash: a caller (the portfolio's PatchSash) diffs this catalog
 * against earnedBadges' output to know which patches are still locked, rather than hardcoding a
 * second copy of these names that could drift from the rules above. This fixed order is the
 * locked list's own order; earned badges lead the sash in the order earnedBadges already
 * returns them (earliest earned first), not this catalog's order.
 */
export const BADGE_CATALOG: Badge[] = [
  { id: "first-robot", name: "First Robot" },
  { id: "first-proof", name: "First Proof" },
  { id: "first-debate", name: "First Debate" },
  { id: "summit-1", name: "Summit 1" },
  { id: "summit-2", name: "Summit 2" },
  { id: "summit-3", name: "Summit 3" },
  { id: "big-brother", name: "Big Brother" },
  { id: "bug-hunter", name: "Bug Hunter" },
  // Task 33 additions. Ids are append-only: never rename or reuse one of the eight above.
  { id: "first-code", name: "First Code" },
  { id: "own-words", name: "Own Words" },
  { id: "fixed-it", name: "Fixed It" },
  { id: "idea-spotter", name: "Idea Spotter" },
  { id: "comeback", name: "Comeback" },
  { id: "pass-it-on", name: "Pass It On" },
];

function earliest<T extends { at: number }>(events: T[]): T | undefined {
  return events.length ? [...events].sort((a, b) => a.at - b.at)[0] : undefined;
}

export function earnedBadges(progress: BadgeProgress): Badge[] {
  const badges: Badge[] = [];

  // First Robot: any Build quest done in weeks 5 to 7 (Sprint 2, the robot sprint).
  const firstRobot = earliest(progress.buildQuestsDone.filter((q) => q.week >= 5 && q.week <= 7));
  if (firstRobot) badges.push({ id: "first-robot", name: "First Robot", earnedAt: firstRobot.at });

  // First Proof: a text proof problem attempted with an explain-it submitted.
  const firstProof = earliest(progress.textProofSubmissions);
  if (firstProof) badges.push({ id: "first-proof", name: "First Proof", earnedAt: firstProof.at });

  // First Debate: a debate step completed.
  const firstDebate = earliest(progress.debatesCompleted);
  if (firstDebate) badges.push({ id: "first-debate", name: "First Debate", earnedAt: firstDebate.at });

  // Summit N: a Showcase week fully done, meaning all three tracks (build, think, speak) done
  // in that week. Duplicate completions for the same track (a resubmit) count once.
  const tracksByWeek = new Map<number, Map<Track, number>>();
  for (const c of progress.showcaseCompletions) {
    const tracks = tracksByWeek.get(c.week) ?? new Map<Track, number>();
    const seenAt = tracks.get(c.track);
    tracks.set(c.track, seenAt === undefined ? c.at : Math.min(seenAt, c.at));
    tracksByWeek.set(c.week, tracks);
  }
  for (const [week, tracks] of tracksByWeek) {
    const summit = SUMMIT_WEEKS[week];
    if (!summit || tracks.size < 3) continue;
    const earnedAt = Math.max(...tracks.values()); // when the last of the three finished
    badges.push({ id: summit.id, name: summit.name, earnedAt });
  }

  // Big Brother: a Big Brother task ticked.
  const bigBrother = earliest(progress.bigBrotherTicks);
  if (bigBrother) badges.push({ id: "big-brother", name: "Big Brother", earnedAt: bigBrother.at });

  // Bug Hunter: three maker logs whose "what went wrong" answer is longer than 20 characters.
  const qualifyingLogs = progress.makerLogs
    .filter((l) => l.whatWentWrong.length > BUG_HUNTER_MIN_LENGTH)
    .sort((a, b) => a.at - b.at);
  if (qualifyingLogs.length >= BUG_HUNTER_LOGS_NEEDED) {
    badges.push({ id: "bug-hunter", name: "Bug Hunter", earnedAt: qualifyingLogs[BUG_HUNTER_LOGS_NEEDED - 1].at });
  }

  // First Code: any Build quest done in weeks 9 to 11 (Sprint 3, typed code -- Teachable
  // Machine, turtle, Python -- rather than the blocks/robot build of Sprint 2). Same shape as
  // First Robot, one sprint later, so weeks 9 to 11 have a "first" of their own instead of
  // sitting empty until Summit 3 in week 12.
  const firstCode = earliest(progress.buildQuestsDone.filter((q) => q.week >= 9 && q.week <= 11));
  if (firstCode) badges.push({ id: "first-code", name: "First Code", earnedAt: firstCode.at });

  // Own Words: an explain step finished that has no problemId -- a reflection in his own
  // words, not an answer being graded (spec's "explain it" steps with no attached problem) --
  // whose answer clears OWN_WORDS_MIN_LENGTH, so a one-word non-answer ("yes") never qualifies.
  const ownWords = earliest(progress.ownWordsExplains.filter((e) => e.text.trim().length >= OWN_WORDS_MIN_LENGTH));
  if (ownWords) badges.push({ id: "own-words", name: "Own Words", earnedAt: ownWords.at });

  // Fixed It: a Maker's Log that gives a real answer (longer than FIXED_IT_MIN_LENGTH) to BOTH
  // "what went wrong" and "how did you fix it" -- naming the problem AND the fix, not just the
  // problem (which is all Bug Hunter checks). A short or missing howFixed does not qualify.
  const fixedItLogs = progress.makerLogs
    .filter((l) => l.whatWentWrong.length > FIXED_IT_MIN_LENGTH && (l.howFixed ?? "").length > FIXED_IT_MIN_LENGTH)
    .sort((a, b) => a.at - b.at);
  if (fixedItLogs.length > 0) badges.push({ id: "fixed-it", name: "Fixed It", earnedAt: fixedItLogs[0].at });

  // Idea Spotter: the same idea met and used in two different problems -- spotting it again
  // elsewhere, not just answering the one problem it first showed up in. Re-attempting the same
  // problem (a mistake-box variant, a "Try it again") never counts as a second problem: an idea
  // event's problemId is always the parent problem's own id, the same rule ideas.ts's metIdeas
  // already relies on. earnedAt is when the SECOND distinct problem was first met, not the
  // idea's very first attempt, since that is the moment the reuse actually happened.
  const problemsByIdea = new Map<string, Set<string>>();
  const secondProblemAt = new Map<string, number>();
  for (const event of [...progress.ideaEvents].sort((a, b) => a.at - b.at)) {
    const seen = problemsByIdea.get(event.ideaId) ?? new Set<string>();
    if (!seen.has(event.problemId)) {
      seen.add(event.problemId);
      if (seen.size === IDEA_SPOTTER_MIN_PROBLEMS && !secondProblemAt.has(event.ideaId)) {
        secondProblemAt.set(event.ideaId, event.at);
      }
    }
    problemsByIdea.set(event.ideaId, seen);
  }
  if (secondProblemAt.size > 0) {
    badges.push({ id: "idea-spotter", name: "Idea Spotter", earnedAt: Math.min(...secondProblemAt.values()) });
  }

  // Comeback: a mistake-box item's variant answered correctly on the first try back (an
  // attempt recorded under review.ts's REVIEW_QUEST_ID, tryNumber 1, correct) -- coming back to
  // a mistake and getting it right, spec 7.4's whole point of the mistake box.
  const comeback = earliest(progress.reviewSuccesses);
  if (comeback) badges.push({ id: "comeback", name: "Comeback", earnedAt: comeback.at });

  // Pass It On: a parent-entered skill note is added -- something taught or practiced outside
  // the app (chess, piano, teaching a sibling) that a parent thought worth writing down.
  const passItOn = earliest(progress.parentSkillNotes);
  if (passItOn) badges.push({ id: "pass-it-on", name: "Pass It On", earnedAt: passItOn.at });

  return badges.sort((a, b) => (a.earnedAt ?? 0) - (b.earnedAt ?? 0));
}

/**
 * Plan 4 task 35: which of `current`'s badges are not yet in `seenIds` -- the "did anything just
 * flip from locked to earned" check the portfolio's celebration needs (Patch.tsx's own doc
 * comment: the sash itself stays "a quiet, static wall... that is owned elsewhere" -- this is
 * the pure half of "elsewhere"). Order preserved from `current` (earnedBadges already returns
 * earliest-earned first), so a caller showing more than one never has to re-sort. Pure on
 * purpose: this module has no notion of a session, a device, or "have I shown this before" --
 * the caller (the portfolio page's localStorage-backed set, one per profile) owns what "seen"
 * means and where it persists.
 */
export function newlyEarned(current: readonly Badge[], seenIds: readonly string[]): Badge[] {
  const seen = new Set(seenIds);
  return current.filter((b) => !seen.has(b.id));
}
