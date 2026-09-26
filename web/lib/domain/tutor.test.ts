import { describe, expect, test } from "vitest";
import { MAX_CHILD_MESSAGES } from "./tutor";

describe("MAX_CHILD_MESSAGES", () => {
  test("is a positive integer, raised from 6 to 15 on 25 September 2026 (owner feedback: too strict, too few asks)", () => {
    expect(MAX_CHILD_MESSAGES).toBe(15);
    expect(Number.isInteger(MAX_CHILD_MESSAGES)).toBe(true);
  });
});
