import { Card } from "@/components/ui/Card";
import { getIdea } from "@/lib/content/app-content";
import { TRACK_LABEL } from "@/lib/content/schema";
import type { WeeklySummary } from "@/lib/domain/weeklySummary";


function joinWithAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function ideaName(ideaId: string): string {
  return getIdea(ideaId)?.name ?? ideaId;
}

/**
 * Turns a computed WeeklySummary (lib/domain/weeklySummary.ts) into plain sentences (Plan 3
 * Task 2's own instruction: "render it as plain sentences"). Every fact was already decided by
 * that pure function; this component only chooses the words, and stays deliberately even-
 * toned in both directions -- no praise on a full week, no alarm on a hard one (the task's own
 * bar: "it must never flatter and never alarm"). Sentences are written subject-free ("Build
 * finished this week", not "He finished Build") so nothing here assumes a child's pronoun.
 */
export function weeklySentences(summary: WeeklySummary): string[] {
  const sentences: string[] = [];

  if (!summary.hasQuestsThisWeek) {
    sentences.push("No quest is assigned this week.");
    return sentences;
  }

  if (summary.isThinWeek) {
    sentences.push("Nothing started this week yet.");
    return sentences;
  }

  const finishedList = joinWithAnd(summary.finishedTracks.map((t) => TRACK_LABEL[t]));
  const unfinishedList = joinWithAnd(summary.unfinishedTracks.map((t) => TRACK_LABEL[t]));

  if (summary.allDone) {
    sentences.push(`${finishedList} finished this week.`);
  } else if (summary.finishedTracks.length === 0) {
    sentences.push(`Nothing finished yet this week. ${unfinishedList} still open.`);
  } else {
    sentences.push(`${finishedList} finished this week. ${unfinishedList} still open.`);
  }

  if (summary.minutesSpentEstimate > 0) {
    sentences.push(
      `About ${summary.minutesSpentEstimate} minutes spent this week, estimated from steps completed rather than measured time.`,
    );
  }

  // Plan 4 task 35: real elapsed time, from lib/domain/weeklySummary.ts's own sittingMinutesThisWeek
  // (clustered from real attempt/log timestamps), never the step-budget estimate above -- said as
  // its own sentence so the two are never confused for one number said twice.
  if (summary.sittingMinutesThisWeek > 0) {
    const sittingWord = summary.sittingsThisWeek === 1 ? "sitting" : "sittings";
    sentences.push(`About ${summary.sittingMinutesThisWeek} minutes actually sitting with it this week, across ${summary.sittingsThisWeek} ${sittingWord}.`);
  }

  if (summary.hardIdeas.length > 0) {
    const names = joinWithAnd(summary.hardIdeas.map((h) => ideaName(h.ideaId)));
    sentences.push(`Tricky on the first try: ${names}.`);
  }

  const waitingParts: string[] = [];
  if (summary.explainItsWaiting > 0) {
    waitingParts.push(`${summary.explainItsWaiting} explain-it ${summary.explainItsWaiting === 1 ? "answer" : "answers"} waiting for a look`);
  }
  if (summary.logsWithoutComment > 0) {
    waitingParts.push(`${summary.logsWithoutComment} log${summary.logsWithoutComment === 1 ? "" : "s"} with no comment yet`);
  }
  if (waitingParts.length > 0) {
    sentences.push(`Waiting on you: ${joinWithAnd(waitingParts)}.`);
  }

  if (summary.parentNotes.length > 0) {
    sentences.push(`Also logged this week: ${summary.parentNotes.map((n) => n.note).join("; ")}.`);
  }

  return sentences;
}

export type WeeklyParagraphProps = { summary: WeeklySummary };

/** The Parent view's weekly paragraph (task 2 brief), replacing the placeholder card that used
 * to say "The written weekly summary arrives with the AI release." There is no AI release: the
 * summary is computed (lib/domain/weeklySummary.ts), not written by a model, and never was
 * meant to be -- arithmetic over what actually happened cannot flatter, alarm, or invent a
 * detail about a child. */
export function WeeklyParagraph({ summary }: WeeklyParagraphProps) {
  const sentences = weeklySentences(summary);
  return (
    <Card tone="forest" className="pr-paragraph">
      <p className="tr-eyebrow">This week in one paragraph</p>
      {sentences.map((sentence, i) => (
        <p key={i}>{sentence}</p>
      ))}
    </Card>
  );
}
