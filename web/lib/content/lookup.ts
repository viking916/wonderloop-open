import type { z } from "zod";
import type {
  BooksSchema, CalendarSchema, Game, Idea, LadderTopic, LadderTopicMeta, Lesson, MaterialsSchema, Motion, Problem, Quest, Skill, SproutWeek, Step, Track,
} from "./schema";

// Pure, filesystem-free content shape and lookups. Nothing here imports node:fs or node:path,
// so this module is safe to pull into a browser bundle (a client component, for instance).
// load.ts (server-only, reads the content tree from disk) imports and re-exports these so its
// existing consumers keep working unchanged.
export type Content = {
  skills: Skill[]; ideas: Idea[]; motions: Motion[]; lessons: Lesson[]; games: Game[];
  books: z.infer<typeof BooksSchema>["books"]; materials: Record<string, z.infer<typeof MaterialsSchema>["items"]>; calendar: z.infer<typeof CalendarSchema>;
  quests: Quest[]; sprout: SproutWeek[];
  /** The Ladder (8 September 2026): the topic graph and the topics authored so far, keyed by id.
   * Both empty in a content tree with no content/ladder folder. */
  ladder: { graph: LadderTopicMeta[]; topics: Record<string, LadderTopic> };
};

export function problemsOf(step: Step): Problem[] {
  if (step.kind === "warmup" || step.kind === "problem-set") return step.problems;
  if (step.kind === "puzzle-of-week") return [step.problem];
  return [];
}

export const getQuest = (c: Content, id: string) => c.quests.find((q) => q.id === id);
export const getWeek = (c: Content, season: number, week: number) =>
  Object.fromEntries(c.quests.filter((q) => q.season === season && q.week === week).map((q) => [q.track, q])) as Partial<Record<Track, Quest>>;
export const getSproutWeek = (c: Content, season: number, week: number) => c.sprout.find((w) => w.season === season && w.week === week);
/** How many seasons the bundle carries, from the quests themselves (never a hardcoded four). */
export const seasonCount = (c: Content) => c.quests.reduce((max, q) => Math.max(max, q.season), 0);
export const getLesson = (c: Content, id: string) => c.lessons.find((l) => l.id === id);
/** The lesson (if any) for a given idea -- how ProblemPlayer's struggle offer finds "meet the
 * idea first" for whatever problem he is stuck on, independent of which quest step, if any,
 * also carries a "lesson" step for the same idea. */
export const getLessonForIdea = (c: Content, ideaId: string) => c.lessons.find((l) => l.ideaId === ideaId);

export type Book = Content["books"][number];
export type Material = Content["materials"][string][number];

/**
 * The book chosen for a season (task 14, season shopping list). Not stored on the profile: no
 * document field ever recorded a chosen bookId (see docs/superpowers/plan-2-notes-from-content.md's
 * own note that this was anticipated but never built), so the choice is deterministic instead --
 * season 1 gets the first explorer book, season 2 the second, wrapping if a season number ever
 * runs past the list. app/explorer/page.tsx's This Week side strip used to compute this inline;
 * it now calls this too, so the two places can never quietly disagree on which book a season
 * means. Returns undefined only when content carries no book marked forWhom: "explorer" at all.
 */
/** The game of the sprint for a season and a week (sprints are weeks 1 to 4, 5 to 8, 9 to 12). */
export function getGameForWeek(c: Content, seasonId: number, week: number): Game | undefined {
  const sprint = Math.min(3, Math.max(1, Math.ceil(week / 4)));
  return c.games.find((g) => g.season === seasonId && g.sprint === sprint);
}

export function getSeasonBook(c: Content, seasonId: number): Book | undefined {
  const explorerBooks = c.books.filter((b) => b.forWhom === "explorer");
  if (explorerBooks.length === 0) return undefined;
  return explorerBooks[(seasonId - 1) % explorerBooks.length] ?? explorerBooks[0];
}
