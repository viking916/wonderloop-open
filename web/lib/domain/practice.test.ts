import { describe, expect, test } from "vitest";
import { hasChessRows, hasPianoRow, hasPracticeCard, practiceDocId, practiceSummary } from "./practice";

describe("practiceDocId", () => {
  test("pads the week to two digits", () => {
    expect(practiceDocId(1, 3)).toBe("s1w03");
    expect(practiceDocId(2, 12)).toBe("s2w12");
    expect(practiceDocId(4, 1)).toBe("s4w01");
  });
});

describe("hasPianoRow", () => {
  test("only when the Play track is explicitly on", () => {
    expect(hasPianoRow({ playTrack: true })).toBe(true);
    expect(hasPianoRow({ playTrack: false })).toBe(false);
    expect(hasPianoRow({})).toBe(false);
  });
});

describe("hasChessRows", () => {
  test("on by default, off only when explicitly false", () => {
    expect(hasChessRows({})).toBe(true);
    expect(hasChessRows({ chessPractice: true })).toBe(true);
    expect(hasChessRows({ chessPractice: false })).toBe(false);
  });
});

describe("hasPracticeCard", () => {
  test("renders whenever either row would show", () => {
    expect(hasPracticeCard({})).toBe(true); // chess on by default
    expect(hasPracticeCard({ chessPractice: false })).toBe(false); // chess off, no piano
    expect(hasPracticeCard({ chessPractice: false, playTrack: true })).toBe(true); // piano only
  });
});

describe("practiceSummary", () => {
  test("both rows, nothing ticked", () => {
    expect(practiceSummary({ playTrack: true }, undefined)).toBe("Chess 0 of 2, piano not yet");
  });

  test("both rows, everything ticked", () => {
    expect(practiceSummary({ playTrack: true }, { piano: true, chessSat: true, chessSun: true })).toBe(
      "Chess 2 of 2, piano done",
    );
  });

  test("the owner's own example: one chess game done, piano done", () => {
    expect(practiceSummary({ playTrack: true }, { piano: true, chessSat: true })).toBe("Chess 1 of 2, piano done");
  });

  test("chess only (piano off)", () => {
    expect(practiceSummary({}, { chessSat: true })).toBe("Chess 1 of 2");
  });

  test("piano only (chess turned off)", () => {
    expect(practiceSummary({ playTrack: true, chessPractice: false }, { piano: true })).toBe("Piano done");
    expect(practiceSummary({ playTrack: true, chessPractice: false }, undefined)).toBe("Piano not yet");
  });

  test("neither row applies: nothing to summarize", () => {
    expect(practiceSummary({ chessPractice: false }, undefined)).toBe("Nothing ticked yet");
  });
});
