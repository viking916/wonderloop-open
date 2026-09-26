import { describe, expect, test } from "vitest";
import { questTimeLabel } from "./questTime";

describe("questTimeLabel", () => {
  test("an ordinary quest reads its plain minutes", () => {
    expect(questTimeLabel({ minutes: 60 })).toBe("60 min");
  });

  test("sittings: 1 reads the same as no sittings field", () => {
    expect(questTimeLabel({ minutes: 60, sittings: 1 })).toBe("60 min");
  });

  test("sittings: 2 names the weeks it spans, not double the minutes", () => {
    expect(questTimeLabel({ minutes: 60, sittings: 2 })).toBe("2 weeks, about 60 min each");
  });
});
