import type { AnswerSpec } from "./content/schema";

export type Rational = { n: bigint; d: bigint };
export type UserInput =
  | { kind: "number"; text: string }
  | { kind: "choice"; index: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "order"; order: number[] }
  | { kind: "grid"; cells: boolean[][] }
  | { kind: "text"; text: string };
export type CheckResult = { correct: boolean; reason?: "not-a-number" | "expression-not-accepted" | "kind-mismatch" | "not-auto-graded" };

function gcd(a: bigint, b: bigint): bigint { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; }
function reduce(r: Rational): Rational { const g = gcd(r.n, r.d) || 1n; const sign = r.d < 0n ? -1n : 1n; return { n: (r.n / g) * sign, d: (r.d / g) * sign }; }
function decimalToRational(s: string): Rational | null {
  // The whole part may be empty so a kid can type ".5" or "-.5" for a half.
  const m = /^(-?)(\d*)(?:\.(\d+))?$/.exec(s); if (!m) return null;
  const [, sign, whole, frac] = m;
  if (!whole && frac === undefined) return null;
  const d = 10n ** BigInt((frac ?? "").length);
  const n = BigInt(whole || "0") * d + BigInt(frac || "0");
  return reduce({ n: sign ? -n : n, d });
}

/** Parses "3", "3/4", "0.75", ".5", "$32.40", "-3", "1 1/2", "25%", "1,250". Returns null for anything else, including expressions. */
export function parseNumber(input: string): Rational | null {
  let s = input.trim().replace(/[$,\s]+/g, (m) => (m.includes("$") || m.includes(",") ? "" : " ")).trim();
  if (!s) return null;
  let percent = false;
  if (s.endsWith("%")) { percent = true; s = s.slice(0, -1).trim(); }
  let result: Rational | null = null;
  const mixed = /^(-?)(\d+) (\d+)\/(\d+)$/.exec(s);
  const frac = /^(-?\d+)\/(\d+)$/.exec(s);
  if (mixed) {
    const [, sign, w, a, b] = mixed; const d = BigInt(b); if (d === 0n) return null;
    const n = BigInt(w) * d + BigInt(a); result = reduce({ n: sign ? -n : n, d });
  } else if (frac) {
    const d = BigInt(frac[2]); if (d === 0n) return null;
    result = reduce({ n: BigInt(frac[1]), d });
  } else {
    result = decimalToRational(s);
  }
  if (!result) return null;
  return percent ? reduce({ n: result.n, d: result.d * 100n }) : result;
}

export function sameNumber(a: string, b: string): boolean {
  const x = parseNumber(a), y = parseNumber(b);
  return !!x && !!y && x.n === y.n && x.d === y.d;
}

const looksLikeExpression = (s: string) => /[+*^=]|(?<=\d)\s*-\s*(?=\d)|\d\s*\/\s*\d+\s*\/|x\b/i.test(s.trim());

export function checkAnswer(spec: AnswerSpec, input: UserInput): CheckResult {
  if (spec.kind === "rubric") return { correct: false, reason: "not-auto-graded" };
  const expectedKind = spec.kind === "boolean" ? "boolean" : spec.kind;
  if (input.kind !== expectedKind) return { correct: false, reason: "kind-mismatch" };
  switch (spec.kind) {
    case "number": {
      if (input.kind !== "number") return { correct: false, reason: "kind-mismatch" };
      // A percent answer is authored as a bare number ("90" for 90%), so a typed "%" is just the
      // unit repeated back and has to come off before parsing. Without a unit a trailing "%" still
      // means per hundred, so "90%" is 0.9.
      const text = spec.unit === "%" ? input.text.replace(/%\s*$/, "") : input.text;
      if (parseNumber(text) === null) return { correct: false, reason: looksLikeExpression(text) ? "expression-not-accepted" : "not-a-number" };
      return { correct: sameNumber(spec.value, text) };
    }
    case "choice": return { correct: input.kind === "choice" && input.index === spec.index };
    case "boolean": return { correct: input.kind === "boolean" && input.value === spec.value };
    case "order": return { correct: input.kind === "order" && input.order.length === spec.order.length && input.order.every((v, i) => v === spec.order[i]) };
    case "grid": return { correct: input.kind === "grid" && input.cells.length === spec.cells.length && input.cells.every((row, i) => row.length === spec.cells[i].length && row.every((c, j) => c === spec.cells[i][j])) };
  }
}

/**
 * task 43 (iPad numeric keyboard): which `inputMode` a typed-number answer's field should ask
 * for, derived purely from the authored answer -- never from anything the child has typed, so
 * the keyboard is right on the very first character. Only ever "decimal" or nothing:
 *
 *   - a pure whole/decimal number ("300", "45.00") gets "decimal", the digits-plus-point pad.
 *   - anything else -- a fraction ("3/4"), a mixed number ("1 3/4"), a negative ("-7"), a
 *     rubric/text answer -- gets no inputMode at all, i.e. the full keyboard.
 *
 * The reason this stays this narrow: the iPad's numeric and decimal keypads have no slash, no
 * space and no minus. A blanket "make number problems numeric" would make "3/4", "1 3/4" and
 * every week-10 negative answer untypeable, trading one bad keyboard for a worse one.
 */
export function numericInputMode(spec: AnswerSpec): "decimal" | undefined {
  if (spec.kind !== "number") return undefined;
  return /^\d+(\.\d+)?$/.test(spec.value) ? "decimal" : undefined;
}
