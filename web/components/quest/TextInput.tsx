export type TextInputProps = {
  value: string;
  onChange: (text: string) => void;
  disabled: boolean;
};

/** A written proof/explain-it (spec 7.3). No auto-grade: submitting opens the worked
 * explanation immediately (lib/domain/attempts.ts's recordAttempt sets revealedAt), so there is
 * no "Not yet" or hint path for this input kind. */
export function TextInput({ value, onChange, disabled }: TextInputProps) {
  return (
    <textarea
      className="tr-textarea"
      name="answer"
      rows={6}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Your answer"
      placeholder="Write your thinking here."
    />
  );
}
