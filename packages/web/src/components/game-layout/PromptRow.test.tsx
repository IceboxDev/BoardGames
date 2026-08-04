import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PromptRow } from "./PromptRow";

describe("PromptRow", () => {
  it("renders title · message with the separator dot", () => {
    render(<PromptRow title="Your turn" message="Select a card" />);
    expect(screen.getByText("Your turn")).toBeInTheDocument();
    expect(screen.getByText("·")).toBeInTheDocument();
    expect(screen.getByText("Select a card")).toBeInTheDocument();
  });

  it("colors the title cyan for active and amber for waiting", () => {
    const { rerender } = render(<PromptRow title="Your turn" />);
    expect(screen.getByText("Your turn").className).toMatch(/text-cyan-400/);
    rerender(<PromptRow title="Opponent" tone="waiting" />);
    expect(screen.getByText("Opponent").className).toMatch(/text-amber-400/);
  });

  it("omits the separator when only a message is given", () => {
    render(<PromptRow message="Revealing cards..." />);
    expect(screen.queryByText("·")).not.toBeInTheDocument();
  });

  it("shows the pulsing activity dot only when pulse is set", () => {
    const { container, rerender } = render(<PromptRow title="AI" tone="waiting" pulse />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    rerender(<PromptRow title="Your turn" />);
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });
});
