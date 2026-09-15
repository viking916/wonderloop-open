import { describe, it, expect } from "vitest";
import { isFourDigitPin, pinMatches } from "./pin";

describe("isFourDigitPin", () => {
  it("accepts exactly 4 digits", () => {
    expect(isFourDigitPin("1234")).toBe(true);
    expect(isFourDigitPin("0000")).toBe(true);
  });

  it("rejects anything that is not exactly 4 digits", () => {
    expect(isFourDigitPin("123")).toBe(false);
    expect(isFourDigitPin("12345")).toBe(false);
    expect(isFourDigitPin("12a4")).toBe(false);
    expect(isFourDigitPin("")).toBe(false);
    expect(isFourDigitPin(" 1234")).toBe(false);
  });
});

describe("pinMatches", () => {
  it("grants entry on an exact match", () => {
    expect(pinMatches("4821", "4821")).toBe(true);
  });

  it("does not grant entry on a wrong PIN", () => {
    expect(pinMatches("0000", "4821")).toBe(false);
    expect(pinMatches("4820", "4821")).toBe(false);
    expect(pinMatches("1482", "4821")).toBe(false);
  });

  it("never matches when no PIN is stored, regardless of what is entered", () => {
    expect(pinMatches("4821", undefined)).toBe(false);
    expect(pinMatches("", undefined)).toBe(false);
    expect(pinMatches("4821", "")).toBe(false);
  });

  it("is an exact match only, never a prefix or substring", () => {
    expect(pinMatches("482", "4821")).toBe(false);
    expect(pinMatches("48210", "4821")).toBe(false);
  });
});
