import { describe, expect, test } from "vitest";
import { currentWeekFromDone } from "./calendar";
import { explorerSeasonIndex, sproutSeasonIndex } from "./seasonIndex";

function doneUpTo(week: number): boolean[] {
  return Array.from({ length: 12 }, (_, i) => i + 1 < week);
}

describe("explorerSeasonIndex: status", () => {
  test("a week before the current week is done", () => {
    const doneByWeek = doneUpTo(4);
    const currentWeek = currentWeekFromDone(doneByWeek);
    const weeks = explorerSeasonIndex(1, {}, doneByWeek, currentWeek);
    expect(weeks[0].status).toBe("done");
    expect(weeks[2].status).toBe("done");
  });

  test("the first not-done week is current", () => {
    const doneByWeek = doneUpTo(4);
    const currentWeek = currentWeekFromDone(doneByWeek);
    expect(currentWeek).toBe(4);
    const weeks = explorerSeasonIndex(1, {}, doneByWeek, currentWeek);
    expect(weeks[3].status).toBe("current");
  });

  test("every week after the current week is upcoming", () => {
    const doneByWeek = doneUpTo(4);
    const currentWeek = currentWeekFromDone(doneByWeek);
    const weeks = explorerSeasonIndex(1, {}, doneByWeek, currentWeek);
    expect(weeks[4].status).toBe("upcoming");
    expect(weeks[11].status).toBe("upcoming");
  });

  test("a past season (nothing recorded here, currentWeek withheld) reads every week as done, never current", () => {
    const weeks = explorerSeasonIndex(1, {}, doneUpTo(13), undefined);
    expect(weeks.every((w) => w.status === "done")).toBe(true);
  });

  test("a future season (nothing done, currentWeek withheld) reads every week as upcoming, never current", () => {
    const weeks = explorerSeasonIndex(1, {}, doneUpTo(1), undefined);
    expect(weeks.every((w) => w.status === "upcoming")).toBe(true);
  });
});

describe("explorerSeasonIndex: showcase weeks", () => {
  test("only weeks 4, 8 and 12 are marked showcase", () => {
    const weeks = explorerSeasonIndex(1, {}, [], undefined);
    const showcaseWeeks = weeks.filter((w) => w.showcase).map((w) => w.week);
    expect(showcaseWeeks).toEqual([4, 8, 12]);
  });

  test("sprints group weeks 1-4, 5-8 and 9-12", () => {
    const weeks = explorerSeasonIndex(1, {}, [], undefined);
    expect(weeks.filter((w) => w.sprint === 1).map((w) => w.week)).toEqual([1, 2, 3, 4]);
    expect(weeks.filter((w) => w.sprint === 2).map((w) => w.week)).toEqual([5, 6, 7, 8]);
    expect(weeks.filter((w) => w.sprint === 3).map((w) => w.week)).toEqual([9, 10, 11, 12]);
  });

  test("the sprint's game appears only on its first week", () => {
    const weeks = explorerSeasonIndex(1, {}, [], undefined);
    expect(weeks[0].game?.id).toBe("set");
    expect(weeks[1].game).toBeUndefined();
    expect(weeks[4].game?.id).toBe("mastermind");
    expect(weeks[8].game?.id).toBe("dots-and-boxes");
  });
});

describe("explorerSeasonIndex: tracks", () => {
  test("a track the profile has off is omitted from every week's cells", () => {
    const withPlay = explorerSeasonIndex(1, { playTrack: true }, [], undefined);
    const withoutPlay = explorerSeasonIndex(1, { playTrack: false }, [], undefined);
    expect(withPlay[0].tracks.some((t) => t.track === "play")).toBe(true);
    expect(withoutPlay.every((w) => w.tracks.every((t) => t.track !== "play"))).toBe(true);
  });

  test("every track cell carries a title, minutes, resolved skill names and idea names", () => {
    const weeks = explorerSeasonIndex(1, {}, [], undefined);
    const build = weeks[0].tracks.find((t) => t.track === "build")!;
    expect(build.questId).toBe("s1-w01-build");
    expect(build.title.length).toBeGreaterThan(0);
    expect(build.minutes).toBe(60);
    expect(build.skills.length).toBeGreaterThan(0);
    // Resolved names, not raw ids: a real skill id contains a dot, a resolved name should not
    // (content/skills.json names are plain sentence-case phrases).
    expect(build.skills.every((s) => !/^[a-z]+\.[a-z]/.test(s))).toBe(true);
  });

  test("a quest's ideas are de-duplicated: no idea name repeats within one track cell", () => {
    const weeks = explorerSeasonIndex(1, {}, [], undefined);
    for (const week of weeks) {
      for (const cell of week.tracks) {
        expect(new Set(cell.ideas).size).toBe(cell.ideas.length);
      }
    }
  });
});

describe("explorerSeasonIndex: kit", () => {
  test("week 1 lists season materials first needed by week 1", () => {
    const weeks = explorerSeasonIndex(1, {}, [], undefined);
    expect(weeks[0].kit.some((k) => k.name === "micro:bit v2")).toBe(true);
  });

  test("a week with nothing newly needed has an empty kit", () => {
    const weeks = explorerSeasonIndex(1, {}, [], undefined);
    expect(weeks[1].kit).toEqual([]);
  });
});

describe("sproutSeasonIndex", () => {
  test("carries theme, activity titles, parent card title and skills", () => {
    const weeks = sproutSeasonIndex(1, [], undefined);
    expect(weeks[0].theme.length).toBeGreaterThan(0);
    expect(weeks[0].activityTitles).toHaveLength(3);
    expect(weeks[0].parentCardTitle.length).toBeGreaterThan(0);
    expect(weeks[0].skills.length).toBeGreaterThan(0);
  });

  test("status, showcase and sprint follow the same rules as the Explorer index", () => {
    const doneByWeek = doneUpTo(2);
    const currentWeek = currentWeekFromDone(doneByWeek);
    const weeks = sproutSeasonIndex(1, doneByWeek, currentWeek);
    expect(weeks[0].status).toBe("done");
    expect(weeks[1].status).toBe("current");
    expect(weeks[2].status).toBe("upcoming");
    expect(weeks.filter((w) => w.showcase).map((w) => w.week)).toEqual([4, 8, 12]);
  });
});
