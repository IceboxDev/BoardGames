import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("exposes the value on the progressbar contract, clamped to 0..100", () => {
    const { rerender } = render(<ProgressBar label="Attendance" value={0.42} />);
    const bar = screen.getByRole("progressbar", { name: "Attendance" });
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    rerender(<ProgressBar label="Attendance" value={1.7} />);
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    rerender(<ProgressBar label="Attendance" value={-3} />);
    expect(bar).toHaveAttribute("aria-valuenow", "0");
  });

  it("fills by tone class, or by an explicit color that wins over the tone", () => {
    const { container, rerender } = render(<ProgressBar label="x" value={0.5} tone="emerald" />);
    const fill = () =>
      container.querySelector('[role="progressbar"] > div:last-child') as HTMLElement;
    expect(fill().className).toContain("bg-emerald-500");
    expect(fill().style.width).toBe("50%");
    rerender(<ProgressBar label="x" value={0.5} tone="emerald" color="rgb(1, 2, 3)" />);
    expect(fill().className).not.toContain("bg-emerald-500");
    expect(fill().style.backgroundColor).toBe("rgb(1, 2, 3)");
  });

  it("draws the outer extent segment behind the fill when given", () => {
    const { container } = render(<ProgressBar label="x" value={0.25} extent={0.8} />);
    const segments = container.querySelectorAll('[role="progressbar"] > div');
    expect(segments).toHaveLength(2);
    expect((segments[0] as HTMLElement).style.width).toBe("80%");
    expect((segments[1] as HTMLElement).style.width).toBe("25%");
  });

  it("has the two sanctioned heights", () => {
    const { rerender } = render(<ProgressBar label="x" value={0} />);
    expect(screen.getByRole("progressbar").className).toContain("h-1.5");
    rerender(<ProgressBar label="x" value={0} size="md" />);
    expect(screen.getByRole("progressbar").className).toContain("h-2");
  });
});
