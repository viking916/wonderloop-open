import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Content } from "../lib/content/load";
import { loadContent, problemsOf } from "../lib/content/load";
import type { Problem, ProblemKind, Quest, Track } from "../lib/content/schema";

export type WeekTrackStats = {
  problems: Record<ProblemKind, number>;
  ideasIntroduced: string[];
  skills: string[];
  money: number;
  avgExplanationWords: number;
};

export type Smell = { problemId: string; kind: "long-sentence" | "hint-leaks-answer" | "long-explanation"; detail: string };

export type Report = {
  weeks: Record<number, Partial<Record<Track, WeekTrackStats>>>;
  smells: Smell[];
};

const PROBLEM_KINDS: ProblemKind[] = ["number", "choice", "truefalse", "order", "grid", "text"];
const MAX_SENTENCE_WORDS = 25;
/**
 * A whole explanation's word budget, per lane.
 *
 * Two true things, and one flat number could not hold both. Length legitimately scales with the
 * lane: across seasons 1 and 2, the approved voice, a warm-up explanation runs a median of 41
 * words and a monster's runs 195, because a monster is the month's centrepiece and explaining a
 * whole technique properly takes room. And season 3 drifted upward in EVERY lane anyway (warm-up
 * 41 to 59, skills 55 to 75, check 58 to 109, puzzle 75 to 106, monster 195 to 250), because each
 * sprint was handed the last as the voice to continue and each rounded up.
 *
 * A flat 120 got both wrong: it passed a 90 word warm-up, twice the approved voice, and failed
 * every monster ever written. These budgets are seasons 1 and 2's own ninetieth percentile per
 * lane with headroom, so the approved voice passes in every lane and drift is named in the lane it
 * happens in.
 */
const MAX_EXPLANATION_WORDS: Record<Problem["lane"], number> = {
  warmup: 75,
  skills: 105,
  shape: 105,
  check: 125,
  puzzle: 145,
  "puzzle-of-week": 175,
  monster: 290,
};
const MONEY_SKILL = "think.money";

function problemsOfQuest(q: Quest): Problem[] {
  return q.steps.flatMap((s) => problemsOf(s));
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

// Split on a sentence-ending period, question mark or exclamation point, but
// never on a period sitting between two digits (a decimal point), so
// "3.5 is not 4." stays one sentence instead of splitting mid-number.
function sentencesOf(s: string): string[] {
  return s
    .split(/(?<!\d)\.(?!\d)|[?!]/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function longExplanationSmells(p: Problem): Smell[] {
  const words = p.explanation.reduce((n, step) => n + wordCount(step), 0);
  const budget = MAX_EXPLANATION_WORDS[p.lane];
  if (words <= budget) return [];
  return [{ problemId: p.id, kind: "long-explanation", detail: `${words} words across ${p.explanation.length} steps, ${budget} is the ${p.lane} budget` }];
}

function longSentenceSmells(p: Problem): Smell[] {
  const smells: Smell[] = [];
  for (const step of p.explanation) {
    for (const sentence of sentencesOf(step)) {
      const words = wordCount(sentence);
      if (words > MAX_SENTENCE_WORDS) {
        const firstEight = sentence.trim().split(/\s+/).slice(0, 8).join(" ");
        smells.push({ problemId: p.id, kind: "long-sentence", detail: `${words} words, starts "${firstEight}"` });
      }
    }
  }
  return smells;
}

// If num/den terminates within 2 decimal places, returns that quotient;
// otherwise null. Shared by the pure-fraction and mixed-number branches of
// canonicalForms so the "terminates within 2 places" rule lives in one place.
function terminatingDecimal(num: number, den: number): number | null {
  if (den === 0 || !Number.isInteger((num * 100) / den)) return null;
  return num / den;
}

// Canonical string forms of a `number` answer value that would count as the
// answer if a hint states them outright: the authored value, a terminating
// (to 2 places) decimal for a fraction or a mixed number (both the trimmed
// and the 2-place form), and a trailing-zero-stripped decimal for an
// authored decimal.
export function canonicalForms(value: string): string[] {
  const forms = new Set<string>([value]);

  const frac = value.match(/^(-?\d+)\/(\d+)$/);
  if (frac) {
    const d = terminatingDecimal(Number(frac[1]), Number(frac[2]));
    if (d !== null) forms.add(d.toString());
  }

  const mixed = value.match(/^(-?\d+) (\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const sign = whole < 0 ? -1 : 1;
    const d = terminatingDecimal(Number(mixed[2]), Number(mixed[3]));
    if (d !== null) {
      const total = whole + sign * d;
      forms.add(total.toString());
      forms.add(total.toFixed(2));
    }
  }

  if (/^-?\d+\.\d+$/.test(value)) forms.add(Number(value).toString());
  return [...forms];
}

// A token counts as "standalone" if it is not glued to another digit on
// either side, and a . or / neighbor only disqualifies the match when that
// neighbor is itself glued to a digit. So "3" does not match inside "13",
// "3/4", "0.3" or "3.5", but it does match in "the answer is 3." or
// "is 3,", where the punctuation is just ending the sentence, not a decimal
// point or a fraction slash.
export function findStandaloneToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<!\\d)(?<!\\d[./])${escaped}(?!\\d)(?![./]\\d)`);
  return re.test(text);
}

function hintLeakSmells(p: Problem): Smell[] {
  if (p.answer.kind !== "number") return [];
  const tokens = canonicalForms(p.answer.value);
  const smells: Smell[] = [];
  // hints[0], hints[1] and the authored tier-3 socraticHint (schema.ts) all get the same
  // answer-leak scan: a Socratic question is exactly as capable of accidentally stating the
  // answer as a tell-more hint is, so it earns no exemption.
  const allHints: [string, string, string] = [p.hints[0], p.hints[1], p.socraticHint];
  const labels = ["hint 1", "hint 2", "socratic hint"];
  allHints.forEach((hint, i) => {
    const leaked = tokens.find((t) => findStandaloneToken(hint, t));
    if (leaked) smells.push({ problemId: p.id, kind: "hint-leaks-answer", detail: `${labels[i]} states "${leaked}"` });
  });
  return smells;
}

function statsFor(q: Quest, smells: Smell[]): WeekTrackStats {
  const problems = problemsOfQuest(q);
  const counts = Object.fromEntries(PROBLEM_KINDS.map((k) => [k, 0])) as Record<ProblemKind, number>;
  for (const p of problems) counts[p.kind] += 1;
  const ideasIntroduced = problems.filter((p) => p.introducesIdea).map((p) => p.ideaId);
  const skills = [...new Set(problems.flatMap((p) => p.skills))].sort();
  const money = problems.filter((p) => p.skills.includes(MONEY_SKILL)).length;
  for (const p of problems) smells.push(...longSentenceSmells(p), ...longExplanationSmells(p), ...hintLeakSmells(p));
  const totalWords = problems.reduce((sum, p) => sum + wordCount(p.explanation.join(" ")), 0);
  const avgExplanationWords = problems.length ? Math.round((totalWords / problems.length) * 10) / 10 : 0;
  return { problems: counts, ideasIntroduced, skills, money, avgExplanationWords };
}

export function buildReport(content: Content): Report {
  const weeks: Report["weeks"] = {};
  const smells: Smell[] = [];
  for (const q of content.quests) {
    const stats = statsFor(q, smells);
    weeks[q.week] ??= {};
    weeks[q.week]![q.track] = stats;
  }
  return { weeks, smells };
}

function markdownTable(report: Report): string {
  const lines: string[] = [];
  lines.push("| Week | Track | number | choice | truefalse | order | grid | text | Ideas | Money | AvgWords |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  const weekNums = Object.keys(report.weeks).map(Number).sort((a, b) => a - b);
  for (const week of weekNums) {
    const tracks = report.weeks[week]!;
    for (const track of Object.keys(tracks).sort() as Track[]) {
      const s = tracks[track]!;
      const counts = PROBLEM_KINDS.map((k) => s.problems[k]).join(" | ");
      lines.push(`| ${week} | ${track} | ${counts} | ${s.ideasIntroduced.join(", ") || "-"} | ${s.money} | ${s.avgExplanationWords} |`);
    }
  }
  return lines.join("\n");
}

function markdownSmells(report: Report): string {
  if (report.smells.length === 0) return "\nsmells: 0";
  const lines = [`\nsmells: ${report.smells.length}`];
  for (const s of report.smells) lines.push(`- [${s.kind}] ${s.problemId}: ${s.detail}`);
  return lines.join("\n");
}

export function main(): void {
  const root = path.resolve(process.argv[2] ?? "../content");
  const r = loadContent(root);
  if (!r.ok || !r.content) {
    for (const e of r.errors) console.error(`${path.relative(root, e.file).split(path.sep).join("/")}${e.path ? " :: " + e.path : ""}\n  ${e.message}`);
    console.error(`\n${r.errors.length} content error(s)`);
    process.exit(1);
  }
  const report = buildReport(r.content);
  console.log(markdownTable(report));
  console.log(markdownSmells(report));
  process.exit(report.smells.length > 0 ? 1 : 0);
}

const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
  } catch {
    return false;
  }
})();
if (isMain) main();
