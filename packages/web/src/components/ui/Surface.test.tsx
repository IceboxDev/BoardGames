import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RADIUS_CARD_LG, RADIUS_CARD_MD } from "./radii";
import { Surface } from "./Surface";

describe("Surface", () => {
  it("renders a div with panel chrome by default", () => {
    render(<Surface>body</Surface>);
    const el = screen.getByText("body");
    expect(el.tagName).toBe("DIV");
    expect(el.className).toMatch(/bg-surface-900/);
    expect(el.className).toContain(RADIUS_CARD_LG);
  });

  it("renders the requested element via `as`", () => {
    render(<Surface as="article">body</Surface>);
    expect(screen.getByText("body").tagName).toBe("ARTICLE");
  });

  it("applies the tile variant and padding scale", () => {
    render(
      <Surface variant="tile" padding="lg">
        body
      </Surface>,
    );
    const cls = screen.getByText("body").className;
    expect(cls).toContain(RADIUS_CARD_MD);
    expect(cls).toMatch(/\bp-4\b/);
  });

  it("forwards className and arbitrary attributes", () => {
    render(
      <Surface className="flex gap-2" data-testid="s">
        body
      </Surface>,
    );
    const el = screen.getByTestId("s");
    expect(el.className).toMatch(/flex/);
  });
});
