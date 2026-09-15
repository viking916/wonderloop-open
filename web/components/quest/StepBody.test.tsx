// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { splitBlocks, StepBody } from "./StepBody";

afterEach(cleanup);

test("a blank line separates paragraphs and consecutive numbered lines become an ordered list", () => {
  const blocks = splitBlocks("Open the editor.\n\n1. Drag `on start`.\n2. Snap `show string` inside it.\n\nDone.");
  expect(blocks.map((b) => b.kind)).toEqual(["p", "ol", "p"]);
  expect(blocks[1]).toEqual({ kind: "ol", start: 1, items: ["Drag `on start`.", "Snap `show string` inside it."] });
});

test("a list may start past 1 and a lone numbered line is still a list", () => {
  expect(splitBlocks("4. Press Download.")).toEqual([{ kind: "ol", start: 4, items: ["Press Download."] }]);
});

test("URLs become links that open in a new tab, with and without https, and keep their trailing stop", () => {
  render(<StepBody text="Open https://makecode.microbit.org and later python.microbit.org. Not this: e.g. the drawer." />);
  const links = screen.getAllByRole("link");
  expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://makecode.microbit.org", "https://python.microbit.org"]);
  expect(links.every((a) => a.getAttribute("target") === "_blank" && a.getAttribute("rel") === "noopener noreferrer")).toBe(true);
  expect(links[1].textContent).toBe("python.microbit.org");
  expect(screen.getByText(/Not this: e\.g\. the drawer\./)).toBeTruthy();
});

test("backtick spans render as inline code inside list items", () => {
  const { container } = render(<StepBody text="1. Drag an `on start` block.\n2. Press `Download`." />);
  const codes = Array.from(container.querySelectorAll("li code")).map((c) => c.textContent);
  expect(codes).toEqual(["on start", "Download"]);
  expect(container.querySelector("ol")?.getAttribute("start")).toBe("1");
});
