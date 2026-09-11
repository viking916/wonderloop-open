import { describe, expect, test } from "vitest";
import type { Quest } from "../content/schema";
import { questsForProfile, tracksForProfile } from "./tracks";

const q = (track: string) => ({ id: `s1-w01-${track}`, track }) as unknown as Quest;
const week = { build: q("build"), make: q("make"), think: q("think"), speak: q("speak"), play: q("play") };

describe("tracksForProfile", () => {
  test("a profile that never opted in sees the core tracks, Make included", () => {
    expect(tracksForProfile({})).toEqual(["build", "make", "think", "speak"]);
    expect(tracksForProfile({ playTrack: false })).toEqual(["build", "make", "think", "speak"]);
  });

  test("opting in adds Play last", () => {
    expect(tracksForProfile({ playTrack: true })).toEqual(["build", "make", "think", "speak", "play"]);
  });
});

describe("questsForProfile", () => {
  test("drops the Play quest unless the profile has the track", () => {
    expect(Object.keys(questsForProfile(week, {}))).toEqual(["build", "make", "think", "speak"]);
    expect(Object.keys(questsForProfile(week, { playTrack: true }))).toEqual(["build", "make", "think", "speak", "play"]);
  });

  test("a week without a Play quest is unchanged either way", () => {
    const three = { build: q("build"), think: q("think"), speak: q("speak") };
    expect(questsForProfile(three, { playTrack: true })).toEqual(three);
  });
});
