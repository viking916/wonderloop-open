export type ChoiceInputProps = {
  options: string[];
  value: number | null;
  onChange: (index: number) => void;
  disabled: boolean;
};

/** Big tappable options (spec 7.3). A real ARIA radiogroup, so arrow keys, Tab and Enter/Space
 * all work from the keyboard, not just a mouse tap. */
export function ChoiceInput({ options, value, onChange, disabled }: ChoiceInputProps) {
  return (
    <div className="tr-choice" role="radiogroup" aria-label="Choose one">
      {options.map((option, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          className={`tr-choice__option${value === i ? " tr-choice__option--selected" : ""}`}
          onClick={() => onChange(i)}
          disabled={disabled}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
