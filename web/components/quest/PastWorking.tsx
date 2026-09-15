import { PenCanvas } from "./PenCanvas";
import type { WorkingContent } from "./WorkingSpace";

export type PastWorkingProps = {
  /** Omitted at the try-3 gate (its own label already introduces the block); the mistake-box
   * return and the parent view's log area both pass one, since there nothing else on screen
   * says whose working this is or when it is from. */
  heading?: string;
  content: WorkingContent;
  /** A smaller rendering for the try-3 gate, which sits inside an already-busy cooldown column
   * rather than being the one thing on screen (used everywhere else -- the mistake-box return,
   * the parent view -- at the default, larger size). */
  compact?: boolean;
};

/**
 * A read-only rendering of a working: the typed notes as a quoted line, the pen strokes as a
 * non-interactive PenCanvas (no onStrokesChange prop, which is exactly how PenCanvas itself
 * knows to ignore pointer events -- see its own doc comment). Renders nothing for a field that
 * is empty, so a working with only strokes never shows an empty quote, and one with only text
 * never shows a blank canvas. Callers gate whether to render this component at all on
 * lib/domain/workings.ts's hasWorkingContent, so it is never shown for a problem with nothing
 * saved.
 */
export function PastWorking({ heading, content, compact }: PastWorkingProps) {
  return (
    <div className={`tr-pastworking${compact ? " tr-pastworking--compact" : ""}`}>
      {heading ? <p className="tr-pastworking__heading">{heading}</p> : null}
      {content.text.trim() ? <p className="tr-pastworking__text">&ldquo;{content.text.trim()}&rdquo;</p> : null}
      {content.strokes.length > 0 ? (
        <PenCanvas
          strokes={content.strokes}
          ariaLabel={heading ?? "Saved working, read only"}
          height={compact ? 120 : 200}
        />
      ) : null}
    </div>
  );
}
