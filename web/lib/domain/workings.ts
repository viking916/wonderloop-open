// Pure logic for the working space (task 43). No Firebase, no React -- see lib/data/workings.ts
// for the Firestore side and components/quest/WorkingSpace.tsx for the UI.

import type { Stroke, WorkingDoc } from "../data/types";

/**
 * Whether a working actually has anything in it -- an untyped, undrawn-on problem must read as
 * "nothing here" everywhere this is checked (the mistake-box "last time" panel, the try-3 gate,
 * the parent view's log area), not as an empty box worth showing. `undefined` (no document at
 * all, the ordinary case for a problem never opened in the working space) and a document whose
 * text is blank and strokes are empty (Clear pressed, or a saved-then-cleared session) are
 * treated identically: both mean "nothing to show".
 */
export function hasWorkingContent(working: WorkingDoc | undefined | { text: string; strokes: Stroke[] }): boolean {
  if (!working) return false;
  return working.text.trim() !== "" || working.strokes.length > 0;
}
