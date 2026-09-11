"use client";

import { Button } from "@/components/ui/Button";

export type BreakOfferProps = {
  onTakeBreak: () => void;
  onNotNow: () => void;
};

/**
 * The break offer (Plan 4 task 35). QuestShell decides WHEN this is allowed on screen -- only at
 * a step boundary, never mid-problem (see that component's own comment and lib/domain/breaks.ts
 * for why) -- this component only renders the offer itself and reports which button he pressed.
 * "Not now" is a real, free dismissal: it does not fail the quest, does not mark him stuck, and
 * QuestShell will not ask again for a while (lib/domain/breaks.ts's BREAK_SNOOZE_MS). This is a
 * suggestion, never a countdown or a lock -- there is no timer here at all.
 */
export function BreakOffer({ onTakeBreak, onNotNow }: BreakOfferProps) {
  return (
    <div className="tr-break" role="status">
      <p className="tr-break__message">You have been at this a good while. Want a break?</p>
      <div className="tr-break__actions">
        <Button variant="secondary" onClick={onTakeBreak}>
          Take a break
        </Button>
        <Button variant="quiet" onClick={onNotNow}>
          Not now
        </Button>
      </div>
    </div>
  );
}
