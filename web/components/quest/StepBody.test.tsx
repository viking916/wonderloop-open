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

test("a known section name alone on its own line is a heading, not a paragraph", () => {
  const blocks = splitBlocks("Some prose.\n\nWhat to remember:\n\n1. First thing.\n2. Second thing.");
  expect(blocks.map((b) => b.kind)).toEqual(["p", "heading", "ol"]);
  expect(blocks[1]).toEqual({ kind: "heading", text: "What to remember" });
});

test("every heading name from docs/content-authoring.md rule 20 is recognised, with an optional number", () => {
  for (const name of ["The idea", "Tricks", "Watch out", "Worked example", "Try one with me", "What to remember"]) {
    expect(splitBlocks(`${name}:`)).toEqual([{ kind: "heading", text: name }]);
  }
  expect(splitBlocks("Worked example 2:")).toEqual([{ kind: "heading", text: "Worked example 2" }]);
});

test("the same words leading a sentence are not a heading", () => {
  expect(splitBlocks("The idea: multiply the top and the bottom by the same number.")).toEqual([
    { kind: "p", text: "The idea: multiply the top and the bottom by the same number." },
  ]);
  expect(splitBlocks("Try one with me. Cover the lines below.")).toEqual([
    { kind: "p", text: "Try one with me. Cover the lines below." },
  ]);
});

test("a paragraph starting Trick/Trap/Check it/Remember is a callout, with a real visible label", () => {
  render(<StepBody text="Trick: multiply straight across the tops." />);
  expect(screen.getByText("TRICK")).toBeTruthy();
  expect(screen.getByText("multiply straight across the tops.")).toBeTruthy();

  const blocks = splitBlocks("Trap: dividing by the top number is the mistake everyone makes.");
  expect(blocks).toEqual([{ kind: "callout", tone: "trap", label: "TRAP", text: "dividing by the top number is the mistake everyone makes.", items: [] }]);

  expect(splitBlocks("Check it: does your answer make sense?")).toEqual([
    { kind: "callout", tone: "check", label: "CHECK IT", text: "does your answer make sense?", items: [] },
  ]);
  expect(splitBlocks("Remember: bottom number, divide.")).toEqual([
    { kind: "callout", tone: "remember", label: "REMEMBER", text: "bottom number, divide.", items: [] },
  ]);
});

test("a callout keeps a numbered list that follows it, in the same block or the next one", () => {
  const sameBlock = splitBlocks("Trick: work top to bottom.\n1. Divide first.\n2. Multiply next.");
  expect(sameBlock).toEqual([{ kind: "callout", tone: "trick", label: "TRICK", text: "work top to bottom.", items: ["Divide first.", "Multiply next."] }]);

  const nextBlock = splitBlocks("Trick: work top to bottom.\n\n1. Divide first.\n2. Multiply next.");
  expect(nextBlock).toEqual([{ kind: "callout", tone: "trick", label: "TRICK", text: "work top to bottom.", items: ["Divide first.", "Multiply next."] }]);
});

test("code and links still work inside a callout's text and its list", () => {
  const { container } = render(
    <StepBody text={"Trick: drag `on start` first.\n\n1. Snap `show number` inside it.\n2. See https://makecode.microbit.org."} />,
  );
  expect(container.querySelectorAll(".tr-callout code")).toHaveLength(2);
  expect(container.querySelector(".tr-callout a")?.getAttribute("href")).toBe("https://makecode.microbit.org");
});

test("a callout with no list at all renders with no ordered list element", () => {
  const { container } = render(<StepBody text="Remember: the bottom number always divides." />);
  expect(container.querySelector(".tr-callout ol")).toBeNull();
});

test("a figure passed in lands right after The idea section, before the next heading", () => {
  const figure = <div data-testid="fig">FIG</div>;
  const { container } = render(
    <StepBody text={"The idea:\n\nMultiply the tops.\n\nTricks:\n\nWatch the signs."} figure={figure} />,
  );
  const groups = Array.from(container.children);
  expect(groups).toHaveLength(3);
  expect(groups[0].className).toBe("tr-step__body");
  expect(groups[0].textContent).toContain("The idea");
  expect(groups[0].textContent).toContain("Multiply the tops.");
  expect(groups[0].textContent).not.toContain("Tricks");
  expect(groups[1].getAttribute("data-testid")).toBe("fig");
  expect(groups[2].className).toBe("tr-step__body");
  expect(groups[2].textContent).toContain("Tricks");
  expect(groups[2].textContent).toContain("Watch the signs.");
});

test("a figure passed in still lands after the whole body when The idea is the last section", () => {
  const figure = <div data-testid="fig">FIG</div>;
  const { container } = render(<StepBody text={"The idea:\n\nMultiply the tops."} figure={figure} />);
  const groups = Array.from(container.children);
  expect(groups).toHaveLength(2);
  expect(groups[0].className).toBe("tr-step__body");
  expect(groups[1].getAttribute("data-testid")).toBe("fig");
});

test("a figure passed in keeps today's placement, after the whole body, when there is no The idea heading", () => {
  const figure = <div data-testid="fig">FIG</div>;
  const { container } = render(<StepBody text={"Tricks:\n\nWatch the signs."} figure={figure} />);
  const groups = Array.from(container.children);
  expect(groups).toHaveLength(2);
  expect(groups[0].className).toBe("tr-step__body");
  expect(groups[0].textContent).toContain("Tricks");
  expect(groups[1].getAttribute("data-testid")).toBe("fig");
});

test("no figure prop renders exactly the single body div, same as before figure placement existed", () => {
  const { container } = render(<StepBody text={"The idea:\n\nMultiply the tops."} />);
  expect(container.children).toHaveLength(1);
  expect(container.children[0].className).toBe("tr-step__body");
});

test("a Trick/Trap/Check it callout bolds its name up to the first real period or colon", () => {
  const { container } = render(<StepBody text="Trick: Cross multiply. When the bottoms differ, multiply straight across." />);
  const strong = container.querySelector(".tr-callout strong");
  expect(strong?.textContent).toBe("Cross multiply");
  const paragraphs = container.querySelectorAll(".tr-callout p");
  expect(paragraphs[1]?.textContent).toBe("Cross multiply. When the bottoms differ, multiply straight across.");
});

test("a callout that is one clause with only a trailing period bolds the whole clause", () => {
  render(<StepBody text="Trick: multiply straight across the tops." />);
  // Exercises the same text the pre-existing "real visible label" test renders, so a lookup by
  // its full text must still succeed once the name-bolding wraps it in a <strong>.
  expect(screen.getByText("multiply straight across the tops.")).toBeTruthy();
});

test("a decimal point or a ratio inside the callout text is not mistaken for the name boundary", () => {
  const { container } = render(<StepBody text="Check it: 3.2 times 2 should give back 6.4." />);
  const strong = container.querySelector(".tr-callout strong");
  // The decimal points are not real sentence breaks, and the trailing period ends the whole
  // clause with nothing left to be a "rest", so the whole one-line fact is the name.
  expect(strong?.textContent).toBe("3.2 times 2 should give back 6.4.");
});

test("a callout with no period or colon at all bolds its first line", () => {
  const { container } = render(<StepBody text="Check it: does your answer make sense?" />);
  const strong = container.querySelector(".tr-callout strong");
  expect(strong?.textContent).toBe("does your answer make sense?");
});

test("a Remember callout is left alone: its text is never bolded", () => {
  const { container } = render(<StepBody text="Remember: bottom number, divide." />);
  expect(container.querySelector(".tr-callout strong")).toBeNull();
});
