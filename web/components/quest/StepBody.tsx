import type { ReactNode } from "react";

/**
 * Renders the plain-text body of a step (instruction, science, task, typing) or a prompt
 * (artifact, explain) the way content writes it (docs/content-authoring.md rule 20):
 *
 * - paragraphs are separated by a blank line;
 * - consecutive lines starting "1. ", "2. " ... are an ordered list, one action per item;
 * - single-backtick spans are block, drawer, menu and file names, shown as inline code;
 * - URLs (https://... or a bare makecode.microbit.org style host) become links that open in
 *   a new tab, because a link a child cannot tap is just a spelling test (caught by the owner
 *   on the first real session, 5 September 2026).
 *
 * Two more conventions (added 25 September 2026, for rule 32's "Learn it" lessons, so a lesson
 * scans instead of reading as one long wall of prose -- docs/content-authoring.md rule 20):
 *
 * - a block that is a single line, and nothing but one of a fixed set of section names followed
 *   by a colon (`The idea:`, `Tricks:`, `Watch out:`, `Worked example:` (optionally numbered,
 *   `Worked example 2:`), `Try one with me:`, `What to remember:`), renders as a small heading.
 *   The same words used mid-sentence (`The idea: multiply the top...`) are untouched, because the
 *   whole line has to be nothing else.
 * - a paragraph starting `Trick:`, `Trap:`, `Check it:` or `Remember:` renders as a callout box
 *   with a small label chip, never colour alone. A numbered list right after it (in the same
 *   block, or the next block) is kept inside the callout.
 *
 * Content never carries markup, so this is plain string splitting: no markdown library, no
 * dangerouslySetInnerHTML.
 *
 * Two further conventions (also added 25 September 2026, a verifier follow-up on the same "Learn
 * it" lessons):
 *
 * - on an instruction or science step, a caller may pass `figure` (the step's already-rendered
 *   ProblemFigure) so it lands right after the body's `The idea:` section rather than after the
 *   whole body: a child reads the idea and sees the picture that goes with it before the tricks
 *   and worked examples that follow. A body with no `The idea:` heading places the figure after
 *   the whole body, exactly where the caller used to render it as a sibling.
 * - inside a Trick:/Trap:/Check it: callout, the callout's own name -- the text up to its first
 *   real period or colon (a decimal point or a ratio like 3:4 does not count), or the first line
 *   if it has neither -- renders in bold, so a child can scan the names. Remember: callouts are
 *   left alone; they are usually already a single short line.
 */

const CODE_SPLIT = /(`[^`]+`)/g;
// Full URLs, or bare hosts of at least two labels with a common suffix, optionally with a path.
// Trailing punctuation stays outside the link so "see makecode.microbit.org." keeps its stop.
const LINK_SPLIT = /(https?:\/\/[^\s<>()"']+|\b(?:[a-z0-9-]+\.)+(?:org|com|edu|io|dev)\b(?:\/[^\s<>()"']*)?)/gi;
const TRAILING_PUNCT = /[.,;:!?]+$/;
const LIST_ITEM = /^\d+[.)]\s+/;

// A lesson section name, alone on its own line ("Worked example:" or "Worked example 2:"),
// becomes a heading. The same words leading a sentence ("The idea: multiply...") do not match,
// because the regex anchors the whole trimmed line.
const HEADING_LINE = /^([A-Za-z][A-Za-z ]*?)(?: \d+)?:$/;
const HEADING_BASES = new Set(["the idea", "tricks", "watch out", "worked example", "try one with me", "what to remember"]);

function headingText(line: string): string | null {
  const trimmed = line.trim();
  const match = HEADING_LINE.exec(trimmed);
  if (!match || !HEADING_BASES.has(match[1].toLowerCase())) return null;
  return trimmed.slice(0, -1);
}

export type CalloutTone = "trick" | "trap" | "check" | "remember";

const CALLOUTS: Array<{ marker: string; tone: CalloutTone; label: string }> = [
  { marker: "Trick", tone: "trick", label: "TRICK" },
  { marker: "Trap", tone: "trap", label: "TRAP" },
  { marker: "Check it", tone: "check", label: "CHECK IT" },
  { marker: "Remember", tone: "remember", label: "REMEMBER" },
];
const CALLOUT_MARKER = /^(Trick|Trap|Check it|Remember):[ \t]*/;

function linkify(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(LINK_SPLIT);
  return parts.map((part, i) => {
    if (i % 2 === 0) return part ? <span key={`${keyBase}-t${i}`}>{part}</span> : null;
    const trailing = part.match(TRAILING_PUNCT)?.[0] ?? "";
    const raw = trailing ? part.slice(0, -trailing.length) : part;
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return (
      <span key={`${keyBase}-l${i}`}>
        <a href={href} target="_blank" rel="noopener noreferrer">
          {raw}
        </a>
        {trailing}
      </span>
    );
  });
}

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(CODE_SPLIT).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
      <code key={`${keyBase}-c${i}`}>{part.slice(1, -1)}</code>
    ) : (
      linkify(part, `${keyBase}-${i}`)
    ),
  );
}

// Tones whose callout name gets bolded (styleguide follow-up, 25 September 2026): Remember
// callouts are left as plain text, the other three get their name bolded for scanning.
const BOLD_NAME_TONES = new Set<CalloutTone>(["trick", "trap", "check"]);

/** Where a callout's own text stops being its "name" and starts being the rest of the sentence:
 * the first period or colon that (a) is not a decimal point or a ratio like 3:4 (both neighbours
 * digits) and (b) actually has more text after it -- one ending "tops." has nothing left to be a
 * "rest", so it does not count as a break either. If none of those turn up, fall back to the
 * first line break; if there is not even one of those, the whole text is the name (this is the
 * common case today: most callouts are one short clause). */
function calloutNameSplit(text: string): { name: string; rest: string } {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "." && ch !== ":") continue;
    const prevDigit = /\d/.test(text[i - 1] ?? "");
    const nextDigit = /\d/.test(text[i + 1] ?? "");
    if (prevDigit && nextDigit) continue;
    if (text.slice(i + 1).trim().length === 0) continue;
    return { name: text.slice(0, i), rest: text.slice(i) };
  }
  const nl = text.indexOf("\n");
  if (nl !== -1 && text.slice(nl + 1).trim().length > 0) return { name: text.slice(0, nl), rest: text.slice(nl) };
  return { name: text, rest: "" };
}

function isOrderedList(lines: string[]): boolean {
  return lines.length > 0 && lines.every((line) => LIST_ITEM.test(line));
}

export type Block =
  | { kind: "p"; text: string }
  | { kind: "ol"; start: number; items: string[] }
  | { kind: "heading"; text: string }
  | { kind: "callout"; tone: CalloutTone; label: string; text: string; items: string[] };

/** The blocks of a body: a paragraph, an ordered list, a heading, or a callout. Exported for
 * tests. Only the four things documented at the top of this file turn a block into anything
 * other than a plain paragraph or list, so a body written before those existed renders exactly
 * as before. */
export function splitBlocks(body: string): Block[] {
  const rawBlocks = body
    .split(/\n\s*\n+/)
    .map((block) => block.replace(/^\n+|\n+$/g, ""))
    .filter((block) => block.trim().length > 0)
    .map((block): Block => {
      const lines = block.split("\n").map((l) => l.trimEnd());
      if (isOrderedList(lines)) {
        const start = Number.parseInt(lines[0], 10) || 1;
        return { kind: "ol", start, items: lines.map((l) => l.replace(LIST_ITEM, "")) };
      }
      if (lines.length === 1) {
        const heading = headingText(lines[0]);
        if (heading) return { kind: "heading", text: heading };
      }
      const calloutMatch = CALLOUT_MARKER.exec(lines[0]);
      if (calloutMatch) {
        const meta = CALLOUTS.find((c) => c.marker === calloutMatch[1])!;
        const restFirstLine = lines[0].slice(calloutMatch[0].length);
        const remaining = lines.slice(1);
        if (remaining.length > 0 && isOrderedList(remaining)) {
          return {
            kind: "callout",
            tone: meta.tone,
            label: meta.label,
            text: restFirstLine,
            items: remaining.map((l) => l.replace(LIST_ITEM, "")),
          };
        }
        const textLines = [restFirstLine, ...remaining].filter((l, i) => i > 0 || l !== "");
        return { kind: "callout", tone: meta.tone, label: meta.label, text: textLines.join("\n"), items: [] };
      }
      return { kind: "p", text: block };
    });

  // A callout with no list of its own swallows an ordered list that follows it directly (rule
  // 20: "a numbered list right after it, in the same block or the next block").
  const blocks: Block[] = [];
  for (let i = 0; i < rawBlocks.length; i++) {
    const block = rawBlocks[i];
    const next = rawBlocks[i + 1];
    if (block.kind === "callout" && block.items.length === 0 && next?.kind === "ol") {
      blocks.push({ ...block, items: next.items });
      i++;
      continue;
    }
    blocks.push(block);
  }
  return blocks;
}

function renderBlocks(blocks: Block[]): ReactNode[] {
  return blocks.map((block, bi) => {
    if (block.kind === "ol") {
      return (
        <ol key={bi} start={block.start}>
          {block.items.map((item, ii) => (
            <li key={ii}>{inline(item, `${bi}-${ii}`)}</li>
          ))}
        </ol>
      );
    }
    if (block.kind === "heading") {
      return (
        <h4 key={bi} className="tr-step__heading">
          {block.text}
        </h4>
      );
    }
    if (block.kind === "callout") {
      const boldName = BOLD_NAME_TONES.has(block.tone);
      const { name, rest } = boldName ? calloutNameSplit(block.text) : { name: "", rest: block.text };
      return (
        <div key={bi} className={`tr-callout tr-callout--${block.tone}`}>
          <p className="tr-callout__label">{block.label}</p>
          {block.text ? (
            <p>
              {boldName && name.trim() ? <strong>{inline(name, `${bi}-cn`)}</strong> : null}
              {inline(rest, `${bi}-c`)}
            </p>
          ) : null}
          {block.items.length > 0 ? (
            <ol>
              {block.items.map((item, ii) => (
                <li key={ii}>{inline(item, `${bi}-${ii}`)}</li>
              ))}
            </ol>
          ) : null}
        </div>
      );
    }
    return <p key={bi}>{inline(block.text, `${bi}`)}</p>;
  });
}

/** True for a `heading` block reading exactly "The idea" (the trailing colon is already stripped
 * by splitBlocks), so InstructionStep/ScienceStep bodies land their figure right after that
 * section instead of after the whole body. */
function isIdeaHeading(block: Block): boolean {
  return block.kind === "heading" && block.text.trim().toLowerCase() === "the idea";
}

export function StepBody({
  text,
  className = "tr-step__body",
  figure,
}: {
  text: string;
  className?: string;
  /** The step's already-rendered ProblemFigure, if any. Omit it (as every caller except
   * InstructionStep and ScienceStep does) to keep rendering exactly as before -- nothing here
   * changes unless a figure is actually passed in. */
  figure?: ReactNode;
}) {
  const blocks = splitBlocks(text);
  const ideaIndex = figure ? blocks.findIndex(isIdeaHeading) : -1;

  if (ideaIndex === -1) {
    // No `The idea:` heading (or no figure to place): today's placement, unchanged -- the whole
    // body in one block, the figure (if any) right after it, both siblings of whatever wraps
    // this component, exactly as when the caller rendered them as two separate elements.
    return (
      <>
        <div className={className}>{renderBlocks(blocks)}</div>
        {figure ?? null}
      </>
    );
  }

  let splitAt = blocks.length;
  for (let i = ideaIndex + 1; i < blocks.length; i++) {
    if (blocks[i].kind === "heading") {
      splitAt = i;
      break;
    }
  }

  return (
    <>
      <div className={className}>{renderBlocks(blocks.slice(0, splitAt))}</div>
      {figure}
      {splitAt < blocks.length ? <div className={className}>{renderBlocks(blocks.slice(splitAt))}</div> : null}
    </>
  );
}
