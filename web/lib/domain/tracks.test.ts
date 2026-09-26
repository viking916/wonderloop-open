import { describe, expect, test } from "vitest";
import type { Quest } from "../content/schema";
import { questsForProfile, tracksForProfile } from "./tracks";

const q = (track: string) => ({ id: `s1-w01-${track}`, track }) as unknown as Quest;
const week = { build: q("build"), make: q("make"), think: q("think"), speak: q("speak"), play: q("play") };

describe("tracksForProfile", () => {
  // 23 September 2026: Play stopped being a weekly quest (it is now a piano checkbox on the
  // Practice this week card, lib/domain/practice.ts) -- tracksForProfile never returns "play"
  // any more, for any profile, playTrack on or off.
  test("never includes Play, playTrack on or off", () => {
    expect(tracksForProfile({})).toEqual(["build", "make", "think", "speak"]);
    expect(tracksForProfile({ playTrack: false })).toEqual(["build", "make", "think", "speak"]);
    expect(tracksForProfile({ playTrack: true })).toEqual(["build", "make", "think", "speak"]);
  });
});

describe("questsForProfile", () => {
  test("always drops the Play quest, playTrack on or off", () => {
    expect(Object.keys(questsForProfile(week, {}))).toEqual(["build", "make", "think", "speak"]);
    expect(Object.keys(questsForProfile(week, { playTrack: true }))).toEqual(["build", "make", "think", "speak"]);
  });

  test("a week without a Play quest is unchanged either way", () => {
    const three = { build: q("build"), think: q("think"), speak: q("speak") };
    expect(questsForProfile(three, { playTrack: true })).toEqual(three);
  });
});
