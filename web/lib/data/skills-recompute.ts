// The app-layer bridge between the content bundle and lib/domain/skills.ts.
//
// resets.ts (task 5) stays free of the content bundle on purpose; this is the app layer that
// hands it the quest/problem ids in scope and the skillsForProblem resolver it asks for
// (resets.ts module comment: "the app layer... tells it which quest ids and problem ids are in
// scope").
//
// This lives in lib/data/ rather than beside a component (final review, finding I1, and its
// re-review): a data operation imported from a React component pulls that component into the
// import graph of everything that later needs skills recomputed.
import { getDocs } from "firebase/firestore";
import { getProblem, getQuest } from "@/lib/content/app-content";
import { getLogs } from "@/lib/data/logs";
import { getParentEntries } from "@/lib/data/parentActivities";
import { saveSkills, toStoredAttempt } from "@/lib/data/progress";
import { type ResetSkillInputs } from "@/lib/data/resets";
import { attemptsCol } from "@/lib/data/types";
import { getDb } from "@/lib/firebase/client";
import { recomputeFromAttempts, type StoredLog } from "@/lib/domain/skills";

/** Every log on record, reduced to StoredLog {questId, track, at} plus every parent-entered
 * note, in exactly the shape lib/domain/skills.ts's recomputeFromAttempts wants. Exported so a
 * problem- or quest-scoped reset button anywhere in the Parent view (MistakeBox, LogList,
 * WeekPlan, SproutCard) can build the same inputs without duplicating this. */
export async function buildSkillInputs(hid: string, pid: string): Promise<ResetSkillInputs> {
  const [logsList, parentEntries] = await Promise.all([getLogs(hid, pid), getParentEntries(hid, pid)]);
  const logs: StoredLog[] = [];
  for (const { log } of logsList) {
    const quest = getQuest(log.questId);
    if (quest) logs.push({ questId: log.questId, track: quest.track, at: log.at });
  }
  return { logs, parentEntries, skillsForProblem: (id) => getProblem(id)?.problem.skills ?? [] };
}

/**
 * Recomputes and saves a profile's whole skills map from every attempt, log and parent-entered
 * note currently on record (lib/domain/skills.ts never increments, so every caller must fold in
 * the same three sources or a skill total could depend on which path happened to run last).
 * The single shared copy: components/quest/ProblemPlayer.tsx calls this after a live attempt,
 * ParentActivities.tsx calls it right after adding a note so the new evidence shows up in the
 * Explorer skills map immediately rather than waiting for the next attempt or reset, and every
 * reset button in ResetControls.tsx calls it after a reset completes.
 */
export async function recomputeAndSaveSkills(hid: string, pid: string): Promise<void> {
  const db = getDb();
  const [attemptsSnap, inputs] = await Promise.all([getDocs(attemptsCol(db, hid, pid)), buildSkillInputs(hid, pid)]);
  const attempts = attemptsSnap.docs.map((d) => toStoredAttempt(d.data()));
  const skills = recomputeFromAttempts(attempts, inputs.logs, inputs.parentEntries, inputs.skillsForProblem);
  await saveSkills(hid, pid, skills);
}
