export type CellState = "blank" | "tick" | "cross";

export type GridInputProps = {
  rows: string[];
  cols: string[];
  cells: CellState[][];
  onChange: (cells: CellState[][]) => void;
  disabled: boolean;
};

const NEXT: Record<CellState, CellState> = {
  blank: "tick",
  tick: "cross",
  cross: "blank",
};
const LABEL: Record<CellState, string> = {
  blank: "blank",
  tick: "ticked",
  cross: "crossed out",
};
const MARK: Record<CellState, string> = { blank: "", tick: "✓", cross: "✕" };

/**
 * A rows-by-columns deduction grid (spec 7.3): every cell is a real button cycling
 * blank -> tick -> cross -> blank, so it is reachable and operable purely from the keyboard
 * (Tab between cells, Enter/Space to cycle). Only ticks count toward the answer (task brief);
 * `checkAnswer`'s grid comparison reads cells as plain booleans, so the cross state exists for
 * his own bookkeeping only and is converted away (to `false`, same as blank) by the caller
 * before it ever reaches lib/answers.ts.
 */
export function GridInput({
  rows,
  cols,
  cells,
  onChange,
  disabled,
}: GridInputProps) {
  function cycle(r: number, c: number) {
    const next = cells.map((row) => [...row]);
    next[r][c] = NEXT[cells[r][c]];
    onChange(next);
  }

  return (
    <div className="tr-grid-scroll">
      <table className="tr-grid">
        <thead>
          <tr>
            <th></th>
            {cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r}>
              <th>{r}</th>
              {cols.map((c, ci) => {
                const state = cells[ri]?.[ci] ?? "blank";
                return (
                  <td key={c}>
                    <button
                      type="button"
                      className={`tr-grid__cell tr-grid__cell--${state}`}
                      onClick={() => cycle(ri, ci)}
                      disabled={disabled}
                      aria-label={`${r}, ${c}: ${LABEL[state]}. Press to change.`}
                    >
                      {MARK[state]}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
