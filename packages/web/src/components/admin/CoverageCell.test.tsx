import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoverageCell } from "./CoverageCell";

describe("CoverageCell", () => {
  it("renders 0% with an explicit 'No editable days' title when total is zero", () => {
    const { container } = render(<CoverageCell coverage={{ can: 0, maybe: 0, total: 0 }} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
    const dot = container.querySelector("span[title]") as HTMLElement;
    expect(dot.getAttribute("title")).toBe("No editable days");
  });

  it("rounds the cover percent (can + maybe / total) to the nearest integer", () => {
    // 1/3 can + 1/3 maybe = ~66.66% → 67
    render(<CoverageCell coverage={{ can: 1, maybe: 1, total: 3 }} />);
    expect(screen.getByText("67%")).toBeInTheDocument();
  });

  it("shows 100% when every day is marked", () => {
    render(<CoverageCell coverage={{ can: 30, maybe: 12, total: 42 }} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("encodes the can / maybe / unmarked breakdown in the title", () => {
    const { container } = render(<CoverageCell coverage={{ can: 5, maybe: 3, total: 10 }} />);
    const dot = container.querySelector("span[title]") as HTMLElement;
    expect(dot.getAttribute("title")).toBe("5 can · 3 maybe · 2 unmarked of 10 editable days");
  });

  // The conic-gradient itself can't be asserted from jsdom — its CSS parser
  // doesn't recognize `conic-gradient()` and drops the value when the inline
  // style attribute is normalized. The slice math is covered by the percent
  // + title assertions above; the gradient color itself is a visual concern.
});
