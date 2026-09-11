import { describe, it, beforeAll, afterAll } from "vitest";
import {
  initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import path from "node:path";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, deleteDoc, where, writeBatch, type Firestore } from "firebase/firestore";
import { signInWithCustomToken } from "firebase/auth";
import { getClientAuth, getDb } from "../lib/firebase/client";
import { attemptsCol, progressRef, resetsCol, skillsCol } from "../lib/data/types";
import { createHousehold } from "../lib/data/households";
import { resetSeason, type ResetSkillInputs } from "../lib/data/resets";
import { buildProgressDoc, saveQuestProgress, watchProgress } from "../lib/data/progress";
import { emptyQuestProgress, isStepComplete, type QuestProgress } from "../lib/domain/completion";
import { EXPECT_WEEKS, getQuest, loadContent } from "../lib/content/load";
import { EMULATOR_PORTS } from "../lib/firebase/emulator-ports.mjs";

// Task 5's rules-test brief (task-5-brief.md Step 1): a member reads/writes their household's
// profile progress; a non-member is denied read and write on the same paths; a member of
// household A is denied on household B; an unauthenticated request is denied everywhere;
// users/{uid} is private to that uid; a member can write an artifact document but not a
// document under another household's path; plus the allow-create path for a first sign-in.
//
// firestore.rules already exists (Task 2, independently reviewed with 20 assertions), so these
// are expected to pass unmodified; this file exists to prove it and to guard against a future
// regression.
//
// This file also carries the data-layer behaviour that only a live emulator can prove: that
// resets.ts actually chunks around Firestore's 500-operation batch cap (below, "resets.ts:
// chunked batch commits"), and that a full ProgressDoc round-trips through progress.ts without
// losing any of the QuestProgress state a Quest screen depends on (below, "progress.ts: full
// QuestProgress round-trip"). Those two describe blocks use the real client SDK
// (lib/firebase/client.ts's getDb()/getClientAuth(), signed in via a real allowlisted identity
// -- see signInAsAllowlistedUser below), not the rules-unit-testing environment above, since
// they exercise the actual repository functions the app calls, not just the rules.
//
// Task 3b: households/{hid} `create`, and everything isMember() gates beneath it, now also
// requires the signed-in address to have its own allowedEmails document. Every uid this file
// signs in as as a *succeeding* case (alice, carol, dave -- see the "allow create is denied"
// test's own note, and the real-client-SDK identities below) is allowlisted below for exactly
// that reason; eve and bob are deliberately left off so the existing "denied" tests keep
// meaning what they say.

let env: RulesTestEnvironment;

const HOUSEHOLD_A = "hh-a";
const HOUSEHOLD_B = "hh-b";
const PROFILE_A1 = "pid-a1";

// rules-unit-testing lets a context's token carry arbitrary claims (its second argument), so
// these are real (fake) email addresses on the token, not just a uid -- exactly what
// request.auth.token.email reads in firestore.rules. alice/carol/dave are the identities every
// existing "succeeds" test signs in as; their allowedEmails docs are seeded in beforeAll below.
const EMAIL_FOR_UID: Record<string, string> = {
  alice: "alice@example.test",
  carol: "carol@example.test",
  dave: "dave@example.test",
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "wonderloop-rules-test",
    firestore: {
      rules: readFileSync("../firestore.rules", "utf8"),
      host: "localhost",
      port: EMULATOR_PORTS.firestore,
    },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `households/${HOUSEHOLD_A}`), {
      name: "Home", ownerUid: "alice", memberUids: ["alice"], inviteCode: "AAAAAA", createdAt: 1,
    });
    await setDoc(doc(db, `households/${HOUSEHOLD_B}`), {
      name: "Other House", ownerUid: "bob", memberUids: ["bob"], inviteCode: "BBBBBB", createdAt: 1,
    });
    await setDoc(doc(db, `households/${HOUSEHOLD_A}/profiles/${PROFILE_A1}`), {
      name: "Explorer", kind: "explorer", avatar: "fox", birthYear: 2017, seasonId: 1, startDate: "2026-09-07", look: "trail",
    });
    await setDoc(doc(db, `households/${HOUSEHOLD_A}/profiles/${PROFILE_A1}/progress/s1-w01-build`), {
      status: "in_progress", stepIndex: 0, problemIndex: 0, minutes: 60, problems: {},
    });
    await setDoc(doc(db, `households/${HOUSEHOLD_A}/profiles/${PROFILE_A1}/artifacts/art1`), {
      kind: "photo", questId: "s1-w01-build", week: 1, storagePath: "x", at: 1,
    });
    await setDoc(doc(db, "users/alice"), { displayName: "Alice", householdIds: [HOUSEHOLD_A] });
    for (const email of Object.values(EMAIL_FOR_UID)) {
      await setDoc(doc(db, `allowedEmails/${email}`), { note: "rules.test.ts fixture", addedAt: 1 });
    }
  });
});
afterAll(async () => { await env.cleanup(); });

function ctxFor(uid: string | null) {
  if (!uid) return env.unauthenticatedContext().firestore();
  const email = EMAIL_FOR_UID[uid];
  return env.authenticatedContext(uid, email ? { email } : undefined).firestore();
}

describe("firestore rules: households and profile progress", () => {
  it("a member reads and writes their household's profile progress", async () => {
    const alice = ctxFor("alice");
    await assertSucceeds(getDoc(doc(alice, `households/${HOUSEHOLD_A}/profiles/${PROFILE_A1}/progress/s1-w01-build`)));
    await assertSucceeds(setDoc(
      doc(alice, `households/${HOUSEHOLD_A}/profiles/${PROFILE_A1}/progress/s1-w01-build`),
      { status: "done", stepIndex: 5, problemIndex: 0, minutes: 60, problems: {} },
    ));
  });

  // Task 43: the working space's storage path (households/{hid}/profiles/{pid}/workings/
  // {problemId}) is not named anywhere in firestore.rules -- it is covered by the household's
  // own `match /{document=**}` wildcard, the same way attempts/reviewQueue/skills/logs already
  // are. These two prove that is actually true rather than assumed, and guard against a future
  // rules edit narrowing that wildcard without anyone noticing this path stopped working.
  it("a member reads and writes their household's own working documents", async () => {
    const alice = ctxFor("alice");
    const workingRefPath = `households/${HOUSEHOLD_A}/profiles/${PROFILE_A1}/workings/s1-w01-think-01-p01`;
    await assertSucceeds(setDoc(doc(alice, workingRefPath), { text: "3/4 plus 1/4", strokes: [], updatedAt: 1 }));
    await assertSucceeds(getDoc(doc(alice, workingRefPath)));
  });

  // 6 September 2026: the family's AI key sits under households/{hid}/private, a subtree the
  // household wildcard must not cover. A member can neither read nor write it.
  it("a member is denied read and write on their own household's private subtree", async () => {
    const alice = ctxFor("alice");
    await assertFails(getDoc(doc(alice, `households/${HOUSEHOLD_A}/private/ai`)));
    await assertFails(setDoc(doc(alice, `households/${HOUSEHOLD_A}/private/ai`), { enc: "none", key: "sk-ant-x" }));
  });

  it("a non-member is denied read and write on another household's working documents", async () => {
    const eve = ctxFor("eve");
    const workingRefPath = `households/${HOUSEHOLD_A}/profiles/${PROFILE_A1}/workings/s1-w01-think-01-p01`;
    await assertFails(getDoc(doc(eve, workingRefPath)));
    await assertFails(setDoc(doc(eve, workingRefPath), { text: "snooping", strokes: [], updatedAt: 1 }));
  });

  it("a non-member is denied read and write on the same paths", async () => {
    const eve = ctxFor("eve");
    await assertFails(getDoc(doc(eve, `households/${HOUSEHOLD_A}/profiles/${PROFILE_A1}/progress/s1-w01-build`)));
    await assertFails(setDoc(
      doc(eve, `households/${HOUSEHOLD_A}/profiles/${PROFILE_A1}/progress/s1-w01-build`),
      { status: "done", stepIndex: 5, problemIndex: 0, minutes: 60, problems: {} },
    ));
  });

  it("a member of household A is denied on household B", async () => {
    const alice = ctxFor("alice");
    await assertFails(getDoc(doc(alice, `households/${HOUSEHOLD_B}`)));
    await assertFails(updateDoc(doc(alice, `households/${HOUSEHOLD_B}`), { name: "hijacked" }));
    await assertFails(getDoc(doc(alice, `households/${HOUSEHOLD_B}/profiles/whatever/progress/x`)));
  });

  it("an unauthenticated request is denied everywhere", async () => {
    const anon = ctxFor(null);
    await assertFails(getDoc(doc(anon, `households/${HOUSEHOLD_A}`)));
    await assertFails(getDoc(doc(anon, `households/${HOUSEHOLD_A}/profiles/${PROFILE_A1}/progress/s1-w01-build`)));
    await assertFails(getDoc(doc(anon, "users/alice")));
    await assertFails(setDoc(doc(anon, `households/${HOUSEHOLD_A}/profiles/${PROFILE_A1}/artifacts/anon-drop`), { kind: "text" }));
  });

  it("users/{uid} is private to that uid", async () => {
    const alice = ctxFor("alice");
    const eve = ctxFor("eve");
    await assertSucceeds(getDoc(doc(alice, "users/alice")));
    await assertFails(getDoc(doc(eve, "users/alice")));
    await assertFails(setDoc(doc(eve, "users/alice"), { displayName: "hijacked", householdIds: [] }));
    await assertSucceeds(setDoc(doc(alice, "users/alice"), { displayName: "Alice A.", householdIds: [HOUSEHOLD_A] }));
  });

  it("a member can write an artifact document but not one under another household's path", async () => {
    const alice = ctxFor("alice");
    await assertSucceeds(setDoc(
      doc(alice, `households/${HOUSEHOLD_A}/profiles/${PROFILE_A1}/artifacts/art2`),
      { kind: "text", questId: "s1-w01-build", week: 1, storagePath: "y", at: 2 },
    ));
    await assertFails(setDoc(
      doc(alice, `households/${HOUSEHOLD_B}/profiles/${PROFILE_A1}/artifacts/art3`),
      { kind: "text", questId: "s1-w01-build", week: 1, storagePath: "y", at: 2 },
    ));
  });

  it("allow create: a first sign-in creates its own household, naming itself owner and sole member", async () => {
    const carol = ctxFor("carol");
    await assertSucceeds(setDoc(doc(carol, "households/hh-carol"), {
      name: "Carol's House", ownerUid: "carol", memberUids: ["carol"], inviteCode: "CCCCCC", createdAt: 3,
    }));
    // Carol can then read and write beneath the household she just created.
    await assertSucceeds(getDoc(doc(carol, "households/hh-carol")));
  });

  it("allow create is denied when the creator does not name itself owner and sole member", async () => {
    const dave = ctxFor("dave");
    await assertFails(setDoc(doc(dave, "households/hh-dave-bad-owner"), {
      name: "Not Dave's House", ownerUid: "someone-else", memberUids: ["dave"], inviteCode: "DDDDDD", createdAt: 3,
    }));
    await assertFails(setDoc(doc(dave, "households/hh-dave-not-member"), {
      name: "Dave's House", ownerUid: "dave", memberUids: ["someone-else"], inviteCode: "EEEEEE", createdAt: 3,
    }));
  });

  it("a non-member cannot delete another household's document", async () => {
    const eve = ctxFor("eve");
    await assertFails(deleteDoc(doc(eve, `households/${HOUSEHOLD_A}`)));
  });
});

// ---------------------------------------------------------------------------------------------
// Task 3b: the allowlist gate itself. "Authentication stays open; authorisation is the gate" --
// these five prove the gate holds even for an address that is otherwise a legitimate member.
// ---------------------------------------------------------------------------------------------

describe("firestore rules: allowedEmails (Task 3b)", () => {
  it("an allowlisted address may create its own household", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      // Doc id is the lowercased address; the token below carries a mixed-case one, so this
      // also proves the rule actually calls .lower() on request.auth.token.email rather than
      // comparing it verbatim.
      await setDoc(doc(ctx.firestore(), "allowedEmails/frank@example.test"), { note: "test", addedAt: 1 });
    });
    const frank = env.authenticatedContext("frank", { email: "Frank@Example.TEST" }).firestore();
    await assertSucceeds(setDoc(doc(frank, "households/hh-frank"), {
      name: "Frank's House", ownerUid: "frank", memberUids: ["frank"], inviteCode: "FFFFFF", createdAt: 5,
    }));
    await assertSucceeds(getDoc(doc(frank, "households/hh-frank")));
  });

  it("a non-allowlisted address may not create a household", async () => {
    const gina = env.authenticatedContext("gina", { email: "gina@example.test" }).firestore();
    await assertFails(setDoc(doc(gina, "households/hh-gina"), {
      name: "Gina's House", ownerUid: "gina", memberUids: ["gina"], inviteCode: "GGGGGG", createdAt: 5,
    }));
  });

  it("a non-allowlisted address may not read a household it is somehow a member of", async () => {
    const hid = "hh-orphan-member";
    await env.withSecurityRulesDisabled(async (ctx) => {
      // Admin-written directly (bypassing rules), the way an ordinary bug or a stale invite
      // join could leave uid "harold" listed as a member without harold's address ever having
      // been allowlisted. Membership alone must not be enough.
      await setDoc(doc(ctx.firestore(), `households/${hid}`), {
        name: "Orphan", ownerUid: "harold", memberUids: ["harold"], inviteCode: "HHHHHH", createdAt: 5,
      });
    });
    const harold = env.authenticatedContext("harold", { email: "harold@example.test" }).firestore();
    await assertFails(getDoc(doc(harold, `households/${hid}`)));
    await assertFails(updateDoc(doc(harold, `households/${hid}`), { name: "hijacked" }));
  });

  it("a user may read their own allowlist document but not someone else's", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "allowedEmails/ivy@example.test"), { note: "test", addedAt: 1 });
      await setDoc(doc(ctx.firestore(), "allowedEmails/jack@example.test"), { note: "test", addedAt: 1 });
    });
    const ivy = env.authenticatedContext("ivy", { email: "ivy@example.test" }).firestore();
    await assertSucceeds(getDoc(doc(ivy, "allowedEmails/ivy@example.test")));
    await assertFails(getDoc(doc(ivy, "allowedEmails/jack@example.test")));
    // Never leaks the list itself, even to an allowlisted reader.
    await assertFails(getDocs(collection(ivy, "allowedEmails")));
  });

  it("no client may write allowedEmails, even for an allowlisted address", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "allowedEmails/karl@example.test"), { note: "test", addedAt: 1 });
    });
    const karl = env.authenticatedContext("karl", { email: "karl@example.test" }).firestore();
    await assertFails(setDoc(doc(karl, "allowedEmails/karl@example.test"), { note: "hijacked", addedAt: 2 }));
    await assertFails(updateDoc(doc(karl, "allowedEmails/karl@example.test"), { note: "hijacked" }));
    await assertFails(deleteDoc(doc(karl, "allowedEmails/karl@example.test")));
    await assertFails(setDoc(doc(karl, "allowedEmails/newperson@example.test"), { note: "self-added", addedAt: 2 }));
  });
});

// ---------------------------------------------------------------------------------------------
// Real-client-SDK tests: signed in via the Auth emulator, writing through firestore.rules for
// real, exercising the actual repository functions (lib/data/resets.ts, lib/data/progress.ts).
//
// Task 3b: households/{hid} `create` now requires the signed-in address to be allowlisted, and
// signInAnonymously carries no email at all -- so these tests, which exercise the real rules
// (not a bypassed test environment), need a real signed-in identity with a real, allowlisted
// address instead. signInAsAllowlistedUser mints one via firebase-admin, the same technique
// scripts/verify-ui.mjs uses for its own sign-in and scripts/seed-emulators.ts uses to seed
// data: pre-create the Auth account with an email (a fresh custom token for a not-yet-existing
// uid carries no email of its own), write its allowedEmails doc (admin bypasses
// firestore.rules), then redeem a custom token for it through the real client SDK -- so the
// create this then does is the actual gated path, not a bypass.
// ---------------------------------------------------------------------------------------------

let rulesTestAdminAppPromise: Promise<import("firebase-admin/app").App> | undefined;
async function getRulesTestAdminApp() {
  if (!rulesTestAdminAppPromise) {
    rulesTestAdminAppPromise = (async () => {
      // vitest.emulator.config.ts sets FIREBASE_AUTH_EMULATOR_HOST but not
      // FIRESTORE_EMULATOR_HOST (lib/firebase/client.ts is pointed at the emulator via
      // NEXT_PUBLIC_USE_EMULATORS instead); firebase-admin needs both set explicitly, or its
      // Firestore client would try to reach a real project.
      process.env.FIRESTORE_EMULATOR_HOST ??= `localhost:${EMULATOR_PORTS.firestore}`;
      process.env.FIREBASE_AUTH_EMULATOR_HOST ??= `localhost:${EMULATOR_PORTS.auth}`;
      const { initializeApp, getApps } = await import("firebase-admin/app");
      return getApps().find((a) => a.name === "rules-test-admin")
        ?? initializeApp({ projectId: "wonderloop-dev" }, "rules-test-admin");
    })();
  }
  return rulesTestAdminAppPromise;
}

let allowlistedUserCounter = 0;
async function signInAsAllowlistedUser(): Promise<string> {
  const app = await getRulesTestAdminApp();
  const { getAuth } = await import("firebase-admin/auth");
  const { getFirestore } = await import("firebase-admin/firestore");
  const uid = `rules-test-${Date.now()}-${allowlistedUserCounter++}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `${uid}@rules-test.wonderloop`;
  await getAuth(app).createUser({ uid, email });
  await getFirestore(app).doc(`allowedEmails/${email}`).set({ note: "rules.test.ts real-client-SDK identity", addedAt: Date.now() });
  const token = await getAuth(app).createCustomToken(uid);
  const cred = await signInWithCustomToken(getClientAuth(), token);
  return cred.user.uid;
}

async function signInAsMemberOfFreshHousehold(hid: string): Promise<string> {
  const uid = await signInAsAllowlistedUser();
  const db = getDb();
  await setDoc(doc(db, `households/${hid}`), {
    name: "Test", ownerUid: uid, memberUids: [uid], inviteCode: "TEST01", createdAt: Date.now(),
  });
  return uid;
}

/** Best-effort cleanup so a real-client-SDK test does not leave a household (and its
 * subcollections) behind in the emulator forever. Deletes every doc in the profile-scoped
 * subcollections these tests actually write to, then the household doc itself. Not a full
 * recursive delete of every possible subcollection -- good enough for what this file writes,
 * not a general-purpose utility. */
async function deleteHouseholdAndSubcollections(db: Firestore, hid: string, pid: string): Promise<void> {
  const subcollections = ["attempts", "progress", "reviewQueue", "skills", "resets"];
  for (const name of subcollections) {
    const snap = await getDocs(collection(db, `households/${hid}/profiles/${pid}/${name}`));
    if (snap.size === 0) continue;
    const batch = writeBatch(db);
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
  }
  await deleteDoc(doc(db, `households/${hid}`));
}

const noSkillInputs: ResetSkillInputs = { logs: [], parentEntries: [], skillsForProblem: () => [] };

describe("resets.ts: chunked batch commits", () => {
  it("a season-scope reset with more than 500 target documents completes", async () => {
    const hid = `batch-hh-${Date.now()}`;
    const pid = "explorer";
    const db = getDb();
    try {
      const uid = await signInAsMemberOfFreshHousehold(hid);

      // 6 fake quests, 520 fake problems: attempts (520) + progress (6) + reviewQueue (520) puts
      // the deletion phase at 1046 operations, well past the 450-per-batch chunk size and the
      // 500-op Firestore hard cap, so this can only pass if resets.ts actually chunks.
      const questIds = Array.from({ length: 6 }, (_, i) => `season-fq${i}`);
      const problemIds = Array.from({ length: 520 }, (_, i) => `season-fp${i}`);

      const attemptDocs = problemIds.map((problemId, i) => ({
        id: `att-${i}`,
        questId: questIds[i % questIds.length],
        problemId,
      }));
      for (let i = 0; i < attemptDocs.length; i += 450) {
        const group = attemptDocs.slice(i, i + 450);
        const batch = writeBatch(db);
        for (const a of group) {
          batch.set(doc(db, `households/${hid}/profiles/${pid}/attempts/${a.id}`), {
            problemId: a.problemId, questId: a.questId, answer: "1", correct: true,
            tryNumber: 1, hintTier: 0, ideaIds: [], revealed: false, at: Date.now(),
          });
        }
        await batch.commit();
      }

      await resetSeason(hid, pid, "season-fs1", questIds, problemIds, uid, noSkillInputs);

      const remaining = await getDocs(attemptsCol(db, hid, pid));
      if (remaining.size !== 0) throw new Error(`expected every attempt deleted, ${remaining.size} remain`);

      const resets = await getDocs(query(resetsCol(db, hid, pid), where("scope", "==", "season")));
      if (resets.size !== 1) throw new Error(`expected exactly one season reset document, found ${resets.size}`);
      if (resets.docs[0].data().targetId !== "season-fs1") throw new Error("resets doc has the wrong targetId");

      const skills = await getDocs(skillsCol(db, hid, pid));
      if (skills.size !== 0) throw new Error(`expected no skill documents (empty resolver), found ${skills.size}`);
    } finally {
      await deleteHouseholdAndSubcollections(db, hid, pid);
    }
  }, 30_000);
});

describe("progress.ts: full QuestProgress round-trip", () => {
  it("a partially ticked checklist reads back byte for byte, and isStepComplete agrees before and after", async () => {
    const hid = `roundtrip-hh-${Date.now()}`;
    const pid = "explorer";
    const db = getDb();
    try {
      await signInAsMemberOfFreshHousehold(hid);

      const loaded = loadContent(path.resolve("../content"), { expectWeeks: EXPECT_WEEKS });
      if (!loaded.ok || !loaded.content) throw new Error("content failed to load");
      const quest = getQuest(loaded.content, "s1-w01-build")!;
      const taskStep = quest.steps.find((s) => s.kind === "task")!;
      if (taskStep.kind !== "task") throw new Error("expected a task step");

      // Half of the task step's checklist items ticked, half not: not complete yet.
      const checklist: Record<string, boolean[]> = { [taskStep.id]: taskStep.checklist.map((_, i) => i % 2 === 0) };
      const before: QuestProgress = { ...emptyQuestProgress(), checklist };
      const beforeAnswer = isStepComplete(taskStep, before);
      if (beforeAnswer !== false) throw new Error("expected the partially ticked checklist to be incomplete before the write");

      const progressDoc = buildProgressDoc(quest, before, {});
      await saveQuestProgress(hid, pid, quest.id, progressDoc);

      const readBack = await new Promise<QuestProgress>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("watchProgress never called back")), 10_000);
        const unsub = watchProgress(hid, pid, (list) => {
          const entry = list.find((x) => x.questId === quest.id);
          if (!entry) return; // wait for the write to be visible
          clearTimeout(timeout);
          unsub();
          resolve(entry.progress.quest);
        });
      });

      if (JSON.stringify(readBack.checklist) !== JSON.stringify(checklist)) {
        throw new Error(`checklist did not round-trip: got ${JSON.stringify(readBack.checklist)}`);
      }
      const afterAnswer = isStepComplete(taskStep, readBack);
      if (afterAnswer !== beforeAnswer) throw new Error(`isStepComplete disagreed after the round trip: before=${beforeAnswer} after=${afterAnswer}`);
    } finally {
      await deleteHouseholdAndSubcollections(db, hid, pid);
    }
  }, 30_000);
});

describe("progress.ts: an unset progress timestamp stays unset", () => {
  it("a not_started quest reads back with startedAt and completedAt both undefined", async () => {
    const hid = `ts-unset-hh-${Date.now()}`;
    const pid = "explorer";
    const db = getDb();
    try {
      await signInAsMemberOfFreshHousehold(hid);

      const loaded = loadContent(path.resolve("../content"), { expectWeeks: EXPECT_WEEKS });
      if (!loaded.ok || !loaded.content) throw new Error("content failed to load");
      const quest = getQuest(loaded.content, "s1-w01-build")!;

      // buildProgressDoc with no startedAt/completedAt supplied: a quest that was never started.
      const notStarted = buildProgressDoc(quest, emptyQuestProgress(), {});
      await saveQuestProgress(hid, pid, quest.id, notStarted);

      const snap = await getDoc(progressRef(db, hid, pid, quest.id));
      const data = snap.data();
      if (!data) throw new Error("expected the progress doc to exist after the write");
      if (data.startedAt !== undefined) throw new Error(`expected startedAt to stay unset, got ${JSON.stringify(data.startedAt)}`);
      if (data.completedAt !== undefined) throw new Error(`expected completedAt to stay unset, got ${JSON.stringify(data.completedAt)}`);
      if (data.status !== "not_started") throw new Error(`expected status not_started, got ${data.status}`);
    } finally {
      await deleteHouseholdAndSubcollections(db, hid, pid);
    }
  }, 30_000);

  it("a started-and-finished quest carries real startedAt and completedAt numbers", async () => {
    const hid = `ts-set-hh-${Date.now()}`;
    const pid = "explorer";
    const db = getDb();
    try {
      await signInAsMemberOfFreshHousehold(hid);

      const loaded = loadContent(path.resolve("../content"), { expectWeeks: EXPECT_WEEKS });
      if (!loaded.ok || !loaded.content) throw new Error("content failed to load");
      const quest = getQuest(loaded.content, "s1-w01-build")!;

      const finishedProgress: QuestProgress = {
        ...emptyQuestProgress(),
        ticks: quest.steps.filter((s) => ["instruction", "science", "task", "typing"].includes(s.kind)).map((s) => ({ stepId: s.id, done: true })),
        artifacts: Object.fromEntries(quest.steps.filter((s) => s.kind === "artifact").map((s) => [s.id, ["photo"]])),
        logs: quest.steps.filter((s) => s.kind === "log").map((s) => s.id),
      };
      const startedAt = Date.now() - 60 * 60 * 1000;
      const completedAt = Date.now();
      const finished = buildProgressDoc(quest, finishedProgress, { startedAt, completedAt });
      await saveQuestProgress(hid, pid, quest.id, finished);

      const snap = await getDoc(progressRef(db, hid, pid, quest.id));
      const data = snap.data();
      if (!data) throw new Error("expected the progress doc to exist after the write");
      if (typeof data.startedAt !== "number") throw new Error(`expected a real startedAt number, got ${JSON.stringify(data.startedAt)}`);
      if (typeof data.completedAt !== "number") throw new Error(`expected a real completedAt number, got ${JSON.stringify(data.completedAt)}`);
      if (data.status !== "done") throw new Error(`expected status done, got ${data.status}`);
    } finally {
      await deleteHouseholdAndSubcollections(db, hid, pid);
    }
  }, 30_000);
});

// ---------------------------------------------------------------------------------------------
// households.ts: concurrent bootstrap creates exactly one household (Critical bug #1, task-6
// review). Two tabs signing in with the same fresh account both call createHousehold for the
// same uid at (as near as this process can get) the same time; before the fix, each minted its
// own random household id, so both writes landed and the family ended up with two households --
// one of them an orphan getHouseholdForUser could never see again (it only ever reads
// householdIds[0]). This exercises the real client SDK against firestore.rules, the same way
// the "Real-client-SDK tests" above do, so the fix is proven against the actual security rules,
// not just against a bypassed test environment.
// ---------------------------------------------------------------------------------------------

describe("households.ts: concurrent bootstrap creates exactly one household", () => {
  it("two concurrent createHousehold calls for the same uid target one document, and the loser does not clobber the winner", async () => {
    const uid = await signInAsAllowlistedUser();
    const db = getDb();
    const hid = `home-${uid}`;
    try {
      const [a, b] = await Promise.all([
        createHousehold(uid, "First household name"),
        createHousehold(uid, "Second household name"),
      ]);

      if (a.hid !== hid || b.hid !== hid) {
        throw new Error(`expected both calls to target home-${uid}, got hid=${a.hid} and hid=${b.hid}`);
      }
      // Firestore's transaction-level concurrency control, not any client-side coordination
      // between the two calls, decides which one actually creates the document: exactly one of
      // the two must report created:true.
      if (a.created === b.created) {
        throw new Error(`expected exactly one call to report created:true, got a.created=${a.created} b.created=${b.created}`);
      }

      const snap = await getDoc(doc(db, `households/${hid}`));
      if (!snap.exists()) throw new Error("expected the household document to exist");
      const data = snap.data()!;
      const winnerName = a.created ? "First household name" : "Second household name";
      if (data.name !== winnerName) {
        throw new Error(`expected the winner's name ("${winnerName}") to survive, got "${data.name}"`);
      }
      if (JSON.stringify(data.memberUids) !== JSON.stringify([uid])) {
        throw new Error(`expected memberUids to stay [uid], got ${JSON.stringify(data.memberUids)}`);
      }
      // Both calls' returned inviteCode must agree with each other and with what actually
      // landed -- the loser must report the winner's inviteCode, not mint and discard its own.
      if (a.inviteCode !== b.inviteCode || a.inviteCode !== data.inviteCode) {
        throw new Error(`expected both calls and the document to agree on inviteCode, got a=${a.inviteCode} b=${b.inviteCode} doc=${data.inviteCode}`);
      }

      const userSnap = await getDoc(doc(db, `users/${uid}`));
      if (!userSnap.exists()) throw new Error("expected a users/{uid} doc to exist");
      const householdIds = (userSnap.data()!.householdIds ?? []) as string[];
      if (householdIds.length !== 1 || householdIds[0] !== hid) {
        throw new Error(`expected users/${uid}.householdIds to be exactly [${hid}], got ${JSON.stringify(householdIds)}`);
      }
    } finally {
      await deleteDoc(doc(db, `households/${hid}`)).catch(() => {});
      await deleteDoc(doc(db, `users/${uid}`)).catch(() => {});
    }
  }, 30_000);
});
