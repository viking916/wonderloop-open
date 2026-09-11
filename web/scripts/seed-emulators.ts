// Seeds the Firestore emulator with a household, three profiles and a little real progress, so
// `npm run dev` has something to look at without a manual click-through. Emulator-only (refuses
// to run against a real project).
//
// "Idempotent" here means content-idempotent, not just id-stable: every document has a fixed
// id (as before) AND every timestamp is derived from a fixed base -- the Monday of the current
// week at 09:00 local, plus fixed offsets -- rather than from Date.now(), so the exact same
// document content is computed on every run. Each write is also skipped when the existing
// document already matches byte-for-byte (see upsert() below), so a second run performs no
// Firestore writes at all; only the calendar week changing (a new Monday) changes what gets
// written.
//
// Uses firebase-admin (bypasses firestore.rules, as admin.ts's own comment says scripts should)
// plus the same pure content and domain modules the app uses (lib/content/load.ts,
// lib/domain/completion.ts, lib/domain/review.ts, lib/domain/skills.ts, and
// lib/data/progress.ts's buildProgressDoc, which is pure -- it never calls getDb()), so the
// seeded progress, review-queue item and skill levels are computed the same way the real app
// would compute them, not hand-typed numbers that could drift out of sync with the rules those
// modules encode.

import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import zlib from "node:zlib";
import { getAdminDb, getAdminStorage } from "../lib/firebase/admin";
import { EXPECT_WEEKS, getQuest, loadContent, problemsOf } from "../lib/content/load";
import { emptyQuestProgress, type QuestProgress } from "../lib/domain/completion";
import { scheduleOnMiss } from "../lib/domain/review";
import { recomputeFromAttempts, type StoredAttempt, type StoredLog } from "../lib/domain/skills";
import { buildProgressDoc } from "../lib/data/progress";
import type { Problem } from "../lib/content/schema";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Refusing to seed: FIRESTORE_EMULATOR_HOST is not set. Seeding is emulator-only.");
  process.exit(1);
}

const db = getAdminDb();

const HID = "home";
const OWNER_UID = "seed-parent-uid";
const PARENT_PID = "parent";
const EXPLORER_PID = "explorer";
const SPROUT_PID = "sprout";

// Task 3b: the address the Auth emulator's mock Google account signs in as locally. Without
// this document, firestore.rules' emailAllowed() gate locks the developer using this app right
// now out of their own local household the moment the rules change lands.
const LOCAL_PARENT_EMAIL = "parent@wonderloop.test";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The Monday of the current week at 09:00 local -- the fixed base every seeded timestamp is
 * an offset from, so the whole document tree is the same on every run within the same week. */
function mondayAt9am(now = new Date()): Date {
  const day = now.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
  monday.setHours(9, 0, 0, 0);
  return monday;
}

function toDateId(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripUndefinedDeep(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}

const counts = { created: 0, updated: 0, unchanged: 0 };

/** Writes data to path only if it differs from what is already there (a full, non-merge set,
 * so a run that drops a field a previous run wrote actually removes it too). Reports what it
 * did in `counts` for the summary printed at the end. */
async function upsert(docPath: string, data: Record<string, unknown>): Promise<void> {
  const clean = stripUndefinedDeep(data);
  const ref = db.doc(docPath);
  const existing = await ref.get();
  if (existing.exists && isDeepStrictEqual(existing.data(), clean)) {
    counts.unchanged++;
    return;
  }
  await ref.set(clean);
  counts[existing.exists ? "updated" : "created"]++;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/**
 * A real, valid, solid-colour PNG -- built by hand (PNG signature, IHDR, one zlib-deflated IDAT
 * of uncompressed-per-row scanlines, IEND; `node:zlib` is the only dependency, no image library
 * needed for a one-colour fill) rather than pulled from a package this repo does not otherwise
 * depend on. A 1x1 pixel would already satisfy Storage and stop the 404 (task 24's actual bug),
 * but `.tr-spread__photo` (app/globals.css) has no explicit width/height, only max-width/
 * max-height -- an `<img>` with no CSS size renders at its own intrinsic size, so a 1x1 source
 * would sit in the portfolio as a literal 1x1 dot, invisible against the page, which trades one
 * silent failure (a 404) for another (a photo artifact that looks like no photo is there at
 * all). 640x480 with real width and height gives the object-fit: contain box in that CSS
 * something to actually contain.
 */
function solidColorPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB, no alpha
  ihdr[10] = 0; // compression method (the only one PNG defines)
  ihdr[11] = 0; // filter method (the only one PNG defines)
  ihdr[12] = 0; // interlace: none
  const rowSize = 1 + width * 3;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowSize; // byte 0 of each row is its filter type; 0 = "none"
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 3;
      raw[px] = rgb[0];
      raw[px + 1] = rgb[1];
      raw[px + 2] = rgb[2];
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

// This app's own --moss (app/globals.css), not a fixture the app parses -- just something a
// browser can actually decode and a person can actually see, so the seeded photo artifact is a
// real photo instead of a Firestore doc pointing at a Storage object that was never written.
const PLACEHOLDER_PHOTO = solidColorPng(640, 480, [107, 143, 90]);

/**
 * Uploads that placeholder to Storage at `storagePath` if nothing is there yet -- the seeded
 * artifact doc's own `storagePath` field, written by `upsert` above, only ever pointed at a
 * document; without a matching object in Storage, the portfolio's own `getDownloadURL` 404s the
 * instant it tries to show this "photo" (task 24). Existence-checked rather than unconditionally
 * overwritten so a second `npm run seed` performs no Storage writes either, matching `upsert`'s
 * own idempotency.
 */
async function upsertPlaceholderPhoto(storagePath: string): Promise<void> {
  const file = getAdminStorage().bucket().file(storagePath);
  const [exists] = await file.exists();
  if (exists) return;
  await file.save(PLACEHOLDER_PHOTO, { contentType: "image/png" });
}

async function main() {
  const contentRoot = path.resolve(process.argv[2] ?? "../content");
  const loaded = loadContent(contentRoot, { expectWeeks: EXPECT_WEEKS });
  if (!loaded.ok || !loaded.content) {
    console.error(`Refusing to seed: content failed to load from ${contentRoot}`);
    for (const e of loaded.errors) console.error(`  ${e.file} :: ${e.path}: ${e.message}`);
    process.exit(1);
  }
  const content = loaded.content;

  const buildQuest = getQuest(content, "s1-w01-build");
  const thinkQuest = getQuest(content, "s1-w01-think");
  if (!buildQuest || !thinkQuest) throw new Error("Season 1 week 1 build/think quests not found in content");

  const skillsForProblem = (problemId: string): string[] => {
    for (const quest of content.quests) {
      for (const step of quest.steps) {
        for (const p of problemsOf(step)) if (p.id === problemId) return p.skills;
      }
    }
    return [];
  };

  const base = mondayAt9am();
  const baseMs = base.getTime();
  const startDate = toDateId(base);
  const createdIds: string[] = [];

  // -------------------------------------------------------------------------------------------
  // Allowlist (Task 3b). Written before the household below, so a fresh emulator (rules
  // already gating on it) never has a moment where the seeded household exists but the local
  // sign-in address does not yet have access to it.
  // -------------------------------------------------------------------------------------------

  await upsert(`allowedEmails/${LOCAL_PARENT_EMAIL}`, {
    note: "Local dev: the Auth emulator's mock Google account", addedAt: baseMs,
  });
  createdIds.push(`allowedEmails/${LOCAL_PARENT_EMAIL}`);

  // -------------------------------------------------------------------------------------------
  // Household and profiles
  // -------------------------------------------------------------------------------------------

  await upsert(`households/${HID}`, {
    name: "Home", ownerUid: OWNER_UID, memberUids: [OWNER_UID], inviteCode: "HOME01", createdAt: baseMs,
  });
  await upsert(`users/${OWNER_UID}`, { displayName: "Parent", householdIds: [HID] });
  createdIds.push(`households/${HID}`);

  await upsert(`households/${HID}/profiles/${PARENT_PID}`, {
    name: "Parent", kind: "parent", avatar: "owl", birthYear: 1985, seasonId: 1, startDate, look: "trail",
  });
  await upsert(`households/${HID}/profiles/${EXPLORER_PID}`, {
    name: "Explorer", kind: "explorer", avatar: "fox", birthYear: 2017, seasonId: 1, startDate, look: "trail",
    // The Play track on, so the UI gate photographs the four-card week (lib/domain/tracks.ts).
    playTrack: true,
  });
  await upsert(`households/${HID}/profiles/${SPROUT_PID}`, {
    name: "Sprout", kind: "sprout", avatar: "rabbit", birthYear: 2023, seasonId: 1, startDate, look: "trail",
  });
  createdIds.push(
    `households/${HID}/profiles/${PARENT_PID}`,
    `households/${HID}/profiles/${EXPLORER_PID}`,
    `households/${HID}/profiles/${SPROUT_PID}`,
  );

  // -------------------------------------------------------------------------------------------
  // Week 1 Build: done, with an artifact and a Maker's Log. Fixed anchor: the Wednesday before
  // this week's Monday, at 09:00 (base - 5 days), representing "finished earlier this cycle".
  // -------------------------------------------------------------------------------------------

  const buildLogAt = baseMs - 5 * DAY_MS;
  const buildQuestProgress: QuestProgress = {
    ...emptyQuestProgress(),
    ticks: buildQuest.steps.filter((s) => ["instruction", "science", "task", "typing"].includes(s.kind)).map((s) => ({ stepId: s.id, done: true })),
    artifacts: Object.fromEntries(buildQuest.steps.filter((s) => s.kind === "artifact").map((s) => [s.id, ["photo"]])),
    logs: buildQuest.steps.filter((s) => s.kind === "log").map((s) => s.id),
  };
  await upsert(
    `households/${HID}/profiles/${EXPLORER_PID}/progress/${buildQuest.id}`,
    buildProgressDoc(buildQuest, buildQuestProgress, { startedAt: buildLogAt - HOUR_MS, completedAt: buildLogAt, problems: {} }),
  );

  const artifactId = "seed-build-artifact";
  const artifactStoragePath = `households/${HID}/profiles/${EXPLORER_PID}/artifacts/${artifactId}`;
  await upsert(`households/${HID}/profiles/${EXPLORER_PID}/artifacts/${artifactId}`, {
    kind: "photo",
    questId: buildQuest.id,
    week: 1,
    storagePath: artifactStoragePath,
    at: buildLogAt,
  });
  await upsertPlaceholderPhoto(artifactStoragePath);

  const buildLogId = "seed-build-log";
  const buildLog: StoredLog = { questId: buildQuest.id, track: "build", at: buildLogAt };
  await upsert(`households/${HID}/profiles/${EXPLORER_PID}/logs/${buildLogId}`, {
    questId: buildQuest.id,
    answers: [
      "A micro:bit badge that scrolls my name and shows a heart, then my own picture on button A.",
      "I dragged an on-start block to show my name, a forever block to make the heart beat, and an on-button-A block to show my own picture.",
      "The show-icon block for the small heart was outside the forever loop at first, so it only beat once.",
      "I dragged it inside the forever loop and it started beating properly, then I checked it on the battery pack.",
      "Next time I would test on the battery pack sooner instead of only over USB. I used the loop idea.",
    ],
    at: buildLogAt,
  });
  createdIds.push(
    `households/${HID}/profiles/${EXPLORER_PID}/progress/${buildQuest.id}`,
    `households/${HID}/profiles/${EXPLORER_PID}/artifacts/${artifactId}`,
    `households/${HID}/profiles/${EXPLORER_PID}/logs/${buildLogId}`,
  );

  // -------------------------------------------------------------------------------------------
  // Week 1 Think: half-answered, with one wrong first try (so the mistake box has an item).
  // Fixed anchor: this week's Monday at noon (base + 3 hours).
  // -------------------------------------------------------------------------------------------

  const allThinkProblems: Problem[] = thinkQuest.steps.flatMap(problemsOf);
  const ANSWERED_COUNT = Math.ceil(allThinkProblems.length / 2);
  const answered = allThinkProblems.slice(0, ANSWERED_COUNT);
  const missedProblem = answered[answered.length - 1]; // the last one answered: wrong first try, correct second try

  const attemptsBase = baseMs + 3 * HOUR_MS;
  const storedAttempts: StoredAttempt[] = [];
  const attemptDocs: Array<{ id: string; doc: Record<string, unknown> }> = [];
  const problemsProgress: Record<string, { firstSeenAt: number; whatYouTried?: string; revealedAt?: number }> = {};

  answered.forEach((problem, i) => {
    const firstSeenAt = attemptsBase + i * 60_000;
    problemsProgress[problem.id] = { firstSeenAt };
    const wrongAnswerIndex = problem.answer.kind === "choice" ? (problem.answer.index + 1) % (problem.options?.length ?? 3) : undefined;

    if (problem.id === missedProblem.id) {
      const wrongAt = firstSeenAt + 5_000;
      const correctAt = wrongAt + 45_000; // the 45 s cooldown (spec 7.3)
      const wrongAttempt: StoredAttempt = { problemId: problem.id, questId: thinkQuest.id, correct: false, tryNumber: 1, hintTier: 0, revealed: false, retry: false, at: wrongAt };
      const correctAttempt: StoredAttempt = { problemId: problem.id, questId: thinkQuest.id, correct: true, tryNumber: 2, hintTier: 1, revealed: false, retry: false, at: correctAt };
      storedAttempts.push(wrongAttempt, correctAttempt);
      attemptDocs.push(
        { id: `${problem.id}-try1`, doc: { ...wrongAttempt, answer: wrongAnswerIndex !== undefined ? String(wrongAnswerIndex) : "wrong", ideaIds: [problem.ideaId] } },
        { id: `${problem.id}-try2`, doc: { ...correctAttempt, answer: answerToString(problem), ideaIds: [problem.ideaId] } },
      );
    } else {
      const correctAttempt: StoredAttempt = { problemId: problem.id, questId: thinkQuest.id, correct: true, tryNumber: 1, hintTier: 0, revealed: false, retry: false, at: firstSeenAt + 5_000 };
      storedAttempts.push(correctAttempt);
      attemptDocs.push({ id: `${problem.id}-try1`, doc: { ...correctAttempt, answer: answerToString(problem), ideaIds: [problem.ideaId] } });
    }
  });

  for (const { id, doc } of attemptDocs) {
    await upsert(`households/${HID}/profiles/${EXPLORER_PID}/attempts/${id}`, doc);
  }
  createdIds.push(...attemptDocs.map(({ id }) => `households/${HID}/profiles/${EXPLORER_PID}/attempts/${id}`));

  // Mistake box: scheduleOnMiss (lib/domain/review.ts) at the moment of the wrong first try.
  const missedAt = storedAttempts.find((a) => a.problemId === missedProblem.id && a.tryNumber === 1)!.at;
  const reviewItem = scheduleOnMiss(missedProblem.id, undefined, missedAt);
  await upsert(`households/${HID}/profiles/${EXPLORER_PID}/reviewQueue/${missedProblem.id}`, {
    dueAt: reviewItem.dueAt, variantSeed: reviewItem.variantSeed, misses: reviewItem.misses,
  });
  createdIds.push(`households/${HID}/profiles/${EXPLORER_PID}/reviewQueue/${missedProblem.id}`);

  const thinkQuestProgress: QuestProgress = {
    ...emptyQuestProgress(),
    problemOutcomes: Object.fromEntries(answered.map((p) => [p.id, "correct" as const])),
  };
  await upsert(
    `households/${HID}/profiles/${EXPLORER_PID}/progress/${thinkQuest.id}`,
    buildProgressDoc(thinkQuest, thinkQuestProgress, { startedAt: attemptsBase, problems: problemsProgress }),
  );
  createdIds.push(`households/${HID}/profiles/${EXPLORER_PID}/progress/${thinkQuest.id}`);

  // Skills: recomputed from the attempts and the build log exactly as the app would (spec 3, 8).
  const skills = recomputeFromAttempts(storedAttempts, [buildLog], [], skillsForProblem);
  for (const s of skills) {
    await upsert(`households/${HID}/profiles/${EXPLORER_PID}/skills/${s.skillId}`, {
      level: s.level, points: s.points, evidence: s.evidence, source: "app",
    });
  }
  createdIds.push(...skills.map((s) => `households/${HID}/profiles/${EXPLORER_PID}/skills/${s.skillId}`));

  // -------------------------------------------------------------------------------------------
  // Two Sprout stars (spec 6: each tablet activity ends with a star; represented here as a
  // completed progress document, one per starred activity, the same collection an Explorer
  // quest's progress lives in). Fixed anchor: this week's Monday at 09:05 / 09:10.
  // -------------------------------------------------------------------------------------------

  const sproutActivities = ["sprout-w01-a1", "sprout-w01-a2"];
  for (const [i, activityId] of sproutActivities.entries()) {
    const completedAt = baseMs + (5 + i * 5) * 60_000;
    await upsert(`households/${HID}/profiles/${SPROUT_PID}/progress/${activityId}`, {
      status: "done", stepIndex: 0, problemIndex: 0, minutes: 5,
      startedAt: completedAt - 60_000, completedAt, quest: emptyQuestProgress(), problems: {},
    });
    createdIds.push(`households/${HID}/profiles/${SPROUT_PID}/progress/${activityId}`);
  }

  console.log("Seeded:");
  for (const id of createdIds) console.log(`  ${id}`);
  console.log(`\nWrites this run: ${counts.created} created, ${counts.updated} updated, ${counts.unchanged} unchanged (of ${createdIds.length} documents)`);
  console.log(`Mistake box item: ${missedProblem.id} (due ${new Date(reviewItem.dueAt).toISOString().slice(0, 10)})`);
  console.log(`Think progress: ${answered.length}/${allThinkProblems.length} problems answered`);
  console.log(`Skills written: ${skills.map((s) => `${s.skillId}=L${s.level}(${s.points}pt)`).join(", ")}`);
}

function answerToString(problem: Problem): string {
  const a = problem.answer;
  if (a.kind === "number") return a.value;
  if (a.kind === "choice") return String(a.index);
  if (a.kind === "boolean") return String(a.value);
  if (a.kind === "order") return a.order.join(",");
  if (a.kind === "grid") return "grid";
  return "text";
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
