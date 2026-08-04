import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ButtonLink } from "./Button";

describe("ButtonLink", () => {
  it("renders an anchor wearing the secondary button skin by default", () => {
    render(<ButtonLink href="https://bgg.test/game">View on BGG</ButtonLink>);
    const link = screen.getByRole("link", { name: "View on BGG" });
    expect(link).toHaveAttribute("href", "https://bgg.test/game");
    expect(link.className).toMatch(/bg-surface-800/);
  });

  it("adds target=_blank rel=noreferrer only when external", () => {
    const { rerender } = render(<ButtonLink href="/x">In-app</ButtonLink>);
    const inApp = screen.getByRole("link", { name: "In-app" });
    expect(inApp).not.toHaveAttribute("target");

    rerender(
      <ButtonLink href="https://x.test" external>
        Out
      </ButtonLink>,
    );
    const out = screen.getByRole("link", { name: "Out" });
    expect(out).toHaveAttribute("target", "_blank");
    expect(out).toHaveAttribute("rel", "noreferrer");
  });

  it("supports the shared variant/tone/shape axes", () => {
    render(
      <ButtonLink href="/x" variant="tinted" tone="purple" shape="pill" size="xs">
        Pill
      </ButtonLink>,
    );
    const link = screen.getByRole("link", { name: "Pill" });
    expect(link.className).toMatch(/rounded-full/);
    expect(link.className).toMatch(/bg-purple-500\/15/);
  });
});
