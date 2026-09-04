import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import waves from "./waves";

describe("waves ambient effect", () => {
  it("exports the effect contract shape", () => {
    expect(waves.key).toBe("waves");
    expect(waves.label).toBe("Waves");
    expect(waves.tier).toBe("cheap");
    expect(typeof waves.Component).toBe("function");
  });

  it("renders a hidden, non-interactive full-bleed layer", () => {
    const { container } = render(<waves.Component />);
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root?.className).toContain("pointer-events-none");
    expect(root?.className).toContain("absolute");
    expect(root?.className).toContain("inset-0");
    expect(root?.className).toContain("overflow-hidden");
  });

  it("renders one caustic, four wave layers, and eight bubbles", () => {
    const { container } = render(<waves.Component />);
    expect(container.querySelectorAll(".amb-wave-caustic")).toHaveLength(1);
    expect(container.querySelectorAll("svg.amb-wave")).toHaveLength(4);
    expect(container.querySelectorAll(".amb-wave-bubble")).toHaveLength(8);
  });

  it("staggers the wave layers and stretches each to the container bottom", () => {
    const { container } = render(<waves.Component />);
    const styles = Array.from(container.querySelectorAll("svg.amb-wave"), (el) =>
      el.getAttribute("style"),
    );
    expect(styles[0]).toContain("--amb-wave-duration: 12s");
    expect(styles[3]).toContain("--amb-wave-duration: 18s");
    // top + height must sum to 100% per wave, so the translucent fills stack
    // into one seamless gradient with no mid-screen horizontal seam.
    expect(styles[0]).toContain("top: 30%");
    expect(styles[0]).toContain("height: 70%");
    expect(styles[3]).toContain("top: 75%");
    expect(styles[3]).toContain("height: 25%");
  });

  // ── The conveyor invariant ────────────────────────────────────────────
  //
  // Each wave is drawn at 200% width and slid exactly -50% (half its own
  // width) on a LINEAR loop. That wrap is only invisible if the path repeats
  // over 500 viewBox units — i.e. the second cubic's control points are the
  // first cubic's, translated by +500 in x with identical y. Two of the four
  // ported paths did NOT satisfy this; the original hid it by playing
  // `alternate`, so the wrap point was never actually reached.
  it("every wave path is periodic over half its width", () => {
    const { container } = render(<waves.Component />);
    const paths = Array.from(container.querySelectorAll("svg.amb-wave path"), (p) =>
      p.getAttribute("d"),
    );
    expect(paths).toHaveLength(4);

    for (const d of paths) {
      const m = d?.match(
        /^M0,(\d+) C(\d+),(\d+) (\d+),(\d+) 500,(\d+) C(\d+),(\d+) (\d+),(\d+) 1000,(\d+)/,
      );
      expect(m, `unparsed wave path: ${d}`).not.toBeNull();
      const n = (m as RegExpMatchArray).slice(1).map(Number);
      const [y0, c1x, c1y, c2x, c2y, midY, c3x, c3y, c4x, c4y, endY] = n;

      // The two halves start and end at the same height…
      expect(y0).toBe(midY);
      expect(midY).toBe(endY);
      // …and the second half's controls are the first half's, shifted +500.
      expect(c3x).toBe(c1x + 500);
      expect(c3y).toBe(c1y);
      expect(c4x).toBe(c2x + 500);
      expect(c4y).toBe(c2y);
    }
  });

  it("parks bubbles at a visible resting height for the reduced-motion still", () => {
    const { container } = render(<waves.Component />);
    for (const b of container.querySelectorAll(".amb-wave-bubble")) {
      expect(b.getAttribute("style")).toContain("--amb-bubble-rest-y");
    }
  });
});
