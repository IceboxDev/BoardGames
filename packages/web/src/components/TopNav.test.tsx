import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { TopNav, TopNavBackButton, TopNavLink } from "./TopNav";

// ── The logo-stability invariant ─────────────────────────────────────────
//
// The nav bar must be FULL-BLEED: no width cap, no per-page geometry. A
// previous "unification pass" capped the inner bar to each page's content
// width, which moved the "Board Game Lab" logo 64px+ between sibling pages
// (Players → Admin) — a regression no unit could see until this one. If a
// width prop or max-w-* ever reappears here, these tests are the tripwire.

function renderNav(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("TopNav — full-bleed geometry", () => {
  it("renders the logo linking home", () => {
    renderNav(<TopNav />);
    const logo = screen.getByRole("link", { name: /board game lab/i });
    expect(logo).toHaveAttribute("href", "/");
  });

  it("inner bar is full-bleed: w-full and never max-w capped or centered", () => {
    const { container } = renderNav(<TopNav />);
    const inner = container.querySelector("nav > div");
    expect(inner).not.toBeNull();
    const cls = inner?.className ?? "";
    expect(cls).toContain("w-full");
    expect(cls).not.toMatch(/max-w-/);
    expect(cls).not.toContain("mx-auto");
  });

  it("accepts no width prop (compile-level guard, asserted at runtime too)", () => {
    // @ts-expect-error — `width` was removed; the nav must not couple to page width.
    renderNav(<TopNav width="7xl" />);
    const inner = document.querySelector("nav > div");
    expect(inner?.className ?? "").not.toMatch(/max-w-/);
  });
});

describe("TopNav — slot ordering", () => {
  it("renders the back slot before page actions, regardless of call-site order", () => {
    renderNav(
      <TopNav back={<TopNavBackButton to="/" label="Dashboard" />}>
        <TopNavLink to="/history">History</TopNavLink>
      </TopNav>,
    );
    const links = screen.getAllByRole("link");
    // [logo, back, history] — back always immediately after the logo.
    expect(links[1]).toHaveTextContent("Dashboard");
    expect(links[2]).toHaveTextContent("History");
  });
});
