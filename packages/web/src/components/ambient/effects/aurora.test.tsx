import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import aurora from "./aurora";

describe("aurora ambient effect", () => {
  it("satisfies the effect contract", () => {
    expect(aurora.key).toBe("aurora");
    expect(aurora.label).toBe("Aurora");
    expect(aurora.tier).toBe("rich");
    expect(typeof aurora.Component).toBe("function");
  });

  it("renders an inert, clipped overlay", () => {
    const { container } = render(<aurora.Component />);
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root?.getAttribute("aria-hidden")).toBe("true");
    for (const cls of ["absolute", "inset-0", "overflow-hidden", "pointer-events-none"]) {
      expect(root?.classList.contains(cls)).toBe(true);
    }
  });

  it("stays within the layer caps (5 ribbons, 20 sparkles)", () => {
    const { container } = render(<aurora.Component />);
    const ribbons = container.querySelectorAll(".amb-aurora-ribbon");
    const sparkles = container.querySelectorAll(".amb-aurora-sparkle");
    expect(ribbons.length).toBeGreaterThan(0);
    expect(ribbons.length).toBeLessThanOrEqual(5);
    expect(sparkles.length).toBeGreaterThan(0);
    expect(sparkles.length).toBeLessThanOrEqual(20);
    // Each ribbon wrapper holds exactly one blurred band.
    for (const ribbon of ribbons) {
      expect(ribbon.querySelectorAll(".amb-aurora-band").length).toBe(1);
    }
  });
});
