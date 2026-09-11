// @vitest-environment jsdom
//
// Task 10 regression test (Critical finding 1, ux-audit.md: "Next problem" can silently
// soft-lock the new problem). Reproduces the real mechanism, not a synthetic stand-in for it:
// Firestore's onSnapshot delivers the LOCAL ECHO of a just-written attempt (via
// watchAttemptsForQuest) well before handleSubmit's own outer await chain (persistAttempt,
// saveQuestProgress, onUpdate, the review-item write, recomputeAndSaveSkills) resolves. That
// local echo is what flips view.explanationOpen and renders "Next problem" -- a control that
// was never itself gated on the submission still being in flight. Click it in that window and
// the child lands on a different problem while the OLD problem's save is still pending.
//
// Before the fix, ProblemPlayer.tsx kept one `busy` boolean shared across every problem in the
// step, cleared only in the ORIGINAL submission's own `finally`. Nothing reset it when the
// problem changed, so the freshly shown problem inherited a "busy" that belonged to a problem
// it had nothing to do with -- its Check button and answer input came up disabled, with no
// spinner, toast or message anywhere on screen, until that old submission's write chain finally
// finished (this is the exact DOM-level bug the audit reproduced 3/3 times: "confirmed via
// element.disabled, not just the a11y tree"). This test asserts the fix directly: a problem
// that has not been touched must never be disabled by another problem's still-pending save.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AttemptDoc } from "@/lib/data/types";
import { emptyQuestProgress } from "@/lib/domain/completion";
import type { Problem, Quest, Step } from "@/lib/content/schema";
import { REVIEW_QUEST_ID } from "@/lib/domain/review";
import { ProblemPlayer } from "./ProblemPlayer";

// vi.mock factories are hoisted above these imports by Vitest, so every mock function they
// reference has to live behind vi.hoisted rather than a plain top-level const.
const mocks = vi.hoisted(() => ({
  watchAttemptsCallbacks: [] as Array<(list: Array<{ id: string; attempt: AttemptDoc }>) => void>,
  persistAttempt: vi.fn(),
  saveQuestProgress: vi.fn().mockResolvedValue(undefined),
  clearReviewItem: vi.fn().mockResolvedValue(undefined),
  upsertReviewItem: vi.fn().mockResolvedValue(undefined),
  recomputeAndSaveSkills: vi.fn().mockResolvedValue(undefined),
  // Task 17: the mistake-box review branch fetches the current review item via getDoc before
  // deciding what to write. Defaults to "no existing item"; review-mode tests override this to
  // a real snapshot so clearOnVariantSuccess has something to update.
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => undefined }),
  // Task 43: WorkingSpace's own getWorking/saveWorking, mocked at the lib/data/workings
  // boundary (not firebase/firestore's getDoc above) so it never collides with the review-item
  // fetch that same getDoc mock already serves. Defaults to "nothing saved yet" -- most tests
  // in this file have nothing to do with the working space at all.
  getWorking: vi.fn().mockResolvedValue(undefined),
  saveWorking: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/data/progress", () => ({
  recordAttempt: (...args: unknown[]) => mocks.persistAttempt(...args),
  saveQuestProgress: (...args: unknown[]) => mocks.saveQuestProgress(...args),
  clearReviewItem: (...args: unknown[]) => mocks.clearReviewItem(...args),
  upsertReviewItem: (...args: unknown[]) => mocks.upsertReviewItem(...args),
  watchAttemptsForQuest: (
    _hid: string,
    _pid: string,
    _questId: string,
    cb: (list: Array<{ id: string; attempt: AttemptDoc }>) => void,
  ) => {
    mocks.watchAttemptsCallbacks.push(cb);
    cb([]); // First snapshot: no attempts yet -- still real information, so attemptsLoaded flips true.
    return () => {};
  },
}));
vi.mock("@/lib/firebase/client", () => ({ getDb: () => ({}) }));
vi.mock("firebase/firestore", () => ({
  getDoc: (...args: unknown[]) => mocks.getDoc(...args),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  query: vi.fn(),
  where: vi.fn(),
}));
vi.mock("@/lib/data/types", () => ({ attemptsCol: vi.fn(() => ({})), reviewItemRef: vi.fn(() => ({})) }));
vi.mock("@/lib/content/app-content", () => ({ getIdea: () => undefined, getLessonForIdea: () => undefined }));
vi.mock("@/lib/data/skills-recompute", () => ({ recomputeAndSaveSkills: (...args: unknown[]) => mocks.recomputeAndSaveSkills(...args) }));
vi.mock("@/lib/data/workings", () => ({
  getWorking: (...args: unknown[]) => mocks.getWorking(...args),
  saveWorking: (...args: unknown[]) => mocks.saveWorking(...args),
}));

afterEach(() => {
  cleanup();
  mocks.watchAttemptsCallbacks.length = 0;
  vi.clearAllMocks();
});

const problem1: Problem = {
  id: "s1-w01-think-01-p01",
  kind: "number",
  lane: "skills",
  prompt: "What is 2 + 4?",
  answer: { kind: "number", value: "6" },
  explanation: ["Add the two numbers.", "2 + 4 is 6.", "Six is the answer."],
  ideaId: "idea-1",
  useAgain: "when adding two small numbers.",
  hints: ["Count up from 2.", "Use your fingers if it helps."],
  socraticHint: "If you started at 2 and took 4 more steps, where would you land?",
  skills: ["think.number-sense"],
  thinkMinutes: 2,
  difficulty: 1,
};

const problem2: Problem = {
  ...problem1,
  id: "s1-w01-think-01-p02",
  prompt: "What is 3 + 5?",
  answer: { kind: "number", value: "8" },
};

const step = {
  kind: "problem-set",
  id: "s1-w01-think-01",
  title: "Warm-up practice",
  lane: "skills",
  problems: [problem1, problem2],
} as Extract<Step, { kind: "problem-set" }>;

const quest: Quest = {
  id: "s1-w01-think",
  season: 1,
  week: 1,
  track: "think",
  title: "Fractions and logic",
  summary: "Practice fractions and logic.",
  minutes: 30,
  materials: [],
  skills: ["think.number-sense"],
  completion: "all-steps",
  steps: [step],
};

function renderPlayer() {
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  render(
    <ProblemPlayer
      step={step}
      quest={quest}
      progress={emptyQuestProgress()}
      problemsProgress={{}}
      progressLoaded={true}
      householdId="hh1"
      profileId="profile1"
      onUpdate={onUpdate}
    />,
  );
}

// Shared with both the review-mode describe block below and task 43's working-space tests, so
// there is exactly one review-mode render helper, not two that could quietly drift apart.
const reviewQuest: Quest = { ...quest, id: REVIEW_QUEST_ID };
function renderReview(reviewProblem: Problem) {
  const reviewStep = { ...step, problems: [reviewProblem] } as Extract<Step, { kind: "problem-set" }>;
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  render(
    <ProblemPlayer
      step={reviewStep}
      quest={reviewQuest}
      progress={emptyQuestProgress()}
      problemsProgress={{}}
      progressLoaded={true}
      householdId="hh1"
      profileId="profile1"
      onUpdate={onUpdate}
    />,
  );
}

// Task 43: renders a problem with two wrong tries already on record, both old enough (well past
// the 45 s cooldown, in real wall-clock time) that the try-3 "what did you try" gate is visible
// immediately -- no fake timers, no waiting out a real cooldown in a test.
function renderTwoWrongTries(problem: Problem) {
  const stepFor = { ...step, problems: [problem] } as Extract<Step, { kind: "problem-set" }>;
  const past = Date.now() - 300_000;
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  render(
    <ProblemPlayer
      step={stepFor}
      quest={quest}
      progress={emptyQuestProgress()}
      problemsProgress={{ [problem.id]: { firstSeenAt: past } }}
      progressLoaded={true}
      householdId="hh1"
      profileId="profile1"
      onUpdate={onUpdate}
    />,
  );
  act(() => {
    mocks.watchAttemptsCallbacks[0]([
      {
        id: "a1",
        attempt: {
          problemId: problem.id, questId: quest.id, answer: "wrong", correct: false, tryNumber: 1,
          hintTier: 0, ideaIds: [problem.ideaId], revealed: false, retry: false, at: past + 1000,
        },
      },
      {
        id: "a2",
        attempt: {
          problemId: problem.id, questId: quest.id, answer: "wrong again", correct: false, tryNumber: 2,
          hintTier: 1, ideaIds: [problem.ideaId], revealed: false, retry: false, at: past + 2000,
        },
      },
    ]);
  });
}

test("a problem that has not been touched is never disabled by another problem's still-pending save", async () => {
  // persistAttempt is held pending on purpose: this is the window the real bug lived in.
  let resolvePersist: () => void = () => {};
  mocks.persistAttempt.mockImplementation(
    () => new Promise<string>((resolve) => { resolvePersist = () => resolve("attempt-1"); }),
  );

  renderPlayer();

  const answerInput = screen.getByLabelText("Your answer") as HTMLInputElement;
  fireEvent.change(answerInput, { target: { value: "6" } });
  fireEvent.click(screen.getByRole("button", { name: "Check" }));

  // handleSubmit is now awaiting persistAttempt, which has not resolved -- exactly the state a
  // slow or piled-up Firestore write leaves a real session in.
  expect(mocks.persistAttempt).toHaveBeenCalledTimes(1);

  // Simulate the local echo: Firestore's onSnapshot for this very write delivers the new,
  // correct attempt through watchAttemptsForQuest before persistAttempt's own promise settles.
  act(() => {
    mocks.watchAttemptsCallbacks[0]([
      {
        id: "a1",
        attempt: {
          problemId: problem1.id,
          questId: quest.id,
          answer: "6",
          correct: true,
          tryNumber: 1,
          hintTier: 0,
          ideaIds: [problem1.ideaId],
          revealed: false,
          retry: false,
          at: Date.now(),
        },
      },
    ]);
  });

  // "Next problem" is showing well before persistAttempt has resolved -- this is real: it is
  // not gated on the submission finishing.
  const nextButton = await screen.findByRole("button", { name: "Next problem" });
  fireEvent.click(nextButton);

  // Problem 2 is now on screen; its own submission has never started. It must not inherit
  // problem 1's still-in-flight busy state -- the real, reproduced symptom is the answer input
  // itself coming up disabled with nothing typed possible at all.
  const problem2Input = (await screen.findByLabelText("Your answer")) as HTMLInputElement;
  expect(problem2Input.disabled).toBe(false);

  // The Check button is expected to stay disabled until something valid is typed (that part is
  // normal, unrelated to the bug) -- once it is, it must not still be blocked by problem 1's
  // pending save either.
  fireEvent.change(problem2Input, { target: { value: "8" } });
  const problem2Check = screen.getByRole("button", { name: "Check" }) as HTMLButtonElement;
  expect(problem2Check.disabled).toBe(false);

  // Let problem 1's save actually finish so nothing dangles past this test.
  await act(async () => {
    resolvePersist();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
});

// Five problems, each answered with the same race triggered on every single transition (not
// just the first) -- the task 10 brief for this fix: "showing it gone across at least 5
// consecutive transitions, including the last problem in a set." The last transition has no
// "Next problem" button at all (it is the last problem), so this also proves that problem 5
// never inherits a stuck busy state either, and that the step's own "last problem" line renders
// instead of a silently disabled screen.
const fiveProblems: Problem[] = Array.from({ length: 5 }, (_, i) => ({
  ...problem1,
  id: `s1-w01-think-01-p0${i + 1}`,
  prompt: `Problem ${i + 1}`,
  answer: { kind: "number", value: String(6 + i * 2) },
}));

const fiveStep = {
  kind: "problem-set",
  id: "s1-w01-think-01",
  title: "Warm-up practice",
  lane: "skills",
  problems: fiveProblems,
} as Extract<Step, { kind: "problem-set" }>;

const fiveQuest: Quest = { ...quest, steps: [fiveStep] };

test("busy never leaks across 5 consecutive transitions, including the last problem in the set", async () => {
  const pending: Array<() => void> = [];
  mocks.persistAttempt.mockImplementation(
    () => new Promise<string>((resolve) => { pending.push(() => resolve("attempt-id")); }),
  );

  const onUpdate = vi.fn().mockResolvedValue(undefined);
  render(
    <ProblemPlayer
      step={fiveStep}
      quest={fiveQuest}
      progress={emptyQuestProgress()}
      problemsProgress={{}}
      progressLoaded={true}
      householdId="hh1"
      profileId="profile1"
      onUpdate={onUpdate}
    />,
  );

  // watchAttemptsForQuest subscribes once per quest (its effect deps are householdId/profileId/
  // quest.id/attemptsRetryKey, none of which change as the child moves between problems within
  // the same step) -- so the real listener delivers one cumulative snapshot per write, not a
  // fresh subscription per problem. accumulated mirrors that: every problem's attempt is added
  // to the same running list and the one callback is called again with the whole thing.
  const accumulated: Array<{ id: string; attempt: AttemptDoc }> = [];

  for (let i = 0; i < fiveProblems.length; i++) {
    const current = fiveProblems[i];
    const input = (await screen.findByLabelText("Your answer")) as HTMLInputElement;
    expect(input.disabled).toBe(false); // the exact assertion that catches the soft-lock, every round

    fireEvent.change(input, { target: { value: String(6 + i * 2) } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    // Race every single transition, not just the first: the local echo of this attempt lands
    // while persistAttempt is still pending, same as a live session under load.
    accumulated.push({
      id: `a${i}`,
      attempt: {
        problemId: current.id,
        questId: fiveQuest.id,
        answer: String(6 + i * 2),
        correct: true,
        tryNumber: 1,
        hintTier: 0,
        ideaIds: [current.ideaId],
        revealed: false,
        retry: false,
        at: Date.now(),
      },
    });
    act(() => {
      mocks.watchAttemptsCallbacks[0]([...accumulated]);
    });

    const isLast = i === fiveProblems.length - 1;
    if (!isLast) {
      const nextButton = await screen.findByRole("button", { name: "Next problem" });
      fireEvent.click(nextButton);
    } else {
      // No "Next problem" on the last one -- the finished-set line must show, not a disabled,
      // unexplained screen.
      await screen.findByText("That was the last problem in this set.");
    }
  }

  // Every one of the five saves is still pending; resolving them all afterward must not throw
  // or leave any state update outside act().
  await act(async () => {
    for (const resolve of pending) resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
});

// Task 17 (final review finding C2): "the mistake box is write-only ... nothing calls
// clearOnVariantSuccess". These tests wire ProblemPlayer's review branch (quest.id ===
// REVIEW_QUEST_ID) directly rather than through the pure lib/domain/review.ts unit tests
// (already covered there), so a future edit that quietly puts scheduleOnMiss back on this path
// -- which happens to look identical for a REALISTIC due item, since scheduleOnMiss(existing
// with misses >= 1) and clearOnVariantSuccess both land on a flat 7-day reschedule -- gets
// caught here instead.
describe("review mode (quest.id === REVIEW_QUEST_ID)", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  // reviewQuest/renderReview are shared (module scope, defined above renderPlayer's own test).

  test("a correct first try on a due item fetches the current item and clears it (clearOnVariantSuccess, not the plain quest-flow clear)", async () => {
    mocks.persistAttempt.mockResolvedValue("attempt-1");
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ dueAt: Date.now() - 1000, misses: 1, variantSeed: 1 }) });

    renderReview(problem1);
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "6" } }); // problem1's answer
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check" }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The plain (non-review) quest-flow branch never reads the existing item on a correct
    // answer at all (clearReviewItem needs no prior state) -- getDoc having been called is
    // itself evidence the review branch, not the plain one, is what ran.
    expect(mocks.getDoc).toHaveBeenCalled();
    expect(mocks.clearReviewItem).toHaveBeenCalledWith("hh1", "profile1", problem1.id);
    expect(mocks.upsertReviewItem).not.toHaveBeenCalled();
  });

  test("a wrong first try on a due item reschedules it 7 days out via clearOnVariantSuccess, not scheduleOnMiss's 14-day first-miss branch, and leaves it in the box", async () => {
    mocks.persistAttempt.mockResolvedValue("attempt-1");
    // misses: 0 is not a shape a real due item has (a due item was already missed at least
    // once), but it is exactly what makes this test load-bearing: scheduleOnMiss would treat
    // misses going 0 -> 1 as a FIRST miss (14 days), while clearOnVariantSuccess always
    // reschedules at a flat 7 days regardless of the resulting miss count. Only one of those
    // two matches what comes out below.
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ dueAt: Date.now() - 1000, misses: 0, variantSeed: 0 }) });

    renderReview(problem1);
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "not the answer" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check" }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.clearReviewItem).not.toHaveBeenCalled();
    expect(mocks.upsertReviewItem).toHaveBeenCalledTimes(1);
    const updated = mocks.upsertReviewItem.mock.calls[0]![2] as { dueAt: number; misses: number };
    const deltaDays = (updated.dueAt - Date.now()) / DAY_MS;
    expect(deltaDays).toBeGreaterThan(6.9);
    expect(deltaDays).toBeLessThan(7.1);
    expect(updated.misses).toBe(1);
  });

  test("a not-auto-graded (rubric/text) problem with no variant clears on its one submission, since checkAnswer never reports it correct at all", async () => {
    const textProblem: Problem = {
      ...problem1,
      kind: "text",
      answer: { kind: "rubric", mustMention: ["equal parts", "reason"] },
    };
    mocks.persistAttempt.mockResolvedValue("attempt-1");
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ dueAt: Date.now() - 1000, misses: 1, variantSeed: 1 }) });

    renderReview(textProblem);
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "I split it into equal parts." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check" }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.clearReviewItem).toHaveBeenCalledWith("hh1", "profile1", textProblem.id);
    expect(mocks.upsertReviewItem).not.toHaveBeenCalled();
  });
});

// Task 43: the working space (a per-problem typed note + pen canvas, auto-saved, never graded)
// and the two other things wired into this component -- the mistake-box "Your working from last
// time" read-only block, and the try-3 "what did you try" gate showing an existing working
// instead of asking into thin air.
describe("task 43: the working space", () => {
  test("the button opens and closes the panel; nothing is saved for a problem only looked at", async () => {
    renderPlayer();

    const openButton = await screen.findByRole("button", { name: "Working space" });
    fireEvent.click(openButton);
    await screen.findByPlaceholderText("Type your thinking here");

    fireEvent.click(screen.getByRole("button", { name: "Close working space" }));
    expect(screen.queryByPlaceholderText("Type your thinking here")).toBeNull();

    // Looking at the panel (opening and closing it) with no edit must never write anything.
    expect(mocks.saveWorking).not.toHaveBeenCalled();
  });

  test("a pen stroke drawn in the panel is saved, tagged as a pen stroke, scoped to this problem id", async () => {
    renderPlayer();
    fireEvent.click(await screen.findByRole("button", { name: "Working space" }));
    const canvas = await screen.findByRole("img", { name: "Your working space drawing area" });

    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });

    await waitFor(() => expect(mocks.saveWorking).toHaveBeenCalled());
    const [hid, pid, problemId, patch] = mocks.saveWorking.mock.calls[0] as [
      string, string, string, { text: string; strokes: Array<{ tool: string }> },
    ];
    expect(hid).toBe("hh1");
    expect(pid).toBe("profile1");
    expect(problemId).toBe(problem1.id);
    expect(patch.strokes).toHaveLength(1);
    expect(patch.strokes[0].tool).toBe("pen");
  });

  test("the try-3 gate keeps its original wording when no working exists", async () => {
    mocks.getWorking.mockResolvedValue(undefined);
    renderTwoWrongTries(problem1);

    await screen.findByText("Before try 3: what did you try?");
    expect(screen.queryByText("You have some working saved.")).toBeNull();
    expect(screen.getByPlaceholderText("I tried...")).toBeTruthy();
  });

  test("the try-3 gate shows the existing working and asks what he would add, when one exists", async () => {
    mocks.getWorking.mockResolvedValue({
      text: "I tried splitting it into fourths", strokes: [], updatedAt: 1,
    });
    renderTwoWrongTries(problem1);

    await screen.findByText("You have some working saved.");
    await screen.findByText("“I tried splitting it into fourths”");
    expect(screen.getByText("Before try 3: what would you add?")).toBeTruthy();
    expect(screen.getByPlaceholderText("I would add...")).toBeTruthy();
    // The original no-working copy must not also be showing.
    expect(screen.queryByText("Before try 3: what did you try?")).toBeNull();
  });

  test("a mistake-box return with a saved working shows it read-only, labelled as from last time", async () => {
    mocks.getWorking.mockResolvedValue({ text: "half of it was easy", strokes: [], updatedAt: 1 });
    renderReview(problem1);

    await screen.findByText("Your working from last time");
    await screen.findByText("“half of it was easy”");
  });

  test("a mistake-box return with no saved working shows nothing extra", async () => {
    mocks.getWorking.mockResolvedValue(undefined);
    renderReview(problem1);

    await screen.findByLabelText("Your answer"); // the screen has finished its own hydration
    expect(screen.queryByText("Your working from last time")).toBeNull();
  });

  test("the normal (non-review) quest flow never shows the mistake-box 'last time' block, even with a saved working", async () => {
    mocks.getWorking.mockResolvedValue({ text: "some earlier note", strokes: [], updatedAt: 1 });
    renderPlayer();

    await screen.findByRole("button", { name: "Working space" });
    expect(screen.queryByText("Your working from last time")).toBeNull();
  });
});

// Task 43: the iPad numeric-keyboard fix. A pure whole/decimal-number answer gets
// inputMode="decimal"; a fraction (or any answer that needs a character the decimal keypad
// lacks) keeps the field's ordinary "text" inputMode, i.e. the full keyboard.
describe("task 43: numeric answer inputMode", () => {
  test("a pure whole-number answer's field has inputMode decimal", async () => {
    renderPlayer(); // problem1's answer is "6"
    const input = (await screen.findByLabelText("Your answer")) as HTMLInputElement;
    expect(input.getAttribute("inputmode")).toBe("decimal");
  });

  test("a fraction answer's field keeps the full keyboard (no decimal inputMode)", async () => {
    const fractionProblem: Problem = { ...problem1, answer: { kind: "number", value: "3/4" } };
    const fractionStep = { ...step, problems: [fractionProblem] } as Extract<Step, { kind: "problem-set" }>;
    render(
      <ProblemPlayer
        step={fractionStep}
        quest={quest}
        progress={emptyQuestProgress()}
        problemsProgress={{}}
        progressLoaded={true}
        householdId="hh1"
        profileId="profile1"
        onUpdate={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    const input = (await screen.findByLabelText("Your answer")) as HTMLInputElement;
    expect(input.getAttribute("inputmode")).toBe("text");
  });
});
