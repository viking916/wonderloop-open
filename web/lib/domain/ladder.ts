// The Ladder's pure engine (8 September 2026, docs/superpowers/specs/2026-09-08-math-ladder-
// design.md): sessions of rounds on Friday, Saturday and Sunday; placement by probes; a topic
// at a time until the mastery bar; a fluency round; then retrieval on a schedule counted in
// sessions. No Firebase, no React, no Date.now() inside functions: time and randomness always
// arrive as parameters.

import type { LadderProblem, LadderTopic, LadderTopicMeta } from "../content/schema";

export const LADDER_QUEST_ID = "ladder";

/** Round shape: 25 minutes on, 5 off. The first round of a session carries a longer retrieval
 * because the gap since the last session is days. */
export const ROUND_MINUTES = 25;
export const BREAK_MINUTES = 5;
export const RETRIEVAL_MINUTES = 6;
export const FIRST_RETRIEVAL_MINUTES = 12;
export const STRETCH_MINUTES = 3;

/** Retrieval problems served per round, and per first round. */
export const RETRIEVAL_COUNT = 6;
export const FIRST_RETRIEVAL_COUNT = 10;
/** Topic problems a round offers before it stops asking (the minutes end it in practice). */
export const TOPIC_COUNT = 10;
export const FLUENCY_COUNT = 10;
export const PROBE_COUNT = 4;

export const MASTERY_WINDOW = 10;
export const MASTERY_NEEDED = 8;
export const MIN_SESSIONS_FOR_MASTERY = 2;

export const RETRIEVAL_FIRST_INTERVAL = 2;
export const RETRIEVAL_CAP = 30;
/** A placement "mastered" claim is checked soon: it enters retrieval at the first interval. */

export type TopicStateKind = "unplaced" | "placed" | "current" | "mastered";

export type TopicState = {
  state: TopicStateKind;
  /** The last MASTERY_WINDOW topic-phase results, oldest first. */
  lastTen: Array<{ correct: boolean; sure: boolean; guessing: boolean; session: number }>;
  /** Distinct session numbers the topic has been worked in. */
  sessions: number[];
  masteredSession?: number;
  fluencyPassed?: boolean;
  /** Problem ids served so far, so a round never repeats one before the bank is exhausted. */
  served: string[];
  /** The way he marked as his (LadderTopic.ways[].id), if any. */
  favouriteWay?: string;
};

export type SkillRetrieval = { skillId: string; topicId: string; interval: number; dueSession: number; lapses: number };

export type LadderState = {
  startedAt: number;
  /** How many sessions have been opened, counting from 1. */
  sessionCount: number;
  currentTopic?: string;
  placementDone: boolean;
  /** Session number of the last opened session and its round index, for resuming. */
  openSession?: { number: number; day: string; round: number; startedAt: number };
};

export type Phase = "retrieval" | "topic" | "fluency" | "stretch" | "probe";

export type RoundPlan = { index: number; retrievalMinutes: number; topicMinutes: number; stretchMinutes: number };

export function emptyTopicState(): TopicState {
  return { state: "unplaced", lastTen: [], sessions: [], served: [] };
}

export function emptyLadderState(now: number): LadderState {
  return { startedAt: now, sessionCount: 0, placementDone: false };
}

/** Rounds a session on a given weekday offers: Friday 2, Saturday 4, Sunday 4, any other day 1. */
export function roundsForDay(day: number): number {
  if (day === 5) return 2;
  if (day === 6 || day === 0) return 4;
  return 1;
}

export function roundPlan(index: number): RoundPlan {
  const retrievalMinutes = index === 0 ? FIRST_RETRIEVAL_MINUTES : RETRIEVAL_MINUTES;
  return { index, retrievalMinutes, topicMinutes: ROUND_MINUTES - retrievalMinutes - STRETCH_MINUTES, stretchMinutes: STRETCH_MINUTES };
}

/** Stage order, then graph order within a stage. */
export function orderedTopics(graph: LadderTopicMeta[]): LadderTopicMeta[] {
  return [...graph].sort((a, b) => a.stage - b.stage);
}

function allMastered(ids: string[], states: Record<string, TopicState>): boolean {
  return ids.every((id) => states[id]?.state === "mastered");
}

/** The next topic to work: the current one if it is set and not mastered, else the first topic
 * in order whose needs are all mastered and which is not mastered itself. Undefined when the
 * authored sequence is exhausted. */
export function nextTopic(graph: LadderTopicMeta[], states: Record<string, TopicState>, current?: string): LadderTopicMeta | undefined {
  if (current && states[current]?.state !== "mastered") return graph.find((t) => t.id === current);
  return orderedTopics(graph).find((t) => states[t.id]?.state !== "mastered" && allMastered(t.needs, states));
}

/** The topics a placement pass probes next: unplaced topics whose needs are all placed as
 * mastered (roots first). Empty once the frontier is found, i.e. some topic is current. */
export function placementCandidates(graph: LadderTopicMeta[], states: Record<string, TopicState>): LadderTopicMeta[] {
  if (Object.values(states).some((s) => s.state === "current")) return [];
  return orderedTopics(graph).filter((t) => (states[t.id]?.state ?? "unplaced") === "unplaced" && allMastered(t.needs, states));
}

/** Applies a probe's outcome: four hits marks the topic mastered (its skills enter retrieval at
 * the first interval so the claim gets checked); two or more misses makes it current and ends
 * placement; one miss leaves it placed as current too, since a child who misses one of
 * four has something to learn there. */
export function applyProbe(state: TopicState, hits: number, session: number): TopicState {
  if (hits >= PROBE_COUNT) return { ...state, state: "mastered", masteredSession: session, sessions: uniq([...state.sessions, session]) };
  return { ...state, state: "current", sessions: uniq([...state.sessions, session]) };
}

/** Records one topic-phase result. */
export function recordTopicResult(
  state: TopicState,
  result: { correct: boolean; confidence?: "sure" | "probably" | "guessing"; session: number; problemId: string },
): TopicState {
  const entry = { correct: result.correct, sure: result.confidence === "sure", guessing: result.confidence === "guessing", session: result.session };
  const lastTen = [...state.lastTen, entry].slice(-MASTERY_WINDOW);
  return { ...state, state: state.state === "mastered" ? "mastered" : "current", lastTen, sessions: uniq([...state.sessions, result.session]), served: [...state.served, result.problemId] };
}

/** Eight of the last ten right, none of those ten marked guessing, spread over two sessions. */
export function masteryBarMet(state: TopicState): boolean {
  if (state.lastTen.length < MASTERY_WINDOW) return false;
  const correct = state.lastTen.filter((r) => r.correct).length;
  if (correct < MASTERY_NEEDED) return false;
  if (state.lastTen.some((r) => r.guessing)) return false;
  return new Set(state.lastTen.map((r) => r.session)).size >= MIN_SESSIONS_FOR_MASTERY;
}

/** A run of guessing (three in a row, right or wrong) stops the round and returns to the idea. */
export function guessingRun(state: TopicState): boolean {
  const last = state.lastTen.slice(-3);
  return last.length === 3 && last.every((r) => r.guessing);
}

export function markMastered(state: TopicState, session: number): TopicState {
  return { ...state, state: "mastered", masteredSession: session, fluencyPassed: true };
}

/** The fluency round passes when at least eight of ten are right within the topic's time. */
export function fluencyPassed(correct: number, seconds: number, allowedSeconds: number): boolean {
  return correct >= 8 && seconds <= allowedSeconds;
}

/** Retrieval entries for a topic's skills once it is mastered, due after the first interval. */
export function retrievalEntriesFor(topic: LadderTopicMeta, session: number, existing: SkillRetrieval[]): SkillRetrieval[] {
  const have = new Set(existing.map((e) => e.skillId));
  return topic.skills
    .filter((s) => !have.has(s))
    .map((skillId) => ({ skillId, topicId: topic.id, interval: RETRIEVAL_FIRST_INTERVAL, dueSession: session + RETRIEVAL_FIRST_INTERVAL, lapses: 0 }));
}

/** Entries due at or before this session, most overdue first. */
export function retrievalDue(entries: SkillRetrieval[], session: number): SkillRetrieval[] {
  return entries.filter((e) => e.dueSession <= session).sort((a, b) => a.dueSession - b.dueSession);
}

/** A hit doubles the interval (capped); a miss halves it (floor 1) and counts a lapse. */
export function applyRetrievalResult(entry: SkillRetrieval, correct: boolean, session: number): SkillRetrieval {
  const interval = correct ? Math.min(RETRIEVAL_CAP, entry.interval * 2) : Math.max(1, Math.floor(entry.interval / 2));
  return { ...entry, interval, dueSession: session + interval, lapses: entry.lapses + (correct ? 0 : 1) };
}

/** Which difficulty band the next topic problem comes from: start at 1, climb on a run of three
 * right, drop on two misses in a row. */
export function bandFor(state: TopicState): 1 | 2 | 3 {
  const results = state.lastTen;
  let band: 1 | 2 | 3 = 1;
  let streak = 0;
  let misses = 0;
  for (const r of results) {
    if (r.correct) { streak++; misses = 0; if (streak >= 3 && band < 3) { band = (band + 1) as 1 | 2 | 3; streak = 0; } }
    else { misses++; streak = 0; if (misses >= 2 && band > 1) { band = (band - 1) as 1 | 2 | 3; misses = 0; } }
  }
  return band;
}

/** Picks up to n topic problems from the band (falling back to neighbouring bands), unserved
 * first, then least recently served, deterministic for a seed. */
export function pickTopicProblems(topic: LadderTopic, state: TopicState, n: number, seed: number): LadderProblem[] {
  const band = bandFor(state);
  const order: Array<1 | 2 | 3> = band === 1 ? [1, 2, 3] : band === 2 ? [2, 3, 1] : [3, 2, 1];
  const servedIndex = new Map<string, number>();
  state.served.forEach((id, i) => servedIndex.set(id, i));
  const out: LadderProblem[] = [];
  for (const b of order) {
    const pool = topic.bank.filter((p) => p.difficulty === b && !out.includes(p));
    const unserved = shuffle(pool.filter((p) => !servedIndex.has(p.id)), seed + b);
    const served = pool.filter((p) => servedIndex.has(p.id)).sort((x, y) => (servedIndex.get(x.id) ?? 0) - (servedIndex.get(y.id) ?? 0));
    for (const p of [...unserved, ...served]) { if (out.length >= n) break; out.push(p); }
    if (out.length >= n) break;
  }
  return out.slice(0, n);
}

/** Probe problems: four across the bands (1, 2, 2, 3), never from the served list. */
export function pickProbeProblems(topic: LadderTopic, seed: number): LadderProblem[] {
  const pick = (d: 1 | 2 | 3, k: number, salt: number) => shuffle(topic.bank.filter((p) => p.difficulty === d), seed + salt).slice(0, k);
  return [...pick(1, 1, 1), ...pick(2, 2, 2), ...pick(3, 1, 3)].slice(0, PROBE_COUNT);
}

/** Fluency problems: ten from the bank's bands 1 and 2, served as variants where they exist so
 * the round is never the same set twice. */
export function pickFluencyProblems(topic: LadderTopic, seed: number): LadderProblem[] {
  const pool = topic.bank.filter((p) => p.difficulty <= 2);
  return shuffle(pool, seed).slice(0, FLUENCY_COUNT).map((p) => asVariant(p, seed));
}

/** One stretch problem the child has not seen, or the least recently seen one. */
export function pickStretch(topic: LadderTopic, seen: string[], seed: number): LadderProblem | undefined {
  const unseen = topic.stretch.filter((p) => !seen.includes(p.id));
  if (unseen.length) return shuffle(unseen, seed)[0];
  return topic.stretch.length ? topic.stretch[seed % topic.stretch.length] : undefined;
}

/** Retrieval problems for due skills: one bank problem per due entry from its topic, served as
 * a variant on odd seeds. */
export function pickRetrievalProblems(
  due: SkillRetrieval[],
  topics: Record<string, LadderTopic>,
  n: number,
  seed: number,
): Array<{ entry: SkillRetrieval; problem: LadderProblem }> {
  const out: Array<{ entry: SkillRetrieval; problem: LadderProblem }> = [];
  for (const entry of due) {
    const topic = topics[entry.topicId];
    if (!topic) continue;
    const pool = topic.bank.filter((p) => p.skills.includes(entry.skillId) && p.difficulty <= 2);
    const source = pool.length ? pool : topic.bank;
    const p = shuffle(source, seed + entry.lapses + entry.dueSession)[0];
    if (!p) continue;
    out.push({ entry, problem: (seed + out.length) % 2 === 1 ? asVariant(p, seed) : p });
    if (out.length >= n) break;
  }
  return out;
}

/** The problem with its variant's prompt and answer swapped in, when it has one. */
export function asVariant(p: LadderProblem, seed: number): LadderProblem {
  if (!p.variant || seed % 2 === 0) return p;
  return { ...p, prompt: p.variant.prompt, options: p.variant.options ?? p.options, items: p.variant.items ?? p.items, rows: p.variant.rows ?? p.rows, cols: p.variant.cols ?? p.cols, answer: p.variant.answer, figure: p.variant.figure ?? p.figure };
}

/** Projection: sessions left to finish a stage at the recent pace of topics per session. */
export function projectSessions(topicsLeft: number, topicsPerSession: number): number | undefined {
  if (topicsPerSession <= 0) return undefined;
  return Math.ceil(topicsLeft / topicsPerSession);
}

function uniq(xs: number[]): number[] {
  return [...new Set(xs)].sort((a, b) => a - b);
}

/** Deterministic shuffle (mulberry32 over the seed), so a round is reproducible for a seed. */
export function shuffle<T>(xs: T[], seed: number): T[] {
  const out = [...xs];
  let a = (seed >>> 0) || 1;
  const rnd = () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
