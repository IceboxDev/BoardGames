import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import starfield from "./starfield";

describe("starfield ambient effect", () => {
  it("exports the effect contract shape", () => {
    expect(starfield.key).toBe("starfield");
    expect(starfield.label).toBe("Starfield");
    expect(starfield.tier).toBe("cheap");
    expect(typeof starfield.Component).toBe("function");
  });

  it("renders a hidden, non-interactive full-bleed layer", () => {
    const { container } = render(<starfield.Component />);
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root?.className).toContain("pointer-events-none");
    expect(root?.className).toContain("absolute");
    expect(root?.className).toContain("inset-0");
    expect(root?.className).toContain("overflow-hidden");
  });

  it("groups the 62 stars into three animated parallax tiers", () => {
    const { container } = render(<starfield.Component />);
    // One animated container per tier, not one per star: the whole point of
    // the tier grouping is that 62 stars cost 3 animated layers, not 62.
    expect(container.querySelectorAll(".amb-star-tier")).toHaveLength(3);
    expect(container.querySelectorAll(".amb-star")).toHaveLength(62);
    expect(container.querySelectorAll(".amb-star-tier--slow .amb-star")).toHaveLength(24);
    expect(container.querySelectorAll(".amb-star-tier--med .amb-star")).toHaveLength(23);
    expect(container.querySelectorAll(".amb-star-tier--fast .amb-star")).toHaveLength(15);
  });

  it("connects each constellation line to real vertex stars", () => {
    const { container } = render(<starfield.Component />);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(container.querySelectorAll("svg line")).toHaveLength(14);
    // Deduped vertices — a closed figure's repeated first point is drawn once.
    const vertices = Array.from(container.querySelectorAll("svg circle.amb-constellation-star"));
    expect(vertices).toHaveLength(16);

    // The invariant: every line endpoint is an actual vertex star, and every
    // vertex star is on a line. Both live in the SAME static svg, so they can
    // never drift out of alignment the way a drifting star layer would.
    const vertexPoints = new Set(
      vertices.map((v) => `${v.getAttribute("cx")},${v.getAttribute("cy")}`),
    );
    const linePoints = new Set(
      Array.from(container.querySelectorAll("svg line")).flatMap((l) => [
        `${l.getAttribute("x1")},${l.getAttribute("y1")}`,
        `${l.getAttribute("x2")},${l.getAttribute("y2")}`,
      ]),
    );
    expect(vertexPoints).toEqual(linePoints);
  });

  it("carries each star's base opacity as a custom property for the twinkle peak", () => {
    const { container } = render(<starfield.Component />);
    const star = container.querySelector(".amb-star");
    expect(star?.getAttribute("style")).toContain("--amb-star-opacity");
  });
});
