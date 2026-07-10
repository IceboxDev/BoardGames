import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageMain, PageShell } from "./PageShell";

describe("PageShell — layout modes", () => {
  it("layout='scroll' applies min-h-dvh + flex-col", () => {
    const { container } = render(
      <PageShell layout="scroll">
        <div>X</div>
      </PageShell>,
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toMatch(/min-h-dvh/);
    expect(outer.className).toMatch(/flex-col/);
  });

  it("layout='fixed' applies h-dvh + overflow-hidden", () => {
    const { container } = render(
      <PageShell layout="fixed">
        <div>X</div>
      </PageShell>,
    );
    expect((container.firstChild as HTMLElement).className).toMatch(/h-dvh/);
    expect((container.firstChild as HTMLElement).className).toMatch(/overflow-hidden/);
  });

  it("layout='centered' renders its own <main> with centering", () => {
    render(
      <PageShell layout="centered">
        <div data-testid="content">X</div>
      </PageShell>,
    );
    const main = screen.getByRole("main");
    expect(main.className).toMatch(/items-center/);
    expect(main.className).toMatch(/justify-center/);
    // Content is inside that main, not in a sibling element.
    expect(main.contains(screen.getByTestId("content"))).toBe(true);
  });
});

describe("PageShell — backgrounds", () => {
  it("background='grid' adds bg-surface-950 and bg-grid", () => {
    const { container } = render(
      <PageShell background="grid">
        <div>X</div>
      </PageShell>,
    );
    expect((container.firstChild as HTMLElement).className).toMatch(/bg-surface-950/);
    expect((container.firstChild as HTMLElement).className).toMatch(/bg-grid/);
  });

  it("background='none' is transparent", () => {
    const { container } = render(
      <PageShell background="none">
        <div>X</div>
      </PageShell>,
    );
    expect((container.firstChild as HTMLElement).className).not.toMatch(/bg-surface-950/);
  });
});

describe("PageMain — widths and padding", () => {
  it.each([
    ["md", /max-w-md/],
    ["2xl", /max-w-2xl/],
    ["3xl", /max-w-3xl/],
    ["6xl", /max-w-6xl/],
    ["7xl", /max-w-7xl/],
  ] as const)("width=%s applies its max-w class", (width, cls) => {
    render(
      <PageMain width={width}>
        <div>X</div>
      </PageMain>,
    );
    expect(screen.getByRole("main").className).toMatch(cls);
  });

  it("width='full' has no max-w class", () => {
    render(
      <PageMain width="full">
        <div>X</div>
      </PageMain>,
    );
    expect(screen.getByRole("main").className).not.toMatch(/max-w-/);
  });

  // `wide` replaces HistoryPage's hand-written responsive chain. It is the one
  // width whose cap changes per breakpoint, so it must stay a single preset
  // rather than a `width="full"` + className escape hatch.
  it("width='wide' widens across breakpoints from a readable base", () => {
    render(
      <PageMain width="wide">
        <div>X</div>
      </PageMain>,
    );
    const cls = screen.getByRole("main").className;
    expect(cls).toContain("max-w-3xl");
    expect(cls).toContain("lg:max-w-5xl");
    expect(cls).toContain("2xl:max-w-6xl");
    expect(cls).toContain("3xl:max-w-7xl");
  });

  it.each([
    ["tight", /py-2/],
    ["comfortable", /py-6/],
    ["dense", /py-8/],
    ["spacious", /py-6/],
  ] as const)("padding=%s applies its padding class", (padding, cls) => {
    render(
      <PageMain padding={padding}>
        <div>X</div>
      </PageMain>,
    );
    expect(screen.getByRole("main").className).toMatch(cls);
  });

  it("padding='none' leaves the main without padding", () => {
    render(
      <PageMain padding="none">
        <div>X</div>
      </PageMain>,
    );
    expect(screen.getByRole("main").className).not.toMatch(/px-\d/);
  });

  it("fillHeight=true upgrades the main to a flexbox with min-h-0", () => {
    render(
      <PageMain fillHeight>
        <div>X</div>
      </PageMain>,
    );
    const main = screen.getByRole("main");
    expect(main.className).toMatch(/flex/);
    expect(main.className).toMatch(/min-h-0/);
    expect(main.className).toMatch(/flex-1/);
  });

  it("forwards id and aria attributes", () => {
    render(
      // biome-ignore lint/correctness/useUniqueElementIds: test asserts forwarding of the exact id Layout.tsx uses for the portal target
      <PageMain id="app-main" aria-label="App content">
        <div>X</div>
      </PageMain>,
    );
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "app-main");
    expect(main).toHaveAttribute("aria-label", "App content");
  });
});
