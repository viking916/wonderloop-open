// @vitest-environment jsdom
//
// Task 4 (concept-first prototype): LessonPlayer is PURE TEACHING by construction -- see its own
// module doc. These tests assert the behavioural contract that promise depends on: a wrong
// answer never blocks a retry, nothing is disabled after a miss, and onDone fires exactly once,
// only after the last beat is answered right.
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import type { Lesson } from "@/lib/content/schema";

afterEach(cleanup);

function gridFigure(n: number): Lesson["beats"][number]["figure"] {
  return { kind: "grid", alt: `${n} shaded squares.`, spec: { rows: 1, cols: n, shaded: Array.from({ length: n }, (_, i) => [0, i]) } };
}

const lesson: Lesson = {
  id: "lesson-test",
  ideaId: "test-idea",
  title: "Meet the idea: a test lesson",
  beats: [
    {
      id: "lesson-test-b01",
      prompt: "How many halves fit in 3?",
      figure: gridFigure(6),
      answer: { kind: "number", value: "6" },
      onWrong: "Count row by row: 2 plus 2 plus 2 is 6.",
      onRight: "Six halves.",
    },
    {
      id: "lesson-test-b02",
      prompt: "Smaller pieces mean more or fewer pieces?",
      figure: gridFigure(2),
      options: ["More", "Fewer"],
      answer: { kind: "choice", index: 0 },
      onWrong: "Smaller pieces always means more of them.",
      onRight: "Right, more.",
    },
    {
      id: "lesson-test-b03",
      prompt: "20 divided by 1/5?",
      figure: gridFigure(5),
      answer: { kind: "number", value: "100" },
      onWrong: "Flip and multiply: 20 times 5.",
      onRight: "One hundred.",
    },
  ],
};

describe("LessonPlayer", () => {
  test("asks the first beat's question immediately, with its figure", () => {
    render(<LessonPlayer lesson={lesson} onDone={() => {}} />);
    expect(screen.getByText("How many halves fit in 3?")).toBeTruthy();
    expect(screen.getByRole("img", { name: /6 shaded squares/ })).toBeTruthy();
  });

  test("a wrong number answer shows onWrong and lets him try again immediately", () => {
    render(<LessonPlayer lesson={lesson} onDone={() => {}} />);
    const input = screen.getByLabelText("Your answer");
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("Count row by row: 2 plus 2 plus 2 is 6.")).toBeTruthy();
    // The input is still enabled -- he can just change his answer and check again.
    expect((input as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(input, { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("Six halves.")).toBeTruthy();
  });

  test("a wrong choice answer clears once he picks something new", () => {
    render(<LessonPlayer lesson={lesson} onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    fireEvent.click(screen.getByRole("radio", { name: "Fewer" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("Smaller pieces always means more of them.")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "More" }));
    expect(screen.queryByText("Smaller pieces always means more of them.")).toBeNull();
  });

  test("onDone fires exactly once, only after the last beat is answered right", () => {
    const onDone = vi.fn();
    render(<LessonPlayer lesson={lesson} onDone={onDone} />);

    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test("Check is disabled on an empty draft", () => {
    render(<LessonPlayer lesson={lesson} onDone={() => {}} />);
    expect((screen.getByRole("button", { name: "Check" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
