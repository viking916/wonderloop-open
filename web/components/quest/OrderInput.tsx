"use client";

import { useRef } from "react";

export type OrderInputProps = {
  items: string[];
  /** order[position] = the index into `items` that currently sits at that position -- the exact
   * shape lib/answers.ts's checkAnswer compares for an "order" AnswerSpec. */
  order: number[];
  onChange: (order: number[]) => void;
  disabled: boolean;
};

/**
 * A reorderable list (spec 7.3): draggable for a mouse, and Up/Down buttons on every row for a
 * 9-year-old on a laptop trackpad, since "drag alone fails" him (task brief). Both paths write
 * the same `order` array, so nothing about how he moved a row changes what gets submitted.
 */
export function OrderInput({ items, order, onChange, disabled }: OrderInputProps) {
  const dragFrom = useRef<number | null>(null);

  function swap(pos: number, dir: -1 | 1) {
    const target = pos + dir;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[pos], next[target]] = [next[target], next[pos]];
    onChange(next);
  }

  function moveTo(fromPos: number, toPos: number) {
    if (fromPos === toPos) return;
    const next = [...order];
    const [moved] = next.splice(fromPos, 1);
    next.splice(toPos, 0, moved);
    onChange(next);
  }

  return (
    <ol className="tr-order">
      {order.map((itemIndex, pos) => (
        <li
          key={itemIndex}
          className="tr-order__item"
          draggable={!disabled}
          onDragStart={() => {
            dragFrom.current = pos;
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragFrom.current !== null) moveTo(dragFrom.current, pos);
            dragFrom.current = null;
          }}
        >
          <span className="tr-order__text">{items[itemIndex]}</span>
          <span className="tr-order__buttons">
            <button type="button" aria-label={`Move "${items[itemIndex]}" up`} onClick={() => swap(pos, -1)} disabled={disabled || pos === 0}>
              Up
            </button>
            <button
              type="button"
              aria-label={`Move "${items[itemIndex]}" down`}
              onClick={() => swap(pos, 1)}
              disabled={disabled || pos === order.length - 1}
            >
              Down
            </button>
          </span>
        </li>
      ))}
    </ol>
  );
}
