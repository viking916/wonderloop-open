import { z } from "zod";

const FORBIDDEN = /[—←-⇿⟰-⟿⤀-⥿➔-➿]|->|=>/; // em dash, Unicode arrows (U+2190-U+21FF, U+27F0-U+27FF, U+2900-U+297F, U+2794-U+27BF), and ASCII arrows
export const Copy = z.string().min(1).refine((s) => !FORBIDDEN.test(s), { message: "No em dashes or arrows in copy" });

// "play" (6 September 2026) is the fourth track: instrument practice, one quest a week beside
// Build, Think and Speak. It is authored like the others but shown only to profiles that opt in
// (ProfileDoc.playTrack; lib/domain/tracks.ts), because not every family has an instrument.
// "make" (6 September 2026, owner's curriculum direction) is the engineering track: mechanical,
// electrical and aerospace toward robotics, with hardware that keeps climbing (3D printing, a
// fabricated board, a radio link). It is a core track like Build, authored season by season
// (season 2 first); a week without a make.json simply has no Make quest.
export const TrackSchema = z.enum(["build", "make", "think", "speak", "play"]);
export type Track = z.infer<typeof TrackSchema>;
// Think grew from 75 to 90 minutes on 6 September 2026 when the geometry-and-chance lane arrived.
export const TRACK_MINUTES: Record<Track, number> = { build: 60, make: 60, think: 90, speak: 45, play: 60 };
/** Display order and labels, the one place they are written down. */
export const TRACK_ORDER: readonly Track[] = ["build", "make", "think", "speak", "play"];
export const TRACK_LABEL: Record<Track, string> = { build: "Build", make: "Make", think: "Think", speak: "Speak", play: "Play" };
const TRACK_ID = "(build|make|think|speak|play)";

export const ProblemKindSchema = z.enum(["number", "choice", "truefalse", "order", "grid", "text"]);
export type ProblemKind = z.infer<typeof ProblemKindSchema>;
// "shape" (6 September 2026, owner direction): the geometry-and-chance lane, three or four
// problems a week from season 2, between the skills lane and the puzzle lane.
export const LaneSchema = z.enum(["warmup", "puzzle-of-week", "skills", "shape", "puzzle", "check", "monster"]);

const NumberAnswerSchema = z.object({ kind: z.literal("number"), value: z.string().regex(/^-?\d+(\.\d+)?(\/\d+)?$|^-?\d+ \d+\/\d+$/), unit: z.string().optional() });
const ChoiceAnswerSchema = z.object({ kind: z.literal("choice"), index: z.number().int().min(0) });
const BooleanAnswerSchema = z.object({ kind: z.literal("boolean"), value: z.boolean() });

export const AnswerSpecSchema = z.discriminatedUnion("kind", [
  NumberAnswerSchema,
  ChoiceAnswerSchema,
  BooleanAnswerSchema,
  z.object({ kind: z.literal("order"), order: z.array(z.number().int().min(0)).min(2) }),
  z.object({ kind: z.literal("grid"), cells: z.array(z.array(z.boolean()).min(1)).min(1) }),
  z.object({ kind: z.literal("rubric"), mustMention: z.array(Copy).min(2).max(4) }),
]);
export type AnswerSpec = z.infer<typeof AnswerSpecSchema>;

/** A lesson beat's check only ever asks a number, choice or true/false question -- the shape a
 * figure can make visible at a glance -- never a rubric/order/grid, none of which fit "one small
 * check question". Shares the same literal validators AnswerSpecSchema above uses, not a
 * re-authored copy, so the two can never quietly drift on what counts as a valid number/choice. */
export const LessonAnswerSpecSchema = z.discriminatedUnion("kind", [NumberAnswerSchema, ChoiceAnswerSchema, BooleanAnswerSchema]);

export const FigureSchema = z.object({
  // "board" (7 September 2026): a chess position from a FEN string in spec.fen, drawn by
  // components/quest/ProblemFigure.tsx; the alt says whose move it is and what to look for.
  // "keys" (a piano keyboard with highlighted keys: spec { octaves: 1 | 2, from: "C4", highlight:
  // ["C4", "E4"], labels?: boolean }) and "beats" (a bar of beats: spec { beats: 4, pattern: "x.xx",
  // count?: ["1", "&", "2"] }) are the Play track's visual guides (7 September 2026).
  // "diagram" (7 September 2026, owner: hands-on steps need a visual guide): a labelled drawing
  // in a w by h box, spec { w, h, wide?, items: [ {t:"box", x,y,w,h,label,sub?,fill?},
  // {t:"line", x1,y1,x2,y2,label?,arrow?,dashed?,color?}, {t:"circle", cx,cy,r,label?,fill?},
  // {t:"poly", points:[[x,y]...],label?,fill?,dashed?}, {t:"dot", cx,cy,label?,side?},
  // {t:"dim", x1,y1,x2,y2,label}, {t:"text", x,y,s,size?,anchor?} ] }. Wiring, mechanisms,
  // frames, support polygons and lever arms are all drawn with it.
  // A diagram may also carry spec.frames (lib/content/diagram-frames.ts): the picture moves.
  // "scene" (8 September 2026): a small drag-to-rotate 3D scene for the few ideas that are
  // three-dimensional, spec { type: "net-cube" | "walker", ... } (components/quest/SceneFigure.tsx).
  // "plane" (9 September 2026, the Ladder's prealgebra stage): a coordinate plane with a unit
  // grid, numbered ticks and labelled points, spec { range: 1..12, points: [{ x, y, label? }],
  // polygon?: [[x, y], ...] (closed, dashed), segments?: [[[x1, y1], [x2, y2]], ...],
  // polylines?: [[[x, y], ...] | { points, dashed? }, ...] (open curves: a line across the plane,
  // a parabola; dashed for a strict inequality's boundary) }. A
  // diagram cannot carry a grid (its item cap and its label lint both forbid it), and a point
  // on bare axes cannot be read, so the plane has its own kind.
  kind: z.enum(["net", "stack", "grid", "path", "shape", "leds", "board", "keys", "beats", "diagram", "scene", "plane"]),
  alt: Copy,
  spec: z.record(z.unknown()),
});
export type Figure = z.infer<typeof FigureSchema>;

const VariantSchema = z.object({
  prompt: Copy,
  options: z.array(Copy).min(3).max(5).optional(),
  items: z.array(Copy).min(2).optional(),
  rows: z.array(Copy).optional(),
  cols: z.array(Copy).optional(),
  answer: AnswerSpecSchema,
  figure: FigureSchema.optional(),
});

const ProblemBase = z.object({
  id: z.string().regex(new RegExp(`^s\\d-w\\d{2}-${TRACK_ID}-\\d{2}-p\\d{2}$`)),
  kind: ProblemKindSchema,
  lane: LaneSchema,
  prompt: Copy,
  options: z.array(Copy).min(3).max(5).optional(),
  items: z.array(Copy).min(2).optional(),
  rows: z.array(Copy).optional(),
  cols: z.array(Copy).optional(),
  answer: AnswerSpecSchema,
  explanation: z.array(Copy).min(2).max(6),
  ideaId: z.string().min(1),
  introducesIdea: z.boolean().optional(),
  useAgain: Copy.refine((s) => /^when /i.test(s), { message: "useAgain starts with 'when'" }),
  hints: z.tuple([Copy, Copy]),
  // Tier 3: authored, not generated (2026-08-30 plan revision). A question that makes him look
  // at the problem differently, at most two sentences, never the answer or a step that is the
  // answer. A named field rather than a third hints entry: it is asked, not told, so it does not
  // belong in a "cumulative tell-more" sequence, and naming it lets content-report.ts's
  // hintLeakSmells report it as its own kind of smell instead of "hint 3" of a tuple that used to
  // mean something else.
  socraticHint: Copy,
  skills: z.array(z.string().min(1)).min(1).max(3),
  thinkMinutes: z.number().int().min(2).max(10),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  variant: VariantSchema.optional(),
  figure: FigureSchema.optional(),
  /** A figure drawn under the worked explanation (7 September 2026, owner: fractions need a
   * visual guide in the explanation, not only in the prompt). */
  explanationFigure: FigureSchema.optional(),
});

const kindMatchesAnswer: Record<ProblemKind, AnswerSpec["kind"]> = {
  number: "number", choice: "choice", truefalse: "boolean", order: "order", grid: "grid", text: "rubric",
};
const AUTO_GRADED: ProblemKind[] = ["number", "choice", "truefalse", "order", "grid"];

function checkChoice(p: { options?: string[]; items?: string[]; answer: AnswerSpec }, ctx: z.RefinementCtx, path: (string | number)[]) {
  if (p.answer.kind === "choice") {
    if (!p.options) ctx.addIssue({ code: "custom", path: [...path, "options"], message: "choice problems need options" });
    else if (p.answer.index >= p.options.length) ctx.addIssue({ code: "custom", path: [...path, "answer", "index"], message: "answer index out of range" });
  }
  if (p.answer.kind === "order") {
    if (!p.items) ctx.addIssue({ code: "custom", path: [...path, "items"], message: "order problems need items" });
    else if (p.answer.order.length !== p.items.length) ctx.addIssue({ code: "custom", path: [...path, "answer", "order"], message: "order must list every item once" });
  }
}

function refineProblem(p: z.infer<typeof ProblemBase>, ctx: z.RefinementCtx) {
  if (p.answer.kind !== kindMatchesAnswer[p.kind]) ctx.addIssue({ code: "custom", path: ["answer"], message: `answer kind must be ${kindMatchesAnswer[p.kind]} for ${p.kind}` });
  if (AUTO_GRADED.includes(p.kind) && !p.variant) ctx.addIssue({ code: "custom", path: ["variant"], message: "auto-graded problems need a variant" });
  if (p.variant && p.variant.answer.kind !== p.answer.kind) ctx.addIssue({ code: "custom", path: ["variant", "answer"], message: "variant answer kind must match" });
  checkChoice(p, ctx, []);
  if (p.variant) checkChoice(p.variant, ctx, ["variant"]);
}
export const ProblemSchema = ProblemBase.superRefine(refineProblem);
export type Problem = z.infer<typeof ProblemSchema>;

// The Ladder (8 September 2026, docs/superpowers/specs/2026-09-08-math-ladder-design.md): a
// mastery-based mathematics sequence beside the seasons. A Ladder problem is an ordinary
// problem with its own id pattern, so the player, the checker, calibration and the mistake box
// take it unchanged; a topic is an idea card, a worked example, a bank and a stretch list; the
// graph names each topic's prerequisites, skills and fluency time.
export const LadderProblemSchema = ProblemBase.extend({ id: z.string().regex(/^ladder-[a-z0-9-]+-p\d{2}$/) }).superRefine(refineProblem);
export type LadderProblem = z.infer<typeof LadderProblemSchema>;
export const LadderTopicSchema = z.object({
  id: z.string().regex(/^(ar|pa|al|ge|a2|ca)-[a-z0-9-]+$/),
  idea: z.object({ body: Copy, figure: FigureSchema.optional() }),
  workedExample: z.object({ prompt: Copy, steps: z.array(Copy).min(3).max(6), figure: FigureSchema.optional() }),
  /** Ways (8 September 2026, owner: several tips and tricks so he can pick the one he likes):
   * two to four genuinely different methods for the topic's problems, the first restating the
   * idea card's own. The child marks a favourite; the session names it first. */
  ways: z.array(z.object({
    id: z.string().regex(/^(ar|pa|al|ge|a2|ca)-[a-z0-9-]+-w\d$/),
    name: Copy,
    when: Copy,
    steps: z.array(Copy).min(3).max(6),
    example: Copy,
    answer: Copy,
    trap: Copy,
    figure: FigureSchema.optional(),
  })).min(2).max(4).optional(),
  bank: z.array(LadderProblemSchema).min(30),
  stretch: z.array(LadderProblemSchema).min(3),
});
export type LadderTopic = z.infer<typeof LadderTopicSchema>;
export const LadderThreadSchema = z.enum(["spine", "number-theory", "counting"]);
export const LadderTopicMetaSchema = z.object({
  id: z.string().regex(/^(ar|pa|al|ge|a2|ca)-[a-z0-9-]+$/),
  stage: z.number().int().min(1).max(6),
  title: Copy,
  needs: z.array(z.string()),
  skills: z.array(z.string().min(1)).min(1).max(3),
  fluencySeconds: z.number().int().min(60).max(300),
  thread: LadderThreadSchema,
  summary: Copy,
});
export type LadderTopicMeta = z.infer<typeof LadderTopicMetaSchema>;
export const LadderGraphSchema = z.object({ topics: z.array(LadderTopicMetaSchema).min(1) });
export type LadderGraph = z.infer<typeof LadderGraphSchema>;

const StepId = z.string().regex(new RegExp(`^s\\d-w\\d{2}-${TRACK_ID}-\\d{2}$`));
const ProblemSet = z.array(ProblemSchema).min(1);

// "Meet the idea" mini-lessons (2026-08-31 owner direction, prototype task): concept-first
// teaching, Brilliant-style, for an idea a child is about to meet ahead of grade. A lesson is
// 3 to 5 beats; every beat asks before it tells -- one figure (the existing declarative
// ProblemFigure system, FigureSchema below, never a new rendering path) plus one small check
// question, answered from the first screen. A beat reuses AnswerSpecSchema so its check is
// graded with the exact same pure checkAnswer() every problem uses, but a beat is NOT a Problem:
// it carries no ideaId/skills/hints/difficulty/thinkMinutes, because none of that applies -- a
// lesson beat is deliberately unfailable and ungraded (see components/quest/LessonPlayer.tsx),
// so it must never be reachable through problemsOf() or any Problem-shaped code path that would
// let it accidentally feed an attempt, a skill or the mistake box.
export const LessonBeatSchema = z
  .object({
    id: z.string().regex(/^lesson-[a-z0-9-]+-b\d{2}$/),
    // The question itself, asked immediately -- never exposition followed by "got it?". If a beat
    // needs a sentence of setup before the question, that setup lives in this same field, but the
    // field always ends on the question he answers from.
    prompt: Copy,
    figure: FigureSchema,
    options: z.array(Copy).min(2).max(5).optional(),
    answer: LessonAnswerSpecSchema,
    // Shown on a wrong try: why, gently, in a sentence or two, and never blocks a retry.
    onWrong: Copy,
    // A short, unembellished confirmation once he gets it -- no praise words, no gamification.
    onRight: Copy,
  })
  .superRefine((b, ctx) => {
    if (b.answer.kind === "choice") {
      if (!b.options) ctx.addIssue({ code: "custom", path: ["options"], message: "a choice beat needs options" });
      else if (b.answer.index >= b.options.length) ctx.addIssue({ code: "custom", path: ["answer", "index"], message: "answer index out of range" });
    }
  });
export type LessonBeat = z.infer<typeof LessonBeatSchema>;

export const LessonSchema = z
  .object({
    id: z.string().regex(/^lesson-[a-z0-9-]+$/),
    ideaId: z.string().min(1),
    title: Copy,
    beats: z.array(LessonBeatSchema).min(3).max(5),
  })
  .superRefine((l, ctx) => {
    l.beats.forEach((b, i) => {
      if (!b.id.startsWith(`${l.id}-b`)) ctx.addIssue({ code: "custom", path: ["beats", i, "id"], message: `beat id must start with ${l.id}-b` });
    });
  });
export type Lesson = z.infer<typeof LessonSchema>;
export const LessonsRegistrySchema = z.object({ lessons: z.array(LessonSchema).min(1) });

export const StepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("instruction"), id: StepId, title: Copy, body: Copy, minutes: z.number().int().positive().optional(), figure: FigureSchema.optional() }),
  // A science step may name the idea it teaches (ideas.json); ticking it counts as meeting
  // that idea, the way a problem attempt does (lib/domain/ideas.ts).
  z.object({ kind: z.literal("science"), id: StepId, title: Copy, body: Copy, figure: FigureSchema.optional(), ideaId: z.string().optional() }),
  z.object({ kind: z.literal("typing"), id: StepId, minutes: z.literal(5), body: Copy }),
  z.object({ kind: z.literal("task"), id: StepId, title: Copy, body: Copy, checklist: z.array(Copy).min(3).max(5), figure: FigureSchema.optional() }),
  // A data step (6 September 2026, the data-science thread): the week's numbers go into a small
  // table the child fills in, the app charts them and shows the mean and median, and the child
  // answers one question from the chart in a sentence. `columns` names the table's columns; the
  // first is the label column (a run, a trial, a setting), the rest are numbers. `minRows` is
  // how many complete rows the step needs. `question` is the claim to answer from the data.
  z.object({
    kind: z.literal("data"), id: StepId, title: Copy, body: Copy,
    columns: z.array(Copy).min(2).max(4), minRows: z.number().int().min(3).max(12), question: Copy, ideaId: z.string().optional(),
  }),
  // "chess" (7 September 2026): tactics puzzles with a board figure, inserted after the shape
  // lane in seasons 2 to 4; the first warm-up of a week is still number-sense, fermi or rhythm.
  z.object({ kind: z.literal("warmup"), id: StepId, variant: z.enum(["number-sense", "fermi", "rhythm", "chess"]), problems: ProblemSet }),
  z.object({ kind: z.literal("puzzle-of-week"), id: StepId, problem: ProblemSchema }),
  // timed: the set offers an opt-in, count-up clock that records minutes to finish and nothing
  // else (lib/domain/clock.ts; curriculum review 2026-09-05, lever 5). Summit check sets carry it.
  z.object({ kind: z.literal("problem-set"), id: StepId, title: Copy, lane: z.enum(["skills", "shape", "puzzle", "check", "monster"]), timed: z.boolean().optional(), problems: ProblemSet }),
  z.object({ kind: z.literal("explain"), id: StepId, title: Copy, mode: z.enum(["written", "voice"]), prompt: Copy, problemId: z.string().optional() }),
  z.object({ kind: z.literal("artifact"), id: StepId, title: Copy, prompt: Copy, accepts: z.array(z.enum(["photo", "code", "recording", "text"])).min(1) }),
  // "play" is the Practice log (four prompts, components/quest/LogStep.tsx PLAY_PROMPTS).
  z.object({ kind: z.literal("log"), id: StepId, variant: z.enum(["maker", "speak", "play"]) }),
  z.object({ kind: z.literal("debate"), id: StepId, motionId: z.string().min(1), side: z.enum(["for", "against", "choose"]), rounds: z.literal(3) }),
  // "Meet the idea" (see LessonSchema above): a short concept lesson inserted ahead of the
  // week that introduces an idea. title is carried on the step itself (like problem-set) so the
  // sidebar (StepList.tsx) can label it without resolving the lesson registry; lessonId is what
  // actually resolves the beats, kept separate so the SAME authored lesson can also be reached
  // from ProblemPlayer's struggle offer, independent of any one quest's step list.
  z.object({ kind: z.literal("lesson"), id: StepId, title: Copy, lessonId: z.string().min(1) }),
]);
export type Step = z.infer<typeof StepSchema>;

/** A quest's extras (6 September 2026): bonus tracks and make-your-own briefs beside the steps,
 * never required for completion. Ids are <questId>-xNN. */
export const ExtraSchema = z.object({
  id: z.string().regex(new RegExp(`^s\\d-w\\d{2}-${TRACK_ID}-x\\d{2}$`)),
  kind: z.enum(["bonus", "invent"]),
  title: Copy,
  minutes: z.number().int().min(5).max(60),
  body: Copy,
  figure: FigureSchema.optional(),
  /** The idea an extra practises (a physics measurement, say); ticking it meets the idea. */
  ideaId: z.string().optional(),
});
export type Extra = z.infer<typeof ExtraSchema>;

export const QuestSchema = z.object({
  id: z.string().regex(new RegExp(`^s\\d-w\\d{2}-${TRACK_ID}$`)),
  season: z.number().int().positive(),
  week: z.number().int().min(1).max(12),
  track: TrackSchema,
  title: Copy,
  summary: Copy,
  minutes: z.number().int().positive(),
  materials: z.array(Copy),
  skills: z.array(z.string().min(1)).min(1),
  showcase: z.boolean().optional(),
  completion: z.enum(["all-steps", "artifact-and-log", "recording-and-log"]),
  steps: z.array(StepSchema).min(2),
  extras: z.array(ExtraSchema).optional(),
}).superRefine((q, ctx) => {
  const expected = `s${q.season}-w${String(q.week).padStart(2, "0")}-${q.track}`;
  if (q.id !== expected) ctx.addIssue({ code: "custom", path: ["id"], message: `id must be ${expected}` });
  const seen = new Set<string>();
  for (const e of q.extras ?? []) {
    if (!e.id.startsWith(`${q.id}-x`)) ctx.addIssue({ code: "custom", path: ["extras"], message: `extra ${e.id} must be named ${q.id}-xNN` });
    if (seen.has(e.id)) ctx.addIssue({ code: "custom", path: ["extras"], message: `duplicate extra id ${e.id}` });
    seen.add(e.id);
  }
  if (q.minutes !== TRACK_MINUTES[q.track]) ctx.addIssue({ code: "custom", path: ["minutes"], message: `minutes must be ${TRACK_MINUTES[q.track]} for ${q.track}` });
  const isShowcase = [4, 8, 12].includes(q.week);
  if (isShowcase !== Boolean(q.showcase)) ctx.addIssue({ code: "custom", path: ["showcase"], message: "showcase must be true exactly on weeks 4, 8, 12" });
});
export type Quest = z.infer<typeof QuestSchema>;

// Sprout
const SproutItem = z.object({
  id: z.string().min(1),
  shape: z.enum(["circle", "square", "triangle", "star", "rock", "bird", "leaf", "coin", "cup", "block", "flower", "fish"]),
  color: z.enum(["red", "blue", "yellow", "green", "orange", "purple", "brown", "grey"]).optional(),
  size: z.enum(["s", "m", "l"]).optional(),
  // The count caps here (and on SproutCorrect's count value and SproutRound.items below) sit
  // at 10: season 2's counting curve reaches 8 in week 5 and 10 by week 9 (design section 3).
  count: z.number().int().min(1).max(10).optional(),
  sound: z.string().optional(),
  /**
   * Material the round SHOWS rather than offers: the cups in "tap the pile of blocks with one
   * block for every cup". It has to be on screen, because the child counts it to answer, but it
   * is not an answer, and rendering it as another card asks a four-year-old to tell the question
   * apart from the choices by nothing but position. The player gives these their own strip, the
   * same one a pattern's trail uses, and never makes them tappable.
   */
  reference: z.boolean().optional(),
});
export type SproutItem = z.infer<typeof SproutItem>;
const SproutCorrect = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pick"), itemIds: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("order"), itemIds: z.array(z.string()).min(2) }),
  z.object({ kind: z.literal("groups"), groups: z.array(z.array(z.string()).min(1)).min(2) }),
  z.object({ kind: z.literal("count"), value: z.number().int().min(1).max(10) }),
]);
export type SproutCorrect = z.infer<typeof SproutCorrect>;
// Sprout ids come in two schemes: season 1 predates seasons and keeps its committed, append-only
// bare ids (sprout-wNN...); season 2 onward is season-namespaced (s2-sprout-wNN...). The
// optional s<season>- prefix below accepts both; loadContent pins each file's exact week id to
// its season and checks activity and round ids nest under it.
const SproutRound = z.object({
  id: z.string().regex(/^(s\d+-)?sprout-w\d{2}-a[1-3]-r[1-5]$/),
  prompt: Copy,
  items: z.array(SproutItem).min(2).max(10),
  correct: SproutCorrect,
});
export type SproutRound = z.infer<typeof SproutRound>;
export const SproutActivitySchema = z.object({
  id: z.string().regex(/^(s\d+-)?sprout-w\d{2}-a[1-3]$/),
  title: Copy,
  skill: z.string().regex(/^sprout\./),
  kind: z.enum(["tap-next", "sort", "count", "sequence", "match", "odd-one-out", "listen-tap", "compare"]),
  intro: Copy,
  offScreen: Copy,
  rounds: z.array(SproutRound).min(3).max(5),
});
export type SproutActivity = z.infer<typeof SproutActivitySchema>;
export const SproutWeekSchema = z.object({
  id: z.string().regex(/^(s\d+-)?sprout-w\d{2}$/),
  season: z.number().int().positive(),
  week: z.number().int().min(1).max(12),
  theme: Copy,
  skills: z.array(z.string().regex(/^sprout\./)).min(1),
  activities: z.array(SproutActivitySchema).length(3),
  parentCard: z.object({
    title: Copy,
    minutes: z.literal(15),
    includes: z.enum(["read-aloud", "blocks", "cut-draw", "sing", "why-walk"]),
    steps: z.array(Copy).min(3).max(5),
    notice: z.array(Copy).min(2).max(3),
  }),
}).superRefine((w, ctx) => {
  const bare = `sprout-w${String(w.week).padStart(2, "0")}`;
  const expected = w.season === 1 ? bare : `s${w.season}-${bare}`;
  if (w.id !== expected) ctx.addIssue({ code: "custom", path: ["id"], message: `id must be ${expected}` });
});
export type SproutWeek = z.infer<typeof SproutWeekSchema>;

// Registries
export const SkillSchema = z.object({
  id: z.string().regex(/^(build|make|think|speak|play|sprout)\.[a-z0-9.-]+$/),
  track: z.enum(["build", "make", "think", "speak", "play", "sprout"]),
  name: Copy,
  levels: z.array(Copy).length(5),
});
export type Skill = z.infer<typeof SkillSchema>;
export const SkillsRegistrySchema = z.object({ skills: z.array(SkillSchema).min(1) });

export const IdeaSchema = z.object({ id: z.string().regex(/^[a-z0-9-]+$/), name: Copy, kid: Copy, firstWeek: z.number().int().min(1).max(12) });
export type Idea = z.infer<typeof IdeaSchema>;
export const IdeasRegistrySchema = z.object({ ideas: z.array(IdeaSchema).min(1) });

/** The game of the sprint (7 September 2026): one per season and sprint, played with the
 * family, chosen for what it teaches. `rules` follow the rule 20 body conventions; `notice` is
 * the one thing to watch for while playing; `skill` is the skill it feeds as evidence. */
export const GameSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: Copy,
  season: z.number().int().min(1).max(4),
  sprint: z.number().int().min(1).max(3),
  players: Copy,
  minutes: z.number().int().min(5).max(120),
  kit: Copy,
  cost: z.number().nonnegative(),
  teaches: Copy,
  rules: Copy,
  notice: Copy,
  skill: z.string().min(1),
  ideaId: z.string().optional(),
});
export type Game = z.infer<typeof GameSchema>;
export const GamesRegistrySchema = z.object({ games: z.array(GameSchema).min(1) });

export const MotionSchema = z.object({ id: z.string().regex(/^[a-z0-9-]+$/), text: Copy, kind: z.enum(["fun", "philosophy", "money"]), firstWeek: z.number().int().min(1).max(12) });
export type Motion = z.infer<typeof MotionSchema>;
export const MotionsSchema = z.object({ motions: z.array(MotionSchema).min(1) });

export const BooksSchema = z.object({ books: z.array(z.object({ id: z.string(), title: Copy, author: Copy, why: Copy, forWhom: z.enum(["explorer", "sprout", "later"]) })).min(1) });
export const MaterialsSchema = z.object({ items: z.array(z.object({ name: Copy, why: Copy, approxUsd: z.number().nonnegative(), neededByWeek: z.number().int().min(1).max(12) })).min(1) });
export const CalendarSchema = z.object({
  seasonStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  competitions: z.array(z.object({ name: Copy, month: z.string(), note: Copy, fromSeason: z.number().int().positive() })).min(1),
});
