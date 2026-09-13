import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeatMon, TrickPips } from "./SeatMon";

describe("SeatMon", () => {
  it("shows the clan's short mark, and 帝 in gold for the Emperor", () => {
    const { container, rerender } = render(<SeatMon clan="takeda" size={40} />);
    expect(container.textContent).toBe("武");
    expect(container.firstElementChild).toHaveStyle({ width: "40px", height: "40px" });
    rerender(<SeatMon clan={null} size={20} />);
    expect(container.textContent).toBe("帝");
  });
});

describe("TrickPips", () => {
  it("reports the count and sizes its dots", () => {
    const { container } = render(<TrickPips won={3} dot={12} />);
    expect(screen.getByRole("img", { name: "3 conflicts won" })).toBeInTheDocument();
    const dots = container.querySelectorAll("span.rounded-full");
    expect(dots).toHaveLength(7);
    expect(dots[0]).toHaveStyle({ width: "12px", height: "12px" });
    expect(dots[0]?.className).toContain("bg-amber-400");
    expect(dots[6]?.className).toContain("bg-fill-strong");
  });
});
