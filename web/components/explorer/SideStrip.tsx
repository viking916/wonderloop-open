import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { getProblem } from "../../lib/content/app-content";
import { dueItems, type ReviewItem } from "../../lib/domain/review";
import { formatDate } from "../../lib/format";
import { StepBody } from "../quest/StepBody";

export interface MonsterCardData {
  weekLabel: string;
  title: string;
  prompt: string;
}

export interface SeasonBookData {
  title: string;
  author: string;
  why: string;
}

export interface GameCardData {
  id: string;
  sprint: number;
  name: string;
  players: string;
  minutes: number;
  teaches: string;
  rules: string;
  notice: string;
  /** ms, when the family marked it played; undefined until then. */
  playedAt?: number;
}

export interface SideStripProps {
  /** The game of the sprint for the displayed week, when the season has one. */
  game?: GameCardData;
  onGamePlayed?: (gameId: string) => void;
  /** Only set when the displayed week has a `monster` lane problem-set (season 1: week 11). */
  monster?: MonsterCardData;
  /** Only set when a season book resolves (needs a non-empty explorer book list); an empty
   * list must not hide the monster card or the mistake box, so this is its own gate, not a
   * precondition for rendering the strip at all. */
  book?: SeasonBookData;
  reviewQueue: ReviewItem[];
  /** ms; passed in rather than read here so the component stays deterministic for a screenshot
   * or a test, matching lib/domain/review.ts's own "now is a parameter" convention. */
  now: number;
}

/**
 * The monster problem card, the season book and the mistake box (spec 7.1 screen 2). The
 * mistake box count is the whole review queue (every scheduled comeback, not only the ones due
 * today): lib/domain/review.ts's scheduleOnMiss always books a first miss 14 days out, so
 * "due today" is empty for days after every miss and would never show what the box actually
 * holds. dueItems (the same "is it due" function the mistake-box practice screen will use) is
 * still the one thing that decides whether any item is ready right now.
 */
export function SideStrip({ game, onGamePlayed, monster, book, reviewQueue, now }: SideStripProps) {
  const ready = dueItems(reviewQueue, now);
  const next = [...reviewQueue].sort((a, b) => a.dueAt - b.dueAt)[0];
  const nextInfo = next ? getProblem(next.problemId) : undefined;

  const stripClasses = ["tr-strip", monster ? "tr-strip--with-monster" : ""].filter(Boolean).join(" ");

  return (
    <div className={stripClasses}>
      {monster ? (
        <Card tone="forest" className="tr-note tr-note--monster">
          <p className="tr-eyebrow">Monster problem · {monster.weekLabel}</p>
          <h3>{monster.title}</h3>
          <p>{monster.prompt}</p>
        </Card>
      ) : null}

      {game ? (
        <Card tone="surface" className="tr-note tr-note--game">
          <p className="tr-eyebrow">Game of the sprint · Sprint {game.sprint}</p>
          <h3>{game.name}</h3>
          <p>
            {game.players}, about {game.minutes} minutes. {game.teaches}
          </p>
          <details className="tr-game__rules">
            <summary>How to play</summary>
            <StepBody text={game.rules} />
            <p className="tr-game__notice">What to notice: {game.notice}</p>
          </details>
          {game.playedAt ? (
            <p className="tr-step__done">Played on {formatDate(game.playedAt)}.</p>
          ) : onGamePlayed ? (
            <Button variant="secondary" onClick={() => onGamePlayed(game.id)}>
              We played it
            </Button>
          ) : null}
        </Card>
      ) : null}

      {book ? (
        <Card tone="surface" className="tr-note">
          <p className="tr-eyebrow">Season book</p>
          <h3>{book.title}</h3>
          <p>
            {book.author}. {book.why}
          </p>
        </Card>
      ) : null}

      {reviewQueue.length > 0 ? (
        <Card tone="surface" className="tr-note">
          <p className="tr-eyebrow">Mistake box</p>
          <h3>{reviewQueue.length} coming back</h3>
          <p>
            {ready.length > 0 ? `${ready.length} ready to try again. ` : ""}
            {nextInfo
              ? `${nextInfo.quest.title} (from week ${nextInfo.quest.week}) returns ${formatDate(next!.dueAt)}.`
              : null}
          </p>
          {/* Task 17 (final review finding C2): this card used to name a count and a return
              date with no control to open one -- the exact "unearned promise" the review
              caught. Only shown once something is actually ready, since there is nothing to do
              here before then. */}
          {ready.length > 0 ? (
            <Button variant="primary" href="/explorer/review">
              Take a second look
            </Button>
          ) : null}
        </Card>
      ) : (
        <EmptyState
          title="Mistake box is empty"
          description="A wrong first try comes back here for a second look, in a new shape."
        />
      )}
    </div>
  );
}
