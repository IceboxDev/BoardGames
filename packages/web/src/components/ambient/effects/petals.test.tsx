import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import petals from "./petals";

describe("petals ambient effect", () => {
  it("satisfies the effect contract", () => {
    expect(petals.key).toBe("petals");
    expect(petals.label).toBe("Petals");
    expect(petals.tier).toBe("rich");
    expect(typeof petals.Component).toBe("function");
  });

  it("renders an inert, clipped overlay", () => {
    const { container } = render(<petals.Component />);
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root?.getAttribute("aria-hidden")).toBe("true");
    for (const cls of ["absolute", "inset-0", "overflow-hidden", "pointer-events-none"]) {
      expect(root?.classList.contains(cls)).toBe(true);
    }
  });

  it("stays within the layer cap (24 petals total)", () => {
    const { container } = render(<petals.Component />);
    const falling = container.querySelectorAll(".amb-petal");
    const settled = container.querySelectorAll(".amb-petal-settled");
    expect(falling.length).toBeGreaterThan(0);
    // Settled petals are the static prefers-reduced-motion remnant, so at
    // least one must always exist.
    expect(settled.length).toBeGreaterThan(0);
    expect(falling.length + settled.length).toBeLessThanOrEqual(24);
    // Every falling petal carries exactly one of the three flutter variants.
    for (const petal of falling) {
      const variants = ["amb-petal-a", "amb-petal-b", "amb-petal-c"].filter((v) =>
        petal.classList.contains(v),
      );
      expect(variants.length).toBe(1);
      expect(petal.querySelectorAll(".amb-petal-shape").length).toBe(1);
    }
  });
});
