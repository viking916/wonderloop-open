// Firestore document types and converters (spec section 9's "Firestore (progress only)" tree).
// Every type here matches spec 9's field list; a few carry one extra field, called out in a
// comment at the field, needed to rebuild the pure domain types (attempts.ts's ProblemState,
// skills.ts's StoredAttempt/StoredLog) from what Firestore actually stores. Nothing in this
// file talks to the network: it only describes shapes, paths and read/write coercion.
//
// withConverter() is applied at every collection/doc helper below so call sites never see a
// raw Firestore Timestamp: converters stamp the listed fields with serverTimestamp() on write
// (the caller passes any truthy placeholder, commonly Date.now(), to say "stamp this now") and
// coerce them back to a plain number (ms) on read.

import {
  serverTimestamp,
  Timestamp,
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
} from "firebase/firestore";
import type { QuestProgress } from "../domain/completion";

// ---------------------------------------------------------------------------
// Document shapes
// ---------------------------------------------------------------------------

/** users/{uid} */
export type UserDoc = {
  displayName: string;
  householdIds: string[];
};

/** households/{hid} */
export type HouseholdDoc = {
  name: string;
  ownerUid: string;
  memberUids: string[];
  inviteCode: string;
  createdAt: number; // ms, serverTimestamp() on write
  /** Which terms and privacy notice the creating parent accepted, and when (components/ConsentGate.tsx). */
  termsVersion?: string;
  termsAcceptedAt?: number;
  // Task 9 feature 1: a parent-set 4-digit PIN gating the Parent profile's content in the UI.
  // Undefined means no PIN is set. Plain text, and readable/writable by every household member
  // -- see components/parent/ParentPinGate.tsx's doc comment for why this is friction, not a
  // security boundary (firestore.rules' isMember(hid) already grants read/write on this whole
  // document to the shared account every child uses too).
  parentPin?: string;
  // Task 14: which season shopping list items (lib/domain/materials.ts's ShoppingItem.key --
  // a material's own name, or `book:{id}` for the season book) a household has marked bought.
  // Lives here, not on a profile, because the gear and the book are shared by the household, not
  // owned by one child (components/parent/SeasonShoppingList.tsx). Undefined and [] both mean
  // "nothing ticked yet".
  boughtMaterials?: string[];
};

export type ProfileKind = "explorer" | "sprout" | "parent";
export type ProfileLook = "trail" | "workbench" | "circuit";

/** households/{hid}/profiles/{pid} */
export type ProfileDoc = {
  name: string;
  kind: ProfileKind;
  avatar: string;
  birthYear: number;
  seasonId: number;
  /** "YYYY-MM-DD", the Monday of the week the child first started this season. Absent until
   * the child's first saved step or round (lib/data/households.ts startClock): until then every
   * screen shows week 1, so a family that joins in November still begins at the beginning. */
  startDate?: string;
  look: ProfileLook; // spec 14: a per-profile setting; Sprout stays on "trail"
  /** The Play track (instrument practice, 6 September 2026) is opt-in per profile: a parent
   * turns it on in the Parent view for a child who takes lessons. Absent means off, so no
   * existing profile changed when the track arrived. */
  playTrack?: boolean;
  /** "YYYY-MM-DD": the day a parent paused this profile's week clock (owner decision,
   * 6 September 2026: a child pauses whenever they want, and the week does not move on without
   * them). While set, the current week is computed as of this day; resuming moves startDate
   * forward by the days paused and clears it (lib/data/households.ts resumeClock). */
  pausedAt?: string;
};

export type QuestStatus = "not_started" | "in_progress" | "parked" | "done";

/**
 * Per-problem state that would otherwise have to live redundantly on every attempt document.
 * Design note (task 5 brief): whatYouTried and firstSeenAt belong on the quest progress
 * document, keyed by problemId, so a ProblemState (lib/domain/attempts.ts) can be rebuilt from
 * this map plus the attempts subcollection, without storing them on each attempt.
 */
export type ProblemProgress = {
  firstSeenAt: number; // ms, when the CURRENT attempt cycle's problem was opened
  whatYouTried?: string; // required before try 3 (spec 7.3), scoped to the current cycle
  revealedAt?: number; // ms, set once the worked explanation has opened, scoped to the current cycle
  // Task 10 fix (spec 7.2 "he can retry any problem"): true once "Try it again" has started a
  // fresh attempt cycle on this problem. firstSeenAt/whatYouTried/revealedAt above are
  // overwritten with a new cycle's values at the same time this is set, and every attempt
  // recorded from then on is written with retry:true (see AttemptDoc.retry below) so
  // skills.ts excludes it from points while still counting it as evidence.
  retry?: boolean;
  // Task 13 addition (spec 7.3's "parent sees it and can thumbs-up or mark redo" for a rubric
  // (not-auto-graded) explain-it answer): a raw fact the Parent view records, never a computed
  // one -- it changes nothing about scoring (pointsForStoredAttempt already scores every
  // revealed answer at 0 regardless) or completion. The Parent view's "redo" control does not
  // set this; it calls the real reset (lib/data/resets.ts's resetProblem) instead, which
  // deletes this whole entry. "approved" is the only value ever written, and it persists as a
  // quiet acknowledgement until a fresh attempt cycle (or a reset) overwrites/removes it.
  parentReview?: "approved";
};

/**
 * households/{hid}/profiles/{pid}/progress/{questId}
 *
 * `quest` is the full lib/domain/completion.ts QuestProgress: ticks, checklist,
 * problemOutcomes, explains, artifacts, logs, debates, parked -- everything the child actually
 * produced, and the only thing isStepComplete/resumePosition/questStatus ever read. status,
 * stepIndex, problemIndex, minutes, startedAt and completedAt are derived conveniences kept
 * alongside it for cheap list views (This Week cards, the parent view) that would otherwise
 * have to run resumePosition/questStatus over every quest just to render a summary; they are
 * not a second source of truth and must be recomputed from `quest` on every write (see
 * progress.ts's buildProgressDoc).
 */
export type ProgressDoc = {
  status: QuestStatus;
  stepIndex: number;
  problemIndex: number;
  minutes: number;
  startedAt?: number;
  completedAt?: number;
  quest: QuestProgress;
  // Extension beyond spec 9's baseline fields (see ProblemProgress above).
  problems: Record<string, ProblemProgress>;
};

/** households/{hid}/profiles/{pid}/attempts/{id} */
export type AttemptDoc = {
  problemId: string;
  questId: string;
  answer: string; // the submitted answer, serialized for the parent view and portfolio
  correct: boolean;
  tryNumber: 1 | 2 | 3;
  hintTier: 0 | 1 | 2 | 3;
  ideaIds: string[];
  /** Knowing what you know (7 September 2026): how sure the child said they were before the
   * check, and, after a first-try miss, what kind of miss it was (lib/domain/calibration.ts). */
  confidence?: "sure" | "probably" | "guessing";
  missKind?: "misread" | "did-not-know" | "slipped";
  // Extension beyond spec 9's field list: whether this try was on a not-auto-graded (rubric)
  // problem, i.e. the worked explanation opened immediately rather than being earned. skills.ts's
  // pointsForStoredAttempt needs this to award zero points for a revealed try without re-deriving
  // it from the problem's answer kind, which this content-free module never looks up.
  revealed: boolean;
  // Task 10 fix (spec 7.2 "he can retry any problem"): true when this attempt was made during a
  // "Try it again" cycle rather than the problem's original one. skills.ts's
  // pointsForStoredAttempt scores every retry:true attempt at 0 regardless of correctness, so a
  // retry can never manufacture skill credit; it is still kept as evidence.
  retry: boolean;
  at: number;
};

/** households/{hid}/profiles/{pid}/reviewQueue/{problemId} */
export type ReviewQueueDoc = {
  dueAt: number; // ms, a scheduled future time, not "now" -- never serverTimestamp()
  variantSeed: number;
  misses: number;
};

export type SkillSource = "app" | "parent";

/** households/{hid}/profiles/{pid}/skills/{skillId} */
export type SkillDoc = {
  level: 1 | 2 | 3 | 4 | 5;
  points: number;
  evidence: string[];
  source: SkillSource;
};

export type ArtifactKind = "photo" | "code" | "recording" | "transcript" | "text";

/** households/{hid}/profiles/{pid}/artifacts/{id} */
export type ArtifactDoc = {
  kind: ArtifactKind;
  questId: string;
  week: number;
  storagePath: string;
  at: number;
  /** The uploaded file's MIME type (photo and recording uploads only; absent on text kinds and
   * on every doc written before recordings existed). A recording's playback element is chosen
   * from it: audio/* plays in <audio>, anything else in <video>. */
  contentType?: string;
};

/**
 * A Maker's Log or Speak log's answers (spec 8): five prompts for the "maker" variant, exactly
 * three for "speak" -- never padded to a fixed five slots, so a Speak log never carries prompts
 * the spec did not write. Three to five, not just "an array of strings", so a caller still gets
 * a compile error for an obviously wrong length (zero, one, or six-plus).
 */
export type LogAnswers =
  | [string, string, string]
  | [string, string, string, string]
  | [string, string, string, string, string];

/** households/{hid}/profiles/{pid}/logs/{id} */
export type LogDoc = {
  questId: string;
  answers: LogAnswers;
  transcript?: string;
  storagePath?: string;
  parentComment?: string;
  // Extension beyond spec 9's field list: not named in the spec's logs/{id} row, but needed to
  // order logs chronologically (portfolio, Showcase talk outline) and to build skills.ts's
  // StoredLog { questId, track, at } -- track is resolved by the app layer from questId, since
  // this module stays content-free.
  at: number;
};

/**
 * households/{hid}/profiles/{pid}/parentActivities/{id}. Not itself named in spec 9's
 * Firestore tree (the spec's collection list runs progress through resets), but spec 7.1/task
 * 13's "parent-entered activities: add a dated note against a skill (chess, piano)" needs a
 * durable home for lib/domain/skills.ts's ParentSkillEntry {skillId, note, at} so a note
 * survives a reload and is included every time skills recompute (a fresh attempt or a parent
 * reset), not only the one time it was added. skillId/note/at line up 1:1 with ParentSkillEntry.
 */
export type ParentActivityDoc = {
  skillId: string;
  note: string;
  at: number;
};

export type ResetScope = "problem" | "quest" | "week" | "season";

/** households/{hid}/profiles/{pid}/resets/{id} */
export type ResetDoc = {
  scope: ResetScope;
  targetId: string;
  byUid: string;
  at: number;
};

export type DebateSide = "for" | "against";

export type DebateRound = {
  childText: string;
  aiText: string;
};

export type DebateCoachCard = {
  strength: string;
  improvement: string;
  ideaName: string;
};

/** households/{hid}/profiles/{pid}/debates/{id} (spec 9; spec 10.2's debate opponent, spec
 * 7.1's Debate room). firestore.rules already names this collection under the household
 * wildcard match; Plan 3 (the AI routes) writes to it. Not exercised by Task 5's repositories,
 * which only cover progress/attempts/reviewQueue/skills/artifacts/logs/resets. */
export type DebateDoc = {
  motionId: string;
  motion: string;
  /** Absent until chosen, for a step whose side is "choose". */
  side?: DebateSide;
  /** Empty string until the steelman is accepted. */
  steelman: string;
  steelmanNote?: string;
  rounds: DebateRound[];
  /** The child's words for an open round, saved before the opponent has answered
   * (lib/domain/debate.ts), so a dropped reply never loses them. */
  pendingChildText?: string;
  coachCard?: DebateCoachCard;
  transcript: string;
  status: "in_progress" | "done";
  /** True when the debate was held out loud with a grown-up because the family's AI features are off. */
  offline?: boolean;
  questId: string;
  stepId: string;
  week: number;
  storagePath?: string;
  at: number;
  updatedAt: number;
};

/** households/{hid}/profiles/{pid}/screenTime/{yyyy-mm-dd} (Sprout) */
export type ScreenTimeDoc = {
  minutes: number;
};

/** One pen or eraser stroke in the working space (task 43). Points are normalized to the
 * canvas's own 0..1 width/height, not device pixels, so a stroke drawn on a phone-width canvas
 * still lines up correctly if it is ever redrawn at a different size (an iPad panel, a parent-
 * view thumbnail). "eraser" strokes are still real points, not a raster mask: PenCanvas replays
 * every stroke in order and paints an eraser stroke with a destination-out composite, so the
 * whole document -- including what got erased -- stays pure vector data end to end, never a
 * bitmap. */
export type Stroke = { tool: "pen" | "eraser"; points: { x: number; y: number }[] };

/**
 * households/{hid}/profiles/{pid}/workings/{problemId} (task 43, owner-approved "working
 * space"). One document per problem id -- not per attempt cycle -- so "Your working from last
 * time" on a mistake-box return is literally the same document a fresh attempt on the original
 * problem already wrote to; there is nothing to reconcile across a retry or a review variant.
 * Never required, never graded, carries no skill credit and is never read by anything that
 * scores an attempt (lib/domain/attempts.ts, lib/domain/skills.ts, lib/domain/review.ts never
 * import this file) -- purity here means the working space is free scratch space, the same way
 * a lesson beat (LessonPlayer.tsx) is free practice.
 */
export type WorkingDoc = {
  text: string;
  strokes: Stroke[];
  updatedAt: number; // ms, serverTimestamp() on write
};

// ---------------------------------------------------------------------------
// Timestamp coercion
// ---------------------------------------------------------------------------

/** Firestore Timestamp to ms. A pending (not yet acknowledged) serverTimestamp() reads back as
 * null; Date.now() is a reasonable local estimate until the write round-trips. */
function toMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return Date.now();
}

/**
 * Builds a FirestoreDataConverter that stamps the given fields with serverTimestamp() on write
 * and coerces them back to ms on read. A field is only stamped when it is both present AND not
 * undefined: a JS object literal can carry a key whose value is undefined (e.g. { startedAt:
 * undefined } from a spread of an optional field), and "field in out" alone is true for that
 * key even though there is nothing there to stamp -- checking presence without checking for
 * undefined silently turns "this quest was never started" into a real serverTimestamp(). This
 * still lets a partial merge patch that never mentions the field at all pass through untouched.
 */
function converterWithTimestamps<T extends Record<string, unknown>>(
  timestampFields: readonly (keyof T & string)[],
): FirestoreDataConverter<T> {
  return {
    toFirestore(data: T) {
      const out: Record<string, unknown> = { ...data };
      for (const field of timestampFields) {
        if (field in out && out[field] !== undefined) out[field] = serverTimestamp();
      }
      return out;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): T {
      const data = snapshot.data(options) as Record<string, unknown>;
      const out: Record<string, unknown> = { ...data };
      for (const field of timestampFields) {
        if (field in out && out[field] !== undefined) out[field] = toMillis(out[field]);
      }
      return out as T;
    },
  };
}

export const userConverter = converterWithTimestamps<UserDoc>([]);
export const householdConverter = converterWithTimestamps<HouseholdDoc>(["createdAt"]);
export const profileConverter = converterWithTimestamps<ProfileDoc>([]);
export const progressConverter = converterWithTimestamps<ProgressDoc>(["startedAt", "completedAt"]);
export const attemptConverter = converterWithTimestamps<AttemptDoc>(["at"]);
export const reviewItemConverter = converterWithTimestamps<ReviewQueueDoc>([]);
export const skillConverter = converterWithTimestamps<SkillDoc>([]);
export const artifactConverter = converterWithTimestamps<ArtifactDoc>(["at"]);
export const logConverter = converterWithTimestamps<LogDoc>(["at"]);
export const resetConverter = converterWithTimestamps<ResetDoc>(["at"]);
export const parentActivityConverter = converterWithTimestamps<ParentActivityDoc>(["at"]);
export const screenTimeConverter = converterWithTimestamps<ScreenTimeDoc>([]);
export const debateConverter = converterWithTimestamps<DebateDoc>(["at"]);
export const workingConverter = converterWithTimestamps<WorkingDoc>(["updatedAt"]);

// ---------------------------------------------------------------------------
// Path helpers (typed refs for whole-document reads/writes; raw doc(db, path) is used at call
// sites that need a FieldValue such as arrayUnion() or increment(), which a converter's
// declared AppModelType shape does not admit).
// ---------------------------------------------------------------------------

export const userPath = (uid: string) => `users/${uid}`;
export const householdPath = (hid: string) => `households/${hid}`;
export const profilesPath = (hid: string) => `households/${hid}/profiles`;
export const profilePath = (hid: string, pid: string) => `households/${hid}/profiles/${pid}`;
export const progressPath = (hid: string, pid: string) => `households/${hid}/profiles/${pid}/progress`;
export const progressDocPath = (hid: string, pid: string, questId: string) => `${progressPath(hid, pid)}/${questId}`;
export const attemptsPath = (hid: string, pid: string) => `households/${hid}/profiles/${pid}/attempts`;
export const reviewQueuePath = (hid: string, pid: string) => `households/${hid}/profiles/${pid}/reviewQueue`;
export const reviewItemDocPath = (hid: string, pid: string, problemId: string) =>
  `${reviewQueuePath(hid, pid)}/${problemId}`;
export const skillsPath = (hid: string, pid: string) => `households/${hid}/profiles/${pid}/skills`;
export const skillDocPath = (hid: string, pid: string, skillId: string) => `${skillsPath(hid, pid)}/${skillId}`;
export const artifactsPath = (hid: string, pid: string) => `households/${hid}/profiles/${pid}/artifacts`;
export const logsPath = (hid: string, pid: string) => `households/${hid}/profiles/${pid}/logs`;
export const resetsPath = (hid: string, pid: string) => `households/${hid}/profiles/${pid}/resets`;
export const parentActivitiesPath = (hid: string, pid: string) => `households/${hid}/profiles/${pid}/parentActivities`;
export const screenTimePath = (hid: string, pid: string) => `households/${hid}/profiles/${pid}/screenTime`;
export const debatesPath = (hid: string, pid: string) => `households/${hid}/profiles/${pid}/debates`;
export const workingsPath = (hid: string, pid: string) => `households/${hid}/profiles/${pid}/workings`;
export const workingDocPath = (hid: string, pid: string, problemId: string) => `${workingsPath(hid, pid)}/${problemId}`;

export const userRef = (db: Firestore, uid: string): DocumentReference<UserDoc> =>
  doc(db, userPath(uid)).withConverter(userConverter);
export const householdRef = (db: Firestore, hid: string): DocumentReference<HouseholdDoc> =>
  doc(db, householdPath(hid)).withConverter(householdConverter);
export const householdsCol = (db: Firestore): CollectionReference<HouseholdDoc> =>
  collection(db, "households").withConverter(householdConverter);
export const profilesCol = (db: Firestore, hid: string): CollectionReference<ProfileDoc> =>
  collection(db, profilesPath(hid)).withConverter(profileConverter);
export const profileRef = (db: Firestore, hid: string, pid: string): DocumentReference<ProfileDoc> =>
  doc(db, profilePath(hid, pid)).withConverter(profileConverter);
export const progressCol = (db: Firestore, hid: string, pid: string): CollectionReference<ProgressDoc> =>
  collection(db, progressPath(hid, pid)).withConverter(progressConverter);
export const progressRef = (db: Firestore, hid: string, pid: string, questId: string): DocumentReference<ProgressDoc> =>
  doc(db, progressDocPath(hid, pid, questId)).withConverter(progressConverter);
export const attemptsCol = (db: Firestore, hid: string, pid: string): CollectionReference<AttemptDoc> =>
  collection(db, attemptsPath(hid, pid)).withConverter(attemptConverter);
export const reviewQueueCol = (db: Firestore, hid: string, pid: string): CollectionReference<ReviewQueueDoc> =>
  collection(db, reviewQueuePath(hid, pid)).withConverter(reviewItemConverter);
export const reviewItemRef = (
  db: Firestore, hid: string, pid: string, problemId: string,
): DocumentReference<ReviewQueueDoc> => doc(db, reviewItemDocPath(hid, pid, problemId)).withConverter(reviewItemConverter);
export const skillsCol = (db: Firestore, hid: string, pid: string): CollectionReference<SkillDoc> =>
  collection(db, skillsPath(hid, pid)).withConverter(skillConverter);
export const skillRef = (db: Firestore, hid: string, pid: string, skillId: string): DocumentReference<SkillDoc> =>
  doc(db, skillDocPath(hid, pid, skillId)).withConverter(skillConverter);
export const artifactsCol = (db: Firestore, hid: string, pid: string): CollectionReference<ArtifactDoc> =>
  collection(db, artifactsPath(hid, pid)).withConverter(artifactConverter);
export const artifactRef = (db: Firestore, hid: string, pid: string, id: string): DocumentReference<ArtifactDoc> =>
  doc(db, `${artifactsPath(hid, pid)}/${id}`).withConverter(artifactConverter);
export const logsCol = (db: Firestore, hid: string, pid: string): CollectionReference<LogDoc> =>
  collection(db, logsPath(hid, pid)).withConverter(logConverter);
export const logRef = (db: Firestore, hid: string, pid: string, id: string): DocumentReference<LogDoc> =>
  doc(db, `${logsPath(hid, pid)}/${id}`).withConverter(logConverter);
export const resetsCol = (db: Firestore, hid: string, pid: string): CollectionReference<ResetDoc> =>
  collection(db, resetsPath(hid, pid)).withConverter(resetConverter);
export const screenTimeRef = (db: Firestore, hid: string, pid: string, dateId: string): DocumentReference<ScreenTimeDoc> =>
  doc(db, `${screenTimePath(hid, pid)}/${dateId}`).withConverter(screenTimeConverter);
export const debatesCol = (db: Firestore, hid: string, pid: string): CollectionReference<DebateDoc> =>
  collection(db, debatesPath(hid, pid)).withConverter(debateConverter);
export const debateRef = (db: Firestore, hid: string, pid: string, id: string): DocumentReference<DebateDoc> =>
  doc(db, `${debatesPath(hid, pid)}/${id}`).withConverter(debateConverter);
export const parentActivitiesCol = (db: Firestore, hid: string, pid: string): CollectionReference<ParentActivityDoc> =>
  collection(db, parentActivitiesPath(hid, pid)).withConverter(parentActivityConverter);
export const workingsCol = (db: Firestore, hid: string, pid: string): CollectionReference<WorkingDoc> =>
  collection(db, workingsPath(hid, pid)).withConverter(workingConverter);
export const workingRef = (db: Firestore, hid: string, pid: string, problemId: string): DocumentReference<WorkingDoc> =>
  doc(db, workingDocPath(hid, pid, problemId)).withConverter(workingConverter);
