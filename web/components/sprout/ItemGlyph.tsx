import type { ReactNode } from "react";
import type { SproutItem } from "@/lib/content/schema";

// Sprout carries all its meaning through shape, colour and sound, never text (spec 6's
// "no text required to play"), so every card the child taps needs a real, distinguishable
// little picture. This is a compact, generic renderer for the schema's fixed shape enum, not a
// per-activity illustration set -- there is no image field on a Sprout item (plan-2-notes'
// "figure" note is about Explorer problems only).

const COLOR_HEX: Record<NonNullable<SproutItem["color"]>, string> = {
  red: "#d9432b",
  blue: "#3f7fb0",
  yellow: "#f2b632",
  green: "#6b8f5a",
  orange: "#e08a3c",
  purple: "#8a6fb0",
  brown: "#8a6b4a",
  grey: "#9aa08f",
};

const SIZE_SCALE: Record<NonNullable<SproutItem["size"]>, number> = { s: 0.7, m: 1, l: 1.3 };

function shapePath(shape: SproutItem["shape"]): { viewBox: string; node: ReactNode } {
  switch (shape) {
    case "circle":
      return { viewBox: "0 0 40 40", node: <circle cx="20" cy="20" r="17" /> };
    case "square":
      return { viewBox: "0 0 40 40", node: <rect x="4" y="4" width="32" height="32" rx="5" /> };
    case "triangle":
      return { viewBox: "0 0 40 40", node: <polygon points="20,4 36,34 4,34" /> };
    case "star":
      return {
        viewBox: "0 0 40 40",
        node: <path d="M20 3l4.8 10.3 11.3 1.3-8.3 7.8 2.2 11.1L20 28.2l-9.9 5.3 2.2-11.1-8.3-7.8 11.3-1.3z" />,
      };
    case "rock":
      return { viewBox: "0 0 40 40", node: <path d="M6 30q-3-9 6-13t18-3q9 3 6 12t-13 8-17-4z" /> };
    case "bird":
      return {
        viewBox: "0 0 40 40",
        node: (
          <path
            d="M4 22q6-10 12-2q6-8 12 0q6-8 12 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
        ),
      };
    case "leaf":
      return { viewBox: "0 0 40 40", node: <path d="M6 34C6 14 20 4 34 4 34 24 22 34 6 34z" /> };
    case "coin":
      return {
        viewBox: "0 0 40 40",
        node: (
          <>
            <circle cx="20" cy="20" r="17" />
            <circle cx="20" cy="20" r="11" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="2" />
          </>
        ),
      };
    case "cup":
      return { viewBox: "0 0 40 40", node: <path d="M9 8h22l-3 24a4 4 0 01-4 3.5H16A4 4 0 0112 32z" /> };
    case "block":
      return {
        viewBox: "0 0 40 40",
        node: (
          <>
            <rect x="5" y="9" width="30" height="22" rx="4" />
            <circle cx="14" cy="20" r="3" fill="rgba(0,0,0,.3)" />
            <circle cx="26" cy="20" r="3" fill="rgba(0,0,0,.3)" />
          </>
        ),
      };
    case "flower":
      return {
        viewBox: "0 0 40 40",
        node: (
          <>
            <circle cx="20" cy="9" r="7" />
            <circle cx="31" cy="20" r="7" />
            <circle cx="20" cy="31" r="7" />
            <circle cx="9" cy="20" r="7" />
            <circle cx="20" cy="20" r="6" fill="var(--sun)" />
          </>
        ),
      };
    case "fish":
      return { viewBox: "0 0 40 40", node: <path d="M4 20c8-10 20-10 28-2l6-6-2 8 2 8-6-6c-8 8-20 8-28-2z" /> };
  }
}

export type ItemGlyphProps = {
  item: SproutItem;
  size?: number;
  /** Renders `item.count` copies of the shape in a small cluster, for count-round items that
   * carry a group size rather than being drawn as separate list entries (plan-2-notes' "an item
   * with count set is drawn as a group of that many"). */
  showCount?: boolean;
};

// Task 28: a real 3-year-old dead-ended on a clap-rhythm round because its pause card -- "a rest
// in the rhythm", authored as a plain circle in a washed-out grey (content/sprout/weeks/01.json)
// -- carried no visible signal that it was a different KIND of card from the loud orange "clap"
// circles either side of it, not (as first suspected) a genuinely empty or zero-size hit area:
// the button, its full-size hit box, and its onClick all worked; it just did not read as a real
// card to press. `sound === "pause"` is Sprout's own name for "a silence" (plan-2-notes-from-
// content.md: "`sound` is... how cards carry meaning without text"), so it is the one true
// signal to key off, independent of whatever `shape`/`color` a round happened to author. This
// draws a dedicated rest glyph -- a dashed outline (an empty ring reads as "no shape" on
// purpose, unlike every filled shape elsewhere in this game) around two rounded bars, the same
// mark a remote's pause button uses -- at the same size as every other card, in --forest (the
// same confidently-legible colour every other control in this app trusts), never the low-
// contrast grey the content authored. This overrides `shape`/`color` entirely for a pause card;
// the content's own `shape: "circle", color: "grey"` stays as a harmless, schema-valid fallback
// for anything that reads the raw content without going through this renderer.
function RestGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="17" fill="none" stroke="var(--forest)" strokeWidth="3" strokeDasharray="5 5" />
      <rect x="14" y="13" width="4.5" height="14" rx="2" fill="var(--forest)" />
      <rect x="21.5" y="13" width="4.5" height="14" rx="2" fill="var(--forest)" />
    </svg>
  );
}

export function ItemGlyph({ item, size = 64, showCount = false }: ItemGlyphProps) {
  if (item.sound === "pause") return <RestGlyph size={size} />;

  const { viewBox, node } = shapePath(item.shape);
  const color = item.color ? COLOR_HEX[item.color] : "var(--forest)";
  const scale = item.size ? SIZE_SCALE[item.size] : 1;
  const drawn = size * scale;

  if (showCount && item.count && item.count > 1) {
    return (
      <div className="sp-glyph-group" aria-hidden="true">
        {Array.from({ length: item.count }, (_, i) => (
          <svg key={i} width={drawn * 0.62} height={drawn * 0.62} viewBox={viewBox} fill={color} color={color}>
            {node}
          </svg>
        ))}
      </div>
    );
  }

  return (
    <svg width={drawn} height={drawn} viewBox={viewBox} fill={color} color={color} aria-hidden="true">
      {node}
    </svg>
  );
}
