import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Sparkline } from "./Sparkline";

const root = document.documentElement;

afterEach(() => {
  root.style.removeProperty("--color-accent-500");
  act(() => {
    window.dispatchEvent(new CustomEvent("themechange"));
  });
});

describe("chart components re-render on themechange", () => {
  it("a mounted Sparkline restrokes when the accent var changes", () => {
    const { container } = render(<Sparkline data={[1, 3, 2, 5]} />);
    const polyline = () => container.querySelector("polyline");
    expect(polyline()?.getAttribute("stroke")).toBe("#6366f1");

    act(() => {
      root.style.setProperty("--color-accent-500", "#ff2d95");
      window.dispatchEvent(new CustomEvent("themechange"));
    });
    expect(polyline()?.getAttribute("stroke")).toBe("#ff2d95");

    act(() => {
      root.style.removeProperty("--color-accent-500");
      window.dispatchEvent(new CustomEvent("themechange"));
    });
    expect(polyline()?.getAttribute("stroke")).toBe("#6366f1");
  });
});
