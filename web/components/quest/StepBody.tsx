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
 * Content never carries markup, so this is plain string splitting: no markdown library, no
 * dangerouslySetInnerHTML.
 */

const CODE_SPLIT = /(`[^`]+`)/g;
// Full URLs, or bare hosts of at least two labels with a common suffix, optionally with a path.
// Trailing punctuation stays outside the link so "see makecode.microbit.org." keeps its stop.
const LINK_SPLIT = /(https?:\/\/[^\s<>()"']+|\b(?:[a-z0-9-]+\.)+(?:org|com|edu|io|dev)\b(?:\/[^\s<>()"']*)?)/gi;
const TRAILING_PUNCT = /[.,;:!?]+$/;
const LIST_ITEM = /^\d+[.)]\s+/;

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

function isOrderedList(lines: string[]): boolean {
  return lines.length > 0 && lines.every((line) => LIST_ITEM.test(line));
}

/** The blocks of a body: each a paragraph or an ordered list. Exported for tests. */
export function splitBlocks(body: string): Array<{ kind: "p"; text: string } | { kind: "ol"; start: number; items: string[] }> {
  return body
    .split(/\n\s*\n+/)
    .map((block) => block.replace(/^\n+|\n+$/g, ""))
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trimEnd());
      if (isOrderedList(lines)) {
        const start = Number.parseInt(lines[0], 10) || 1;
        return { kind: "ol" as const, start, items: lines.map((l) => l.replace(LIST_ITEM, "")) };
      }
      return { kind: "p" as const, text: block };
    });
}

export function StepBody({ text, className = "tr-step__body" }: { text: string; className?: string }) {
  const blocks = splitBlocks(text);
  return (
    <div className={className}>
      {blocks.map((block, bi) =>
        block.kind === "ol" ? (
          <ol key={bi} start={block.start}>
            {block.items.map((item, ii) => (
              <li key={ii}>{inline(item, `${bi}-${ii}`)}</li>
            ))}
          </ol>
        ) : (
          <p key={bi}>{inline(block.text, `${bi}`)}</p>
        ),
      )}
    </div>
  );
}
