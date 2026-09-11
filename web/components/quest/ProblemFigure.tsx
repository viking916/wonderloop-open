import type { ReactElement } from "react";
import type { Figure } from "@/lib/content/schema";
import { LedMatrix } from "./LedMatrix";
import { AnimatedDiagram } from "./AnimatedDiagram";
import { SceneFigure } from "./SceneFigure";
import { diagramFrames } from "@/lib/content/diagram-frames";

/**
 * Renders a Problem's optional `figure` (schema.ts's FigureSchema) as inline SVG, the same
 * "hand-drawn vector, styled via CSS custom properties, scales cleanly" approach
 * components/ui/SeasonTrail.tsx already established for this app -- no asset pipeline, no
 * raster art to keep in sync with content.
 *
 * Content authors a declarative `spec` (plain numbers/coordinates/labels), never raw SVG
 * markup: every figure is drawn here from those numbers, so what is ON screen is provably a
 * direct rendering of what the content actually says (a "9 shaded" grid always shows exactly
 * nine shaded cells; there is no hand-authored path that could quietly disagree with its own
 * count). `spec`'s shape differs by `kind`; the render* helpers below own each one.
 *
 * Ground rule every one of these follows (Wonderloop task 31): draw only what the prompt's
 * words already establish (a net laid flat, a shape before it is turned, a grid before a route
 * is walked). Never draw the folded cube, the turned shape or the walked path -- that would
 * hand over the answer the problem is testing, not just help hold the picture in mind.
 */
// ---------------------------------------------------------------------------
// Task 36: multiple-choice options that used to be prose paragraphs describing a shape ("A
// cross shape: a column of four squares...") now get ONE figure showing all of the candidate
// shapes side by side, labeled A/B/C/D, with `options` reduced to those same short labels
// ("Shape A", "Shape B", ...). This is how a real maths paper lays out a "which of these"
// question: the four candidates stay comparable at a glance instead of each needing to be held
// in the head from a paragraph. The full prose never disappears -- it moves into this figure's
// `alt` (rendered as both the <svg>'s aria-label and its <title>, same mechanism every other
// figure already uses), so a screen reader still gets every word, in full, labeled by shape.
//
// Both "net" (net kind) and "shape" (shape kind, type "candidates") reuse this exact grid-of-
// labeled-shapes layout, so it lives once here rather than twice. A 2-column wrap keeps the
// combined figure closer to square than a single row of four would be, which matters directly
// for the 390px non-negotiable: a single row this wide, scaled to fit a phone, would shrink
// every cell to an unreadable sliver, while a 2x2 grid keeps each cell legible.
const CANDIDATE_COLS = 2;
const CANDIDATE_GAP_X = 26;
const CANDIDATE_GAP_Y = 24;
const CANDIDATE_LABEL_H = 26;

// ---------------------------------------------------------------------------
// Task 39 (fix round, "Meet the idea" prototype): grid mode "bars" -- multiple visibly SEPARATE
// whole shapes, each divided into its own pieces, drawn with a real gap between them plus a
// dashed outline hugging each one's own boundary. Built because beat 1's original figure (a
// single 3-row x 2-col rectangle, no gaps) read as ONE bar cut into six pieces, not three whole
// bars each cut in half -- a real content bug (a figure that teaches the opposite of what the
// beat's words say), not a cosmetic one. The plain "grid" mode below stays exactly as it was
// (still correct for anything that IS genuinely one shape, e.g. beat 5's single bar of fifths);
// "bars" is additive, a first-class sibling mode next to "streets", because most of the other 33
// lessons will need this same "N separate wholes, each subdivided" shape sooner or later (this is
// a fraction curriculum: halves/thirds/quarters of several wholes side by side is a recurring
// picture, not a one-off for this lesson).
//
// spec: { mode: "bars", bars: number, cols: number, shaded: [barIndex, pieceIndex][] } -- same
// [row, col] coordinate convention the plain grid mode already uses (bars stand in for rows),
// so an author already fluent in the existing grid spec needs to learn only the mode name and
// gains a for-free upgrade path: "rows" of a single merged rectangle become "bars", separate and
// gapped, with everything else (cols, shaded coordinates) read exactly the same way.
const BARS_GAP = 18;
const BARS_OUTLINE_PAD = 4;

function barsGridSize(bars: number, cols: number, cell: number, pad: number) {
  const w = cols * cell + pad * 2 + BARS_OUTLINE_PAD * 2;
  const h = bars * cell + (bars - 1) * BARS_GAP + pad * 2 + BARS_OUTLINE_PAD * 2;
  return { w, h };
}

/**
 * Task 40 fix: every candidate used to size its own row and its own column independently (the
 * widest shape in a row set that row's height, the widest in a column set that column's width),
 * so a short, wide shape (a straight strip) and a tall, narrow one (a cross) sharing a row left
 * wildly different amounts of blank space around themselves depending on where they happened to
 * land -- labels a different distance above their own shape, and a gap between two rows that
 * differed by column. That is what read as "scattered" instead of "a grid" (owner's screenshot,
 * the week-1 cube-net problem).
 *
 * One uniform cell -- the single largest candidate's own width and height, applied to EVERY
 * position identically -- fixes it for any set of candidate shapes, not just this one: every
 * gutter is equal by construction, every label in a row shares the same baseline (same distance
 * above the row's cell top, and every row is the same height), and the figure is as compact as
 * the largest shape actually requires rather than each shape floating in its own space. Shapes
 * are top-aligned within their cell (never centered vertically -- "first/comparable" reads as
 * "top" the way a printed exam figure lays these out) and centered horizontally (purely
 * cosmetic; nothing in the problem depends on a shape's left/right position).
 */
function candidateLayout(sizes: { w: number; h: number }[], pad = 16) {
  const cols = CANDIDATE_COLS;
  const rows = Math.ceil(sizes.length / cols);
  const cellW = Math.max(0, ...sizes.map((s) => s.w));
  const cellH = Math.max(0, ...sizes.map((s) => s.h));
  const positions = sizes.map((size, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const cellX = pad + c * (cellW + CANDIDATE_GAP_X);
    const cellTop = pad + r * (cellH + CANDIDATE_GAP_Y + CANDIDATE_LABEL_H) + CANDIDATE_LABEL_H;
    return { x: cellX + (cellW - size.w) / 2, y: cellTop, labelX: cellX + cellW / 2 };
  });
  const totalW = pad * 2 + cols * cellW + CANDIDATE_GAP_X * (cols - 1);
  const totalH = pad * 2 + rows * (cellH + CANDIDATE_LABEL_H) + CANDIDATE_GAP_Y * (rows - 1);
  return { positions, totalW, totalH };
}

function netCandidateSize(squares: { row: number; col: number }[], cell: number) {
  const minRow = Math.min(0, ...squares.map((s) => s.row));
  const maxRow = Math.max(0, ...squares.map((s) => s.row));
  const minCol = Math.min(0, ...squares.map((s) => s.col));
  const maxCol = Math.max(0, ...squares.map((s) => s.col));
  return { minRow, minCol, w: (maxCol - minCol + 1) * cell, h: (maxRow - minRow + 1) * cell };
}

function shapeCandidateSize(cells: [number, number][], cell: number) {
  const maxRow = Math.max(0, ...cells.map((c) => c[0]));
  const maxCol = Math.max(0, ...cells.map((c) => c[1]));
  return { w: (maxCol + 1) * cell, h: (maxRow + 1) * cell };
}

export function ProblemFigure({ figure, onFrame }: { figure: Figure; onFrame?: (index: number) => void }) {
  const spec = figure.spec as Record<string, unknown>;
  if (figure.kind === "leds") return <LedMatrix spec={spec} alt={figure.alt} />;
  if (figure.kind === "scene") return <SceneFigure spec={spec} alt={figure.alt} />;
  if (figure.kind === "diagram" && diagramFrames(spec).length > 0) {
    return <AnimatedDiagram spec={spec} alt={figure.alt} viewBox={viewBoxFor(figure.kind, spec)} render={(items) => renderDiagram(spec, items)} onFrame={onFrame} />;
  }
  return (
    <figure className={spec.wide ? "tr-figure tr-figure--wide" : "tr-figure"}>
      <svg
        className="tr-figure-svg"
        viewBox={viewBoxFor(figure.kind, spec)}
        role="img"
        aria-label={figure.alt}
        preserveAspectRatio="xMidYMid meet"
      >
        <title>{figure.alt}</title>
        {renderBody(figure.kind, spec)}
      </svg>
    </figure>
  );
}

function renderBody(kind: Figure["kind"], spec: Record<string, unknown>) {
  switch (kind) {
    case "grid":
      return spec.mode === "streets" ? renderStreetGrid(spec) : spec.mode === "bars" ? renderBarsGrid(spec) : renderShadedGrid(spec);
    case "shape":
      return spec.type === "letter" ? renderLetter(spec) : spec.type === "candidates" ? renderShapeCandidates(spec) : renderPolyomino(spec);
    case "net":
      return renderNet(spec);
    case "stack":
      return spec.mode === "sequence" ? renderSequence(spec) : renderLayers(spec);
    case "board":
      return renderBoard(spec);
    case "keys":
      return renderKeys(spec);
    case "beats":
      return renderBeats(spec);
    case "diagram":
      return renderDiagram(spec);
    case "plane":
      return renderPlane(spec);
    case "scene":
    case "path":
    case "leds":
      return null;
  }
}

// ---------------------------------------------------------------------------
// plane (9 September 2026, the Ladder's prealgebra stage): a coordinate plane a child can
// actually read a point from -- a light unit grid, axes with arrow heads, a number on every
// tick, and each point set off from its grid crossing. spec { range, points: [{ x, y, label? }],
// polygon?: [[x, y], ...], segments?: [[[x1, y1], [x2, y2]], ...] }. Always a 300 by 300 box.
// ---------------------------------------------------------------------------
const PLANE_C = 150;
const PLANE_HALF = 112;
function renderPlane(spec: Record<string, unknown>) {
  const range = Math.min(12, Math.max(1, Math.round(Number(spec.range) || 5)));
  const unit = PLANE_HALF / range;
  const X = (v: number) => PLANE_C + v * unit;
  const Y = (v: number) => PLANE_C - v * unit;
  // A point outside the range would dangle beyond the grid, so it is not drawn at all.
  const points = ((spec.points as { x: number; y: number; label?: string }[]) ?? []).filter((p) => Math.abs(p.x) <= range && Math.abs(p.y) <= range);
  // Nothing is drawn beyond the grid: a polygon or segment with a vertex outside the range is
  // dropped whole (a half-drawn shape would lie), and a polyline keeps only its in-range points.
  const inRange = ([x, y]: [number, number]) => Math.abs(x) <= range && Math.abs(y) <= range;
  const polygonRaw = (spec.polygon as [number, number][]) ?? [];
  const polygon = polygonRaw.every(inRange) ? polygonRaw : [];
  const segments = (((spec.segments as [[number, number], [number, number]][]) ?? [])).filter(([a, b]) => inRange(a) && inRange(b));
  // polylines (9 September 2026, the algebra stage): open paths through listed points, for a
  // line across the plane or a parabola sampled every half unit; drawn before the points.
  // An entry is a point list, or { points, dashed } for a boundary that is not part of the
  // solution (a strict inequality's line is dashed, as on paper).
  const polylines = ((spec.polylines as unknown[]) ?? [])
    .map((e) => (Array.isArray(e) ? { points: e as [number, number][], dashed: false } : (e as { points: [number, number][]; dashed?: boolean })))
    .map((pl) => ({ ...pl, points: pl.points.filter(inRange) }))
    .filter((pl) => pl.points.length >= 2);
  const step = range > 6 ? 2 : 1;
  const grid: ReactElement[] = [];
  const ticks: ReactElement[] = [];
  for (let k = -range; k <= range; k++) {
    if (k === 0) continue;
    grid.push(<line key={`v${k}`} className="tr-fig-plane-grid" x1={X(k)} y1={Y(range)} x2={X(k)} y2={Y(-range)} />);
    grid.push(<line key={`h${k}`} className="tr-fig-plane-grid" x1={X(-range)} y1={Y(k)} x2={X(range)} y2={Y(k)} />);
    if (k % step) continue;
    ticks.push(
      <text key={`tx${k}`} className="tr-fig-plane-tick" x={X(k)} y={PLANE_C + 14} textAnchor="middle">
        {k}
      </text>,
    );
    ticks.push(
      <text key={`ty${k}`} className="tr-fig-plane-tick" x={PLANE_C - 6} y={Y(k) + 4} textAnchor="end">
        {k}
      </text>,
    );
  }
  const poly = polygon.length >= 2 ? <polygon className="tr-fig-plane-poly" points={polygon.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ")} /> : null;
  const segs = segments.map(([[x1, y1], [x2, y2]], i) => <line key={`s${i}`} className="tr-fig-plane-seg" x1={X(x1)} y1={Y(y1)} x2={X(x2)} y2={Y(y2)} />);
  const curves = polylines.map((pl, i) => (
    <polyline key={`c${i}`} className="tr-fig-plane-curve" strokeDasharray={pl.dashed ? "7 5" : undefined} points={pl.points.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ")} />
  ));
  const dots = points.map((p, i) => {
    // The label sits up and to the right of the dot, flipped inward near the top or right edge,
    // so it never covers the grid crossing the child is reading. A point one unit below the
    // x axis takes its label below (the tick numbers live just under the axis), and a point one
    // unit left of the y axis takes its label to the left (the y tick numbers live just left of it).
    const width = (p.label ?? "").length * 7;
    const reachesAxis = p.x < 0 && X(p.x) + 8 + width > PLANE_C - 16;
    // Two labelled points on one row would collide, so the left one labels below the row; a
    // labelled point one step up and to the right would collide too, so this one labels below
    // as well (or to the left when below is the tick row). A labelled origin goes up-left,
    // clear of both tick rows.
    const rowMate = points.some((q) => q !== p && q.label && q.y === p.y && q.x > p.x);
    const nearMate = points.some((q) => q !== p && q.label && Math.abs(q.x - p.x) <= 1 && q.y === p.y + 1);
    const origin = p.x === 0 && p.y === 0;
    const belowIsTicks = p.y === 0 || p.y === -1;
    let right = !origin && p.x < range - 1 && p.x !== -1 && !reachesAxis && !(nearMate && belowIsTicks);
    let up = origin || (p.y < range - 1 && p.y !== -1 && !rowMate && !(nearMate && !belowIsTicks));
    // A point on a drawn line labels on the side the line does not run through: the label goes
    // along the line's normal, above a rising line's right side or below it, whichever quadrant
    // (up-right, up-left, down-right, down-left) the normal points into.
    const through = polylines.map((pl) => pl.points).find((pts) =>
      pts.some((a, k) => {
        const b = pts[k + 1];
        if (!b) return false;
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len2 = dx * dx + dy * dy;
        if (!len2) return false;
        const t = ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / len2;
        if (t < 0 || t > 1) return false;
        const ex = a[0] + t * dx - p.x, ey = a[1] + t * dy - p.y;
        return ex * ex + ey * ey < 0.09;
      }),
    );
    // Horizontal text beside a steep line stays clear of it; text above or below a shallow line
    // stays clear of that. So a point on a steep line labels to its side, a point on a shallow
    // line labels above (or below near the top edge).
    let side: "beside" | "over" | null = null;
    if (through && through.length >= 2) {
      // the curve's local direction at the point, from its neighbours along the polyline
      const k = through.findIndex(([x, y]) => Math.abs(x - p.x) < 0.3 && Math.abs(y - p.y) < 0.3);
      const a = through[Math.max(0, k - 2)], b = through[Math.min(through.length - 1, k + 2)];
      side = Math.abs(b[0] - a[0]) <= Math.abs(b[1] - a[1]) ? "beside" : "over";
      right = p.x < range - 1 && p.x !== -1;
      // at a turning point the neighbours sit on one side; the label goes on the other side
      const bend = (a[1] + b[1]) / 2 - p.y;
      up = bend > 0.2 ? false : p.y < range - 1;
      if (bend > 0.2 && p.y < -range + 0.6) up = true;
    } else {
      // A point close to a line (a test point beside a boundary) labels on the side away from
      // the line, so the label does not run into it.
      for (const pl of polylines) {
        const a = pl.points[0], b = pl.points[pl.points.length - 1];
        if (!a || !b) continue;
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.hypot(dx, dy);
        if (!len) continue;
        const dist = ((p.x - a[0]) * -dy + (p.y - a[1]) * dx) / len; // signed, along the left normal
        if (Math.abs(dist) > 2.2) continue;
        const nx = (-dy / len) * Math.sign(dist), ny = (dx / len) * Math.sign(dist);
        if (Math.abs(nx) > 0.2) right = nx > 0 && p.x < range - 1;
        if (Math.abs(ny) > 0.2) up = ny > 0 && p.y < range - 1;
        break;
      }
    }
    // A label sent left from a point just right of the y axis would cross the tick column, so
    // it goes centred above the point instead.
    if (side !== "beside" && !right && p.x > 0 && X(p.x) - 9 - width < PLANE_C + 2) side = "over";
    const lx = side === "over" ? X(p.x) : X(p.x) + (right ? 9 : -9);
    let ly = side === "beside" ? Y(p.y) + 4 : side === "over" ? Y(p.y) + (up ? -10 : 18) : Y(p.y) + (up ? -8 : 15);
    // a beside-label whose band would cross the x tick numbers drops under them
    if (side === "beside" && ly > PLANE_C + 2 && ly - 10 < PLANE_C + 18) ly = PLANE_C + 28;
    const anchor = side === "over" ? "middle" : right ? "start" : "end";
    return (
      <g key={`p${i}`}>
        <circle className="tr-fig-plane-dot" cx={X(p.x)} cy={Y(p.y)} r={5} />
        {p.label ? (
          <text className="tr-fig-plane-label" x={lx} y={ly} textAnchor={anchor}>
            {p.label}
          </text>
        ) : null}
      </g>
    );
  });
  return (
    <g>
      <defs>
        <marker id="tr-plane-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="tr-fig-plane-arrowhead" />
        </marker>
      </defs>
      {grid}
      <line className="tr-fig-plane-axis" x1={PLANE_C} y1={PLANE_C} x2={X(range) + 14} y2={PLANE_C} markerEnd="url(#tr-plane-arrow)" />
      <line className="tr-fig-plane-axis" x1={PLANE_C} y1={PLANE_C} x2={X(-range) - 14} y2={PLANE_C} markerEnd="url(#tr-plane-arrow)" />
      <line className="tr-fig-plane-axis" x1={PLANE_C} y1={PLANE_C} x2={PLANE_C} y2={Y(range) - 14} markerEnd="url(#tr-plane-arrow)" />
      <line className="tr-fig-plane-axis" x1={PLANE_C} y1={PLANE_C} x2={PLANE_C} y2={Y(-range) + 14} markerEnd="url(#tr-plane-arrow)" />
      {ticks}
      <text className="tr-fig-plane-tick" x={PLANE_C - 6} y={PLANE_C + 14} textAnchor="end">
        0
      </text>
      {poly}
      {curves}
      {segs}
      {dots}
    </g>
  );
}

function viewBoxFor(kind: Figure["kind"], spec: Record<string, unknown>): string {
  const CELL = 34;
  const PAD = 16;
  switch (kind) {
    case "board":
      return `0 0 ${BOARD_CELL * 8 + BOARD_PAD * 2} ${BOARD_CELL * 8 + BOARD_PAD * 2}`;
    case "keys":
      return `0 0 ${keysWidth(spec)} ${KEY_H + 34}`;
    case "beats":
      return `0 0 ${(Number(spec.beats) || 4) * BEAT_W + 24} 96`;
    case "diagram":
      return `0 0 ${Number(spec.w) || 360} ${Number(spec.h) || 220}`;
    case "plane":
      return "0 0 300 300";
    case "scene":
      return "0 0 360 220";
    case "grid": {
      if (spec.mode === "streets") {
        const streets = (spec.streets as string[]) ?? [];
        const avenues = (spec.avenues as string[]) ?? [];
        const w = (avenues.length - 1) * 44 + PAD * 2 + 60;
        const h = (streets.length - 1) * 44 + PAD * 2 + 40;
        return `0 0 ${w} ${h}`;
      }
      if (spec.mode === "bars") {
        const bars = Number(spec.bars) || 1;
        const cols = Number(spec.cols) || 1;
        const { w, h } = barsGridSize(bars, cols, CELL, PAD);
        return `0 0 ${w} ${h}`;
      }
      const rows = Number(spec.rows) || 1;
      const cols = Number(spec.cols) || 1;
      return `0 0 ${cols * CELL + PAD * 2} ${rows * CELL + PAD * 2}`;
    }
    case "shape": {
      if (spec.type === "letter") return "0 0 220 130";
      if (spec.type === "candidates") {
        const base = spec.base as { cells: [number, number][] };
        const baseMaxRow = Math.max(0, ...base.cells.map((c) => c[0]));
        const baseMaxCol = Math.max(0, ...base.cells.map((c) => c[1]));
        const baseW = (baseMaxCol + 1) * CELL + PAD * 2 + 60; // +60: room for the turn icon, same as the plain polyomino case below
        const baseH = (baseMaxRow + 1) * CELL + PAD * 2;
        const candidates = (spec.candidates as { cells: [number, number][] }[]) ?? [];
        const sizes = candidates.map((c) => shapeCandidateSize(c.cells, CELL));
        const { totalW, totalH } = candidateLayout(sizes, PAD);
        return `0 0 ${Math.max(baseW, totalW)} ${baseH + 20 + totalH}`;
      }
      const cells = (spec.cells as [number, number][]) ?? [];
      const maxRow = Math.max(0, ...cells.map((c) => c[0]));
      const maxCol = Math.max(0, ...cells.map((c) => c[1]));
      return `0 0 ${(maxCol + 1) * CELL + PAD * 2 + 60} ${(maxRow + 1) * CELL + PAD * 2}`;
    }
    case "net": {
      // renderNet below draws each square on its own 44-unit grid (bigger than the 34-unit
      // CELL used by grid/shape above, to leave room for a two-digit-safe label) -- this must
      // match that spacing exactly, or the viewBox is too small for what is actually drawn and
      // the last row/column renders clipped instead of scaled to fit.
      const NET_CELL = 44;
      const candidates = spec.candidates as { squares: { row: number; col: number }[] }[] | undefined;
      if (candidates) {
        const sizes = candidates.map((c) => netCandidateSize(c.squares, NET_CELL));
        const { totalW, totalH } = candidateLayout(sizes, PAD);
        return `0 0 ${totalW} ${totalH}`;
      }
      const squares = (spec.squares as { row: number; col: number }[]) ?? [];
      const minRow = Math.min(0, ...squares.map((s) => s.row));
      const maxRow = Math.max(0, ...squares.map((s) => s.row));
      const maxCol = Math.max(0, ...squares.map((s) => s.col));
      return `0 0 ${(maxCol + 1) * NET_CELL + PAD * 2} ${(maxRow - minRow + 1) * NET_CELL + PAD * 2}`;
    }
    case "stack": {
      if (spec.mode === "sequence") {
        const nodes = (spec.nodes as unknown[]) ?? [];
        return `0 0 ${nodes.length * 92 + PAD * 2} 120`;
      }
      const layers = (spec.layers as { cols: number }[]) ?? [];
      const maxCols = Math.max(1, ...layers.map((l) => l.cols));
      const panelW = maxCols * 22 + 20;
      return `0 0 ${layers.length * (panelW + 18) + PAD * 2} 150`;
    }
    case "path":
    case "leds":
      return "0 0 100 100";
  }
}

// ---------------------------------------------------------------------------
// grid: shaded-square fraction diagrams (e.g. "24 squares, 9 shaded")
// ---------------------------------------------------------------------------
function renderShadedGrid(spec: Record<string, unknown>) {
  const rows = Number(spec.rows) || 1;
  const cols = Number(spec.cols) || 1;
  const shaded = new Set(((spec.shaded as [number, number][]) ?? []).map(([r, c]) => `${r},${c}`));
  const CELL = 34;
  const PAD = 16;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isShaded = shaded.has(`${r},${c}`);
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={PAD + c * CELL}
          y={PAD + r * CELL}
          width={CELL}
          height={CELL}
          className={isShaded ? "tr-fig-cell tr-fig-cell--shaded" : "tr-fig-cell"}
        />,
      );
    }
  }
  return <g>{cells}</g>;
}

// ---------------------------------------------------------------------------
// grid: mode "bars" -- N visibly separate whole shapes ("bars"), each its own row of `cols`
// pieces, stacked with a real BARS_GAP between them (the fix for defect 1, task 39) plus a
// dashed outline hugging each bar's own extent. The dash is deliberate and distinct from the
// solid tr-fig-cell borders: solid lines are real cuts between pieces within one whole; the
// dashed rect is not a cut at all, just a boundary saying "these pieces are one whole bar" --
// two different kinds of line for two different meanings, not one style doing both jobs.
// ---------------------------------------------------------------------------
function renderBarsGrid(spec: Record<string, unknown>) {
  const bars = Number(spec.bars) || 1;
  const cols = Number(spec.cols) || 1;
  const shaded = new Set(((spec.shaded as [number, number][]) ?? []).map(([b, c]) => `${b},${c}`));
  const CELL = 34;
  const PAD = 16;
  const groups = [];
  for (let bar = 0; bar < bars; bar++) {
    const barY = PAD + bar * (CELL + BARS_GAP);
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const isShaded = shaded.has(`${bar},${c}`);
      cells.push(
        <rect
          key={`${bar}-${c}`}
          x={PAD + c * CELL}
          y={barY}
          width={CELL}
          height={CELL}
          className={isShaded ? "tr-fig-cell tr-fig-cell--shaded" : "tr-fig-cell"}
        />,
      );
    }
    groups.push(
      <g key={bar}>
        <rect
          x={PAD - BARS_OUTLINE_PAD}
          y={barY - BARS_OUTLINE_PAD}
          width={cols * CELL + BARS_OUTLINE_PAD * 2}
          height={CELL + BARS_OUTLINE_PAD * 2}
          rx={4}
          className="tr-fig-bar-outline"
        />
        {cells}
      </g>,
    );
  }
  return <g>{groups}</g>;
}

// ---------------------------------------------------------------------------
// grid: street map (start/end marked, no route drawn -- the route is the answer)
// ---------------------------------------------------------------------------
function renderStreetGrid(spec: Record<string, unknown>) {
  const streets = (spec.streets as string[]) ?? [];
  const avenues = (spec.avenues as string[]) ?? [];
  const start = spec.start as { streetIndex: number; avenueIndex: number };
  const end = spec.end as { streetIndex: number; avenueIndex: number };
  const STEP = 44;
  const originX = 60;
  const originY = 16;
  const lines = [];
  // Streets run horizontally (one per row, y = streetIndex); avenues run vertically.
  for (let i = 0; i < streets.length; i++) {
    const y = originY + i * STEP;
    lines.push(<line key={`s${i}`} className="tr-fig-street" x1={originX} y1={y} x2={originX + (avenues.length - 1) * STEP} y2={y} />);
    lines.push(
      <text key={`sl${i}`} className="tr-fig-axis-label" x={originX - 10} y={y + 4} textAnchor="end">
        {streets[i]}
      </text>,
    );
  }
  for (let j = 0; j < avenues.length; j++) {
    const x = originX + j * STEP;
    lines.push(
      <line key={`a${j}`} className="tr-fig-street" x1={x} y1={originY} x2={x} y2={originY + (streets.length - 1) * STEP} />,
    );
    lines.push(
      <text key={`al${j}`} className="tr-fig-axis-label" x={x} y={originY - 10} textAnchor="middle">
        {avenues[j]}
      </text>,
    );
  }
  const startX = originX + start.avenueIndex * STEP;
  const startY = originY + start.streetIndex * STEP;
  const endX = originX + end.avenueIndex * STEP;
  const endY = originY + end.streetIndex * STEP;
  return (
    <g>
      {lines}
      <circle className="tr-fig-marker tr-fig-marker--start" cx={startX} cy={startY} r={9} />
      <text className="tr-fig-marker-label" x={startX} y={startY - 16} textAnchor="middle">
        Start
      </text>
      <rect className="tr-fig-marker tr-fig-marker--end" x={endX - 8} y={endY - 8} width={16} height={16} />
      <text className="tr-fig-marker-label" x={endX} y={endY - 16} textAnchor="middle">
        End
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// shape: a small polyomino in its starting orientation, plus a non-representational turn icon
// (never the turned result -- that is the answer)
// ---------------------------------------------------------------------------
function renderPolyomino(spec: Record<string, unknown>) {
  const cells = (spec.cells as [number, number][]) ?? [];
  const CELL = 34;
  const PAD = 16;
  const maxCol = Math.max(0, ...cells.map((c) => c[1]));
  const squares = cells.map(([r, c], i) => (
    <rect key={i} x={PAD + c * CELL} y={PAD + r * CELL} width={CELL} height={CELL} className="tr-fig-cell tr-fig-cell--shaded" />
  ));
  const iconX = PAD + (maxCol + 1) * CELL + 30;
  const iconY = PAD + CELL;
  return (
    <g>
      {squares}
      {turnIcon(iconX, iconY, spec.turn === "quarter-clockwise" ? 90 : 180)}
    </g>
  );
}

// ---------------------------------------------------------------------------
// shape: type "candidates" -- task 36. The starting shape (drawn exactly like renderPolyomino
// above, turn icon included, never the turned result) plus a labeled A/B/C/D grid of the
// answer's own candidate results underneath, so the reader compares four drawn shapes instead
// of holding four paragraphs in their head. Every candidate is drawn with the same
// tr-fig-cell--shaded styling regardless of which index the answer actually is -- nothing here
// may visually hint at the correct one.
// ---------------------------------------------------------------------------
function renderShapeCandidates(spec: Record<string, unknown>) {
  const base = spec.base as { cells: [number, number][]; turn?: string };
  const candidates = (spec.candidates as { label: string; cells: [number, number][] }[]) ?? [];
  const CELL = 34;
  const PAD = 16;
  const baseMaxCol = Math.max(0, ...base.cells.map((c) => c[1]));
  const baseMaxRow = Math.max(0, ...base.cells.map((c) => c[0]));
  const baseSquares = base.cells.map(([r, c], i) => (
    <rect key={`base-${i}`} x={PAD + c * CELL} y={PAD + r * CELL} width={CELL} height={CELL} className="tr-fig-cell tr-fig-cell--shaded" />
  ));
  const iconX = PAD + (baseMaxCol + 1) * CELL + 30;
  const iconY = PAD + CELL;
  const baseH = (baseMaxRow + 1) * CELL + PAD * 2;

  const sizes = candidates.map((c) => shapeCandidateSize(c.cells, CELL));
  const { positions } = candidateLayout(sizes, PAD);
  const gridTop = baseH + 20;

  return (
    <g>
      {baseSquares}
      {turnIcon(iconX, iconY, base.turn === "quarter-clockwise" ? 90 : 180)}
      {candidates.map((cand, i) => {
        const pos = positions[i];
        return (
          <g key={cand.label}>
            <text x={pos.labelX} y={gridTop + pos.y - 8} textAnchor="middle" className="tr-fig-choice-label">
              {cand.label}
            </text>
            {cand.cells.map(([r, c], j) => (
              <rect
                key={j}
                x={pos.x + c * CELL}
                y={gridTop + pos.y + r * CELL}
                width={CELL}
                height={CELL}
                className="tr-fig-cell tr-fig-cell--shaded"
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}

/** A curved arrow (graphic, not a text arrow character) showing a turn amount without ever
 * depicting the turned result itself. sweepDeg 90 draws a quarter-circle arc, 180 a half-circle. */
function turnIcon(cx: number, cy: number, sweepDeg: number) {
  const r = 16;
  const startAngle = -90;
  const endAngle = startAngle + sweepDeg;
  const toXY = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [sx, sy] = toXY(startAngle);
  const [ex, ey] = toXY(endAngle);
  const largeArc = sweepDeg > 180 ? 1 : 0;
  return (
    <g className="tr-fig-turn">
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`} fill="none" />
      <polygon points={`${ex},${ey} ${ex - 6},${ey - 2} ${ex - 2},${ey - 7}`} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// shape: a letter shown upright, with the same non-representational turn icon
// ---------------------------------------------------------------------------
function renderLetter(spec: Record<string, unknown>) {
  const letter = String(spec.letter ?? "");
  return (
    <g>
      <rect x={20} y={15} width={100} height={100} className="tr-fig-letter-box" />
      <text x={70} y={90} textAnchor="middle" className="tr-fig-letter">
        {letter}
      </text>
      {turnIcon(175, 65, spec.turn === "quarter-clockwise" ? 90 : 180)}
    </g>
  );
}

// ---------------------------------------------------------------------------
// net: a flat cube net, exactly as laid out -- never folded. Task 36: spec.candidates draws a
// labeled A/B/C/D grid of several nets side by side instead of the usual single one, for a
// "which of these nets folds into a cube" multiple-choice question -- same
// tr-fig-cell/tr-fig-choice-label styling on every candidate regardless of which is correct.
// ---------------------------------------------------------------------------
function renderNet(spec: Record<string, unknown>) {
  const CELL = 44;
  const PAD = 16;
  const candidates = spec.candidates as { label: string; squares: { row: number; col: number }[] }[] | undefined;
  if (candidates) {
    const sizes = candidates.map((c) => netCandidateSize(c.squares, CELL));
    const { positions } = candidateLayout(sizes, PAD);
    return (
      <g>
        {candidates.map((cand, i) => {
          const pos = positions[i];
          const bbox = sizes[i];
          return (
            <g key={cand.label}>
              <text x={pos.labelX} y={pos.y - 8} textAnchor="middle" className="tr-fig-choice-label">
                {cand.label}
              </text>
              {cand.squares.map((s, j) => (
                <rect
                  key={j}
                  x={pos.x + (s.col - bbox.minCol) * CELL}
                  y={pos.y + (s.row - bbox.minRow) * CELL}
                  width={CELL}
                  height={CELL}
                  className="tr-fig-cell"
                />
              ))}
            </g>
          );
        })}
      </g>
    );
  }
  const squares = (spec.squares as { n: number; row: number; col: number }[]) ?? [];
  const minRow = Math.min(0, ...squares.map((s) => s.row));
  return (
    <g>
      {squares.map((s) => {
        const x = PAD + s.col * CELL;
        const y = PAD + (s.row - minRow) * CELL;
        return (
          <g key={s.n}>
            <rect x={x} y={y} width={CELL} height={CELL} className="tr-fig-cell" />
            <text x={x + CELL / 2} y={y + CELL / 2 + 6} textAnchor="middle" className="tr-fig-net-label">
              {s.n}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// stack: a left-to-right operation sequence (start unknown, each step, end known)
// ---------------------------------------------------------------------------
function renderSequence(spec: Record<string, unknown>) {
  const nodes = (spec.nodes as { type: "state" | "op"; label: string; value?: string }[]) ?? [];
  const BOX = 74;
  const GAP = 18;
  const PAD = 16;
  return (
    <g>
      {nodes.map((n, i) => {
        const x = PAD + i * (BOX + GAP);
        const y = 30;
        if (n.type === "state") {
          return (
            <g key={i}>
              <rect x={x} y={y} width={BOX} height={60} className="tr-fig-state-box" />
              <text x={x + BOX / 2} y={y + 26} textAnchor="middle" className="tr-fig-state-label">
                {n.label}
              </text>
              <text x={x + BOX / 2} y={y + 48} textAnchor="middle" className="tr-fig-state-value">
                {n.value ?? "?"}
              </text>
            </g>
          );
        }
        return (
          <g key={i}>
            <rect x={x} y={y + 12} width={BOX} height={36} rx={18} className="tr-fig-op-box" />
            <text x={x + BOX / 2} y={y + 35} textAnchor="middle" className="tr-fig-op-label">
              {n.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// stack: layered footprints (bottom to top), each drawn as its own small flat grid
// ---------------------------------------------------------------------------
function renderLayers(spec: Record<string, unknown>) {
  const layers = (spec.layers as { label: string; rows: number; cols: number; full?: boolean; filled?: [number, number][] }[]) ?? [];
  const CELL = 20;
  const PAD = 16;
  let x = PAD;
  const groups = layers.map((layer, li) => {
    const filled = layer.full
      ? Array.from({ length: layer.rows }, (_, r) => Array.from({ length: layer.cols }, (_, c) => [r, c] as [number, number])).flat()
      : (layer.filled ?? []);
    const filledSet = new Set(filled.map(([r, c]) => `${r},${c}`));
    const cells = [];
    for (let r = 0; r < layer.rows; r++) {
      for (let c = 0; c < layer.cols; c++) {
        const isFilled = filledSet.has(`${r},${c}`);
        cells.push(
          <rect
            key={`${r}-${c}`}
            x={x + c * CELL}
            y={30 + r * CELL}
            width={CELL}
            height={CELL}
            className={isFilled ? "tr-fig-cell tr-fig-cell--shaded" : "tr-fig-cell tr-fig-cell--empty"}
          />,
        );
      }
    }
    const panelWidth = layer.cols * CELL;
    const label = (
      <text key="label" x={x + panelWidth / 2} y={16} textAnchor="middle" className="tr-fig-layer-label">
        {layer.label}
      </text>
    );
    const group = (
      <g key={li}>
        {label}
        {cells}
      </g>
    );
    x += panelWidth + 26;
    return group;
  });
  return <g>{groups}</g>;
}

// A chess position from a FEN placement field (the part before the first space), white at the
// bottom unless spec.flip is true. Pieces are the Unicode chess glyphs, so nothing is loaded.
const BOARD_CELL = 34;
const BOARD_PAD = 14;
const PIECE_GLYPH: Record<string, string> = {
  K: "\u2654", Q: "\u2655", R: "\u2656", B: "\u2657", N: "\u2658", P: "\u2659",
  k: "\u265A", q: "\u265B", r: "\u265C", b: "\u265D", n: "\u265E", p: "\u265F",
};

function renderBoard(spec: Record<string, unknown>) {
  const fen = String(spec.fen ?? "").split(" ")[0];
  const flip = spec.flip === true;
  const rows = fen.split("/");
  const cells: { r: number; c: number; piece?: string }[] = [];
  rows.forEach((row, r) => {
    let c = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { c += Number(ch); continue; }
      cells.push({ r, c, piece: ch });
      c++;
    }
  });
  const files = "abcdefgh".split("");
  const sq = (r: number, c: number) => {
    const rr = flip ? 7 - r : r;
    const cc = flip ? 7 - c : c;
    return { x: BOARD_PAD + cc * BOARD_CELL, y: BOARD_PAD + rr * BOARD_CELL };
  };
  const squares = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const { x, y } = sq(r, c);
    squares.push(<rect key={`s${r}${c}`} x={x} y={y} width={BOARD_CELL} height={BOARD_CELL} fill={(r + c) % 2 === 0 ? "#f3e7cf" : "#8a9a6a"} />);
  }
  return (
    <g>
      {squares}
      {cells.map(({ r, c, piece }) => {
        const { x, y } = sq(r, c);
        const white = piece === piece?.toUpperCase();
        return (
          <text key={`p${r}${c}`} x={x + BOARD_CELL / 2} y={y + BOARD_CELL * 0.74} fontSize={BOARD_CELL * 0.8} textAnchor="middle" fill={white ? "#fff" : "#1f2a1f"} stroke={white ? "#1f2a1f" : "none"} strokeWidth={white ? 0.8 : 0}>
            {PIECE_GLYPH[piece ?? ""] ?? ""}
          </text>
        );
      })}
      {files.map((f, i) => (
        <text key={`f${f}`} x={BOARD_PAD + (flip ? 7 - i : i) * BOARD_CELL + BOARD_CELL / 2} y={BOARD_PAD + 8 * BOARD_CELL + 11} fontSize="9" textAnchor="middle" fill="#6b6357" fontFamily="monospace">
          {f}
        </text>
      ))}
      {[8, 7, 6, 5, 4, 3, 2, 1].map((rank, i) => (
        <text key={`r${rank}`} x={5} y={BOARD_PAD + (flip ? 7 - i : i) * BOARD_CELL + BOARD_CELL * 0.62} fontSize="9" textAnchor="middle" fill="#6b6357" fontFamily="monospace">
          {rank}
        </text>
      ))}
    </g>
  );
}

// A piano keyboard, one or two octaves from spec.from (default C4), white keys as rects and
// black keys drawn over them; spec.highlight names keys like "C4", "F#4"; spec.labels writes the
// white-key names. Drawn as SVG so a Play step can point at the keys it talks about.
const KEY_W = 30;
const KEY_H = 110;
const WHITE = ["C", "D", "E", "F", "G", "A", "B"];
const BLACK_AFTER: Record<string, string> = { C: "C#", D: "D#", F: "F#", G: "G#", A: "A#" };

function keysWidth(spec: Record<string, unknown>): number {
  const octaves = Number(spec.octaves) === 2 ? 2 : 1;
  return octaves * 7 * KEY_W + 16;
}

function renderKeys(spec: Record<string, unknown>) {
  const octaves = Number(spec.octaves) === 2 ? 2 : 1;
  const from = String(spec.from ?? "C4");
  const startOctave = Number(from.replace(/[^0-9]/g, "")) || 4;
  // The keyboard may start on any white key: the names cycle from that letter, and the octave
  // number steps up each time the cycle passes B.
  const startIndex = Math.max(0, WHITE.indexOf(from.replace(/[^A-G]/g, "").toUpperCase() || "C"));
  const highlight = new Set(((spec.highlight as string[]) ?? []).map((k) => k.replace("♯", "#")));
  const labels = spec.labels !== false;
  const whites: ReactElement[] = [];
  const blacks: ReactElement[] = [];
  const x0 = 8;
  for (let o = 0; o < octaves; o++) {
    WHITE.forEach((_unused, i) => {
      const absolute = startIndex + o * 7 + i;
      const name = WHITE[absolute % 7];
      const octaveNumber = startOctave + Math.floor(absolute / 7);
      const key = `${name}${octaveNumber}`;
      const x = x0 + (o * 7 + i) * KEY_W;
      const on = highlight.has(key);
      whites.push(
        <g key={key}>
          <rect x={x} y={8} width={KEY_W} height={KEY_H} fill={on ? "#f2c14e" : "#fff"} stroke="#3a3a3a" strokeWidth="1.2" />
          {labels ? (
            <text x={x + KEY_W / 2} y={KEY_H + 26} fontSize="11" textAnchor="middle" fill="#3a3a3a" fontFamily="monospace">
              {key}
            </text>
          ) : null}
        </g>,
      );
      const sharp = BLACK_AFTER[name];
      if (sharp) {
        const bkey = `${sharp}${octaveNumber}`;
        const bon = highlight.has(bkey);
        blacks.push(<rect key={bkey} x={x + KEY_W * 0.68} y={8} width={KEY_W * 0.64} height={KEY_H * 0.62} fill={bon ? "#e0a020" : "#1f1f1f"} stroke="#1f1f1f" strokeWidth="1" rx="1" />);
      }
    });
  }
  return (
    <g>
      {whites}
      {blacks}
    </g>
  );
}

// A bar of beats: spec.beats boxes in a row, spec.pattern a string one character per beat
// ("x" a clap or note, "." a rest, "-" a held note continuing), spec.count optional labels
// under the beats ("1", "&", "2", ...). The Play track's rhythm guide.
const BEAT_W = 44;

function renderBeats(spec: Record<string, unknown>) {
  const beats = Number(spec.beats) || 4;
  const pattern = String(spec.pattern ?? "x".repeat(beats)).padEnd(beats, ".");
  const count = (spec.count as string[]) ?? [];
  const out: ReactElement[] = [];
  for (let i = 0; i < beats; i++) {
    const x = 12 + i * BEAT_W;
    const ch = pattern[i];
    out.push(<rect key={`b${i}`} x={x} y={12} width={BEAT_W - 6} height={44} fill="#fff" stroke="#c9c1b0" strokeWidth="1" rx="4" />);
    if (ch === "x") out.push(<circle key={`c${i}`} cx={x + (BEAT_W - 6) / 2} cy={34} r={11} fill="#5f7c4f" />);
    if (ch === "-") out.push(<rect key={`h${i}`} x={x + 4} y={30} width={BEAT_W - 14} height={8} fill="#5f7c4f" rx="4" />);
    if (ch === ".") out.push(<text key={`r${i}`} x={x + (BEAT_W - 6) / 2} y={39} fontSize="13" textAnchor="middle" fill="#a8a093" fontFamily="monospace">rest</text>);
    out.push(
      <text key={`n${i}`} x={x + (BEAT_W - 6) / 2} y={78} fontSize="12" textAnchor="middle" fill="#6b6357" fontFamily="monospace">
        {count[i] ?? String(i + 1)}
      </text>,
    );
  }
  return <g>{out}</g>;
}

// A labelled drawing for hands-on steps (wiring, a mechanism, a frame, a support polygon, a
// lever arm): the author places boxes, lines, circles, polygons, dots, dimension lines and
// text in a w by h box. Colours are named so every diagram shares the app's palette.
const DIAGRAM_FILL: Record<string, string> = {
  ink: "#3a3a3a",
  accent: "#f2c14e",
  green: "#5f7c4f",
  rust: "#a33a2a",
  paper: "#fffdf7",
  muted: "#a8a093",
  sand: "#e8dcc4",
  none: "none",
};
const fillOf = (name: unknown, fallback: string) => DIAGRAM_FILL[String(name ?? "")] ?? fallback;
// Text on a dark fill is drawn light, so a rust battery or an ink box stays readable.
const DARK_FILLS = new Set(["ink", "rust", "green", "muted"]);
const textOn = (fill: unknown) => (DARK_FILLS.has(String(fill ?? "")) ? "#fffdf7" : "#3a3a3a");
const subOn = (fill: unknown) => (DARK_FILLS.has(String(fill ?? "")) ? "#f1e9d6" : "#6b6357");

type DiagramItem = Record<string, unknown>;

function renderDiagram(spec: Record<string, unknown>, frameItems?: DiagramItem[]) {
  const items = frameItems ?? ((spec.items as DiagramItem[]) ?? []);
  const out: ReactElement[] = [];
  const label = (key: string, x: number, y: number, text: unknown, size = 12, anchor: "start" | "middle" | "end" = "middle", color = "#3a3a3a") =>
    text ? (
      <text key={key} x={x} y={y} fontSize={size} textAnchor={anchor} fill={color} fontFamily="system-ui, sans-serif">
        {String(text)}
      </text>
    ) : null;
  items.forEach((it, i) => {
    const k = `d${i}`;
    switch (it.t) {
      case "box": {
        const x = Number(it.x), y = Number(it.y), w = Number(it.w), h = Number(it.h);
        out.push(<rect key={k} x={x} y={y} width={w} height={h} rx="4" fill={fillOf(it.fill, "#fffdf7")} stroke="#3a3a3a" strokeWidth="1.4" />);
        const two = Boolean(it.sub);
        const l1 = label(`${k}l`, x + w / 2, y + h / 2 + (two ? -2 : 4), it.label, 12, "middle", textOn(it.fill));
        if (l1) out.push(l1);
        const l2 = label(`${k}s`, x + w / 2, y + h / 2 + 13, it.sub, 10, "middle", subOn(it.fill));
        if (l2) out.push(l2);
        break;
      }
      case "line": {
        const x1 = Number(it.x1), y1 = Number(it.y1), x2 = Number(it.x2), y2 = Number(it.y2);
        const color = fillOf(it.color, "#3a3a3a");
        out.push(
          <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1.8" strokeDasharray={it.dashed ? "5 4" : undefined} markerEnd={it.arrow ? "url(#tr-arrow)" : undefined} />,
        );
        // The label sits beside the line, offset along its normal (above a horizontal line, to
        // the left of a vertical one), so it never lies on the stroke or the arrow head.
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
        const nx = (dy / len) * 11, ny = (-dx / len) * 11;
        const l = label(`${k}l`, (x1 + x2) / 2 + nx, (y1 + y2) / 2 + ny + 4, it.label, 11, Math.abs(nx) > 6 ? (nx < 0 ? "end" : "start") : "middle", color);
        if (l) out.push(l);
        break;
      }
      case "circle": {
        const cx = Number(it.cx), cy = Number(it.cy), r = Number(it.r);
        out.push(<circle key={k} cx={cx} cy={cy} r={r} fill={fillOf(it.fill, "#fffdf7")} stroke="#3a3a3a" strokeWidth="1.4" />);
        const l = label(`${k}l`, cx, cy + 4, it.label, 11, "middle", textOn(it.fill));
        if (l) out.push(l);
        break;
      }
      case "poly": {
        const pts = ((it.points as number[][]) ?? []).map((p) => `${Number(p[0])},${Number(p[1])}`).join(" ");
        out.push(<polygon key={k} points={pts} fill={fillOf(it.fill, "none")} fillOpacity={it.fill ? 0.35 : 1} stroke="#3a3a3a" strokeWidth="1.4" strokeDasharray={it.dashed ? "5 4" : undefined} />);
        if (it.label) {
          const ps = (it.points as number[][]) ?? [];
          const cx = ps.reduce((a, p) => a + Number(p[0]), 0) / Math.max(1, ps.length);
          const cy = ps.reduce((a, p) => a + Number(p[1]), 0) / Math.max(1, ps.length);
          const l = label(`${k}l`, cx, cy + 4, it.label, 11);
          if (l) out.push(l);
        }
        break;
      }
      case "dot": {
        const cx = Number(it.cx), cy = Number(it.cy);
        out.push(<circle key={k} cx={cx} cy={cy} r={4} fill="#a33a2a" />);
        const side = String(it.side ?? "right");
        const dx = side === "left" ? -7 : side === "right" ? 7 : 0;
        const dy = side === "above" ? -7 : side === "below" ? 14 : 4;
        const l = label(`${k}l`, cx + dx, cy + dy, it.label, 11, side === "left" ? "end" : side === "right" ? "start" : "middle");
        if (l) out.push(l);
        break;
      }
      case "dim": {
        const x1 = Number(it.x1), y1 = Number(it.y1), x2 = Number(it.x2), y2 = Number(it.y2);
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * 5, ny = (dx / len) * 5;
        out.push(<line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#6b6357" strokeWidth="1.2" />);
        out.push(<line key={`${k}a`} x1={x1 + nx} y1={y1 + ny} x2={x1 - nx} y2={y1 - ny} stroke="#6b6357" strokeWidth="1.2" />);
        out.push(<line key={`${k}b`} x1={x2 + nx} y1={y2 + ny} x2={x2 - nx} y2={y2 - ny} stroke="#6b6357" strokeWidth="1.2" />);
        const l = label(`${k}l`, (x1 + x2) / 2 + nx * 2.4, (y1 + y2) / 2 + ny * 2.4 + 4, it.label, 11, "middle", "#6b6357");
        if (l) out.push(l);
        break;
      }
      case "text": {
        const anchor = it.anchor === "middle" || it.anchor === "end" ? it.anchor : "start";
        const l = label(k, Number(it.x), Number(it.y), it.s, Number(it.size) || 12, anchor);
        if (l) out.push(l);
        break;
      }
    }
  });
  return (
    <g>
      <defs>
        <marker id="tr-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#3a3a3a" />
        </marker>
      </defs>
      {out}
    </g>
  );
}
