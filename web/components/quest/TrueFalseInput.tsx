export type TrueFalseInputProps = {
  value: boolean | null;
  onChange: (value: boolean) => void;
  disabled: boolean;
};

/** Two buttons (spec 7.3), styled the same as ChoiceInput's options so the two input kinds
 * read as one family. */
export function TrueFalseInput({ value, onChange, disabled }: TrueFalseInputProps) {
  return (
    <div className="tr-choice tr-truefalse" role="radiogroup" aria-label="True or false">
      <button
        type="button"
        role="radio"
        aria-checked={value === true}
        className={`tr-choice__option${value === true ? " tr-choice__option--selected" : ""}`}
        onClick={() => onChange(true)}
        disabled={disabled}
      >
        True
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === false}
        className={`tr-choice__option${value === false ? " tr-choice__option--selected" : ""}`}
        onClick={() => onChange(false)}
        disabled={disabled}
      >
        False
      </button>
    </div>
  );
}
