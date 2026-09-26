// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BadgeCelebration } from "./BadgeCelebration";
import type { Badge } from "@/lib/domain/badges";

afterEach(cleanup);

const FIRST_ROBOT: Badge = { id: "first-robot", name: "First Robot", earnedAt: 1_700_000_000_000 };
const FIRST_PROOF: Badge = { id: "first-proof", name: "First Proof", earnedAt: 1_700_000_100_000 };

describe("BadgeCelebration", () => {
  test("renders nothing when there is nothing new to celebrate", () => {
    const { container } = render(<BadgeCelebration badges={[]} onDismiss={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  test("names the badge and offers a dismiss", () => {
    const onDismiss = vi.fn();
    render(<BadgeCelebration badges={[FIRST_ROBOT]} onDismiss={onDismiss} />);
    expect(screen.getByText("New patch")).toBeTruthy();
    expect(screen.getByText("First Robot")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  test("more than one new badge shows every one, plural heading", () => {
    render(<BadgeCelebration badges={[FIRST_ROBOT, FIRST_PROOF]} onDismiss={vi.fn()} />);
    expect(screen.getByText("New patches")).toBeTruthy();
    expect(screen.getByText("First Robot")).toBeTruthy();
    expect(screen.getByText("First Proof")).toBeTruthy();
  });
});
