// The Showcase talk outline, assembled, not written (Plan 3 Task 3; spec 10 item 4, amended by
// docs/superpowers/plans/2026-08-30-plan-3-voice-and-ai.md: "the material is his own words,
// already written in his Maker's Log across the sprint. A model would paraphrase him.
// Assembling is more honest and cannot invent a project he did not do."). No model, no prose
// generation: this module only selects and orders his own Maker's Log answers into beats he
// can glance at while he talks. Pure: no React, no Firebase, no Date.now() -- `now` is passed
// in. See the module's own doc comments below for exactly what `now` is used for.
//
// "The sprint" is the four content weeks ending on a Showcase week (weeks 4, 8, 12 -- see
// components/explorer/WeekHeader.tsx's SHOWCASE_WEEKS): weeks 1-4, 5-8, 9-12. Every content
// week in Wonderloop's one build track carries its own Maker's Log (components/quest/
// LogStep.tsx's MAKER_PROMPTS, five prompts, log step variant "maker"), so a sprint can supply
// up to four logs, one per week -- see sprintRangeForShowcaseWeek below.

/** One Maker's Log, flattened to what this module needs. `answers` is components/quest/
 * LogStep.tsx's MAKER_PROMPTS order, verbatim: [0] what he made, [1] how he did it in steps,
 * [2] what went wrong, [3] how he fixed it, [4] what he'd do differently and which idea he
 * used. The caller resolves one entry per quest -- the LATEST log on record for that quest, the
 * same "latest, not every resubmit" rule app/explorer/portfolio/page.tsx's buildCompletedEntries
 * already applies to a quest's artifact and log -- so a quest resubmitted twice in one sprint
 * contributes one beat's worth of material here, not two competing ones. */
export type MakerLogInput = {
  week: number;
  questTitle: string;
  answers: [string, string, string, string, string];
  at: number;
};

/** A quote is always his own words, never rewritten: `words` is the trimmed answer text,
 * verbatim, attributed to the week and project it came from so a beat never has to pretend one
 * project's story is another's. */
export type TalkQuote = { week: number; questTitle: string; words: string };

/**
 * One beat of the talk: a short cue in kid language ("say what went wrong"), never a script to
 * read aloud, backed by one or more quotes of his own words. "made" is the only beat that can
 * carry more than one quote -- one per project finished this sprint -- because naming
 * everything he built is inherently a list; every other beat quotes a single project (the
 * sprint's anchor, see pickAnchor below) so the talk tells one coherent problem-to-fix story
 * rather than jumping between projects mid-beat.
 */
export type TalkBeat = {
  id: "problem" | "fix" | "made" | "steps" | "reflection";
  cue: string;
  quotes: TalkQuote[];
};

export type TalkOutline =
  | {
      hasLogs: true;
      sprintStartWeek: number;
      sprintEndWeek: number;
      /** The project the talk is anchored on -- see pickAnchor's own doc comment for how it is
       * chosen. Every beat except "made" quotes this project alone. */
      anchorWeek: number;
      anchorQuestTitle: string;
      /** Always exactly five, in speaking order: problem, fix, made, steps, reflection --
       * "what went wrong" and "how he fixed it" lead, ahead of "made", so the talk opens on the
       * most interesting part rather than a bare list of what he built (task brief). */
      beats: TalkBeat[];
    }
  | {
      hasLogs: false;
      sprintStartWeek: number;
      sprintEndWeek: number;
      /** What to do about it, phrased as a nudge, never a reprimand -- there is nothing to
       * assemble because there is nothing on record yet, not because anything went wrong. */
      guidance: string;
    };

/** A Showcase week is always the last week of its own four-week sprint (week 4 closes weeks
 * 1-4, week 8 closes 5-8, week 12 closes 9-12) -- see components/explorer/WeekHeader.tsx's
 * SHOWCASE_WEEKS and lib/domain/badges.ts's own Sprint 1/2/3 week ranges, which this mirrors. */
export const SPRINT_LENGTH_WEEKS = 4;

export function sprintRangeForShowcaseWeek(showcaseWeek: number): [number, number] {
  return [showcaseWeek - SPRINT_LENGTH_WEEKS + 1, showcaseWeek];
}

const CUES: Record<TalkBeat["id"], string> = {
  problem: "Start with what went wrong.",
  fix: "Say how you fixed it.",
  made: "Say what you built this sprint.",
  steps: "Walk through how you did it, in steps.",
  reflection: "Say what you would do differently, and which idea you used.",
};

/**
 * Which of the sprint's projects the talk is anchored on: the one whose "what went wrong" and
 * "how did you fix it" answers, together, are the longest -- a plain, honest proxy for "the
 * most interesting story", since a longer answer to those two prompts almost always means a
 * real problem worth telling, not a one-line "it broke". Ties (equally long stories) are broken
 * by which project's log is closest in time to `now` -- the most recent real work is the
 * easiest for him to still speak to from memory -- and a tie surviving even that falls to the
 * later week, since a later project in the sprint is the more finished one.
 */
function pickAnchor(logs: readonly MakerLogInput[], now: number): MakerLogInput {
  return [...logs].sort((a, b) => {
    const scoreA = a.answers[2].length + a.answers[3].length;
    const scoreB = b.answers[2].length + b.answers[3].length;
    if (scoreB !== scoreA) return scoreB - scoreA;
    const distA = Math.abs(now - a.at);
    const distB = Math.abs(now - b.at);
    if (distA !== distB) return distA - distB;
    return b.week - a.week;
  })[0]!;
}

function quote(log: MakerLogInput, index: number): TalkQuote {
  return { week: log.week, questTitle: log.questTitle, words: log.answers[index] };
}

export function talkOutline(input: { logs: readonly MakerLogInput[]; showcaseWeek: number; now: number }): TalkOutline {
  const [sprintStartWeek, sprintEndWeek] = sprintRangeForShowcaseWeek(input.showcaseWeek);
  const sprintLogs = input.logs
    .filter((l) => l.week >= sprintStartWeek && l.week <= sprintEndWeek)
    .sort((a, b) => a.week - b.week);

  if (sprintLogs.length === 0) {
    return {
      hasLogs: false,
      sprintStartWeek,
      sprintEndWeek,
      guidance:
        "No Maker's Log yet this sprint, so there is nothing to build a talk from. Write one about your most recent build, even a short one, and this outline will fill in.",
    };
  }

  const anchor = pickAnchor(sprintLogs, input.now);

  const beats: TalkBeat[] = [
    { id: "problem", cue: CUES.problem, quotes: [quote(anchor, 2)] },
    { id: "fix", cue: CUES.fix, quotes: [quote(anchor, 3)] },
    { id: "made", cue: CUES.made, quotes: sprintLogs.map((l) => quote(l, 0)) },
    { id: "steps", cue: CUES.steps, quotes: [quote(anchor, 1)] },
    { id: "reflection", cue: CUES.reflection, quotes: [quote(anchor, 4)] },
  ];

  return {
    hasLogs: true,
    sprintStartWeek,
    sprintEndWeek,
    anchorWeek: anchor.week,
    anchorQuestTitle: anchor.questTitle,
    beats,
  };
}
