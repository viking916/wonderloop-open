import { describe, expect, test } from "vitest";
import { checkAnswer, numericInputMode, parseNumber, sameNumber } from "./answers";

describe("parseNumber", () => {
  test.each([
    ["3", "3"], ["3/4", "0.75"], ["6/8", "3/4"], ["0.75", "3/4"], ["$32.40", "32.4"], ["32.40", "32.4"],
    ["-3", "-3"], ["1 1/2", "3/2"], ["  42  ", "42"], ["25%", "0.25"], ["1,250", "1250"],
    [".5", "1/2"], ["-.5", "-1/2"],
  ])("%s equals %s", (a, b) => {
    expect(sameNumber(a, b)).toBe(true);
  });
  test.each(["2+3", "five", "", "3/0", "1/2/3", "4x"])("rejects %s", (s) => {
    expect(parseNumber(s)).toBeNull();
  });
  test("different values are not the same", () => {
    expect(sameNumber("3", "4")).toBe(false);
    expect(sameNumber("0.3", "1/3")).toBe(false);
  });
});

describe("checkAnswer", () => {
  test("number: accepts equivalent forms", () => {
    expect(checkAnswer({ kind: "number", value: "32.40" }, { kind: "number", text: "$32.4" }).correct).toBe(true);
  });
  test("number with a percent unit: the typed % is the unit, not per hundred", () => {
    const spec = { kind: "number", value: "90", unit: "%" } as const;
    expect(checkAnswer(spec, { kind: "number", text: "90" }).correct).toBe(true);
    expect(checkAnswer(spec, { kind: "number", text: "90%" }).correct).toBe(true);
    expect(checkAnswer(spec, { kind: "number", text: "0.9" }).correct).toBe(false);
  });
  test("number without a unit: a trailing % still means per hundred", () => {
    expect(checkAnswer({ kind: "number", value: "0.9" }, { kind: "number", text: "90%" }).correct).toBe(true);
  });
  test("number: rejects a word with a not-a-number reason", () => {
    const r = checkAnswer({ kind: "number", value: "5" }, { kind: "number", text: "five" });
    expect(r.correct).toBe(false);
    expect(r.reason).toBe("not-a-number");
  });
  test("number: rejects an expression with a reason", () => {
    const r = checkAnswer({ kind: "number", value: "5" }, { kind: "number", text: "2+3" });
    expect(r.correct).toBe(false);
    expect(r.reason).toBe("expression-not-accepted");
  });
  test("choice", () => {
    expect(checkAnswer({ kind: "choice", index: 2 }, { kind: "choice", index: 2 }).correct).toBe(true);
    expect(checkAnswer({ kind: "choice", index: 2 }, { kind: "choice", index: 1 }).correct).toBe(false);
  });
  test("boolean", () => {
    expect(checkAnswer({ kind: "boolean", value: true }, { kind: "boolean", value: true }).correct).toBe(true);
  });
  test("order must match exactly", () => {
    expect(checkAnswer({ kind: "order", order: [2, 0, 1] }, { kind: "order", order: [2, 0, 1] }).correct).toBe(true);
    expect(checkAnswer({ kind: "order", order: [2, 0, 1] }, { kind: "order", order: [0, 2, 1] }).correct).toBe(false);
  });
  test("grid compares every cell", () => {
    const cells = [[true, false], [false, true]];
    expect(checkAnswer({ kind: "grid", cells }, { kind: "grid", cells: [[true, false], [false, true]] }).correct).toBe(true);
    expect(checkAnswer({ kind: "grid", cells }, { kind: "grid", cells: [[true, true], [false, true]] }).correct).toBe(false);
  });
  test("rubric is never auto-graded", () => {
    const r = checkAnswer({ kind: "rubric", mustMention: ["a", "b"] }, { kind: "text", text: "a and b" });
    expect(r.correct).toBe(false);
    expect(r.reason).toBe("not-auto-graded");
  });
  test("kind mismatch", () => {
    expect(checkAnswer({ kind: "number", value: "3" }, { kind: "choice", index: 0 }).reason).toBe("kind-mismatch");
  });
});

// Task 43: the trap is real -- the iPad's numeric and decimal keypads have no slash, no space
// and no minus, so a fraction, a mixed number or a negative answer must never get "decimal" or
// they become untypeable. Every case here is drawn straight from the brief.
describe("numericInputMode", () => {
  test.each([
    ["300", "decimal"],
    ["45.00", "decimal"],
    ["0", "decimal"],
    ["3/4", undefined],
    ["1 3/4", undefined],
    ["-7", undefined],
  ])("a number answer of %s gets inputMode %s", (value, expected) => {
    expect(numericInputMode({ kind: "number", value })).toBe(expected);
  });

  test("a rubric/text answer never gets a numeric inputMode", () => {
    expect(numericInputMode({ kind: "rubric", mustMention: ["equal parts", "reason"] })).toBeUndefined();
  });

  test("choice/boolean/order/grid answers never get a numeric inputMode", () => {
    expect(numericInputMode({ kind: "choice", index: 0 })).toBeUndefined();
    expect(numericInputMode({ kind: "boolean", value: true })).toBeUndefined();
    expect(numericInputMode({ kind: "order", order: [1, 0] })).toBeUndefined();
    expect(numericInputMode({ kind: "grid", cells: [[true]] })).toBeUndefined();
  });
});
