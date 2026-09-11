import { Card } from "@/components/ui/Card";
import { calibrationSentences, missSentence, type CalibrationInput } from "@/lib/domain/calibration";

/**
 * "Knowing what you know" (7 September 2026): the two sentences lib/domain/calibration.ts makes
 * from the confidence marks and the miss kinds. Shown on the skills map and in the Parent view;
 * rendered only once there is something to say, so a fresh profile sees nothing here.
 */
export function CalibrationCard({ attempts, heading = "Knowing what you know" }: { attempts: CalibrationInput[]; heading?: string }) {
  const lines = calibrationSentences(attempts);
  const misses = missSentence(attempts);
  if (lines.length === 0 && !misses) return null;
  return (
    <Card tone="surface" className="tr-note tr-calibration">
      <p className="tr-eyebrow">{heading}</p>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {misses ? <p>{misses}</p> : null}
    </Card>
  );
}
