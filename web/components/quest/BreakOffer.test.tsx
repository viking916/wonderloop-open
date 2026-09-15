// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BreakOffer } from "./BreakOffer";

afterEach(cleanup);

describe("BreakOffer", () => {
  test("offers a break and reports Take a break", () => {
    const onTakeBreak = vi.fn();
    const onNotNow = vi.fn();
    render(<BreakOffer onTakeBreak={onTakeBreak} onNotNow={onNotNow} />);
    fireEvent.click(screen.getByText("Take a break"));
    expect(onTakeBreak).toHaveBeenCalledOnce();
    expect(onNotNow).not.toHaveBeenCalled();
  });

  test("Not now reports its own callback, distinct from Take a break", () => {
    const onTakeBreak = vi.fn();
    const onNotNow = vi.fn();
    render(<BreakOffer onTakeBreak={onTakeBreak} onNotNow={onNotNow} />);
    fireEvent.click(screen.getByText("Not now"));
    expect(onNotNow).toHaveBeenCalledOnce();
    expect(onTakeBreak).not.toHaveBeenCalled();
  });
});
