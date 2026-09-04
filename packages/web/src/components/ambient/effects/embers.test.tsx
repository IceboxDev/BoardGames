import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import embers from "./embers";

describe("embers ambient effect", () => {
  it("satisfies the effect contract", () => {
    expect(embers.key).toBe("embers");
    expect(embers.label).toBe("Embers");
    expect(embers.tier).toBe("rich");
    expect(typeof embers.Component).toBe("function");
  });

  it("renders an inert, clipped overlay", () => {
    const { container } = render(<embers.Component />);
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root?.getAttribute("aria-hidden")).toBe("true");
    for (const cls of ["absolute", "inset-0", "overflow-hidden", "pointer-events-none"]) {
      expect(root?.classList.contains(cls)).toBe(true);
    }
  });

  it("stays within the layer caps (12 embers, 12 smoke wisps)", () => {
    const { container } = render(<embers.Component />);
    const sparks = container.querySelectorAll(".amb-ember");
    const smoke = container.querySelectorAll(".amb-ember-smoke");
    expect(sparks.length).toBeGreaterThan(0);
    expect(sparks.length).toBeLessThanOrEqual(12);
    expect(smoke.length).toBeGreaterThan(0);
    expect(smoke.length).toBeLessThanOrEqual(12);
    // Blur lives on the inner shape whose animation is transform-only.
    for (const wisp of smoke) {
      expect(wisp.querySelectorAll(".amb-ember-smoke-puff").length).toBe(1);
    }
    for (const spark of sparks) {
      expect(spark.querySelectorAll(".amb-ember-spark").length).toBe(1);
    }
  });
});
