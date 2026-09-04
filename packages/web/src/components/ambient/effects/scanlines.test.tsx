import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import scanlines from "./scanlines";

describe("scanlines ambient effect", () => {
  it("exports the effect contract shape", () => {
    expect(scanlines.key).toBe("scanlines");
    expect(scanlines.label).toBe("Scanlines");
    expect(scanlines.tier).toBe("cheap");
    expect(typeof scanlines.Component).toBe("function");
  });

  it("renders a hidden, non-interactive full-bleed layer", () => {
    const { container } = render(<scanlines.Component />);
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root?.className).toContain("pointer-events-none");
    expect(root?.className).toContain("absolute");
    expect(root?.className).toContain("inset-0");
    expect(root?.className).toContain("overflow-hidden");
  });

  it("renders exactly the texture and the two sweep bands", () => {
    const { container } = render(<scanlines.Component />);
    const root = container.firstElementChild;
    expect(root?.children).toHaveLength(3);
    expect(container.querySelectorAll(".amb-scanline-texture")).toHaveLength(1);
    expect(container.querySelectorAll(".amb-scanline-band")).toHaveLength(1);
    expect(container.querySelectorAll(".amb-scanline-chroma")).toHaveLength(1);
  });
});
