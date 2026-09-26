import { describe, expect, test } from "vitest";
import { earnedBadges, newlyEarned, type Badge, type BadgeProgress } from "./badges";

const T0 = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function emptyProgress(): BadgeProgress {
  return {
    buildQuestsDone: [],
    showcaseCompletions: [],
    textProofSubmissions: [],
    debatesCompleted: [],
    bigBrotherTicks: [],
    makerLogs: [],
    ownWordsExplains: [],
    ideaEvents: [],
    reviewSuccesses: [],
    parentSkillNotes: [],
  };
}

function ids(badges: ReturnType<typeof earnedBadges>): string[] {
  return badges.map((b) => b.id);
}

describe("First Robot", () => {
  test("earned when a Build quest is done in weeks 5 to 7", () => {
    const progress: BadgeProgress = { ...emptyProgress(), buildQuestsDone: [{ track: "build", week: 6, at: T0 }] };
    const badges = earnedBadges(progress);
    expect(ids(badges)).toContain("first-robot");
    expect(badges.find((b) => b.id === "first-robot")?.earnedAt).toBe(T0);
  });

  test("not earned for a Build quest done outside weeks 5 to 7", () => {
    const progress: BadgeProgress = { ...emptyProgress(), buildQuestsDone: [{ track: "build", week: 1, at: T0 }, { track: "build", week: 12, at: T0 }] };
    expect(ids(earnedBadges(progress))).not.toContain("first-robot");
  });

  test("earnedAt is the earliest qualifying completion", () => {
    const progress: BadgeProgress = {
      ...emptyProgress(),
      buildQuestsDone: [{ track: "build", week: 6, at: T0 + 1000 }, { track: "build", week: 5, at: T0 }],
    };
    expect(earnedBadges(progress).find((b) => b.id === "first-robot")?.earnedAt).toBe(T0);
  });
});

describe("First Proof", () => {
  test("earned once a text proof problem is attempted with an explain-it submitted", () => {
    const progress: BadgeProgress = { ...emptyProgress(), textProofSubmissions: [{ at: T0 }] };
    expect(ids(earnedBadges(progress))).toContain("first-proof");
  });

  test("not earned with none submitted", () => {
    expect(ids(earnedBadges(emptyProgress()))).not.toContain("first-proof");
  });
});

describe("First Debate", () => {
  test("earned once a debate step is completed", () => {
    const progress: BadgeProgress = { ...emptyProgress(), debatesCompleted: [{ at: T0 }] };
    expect(ids(earnedBadges(progress))).toContain("first-debate");
  });
});

describe("Summit N", () => {
  test("Summit 1 (week 4) earned only when all three tracks are done", () => {
    const twoOfThree: BadgeProgress = {
      ...emptyProgress(),
      showcaseCompletions: [{ track: "build", week: 4, at: T0 }, { track: "think", week: 4, at: T0 + 1 }],
    };
    expect(ids(earnedBadges(twoOfThree))).not.toContain("summit-1");

    const allThree: BadgeProgress = {
      ...emptyProgress(),
      showcaseCompletions: [
        { track: "build", week: 4, at: T0 },
        { track: "think", week: 4, at: T0 + 1 },
        { track: "speak", week: 4, at: T0 + 2 },
      ],
    };
    const badges = earnedBadges(allThree);
    expect(ids(badges)).toContain("summit-1");
    expect(badges.find((b) => b.id === "summit-1")?.earnedAt).toBe(T0 + 2); // when the last of the three finished
  });

  test("Summit 2 (week 8) and Summit 3 (week 12) use the same rule, independently", () => {
    const progress: BadgeProgress = {
      ...emptyProgress(),
      showcaseCompletions: [
        { track: "build", week: 8, at: T0 },
        { track: "think", week: 8, at: T0 },
        { track: "speak", week: 8, at: T0 },
        { track: "build", week: 12, at: T0 },
        { track: "think", week: 12, at: T0 },
        // speak week 12 missing: Summit 3 not earned
      ],
    };
    const badgeIds = ids(earnedBadges(progress));
    expect(badgeIds).toContain("summit-2");
    expect(badgeIds).not.toContain("summit-3");
  });

  test("a duplicate completion for the same track does not fake a third track", () => {
    const progress: BadgeProgress = {
      ...emptyProgress(),
      showcaseCompletions: [
        { track: "build", week: 4, at: T0 },
        { track: "build", week: 4, at: T0 + 1 }, // reattempt/resubmit, still just one track
        { track: "think", week: 4, at: T0 + 2 },
      ],
    };
    expect(ids(earnedBadges(progress))).not.toContain("summit-1");
  });
});

describe("Big Brother", () => {
  test("earned once a Big Brother task is ticked", () => {
    const progress: BadgeProgress = { ...emptyProgress(), bigBrotherTicks: [{ at: T0 }] };
    expect(ids(earnedBadges(progress))).toContain("big-brother");
  });
});

describe("Bug Hunter", () => {
  test("earned once three maker logs answer 'what went wrong' with more than 20 characters", () => {
    const longEnough = "I forgot to plug in the battery pack first."; // > 20 chars
    const progress: BadgeProgress = {
      ...emptyProgress(),
      makerLogs: [{ whatWentWrong: longEnough, at: T0 }, { whatWentWrong: longEnough, at: T0 + DAY_MS }, { whatWentWrong: longEnough, at: T0 + 2 * DAY_MS }],
    };
    const badges = earnedBadges(progress);
    expect(ids(badges)).toContain("bug-hunter");
    expect(badges.find((b) => b.id === "bug-hunter")?.earnedAt).toBe(T0 + 2 * DAY_MS); // the third qualifying log
  });

  test("not earned with only two qualifying logs", () => {
    const longEnough = "I forgot to plug in the battery pack first.";
    const progress: BadgeProgress = { ...emptyProgress(), makerLogs: [{ whatWentWrong: longEnough, at: T0 }, { whatWentWrong: longEnough, at: T0 + DAY_MS }] };
    expect(ids(earnedBadges(progress))).not.toContain("bug-hunter");
  });

  test("a short 'what went wrong' answer (20 chars or fewer) does not count toward it", () => {
    const tooShort = "12345678901234567890"; // exactly 20 characters: not longer than 20
    const longEnough = "I forgot to plug in the battery pack first.";
    const progress: BadgeProgress = {
      ...emptyProgress(),
      makerLogs: [
        { whatWentWrong: tooShort, at: T0 },
        { whatWentWrong: longEnough, at: T0 + DAY_MS },
        { whatWentWrong: longEnough, at: T0 + 2 * DAY_MS },
      ],
    };
    expect(ids(earnedBadges(progress))).not.toContain("bug-hunter");
  });
});

describe("First Code", () => {
  test("earned when a Build quest is done in weeks 9 to 11", () => {
    const progress: BadgeProgress = { ...emptyProgress(), buildQuestsDone: [{ track: "build", week: 10, at: T0 }] };
    const badges = earnedBadges(progress);
    expect(ids(badges)).toContain("first-code");
    expect(badges.find((b) => b.id === "first-code")?.earnedAt).toBe(T0);
  });

  test("not earned for a Build quest done outside weeks 9 to 11 (week 12 is Summit 3's week, not Sprint 3's)", () => {
    const progress: BadgeProgress = { ...emptyProgress(), buildQuestsDone: [{ track: "build", week: 8, at: T0 }, { track: "build", week: 12, at: T0 }] };
    expect(ids(earnedBadges(progress))).not.toContain("first-code");
  });

  test("First Robot and First Code are independent: a week 6 quest earns only First Robot", () => {
    const progress: BadgeProgress = { ...emptyProgress(), buildQuestsDone: [{ track: "build", week: 6, at: T0 }] };
    const badgeIds = ids(earnedBadges(progress));
    expect(badgeIds).toContain("first-robot");
    expect(badgeIds).not.toContain("first-code");
  });
});

describe("Own Words", () => {
  test("earned once an explain step with no problemId is finished with a real explanation", () => {
    const progress: BadgeProgress = {
      ...emptyProgress(),
      ownWordsExplains: [{ text: "I used loops to repeat it instead of typing", at: T0 }],
    };
    expect(ids(earnedBadges(progress))).toContain("own-words");
  });

  test("not earned with none on record", () => {
    expect(ids(earnedBadges(emptyProgress()))).not.toContain("own-words");
  });

  test("a one-word non-answer does not earn it", () => {
    const progress: BadgeProgress = { ...emptyProgress(), ownWordsExplains: [{ text: "yes", at: T0 }] };
    expect(ids(earnedBadges(progress))).not.toContain("own-words");
  });

  test("short shrugs like 'ok' and 'idk' do not earn it either", () => {
    const progress: BadgeProgress = {
      ...emptyProgress(),
      ownWordsExplains: [{ text: "ok", at: T0 }, { text: "idk", at: T0 + 1 }],
    };
    expect(ids(earnedBadges(progress))).not.toContain("own-words");
  });

  test("naming the idea alone, with no explanation, does not earn it (12 characters, under the floor)", () => {
    const progress: BadgeProgress = { ...emptyProgress(), ownWordsExplains: [{ text: "I used loops", at: T0 }] };
    expect(ids(earnedBadges(progress))).not.toContain("own-words");
  });

  test("a terse but real explanation clears the floor", () => {
    const progress: BadgeProgress = {
      ...emptyProgress(),
      ownWordsExplains: [{ text: "I used loops to repeat it", at: T0 }],
    };
    expect(ids(earnedBadges(progress))).toContain("own-words");
  });

  test("earnedAt is the earliest qualifying explanation, skipping a too-short earlier one", () => {
    const progress: BadgeProgress = {
      ...emptyProgress(),
      ownWordsExplains: [
        { text: "yes", at: T0 },
        { text: "It moves the arm up and down when the motor spins", at: T0 + DAY_MS },
      ],
    };
    const badges = earnedBadges(progress);
    expect(badges.find((b) => b.id === "own-words")?.earnedAt).toBe(T0 + DAY_MS);
  });
});

describe("Fixed It", () => {
  const longEnough = "I forgot to plug in the battery pack first."; // > 20 chars

  test("earned once a Maker's Log answers both 'what went wrong' and 'how did you fix it' with more than 20 characters", () => {
    const progress: BadgeProgress = {
      ...emptyProgress(),
      makerLogs: [{ whatWentWrong: longEnough, howFixed: "I plugged the battery pack in and it worked.", at: T0 }],
    };
    const badges = earnedBadges(progress);
    expect(ids(badges)).toContain("fixed-it");
    expect(badges.find((b) => b.id === "fixed-it")?.earnedAt).toBe(T0);
  });

  test("not earned when 'how did you fix it' is missing or too short", () => {
    const noFix: BadgeProgress = { ...emptyProgress(), makerLogs: [{ whatWentWrong: longEnough, at: T0 }] };
    expect(ids(earnedBadges(noFix))).not.toContain("fixed-it");

    const shortFix: BadgeProgress = { ...emptyProgress(), makerLogs: [{ whatWentWrong: longEnough, howFixed: "Fixed it.", at: T0 }] };
    expect(ids(earnedBadges(shortFix))).not.toContain("fixed-it");
  });

  test("not earned when only 'what went wrong' is long enough (Bug Hunter's own bar, not Fixed It's)", () => {
    const progress: BadgeProgress = {
      ...emptyProgress(),
      makerLogs: [{ whatWentWrong: "too short", howFixed: "I plugged the battery pack in and it worked.", at: T0 }],
    };
    expect(ids(earnedBadges(progress))).not.toContain("fixed-it");
  });
});

describe("Idea Spotter", () => {
  test("earned when an idea is met in two different problems, at the second problem's own time", () => {
    const progress: BadgeProgress = {
      ...emptyProgress(),
      ideaEvents: [
        { ideaId: "guess-and-round", problemId: "p1", at: T0 },
        { ideaId: "guess-and-round", problemId: "p2", at: T0 + DAY_MS },
      ],
    };
    const badges = earnedBadges(progress);
    expect(ids(badges)).toContain("idea-spotter");
    expect(badges.find((b) => b.id === "idea-spotter")?.earnedAt).toBe(T0 + DAY_MS);
  });

  test("not earned when the idea is only met in one problem, however many times", () => {
    const progress: BadgeProgress = {
      ...emptyProgress(),
      ideaEvents: [
        { ideaId: "guess-and-round", problemId: "p1", at: T0 },
        { ideaId: "guess-and-round", problemId: "p1", at: T0 + DAY_MS }, // a retry, same problem
      ],
    };
    expect(ids(earnedBadges(progress))).not.toContain("idea-spotter");
  });

  test("earnedAt is the earliest idea to reach a second problem, across different ideas", () => {
    const progress: BadgeProgress = {
      ...emptyProgress(),
      ideaEvents: [
        { ideaId: "idea-a", problemId: "p1", at: T0 },
        { ideaId: "idea-a", problemId: "p2", at: T0 + 2 * DAY_MS },
        { ideaId: "idea-b", problemId: "p3", at: T0 + 1000 },
        { ideaId: "idea-b", problemId: "p4", at: T0 + DAY_MS },
      ],
    };
    expect(earnedBadges(progress).find((b) => b.id === "idea-spotter")?.earnedAt).toBe(T0 + DAY_MS);
  });
});

describe("Comeback", () => {
  test("earned once a mistake-box variant is answered correctly on the first try back", () => {
    const progress: BadgeProgress = { ...emptyProgress(), reviewSuccesses: [{ at: T0 }] };
    expect(ids(earnedBadges(progress))).toContain("comeback");
  });

  test("not earned with none on record", () => {
    expect(ids(earnedBadges(emptyProgress()))).not.toContain("comeback");
  });
});

describe("Pass It On", () => {
  test("earned once a parent-entered skill note is on record", () => {
    const progress: BadgeProgress = { ...emptyProgress(), parentSkillNotes: [{ at: T0 }] };
    expect(ids(earnedBadges(progress))).toContain("pass-it-on");
  });

  test("not earned with none on record", () => {
    expect(ids(earnedBadges(emptyProgress()))).not.toContain("pass-it-on");
  });
});

describe("earnedBadges: no progress", () => {
  test("returns an empty list when nothing has been earned", () => {
    expect(earnedBadges(emptyProgress())).toEqual([]);
  });
});

describe("newlyEarned (Plan 4 task 35: the celebration's own diff)", () => {
  const first: Badge = { id: "first-robot", name: "First Robot", earnedAt: T0 };
  const second: Badge = { id: "first-proof", name: "First Proof", earnedAt: T0 + DAY_MS };

  test("nothing seen yet: every earned badge is new", () => {
    expect(newlyEarned([first, second], [])).toEqual([first, second]);
  });

  test("already seen: nothing is new", () => {
    expect(newlyEarned([first, second], ["first-robot", "first-proof"])).toEqual([]);
  });

  test("only the badge missing from seenIds counts as new", () => {
    expect(newlyEarned([first, second], ["first-robot"])).toEqual([second]);
  });

  test("a seenIds entry for a badge that is not currently earned changes nothing", () => {
    expect(newlyEarned([first], ["some-badge-not-earned"])).toEqual([first]);
  });

  test("no badges earned at all: nothing to celebrate regardless of seenIds", () => {
    expect(newlyEarned([], ["first-robot"])).toEqual([]);
  });
});
