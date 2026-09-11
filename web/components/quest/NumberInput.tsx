export type NumberInputProps = {
  value: string;
  onChange: (text: string) => void;
  /** Enter submits (task brief: "a text field ... Enter submits"). */
  onEnter: () => void;
  disabled: boolean;
  /**
   * Task 43: which on-screen keyboard the field asks for, derived by the caller from the
   * authored answer (lib/answers.ts's numericInputMode) -- this component never looks at the
   * answer itself. "decimal" for a pure whole/decimal-number answer ("300", "45.00"); undefined
   * (the full keyboard) for anything that needs a character the iPad's numeric/decimal keypads
   * do not have -- a fraction's slash, a mixed number's space, a negative's minus.
   */
  inputMode?: "decimal";
};

/** A typed number/fraction/money/percent answer (spec 7.3). `checkAnswer`/`parseNumber` accept
 * "32.40", "$32.40", "32.4", "3/4", "1 1/2" and "90%" already, so this input stays a plain text
 * field: it does not parse, format or restrict what he types. */
export function NumberInput({ value, onChange, onEnter, disabled, inputMode }: NumberInputProps) {
  return (
    <input
      type="text"
      inputMode={inputMode ?? "text"}
      autoComplete="off"
      spellCheck={false}
      name="answer"
      className="tr-answer__input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !disabled) {
          e.preventDefault();
          onEnter();
        }
      }}
      disabled={disabled}
      aria-label="Your answer"
      placeholder="Type your answer"
    />
  );
}
