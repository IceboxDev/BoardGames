import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LineChart } from "./LineChart";

/** Tick labels in the order they sit on screen, top to bottom. */
function ticksTopDown(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, "image/svg+xml");
  return [...doc.querySelectorAll('text[text-anchor="end"]')]
    .filter((t) => !t.getAttribute("transform"))
    .map((t) => ({ y: Number(t.getAttribute("y")), text: t.textContent ?? "" }))
    .filter((t) => Number.isFinite(t.y) && t.y < 170)
    .sort((a, b) => a.y - b.y)
    .map((t) => t.text);
}

function circleXs(html: string): number[] {
  const doc = new DOMParser().parseFromString(html, "image/svg+xml");
  return [...doc.querySelectorAll("circle")].map((c) => Number(c.getAttribute("cx")));
}

const data = [
  { x: 0, y: 76, label: "Sep 25" },
  { x: 3, y: 79, label: "Sep 28" },
  { x: 4, y: 79, label: "Sep 29" },
];

describe("LineChart", () => {
  it("labels the axis with the largest value on top, in round steps", () => {
    const ticks = ticksTopDown(renderToStaticMarkup(<LineChart data={data} height={180} />));
    expect(ticks[0]).toBe("79");
    expect(ticks[ticks.length - 1]).toBe("76");
    expect(ticks.every((t) => Number.isInteger(Number(t)))).toBe(true);
  });

  it("puts the smallest value on top when lower is better", () => {
    const ticks = ticksTopDown(
      renderToStaticMarkup(<LineChart data={data} height={180} invertY />),
    );
    expect(ticks[0]).toBe("76");
  });

  it("spaces points by x, not by index", () => {
    const [a, b, c] = circleXs(renderToStaticMarkup(<LineChart data={data} />));
    expect((b - a) / (c - b)).toBeCloseTo(3);
  });

  it("honours a fixed domain and formatter", () => {
    const html = renderToStaticMarkup(
      <LineChart data={data} height={180} yDomain={[0, 100]} formatY={(v) => `${v}%`} />,
    );
    const ticks = ticksTopDown(html);
    expect(ticks[0]).toBe("100%");
    expect(ticks[ticks.length - 1]).toBe("0%");
  });
});
