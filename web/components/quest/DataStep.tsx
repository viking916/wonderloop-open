"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import type { Step } from "@/lib/content/schema";
import { dataRowComplete, type QuestProgress } from "@/lib/domain/completion";
import { StepBody } from "./StepBody";

export type DataStepProps = {
  step: Extract<Step, { kind: "data" }>;
  progress: QuestProgress;
  onUpdate: (updater: (prev: QuestProgress) => QuestProgress) => Promise<void>;
  onOwnPrimaryChange?: (visible: boolean) => void;
};

const MAX_ROWS = 12;

function blankRows(count: number, columns: number): string[][] {
  return Array.from({ length: count }, () => Array.from({ length: columns }, () => ""));
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * One bar chart per numeric column: the rows along the bottom, the mean as a dashed line, the
 * median printed beside it. Drawn as plain SVG so it needs nothing loaded and prints in the
 * portfolio like everything else.
 */
function ColumnChart({ label, labels, values }: { label: string; labels: string[]; values: number[] }) {
  const w = 560;
  const h = 200;
  const padL = 44;
  const padB = 28;
  const padT = 18;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const y = (v: number) => padT + ((max - v) / span) * (h - padT - padB);
  const slot = (w - padL - 8) / values.length;
  const barW = Math.max(8, slot * 0.6);
  const m = mean(values);
  return (
    <figure>
      <svg className="tr-data__chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}: ${values.map(fmt).join(", ")}`}>
        <line x1={padL} y1={y(0)} x2={w - 4} y2={y(0)} stroke="#c9c1b0" strokeWidth="1" />
        {values.map((v, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          const top = Math.min(y(v), y(0));
          const height = Math.abs(y(v) - y(0));
          return (
            <g key={i}>
              <rect x={x} y={top} width={barW} height={Math.max(height, 1)} fill="#5f7c4f" rx="2" />
              <text x={x + barW / 2} y={h - padB + 14} fontSize="11" textAnchor="middle" fill="#6b6357" fontFamily="monospace">
                {labels[i].slice(0, 8)}
              </text>
            </g>
          );
        })}
        <line x1={padL} y1={y(m)} x2={w - 4} y2={y(m)} stroke="#a33a2a" strokeWidth="1.5" strokeDasharray="6 4" />
        <text x={4} y={y(m) + 4} fontSize="11" fill="#a33a2a" fontFamily="monospace">
          mean
        </text>
        <text x={4} y={padT + 4} fontSize="11" fill="#6b6357" fontFamily="monospace">
          {fmt(max)}
        </text>
      </svg>
      <figcaption className="tr-data__stats">
        {label}: mean {fmt(m)}, median {fmt(median(values))}, lowest {fmt(Math.min(...values))}, highest {fmt(Math.max(...values))}
      </figcaption>
    </figure>
  );
}

/**
 * The data step (6 September 2026, the data-science thread): a small table the child fills in
 * from the week's own measurements, a chart of each numeric column with its mean and median,
 * and one sentence answering the step's question from what the chart shows. Saved into
 * QuestProgress.data; completion needs `minRows` complete rows and a non-empty answer
 * (lib/domain/completion.ts). Nothing here is graded: the point is that the claim comes from the
 * numbers, and the numbers came from the child.
 */
export function DataStep({ step, progress, onUpdate, onOwnPrimaryChange }: DataStepProps) {
  const columns = step.columns.length;
  const existing = progress.data?.[step.id];
  const [rows, setRows] = useState<string[][]>(() => {
    const base = existing?.rows?.map((r) => [...r.cells, ...Array.from({ length: Math.max(0, columns - r.cells.length) }, () => "")]) ?? [];
    return base.length >= step.minRows ? base : [...base, ...blankRows(step.minRows - base.length, columns)];
  });
  const [answer, setAnswer] = useState(existing?.answer ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(Boolean(existing && existing.answer.trim()));
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  const completeRows = useMemo(() => rows.filter((r) => dataRowComplete(r, columns)), [rows, columns]);
  const canSave = completeRows.length >= step.minRows && answer.trim().length > 0 && !saving;
  const primary = !saved && canSave;
  useEffect(() => {
    onOwnPrimaryChange?.(primary);
    return () => onOwnPrimaryChange?.(false);
  }, [primary, onOwnPrimaryChange]);

  function setCell(r: number, c: number, value: string) {
    setRows((prev) => prev.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? value : cell)) : row)));
    setSaved(false);
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      const at = Date.now();
      // Rows persist as objects: Firestore refuses an array nested inside an array.
      const persisted = rows.map((cells) => ({ cells }));
      await onUpdate((prev) => ({ ...prev, data: { ...(prev.data ?? {}), [step.id]: { rows: persisted, answer: answer.trim(), at } } }));
      setSaved(true);
    } catch {
      setSaveError("That did not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const labels = completeRows.map((r) => r[0].trim());

  return (
    <section className="tr-step" aria-labelledby={`${step.id}-title`}>
      <h3 id={`${step.id}-title`} className="tr-step__title">
        {step.title}
      </h3>
      <StepBody text={step.body} />
      {saveError ? <Toast tone="hint" message={saveError} onDismiss={() => setSaveError(undefined)} /> : null}
      <table className="tr-data__table">
        <thead>
          <tr>
            {step.columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {step.columns.map((c, col) => (
                <td key={col}>
                  <input
                    className="tr-input"
                    inputMode={col === 0 ? "text" : "decimal"}
                    aria-label={`${c}, row ${r + 1}`}
                    value={row[col] ?? ""}
                    onChange={(e) => setCell(r, col, e.target.value)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tr-step__actions">
        <Button variant="quiet" type="button" onClick={() => setRows((prev) => [...prev, blankRows(1, columns)[0]])} disabled={rows.length >= MAX_ROWS}>
          Add a row
        </Button>
        <span className="tr-data__stats">
          {completeRows.length} of {step.minRows} rows filled in
        </span>
      </div>
      {completeRows.length >= 2
        ? step.columns.slice(1).map((c, i) => (
            <ColumnChart key={c} label={c} labels={labels} values={completeRows.map((r) => Number(r[i + 1]))} />
          ))
        : null}
      <p className="tr-data__question">{step.question}</p>
      <textarea
        className="tr-textarea"
        rows={3}
        aria-label="Your answer from the data"
        placeholder="Answer from the chart, in a sentence with a number in it."
        value={answer}
        onChange={(e) => {
          setAnswer(e.target.value);
          setSaved(false);
        }}
      />
      <div className="tr-step__actions">
        <Button variant={primary ? "primary" : "secondary"} onClick={handleSave} disabled={!canSave}>
          {saving ? "Saving..." : saved ? "Saved" : "Save the data"}
        </Button>
      </div>
    </section>
  );
}
