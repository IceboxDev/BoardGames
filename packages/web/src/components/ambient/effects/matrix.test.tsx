import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import matrix from "./matrix";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("matrix ambient effect", () => {
  it("satisfies the effect contract", () => {
    expect(matrix.key).toBe("matrix");
    expect(matrix.label).toBe("Matrix Rain");
    expect(matrix.tier).toBe("rich");
    expect(typeof matrix.Component).toBe("function");
  });

  it("renders an inert, clipped overlay", () => {
    const { container } = render(<matrix.Component />);
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root?.getAttribute("aria-hidden")).toBe("true");
    for (const cls of ["absolute", "inset-0", "overflow-hidden", "pointer-events-none"]) {
      expect(root?.classList.contains(cls)).toBe(true);
    }
  });

  it("renders one pre-generated glyph column per animated element, within the cap", () => {
    const { container } = render(<matrix.Component />);
    const columns = container.querySelectorAll(".amb-matrix-col");
    expect(columns.length).toBeGreaterThan(0);
    expect(columns.length).toBeLessThanOrEqual(16);
    for (const col of columns) {
      // A single text node of newline-separated glyphs — no per-character
      // child elements to mutate.
      expect(col.children.length).toBe(0);
      expect((col.textContent ?? "").split("\n").length).toBeGreaterThanOrEqual(10);
    }
  });

  it("schedules no timers during mount (the old MatrixRain ran 16 setInterval loops)", () => {
    const intervalSpy = vi.spyOn(globalThis, "setInterval");
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    render(<matrix.Component />);
    expect(intervalSpy).not.toHaveBeenCalled();
    expect(timeoutSpy).not.toHaveBeenCalled();
  });
});
