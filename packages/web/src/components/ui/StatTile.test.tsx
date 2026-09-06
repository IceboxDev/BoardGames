import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { StatTile } from "./StatTile";

// The three tile modes: plain metric, navigation link with a CTA row, and the
// inert "Soon" placeholder. Link mode must render a LINK role, never a button
// — ProfileHeader's regression test queries buttons and must only ever find
// the Edit-profile one.

describe("StatTile", () => {
  it("renders a link card with href and CTA text in link mode", () => {
    render(
      <MemoryRouter>
        <StatTile label="Games played" value={7} to="/u/u1/matches" cta="View history" />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/u/u1/matches");
    expect(link.textContent).toContain("View history");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders no link and a Soon slot in soon mode", () => {
    render(<StatTile label="Win rate" value="62%" soon />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Soon")).toBeTruthy();
  });

  it("renders a plain static tile by default", () => {
    render(<StatTile label="Games owned" value={50} sub="3 boxes" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText("Soon")).toBeNull();
    expect(screen.getByText("50")).toBeTruthy();
    expect(screen.getByText("3 boxes")).toBeTruthy();
  });

  it("types the figure on the size scale and colors it by tone", () => {
    const { rerender } = render(<StatTile label="Overdue" value={3} tone="rose" size="2xl" />);
    const figure = screen.getByText("3");
    expect(figure.className).toContain("text-2xl");
    expect(figure.className).toContain("text-rose-300");
    rerender(<StatTile label="Overdue" value={3} />);
    expect(screen.getByText("3").className).toContain("text-fg-strong");
  });

  it("can put the caption under the figure and drop the card chrome", () => {
    const { container } = render(
      <StatTile label="Wins" value={12} variant="plain" labelPosition="bottom" />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).not.toMatch(/border|bg-surface/);
    const order = Array.from(root.querySelectorAll("span")).map((s) => s.textContent);
    expect(order.indexOf("12")).toBeLessThan(order.indexOf("Wins"));
  });

  it("renders a free-form body in place of the figure (hero-card form)", () => {
    render(
      <StatTile label="Record" align="start" padding="lg">
        <p>donut goes here</p>
      </StatTile>,
    );
    expect(screen.getByText("Record")).toBeInTheDocument();
    expect(screen.getByText("donut goes here")).toBeInTheDocument();
  });
});
