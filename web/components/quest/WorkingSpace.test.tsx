// @vitest-environment jsdom
//
// Task 43: the working space is zero-ceremony (no save button, auto-saved) and must never write
// anything for a problem he only opens and never touches. These tests exercise that contract
// directly against the real getWorking/saveWorking call shape, with lib/data/workings mocked at
// the same boundary ProblemPlayer.test.tsx already mocks lib/data/progress at.
//
// eagerLoad (default false) is exercised explicitly: it exists because an earlier, always-fetch
// version of this component measurably slowed down scripts/verify-ui.mjs's interaction sweep
// (see WorkingSpace.tsx's own eagerLoad comment and the task 43 report) by reading every
// problem's working document on mount whether or not it was ever opened. The default (lazy)
// path defers that read until the panel is actually opened; ProblemPlayer.tsx opts a caller
// into eagerLoad only where the content is needed before that (mistake-box review, and the
// try-3 gate).
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { WorkingSpace, type WorkingContent } from "./WorkingSpace";

const mocks = vi.hoisted(() => ({
  getWorking: vi.fn(),
  saveWorking: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/data/workings", () => ({
  getWorking: (...args: unknown[]) => mocks.getWorking(...args),
  saveWorking: (...args: unknown[]) => mocks.saveWorking(...args),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

test("a problem never opened or touched (the default, lazy load) is never even read from Firestore", async () => {
  mocks.getWorking.mockResolvedValue(undefined);
  render(<WorkingSpace householdId="hh1" profileId="p1" problemId="prob1" />);

  // Give any stray microtask/effect a turn, then assert nothing fired -- there is no positive
  // event to wait for here (that is the whole point of "lazy").
  await act(async () => {
    await Promise.resolve();
  });
  expect(mocks.getWorking).not.toHaveBeenCalled();
  expect(mocks.saveWorking).not.toHaveBeenCalled();
});

test("opening the panel hydrates it (and looking at it, with no edit, still writes nothing)", async () => {
  mocks.getWorking.mockResolvedValue(undefined);
  render(<WorkingSpace householdId="hh1" profileId="p1" problemId="prob1" />);

  fireEvent.click(screen.getByRole("button", { name: "Working space" }));
  await waitFor(() => expect(mocks.getWorking).toHaveBeenCalledWith("hh1", "p1", "prob1"));
  await screen.findByPlaceholderText("Type your thinking here");

  await new Promise((r) => setTimeout(r, 50));
  expect(mocks.saveWorking).not.toHaveBeenCalled();
});

test("typing in the notes field auto-saves after a short pause, with no save button anywhere", async () => {
  mocks.getWorking.mockResolvedValue(undefined);
  render(<WorkingSpace householdId="hh1" profileId="p1" problemId="prob1" />);
  fireEvent.click(screen.getByRole("button", { name: "Working space" }));
  const textarea = await screen.findByPlaceholderText("Type your thinking here");

  expect(screen.queryByRole("button", { name: /^save$/i })).toBeNull();

  fireEvent.change(textarea, { target: { value: "I tried splitting it into fourths" } });

  await waitFor(() => expect(mocks.saveWorking).toHaveBeenCalledWith("hh1", "p1", "prob1", {
    text: "I tried splitting it into fourths",
    strokes: [],
  }), { timeout: 2000 });
});

test("eagerLoad hydrates and reports existing content before the panel is ever opened", async () => {
  const existing = { text: "half of it", strokes: [{ tool: "pen" as const, points: [{ x: 0.1, y: 0.1 }] }] };
  mocks.getWorking.mockResolvedValue({ ...existing, updatedAt: 1 });
  const onContentChange = vi.fn();
  render(
    <WorkingSpace householdId="hh1" profileId="p1" problemId="prob1" onContentChange={onContentChange} eagerLoad />,
  );

  await waitFor(() => expect(onContentChange).toHaveBeenCalledWith(existing));
});

test("eagerLoad on a problem with no saved working reports undefined via onContentChange", async () => {
  mocks.getWorking.mockResolvedValue(undefined);
  const onContentChange = vi.fn();
  render(
    <WorkingSpace householdId="hh1" profileId="p1" problemId="prob1" onContentChange={onContentChange} eagerLoad />,
  );

  await waitFor(() => expect(onContentChange).toHaveBeenCalledWith(undefined));
});

test("Clear empties the strokes and is reflected as a content change", async () => {
  mocks.getWorking.mockResolvedValue({
    text: "", strokes: [{ tool: "pen", points: [{ x: 0.2, y: 0.2 }] }], updatedAt: 1,
  });
  const onContentChange = vi.fn();
  render(<WorkingSpace householdId="hh1" profileId="p1" problemId="prob1" onContentChange={onContentChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Working space" }));
  await waitFor(() => expect(onContentChange).toHaveBeenCalled());
  const clearButton = (await screen.findByRole("button", { name: "Clear" })) as HTMLButtonElement;
  expect(clearButton.disabled).toBe(false);

  fireEvent.click(clearButton);

  const [content] = onContentChange.mock.calls[onContentChange.mock.calls.length - 1] as [WorkingContent];
  expect(content.strokes).toHaveLength(0);
  await waitFor(() => expect(mocks.saveWorking).toHaveBeenCalledWith("hh1", "p1", "prob1", { text: "", strokes: [] }));
});

test("Clear can be undone until the next stroke", async () => {
  const strokes = [{ tool: "pen", points: [{ x: 0.2, y: 0.2 }] }];
  mocks.getWorking.mockResolvedValue({ text: "", strokes, updatedAt: 1 });
  const onContentChange = vi.fn();
  render(<WorkingSpace householdId="hh1" profileId="p1" problemId="prob1" onContentChange={onContentChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Working space" }));
  fireEvent.click(await screen.findByRole("button", { name: "Clear" }));

  const undo = await screen.findByRole("button", { name: "Undo clear" });
  expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  fireEvent.click(undo);

  const [content] = onContentChange.mock.calls[onContentChange.mock.calls.length - 1] as [WorkingContent];
  expect(content.strokes).toEqual(strokes);
  await waitFor(() => expect(mocks.saveWorking).toHaveBeenCalledWith("hh1", "p1", "prob1", { text: "", strokes }));
  expect((screen.getByRole("button", { name: "Clear" }) as HTMLButtonElement).disabled).toBe(false);
});

test("switching to a different problem id (eagerLoad) re-hydrates from that problem's own working", async () => {
  mocks.getWorking.mockImplementation((_hid: string, _pid: string, problemId: string) =>
    Promise.resolve(problemId === "prob1" ? { text: "prob1 note", strokes: [], updatedAt: 1 } : undefined),
  );
  const onContentChange = vi.fn();
  const { rerender } = render(
    <WorkingSpace householdId="hh1" profileId="p1" problemId="prob1" onContentChange={onContentChange} eagerLoad />,
  );
  await waitFor(() => expect(onContentChange).toHaveBeenCalledWith({ text: "prob1 note", strokes: [] }));

  onContentChange.mockClear();
  rerender(
    <WorkingSpace householdId="hh1" profileId="p1" problemId="prob2" onContentChange={onContentChange} eagerLoad />,
  );

  await waitFor(() => expect(onContentChange).toHaveBeenCalledWith(undefined));
  expect(mocks.getWorking).toHaveBeenLastCalledWith("hh1", "p1", "prob2");
});

test("a pending edit is flushed on unmount, not silently dropped", async () => {
  vi.useFakeTimers();
  mocks.getWorking.mockResolvedValue(undefined);
  const { unmount } = render(<WorkingSpace householdId="hh1" profileId="p1" problemId="prob1" />);
  fireEvent.click(screen.getByRole("button", { name: "Working space" }));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  const textarea = screen.getByPlaceholderText("Type your thinking here");
  fireEvent.change(textarea, { target: { value: "quick note" } });

  // Well under the debounce window -- nothing has auto-saved yet.
  expect(mocks.saveWorking).not.toHaveBeenCalled();
  unmount();
  expect(mocks.saveWorking).toHaveBeenCalledWith("hh1", "p1", "prob1", { text: "quick note", strokes: [] });
});
