import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { games } from "../../games/registry";
import { GameSlugGrid } from "./GameSlugGrid";

// The library grid carries the same cyan→blue "New" highlighter the game-night
// carousel uses, so a freshly-added game reads identically wherever it shows —
// and the profile answers "who actually bought the new game".

/** A slug the catalog currently flags `isNew`, and one it does not. */
const newSlug = games.find((g) => g.isNew === true)?.slug;
const plainSlug = games.find((g) => g.isNew !== true)?.slug as string;

function tile(title: string): HTMLElement {
  const button = screen.getByText(title).closest("button");
  if (!button) throw new Error(`no tile rendered for ${title}`);
  return button;
}

describe("GameSlugGrid", () => {
  it("renders a tile per resolvable slug", () => {
    render(<GameSlugGrid slugs={[plainSlug]} emptyTitle="none" />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("falls back to the empty state when nothing resolves", () => {
    render(<GameSlugGrid slugs={["not-a-real-game"]} emptyTitle="No games in the library" />);
    expect(screen.getByText("No games in the library")).toBeInTheDocument();
  });

  it.runIf(newSlug)("frames a New game in the library and badges it", () => {
    const game = games.find((g) => g.slug === newSlug);
    if (!game) throw new Error("expected a New game in the catalog");
    render(<GameSlugGrid slugs={[game.slug]} highlightNew emptyTitle="none" />);

    expect(tile(game.title).className).toContain("card-frame-new");
    expect(screen.getByText(/^New$/)).toBeInTheDocument();
  });

  it.runIf(newSlug)("leaves the New frame off when highlightNew is not set", () => {
    // Wishlist / favorites: a New game there is explicitly NOT owned, so the
    // "someone bought this" signal must not fire.
    const game = games.find((g) => g.slug === newSlug);
    if (!game) throw new Error("expected a New game in the catalog");
    render(<GameSlugGrid slugs={[game.slug]} emptyTitle="none" />);

    expect(tile(game.title).className).not.toContain("card-frame-new");
    expect(screen.queryByText(/^New$/)).not.toBeInTheDocument();
  });

  it("never frames a game the catalog does not flag", () => {
    const game = games.find((g) => g.slug === plainSlug);
    if (!game) throw new Error("expected a non-New game in the catalog");
    render(<GameSlugGrid slugs={[game.slug]} highlightNew emptyTitle="none" />);

    expect(tile(game.title).className).not.toContain("card-frame-new");
  });
});
