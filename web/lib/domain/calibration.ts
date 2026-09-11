// calibration.ts: knowing what you know (7 September 2026, the metacognition thread). Before a
// check the child taps how sure they are; after a first-try miss they say what kind of miss it
// was. This module turns those marks into the two plain sentences the skills map and the Parent
// view show. Pure: attempts in, sentences out, no dates read here.

export type Confidence = "sure" | "probably" | "guessing";
export type MissKind = "misread" | "did-not-know" | "slipped";

export const CONFIDENCE_LABEL: Record<Confidence, string> = { sure: "Sure", probably: "Probably", guessing: "Guessing" };
export const MISS_LABEL: Record<MissKind, string> = { misread: "I misread it", "did-not-know": "I did not know the idea", slipped: "I knew it and slipped" };

export type CalibrationInput = { confidence?: Confidence; missKind?: MissKind; correct: boolean; tryNumber: number; retry?: boolean };

export type CalibrationRow = { confidence: Confidence; total: number; correct: number };

/** First tries only, and only the ones that carried a confidence mark, in the fixed order. */
export function calibrationRows(attempts: CalibrationInput[]): CalibrationRow[] {
  const order: Confidence[] = ["sure", "probably", "guessing"];
  const rows = order.map((confidence) => ({ confidence, total: 0, correct: 0 }));
  for (const a of attempts) {
    if (!a.confidence || a.tryNumber !== 1 || a.retry) continue;
    const row = rows.find((r) => r.confidence === a.confidence)!;
    row.total++;
    if (a.correct) row.correct++;
  }
  return rows.filter((r) => r.total > 0);
}

export function missKindCounts(attempts: CalibrationInput[]): Array<{ kind: MissKind; count: number }> {
  const order: MissKind[] = ["misread", "did-not-know", "slipped"];
  const counts = order.map((kind) => ({ kind, count: attempts.filter((a) => a.missKind === kind).length }));
  return counts.filter((c) => c.count > 0);
}

/**
 * The sentence for the card. "When you said sure, you were right 8 of 10 times" for each
 * confidence with at least one mark, then the one honest observation the numbers support:
 * sure-and-wrong often means slow down; guessing-and-right often means you know more than you
 * think. Nothing is said before three marks in a row, since two tries prove nothing.
 */
export function calibrationSentences(attempts: CalibrationInput[]): string[] {
  const rows = calibrationRows(attempts);
  const out = rows.map((r) => `When you said ${CONFIDENCE_LABEL[r.confidence].toLowerCase()}, you were right ${r.correct} of ${r.total} times.`);
  const sure = rows.find((r) => r.confidence === "sure");
  const guessing = rows.find((r) => r.confidence === "guessing");
  if (sure && sure.total >= 3 && sure.correct / sure.total < 0.7) out.push("Sure and wrong more than once: read the question twice before the check.");
  if (guessing && guessing.total >= 3 && guessing.correct / guessing.total > 0.6) out.push("Guessing and right most of the time: you know more than you think.");
  return out;
}

export function missSentence(attempts: CalibrationInput[]): string | undefined {
  const counts = missKindCounts(attempts);
  if (counts.length === 0) return undefined;
  const parts = counts.map((c) => `${MISS_LABEL[c.kind].replace(/^I /, "").toLowerCase()} ${c.count}`);
  const top = [...counts].sort((a, b) => b.count - a.count)[0];
  const advice: Record<MissKind, string> = {
    misread: "Most misses were misreads, so the fix is slowing down, not more practice.",
    "did-not-know": "Most misses were ideas not yet met, so they come back through the mistake box.",
    slipped: "Most misses were slips on ideas you know, so the fix is checking the last step.",
  };
  return `Misses so far: ${parts.join(", ")}. ${advice[top.kind]}`;
}
