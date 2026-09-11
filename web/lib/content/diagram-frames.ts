/**
 * Animation frames for the `diagram` figure kind (8 September 2026, owner: a kid visualises
 * motion better when the picture moves). A diagram may carry
 *   spec.frames: [{ ms?, caption?, set: { "<item index>": { ...field overrides } } }]
 * and an optional spec.ms default hold. Each frame is the base items with the named items'
 * fields replaced (any field: x, y, cx, cy, fill, color, label, s, dashed, arrow), and an
 * override of { hidden: true } drops the item for that frame. Frame 0 is the resting picture,
 * so a figure with frames still reads as a still under reduced motion and in screenshots.
 *
 * Pure, so the gallery script and the geometry lint can resolve frames without React.
 */
export type DiagramItem = Record<string, unknown>;
export type DiagramFrame = { ms?: number; caption?: string; set?: Record<string, DiagramItem> };

export const DEFAULT_FRAME_MS = 900;

export function diagramFrames(spec: Record<string, unknown>): DiagramFrame[] {
  const raw = Array.isArray(spec.frames) ? (spec.frames as DiagramFrame[]) : [];
  return raw.filter((f) => f && typeof f === "object");
}

/** The items of frame `index` (0 = the base drawing with frame 0's overrides applied). */
export function resolveDiagramFrame(spec: Record<string, unknown>, index: number): DiagramItem[] {
  const base = (spec.items as DiagramItem[]) ?? [];
  const frames = diagramFrames(spec);
  const frame = frames[index];
  if (!frame?.set) return base;
  return base
    .map((it, i) => {
      const over = frame.set?.[String(i)];
      return over ? { ...it, ...over } : it;
    })
    .filter((it) => !it.hidden);
}

export function frameHold(spec: Record<string, unknown>, index: number): number {
  const frames = diagramFrames(spec);
  const ms = frames[index]?.ms ?? (typeof spec.ms === "number" ? spec.ms : DEFAULT_FRAME_MS);
  return Math.max(120, ms);
}
