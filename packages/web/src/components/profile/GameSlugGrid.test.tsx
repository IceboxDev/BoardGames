import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { games } from "../../games/registry";
import { GameSlugGrid } from "./GameSlugGrid";

// The library grid carries the same cyan→blue "New" highlighter the game-night
// carousel uses. "New" is per member — the profile's `newSlugs`, a dated copy
// the member hasn't played yet — never a catalog property, so the grid is told
// which slugs to frame.

const game = games[0];
const other = games[1];

function tile(title: string): HTMLElement {
  const button = screen.getByText(title).closest("button");
  if (!button) throw new Error(`no tile rendered for ${title}`);
  return button;
}

describe("GameSlugGrid", () => {
  it("renders a tile per resolvable slug", () => {
    render(<GameSlugGrid slugs={[game.slug]} emptyTitle="none" />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("falls back to the empty state when nothing resolves", () => {
    render(<GameSlugGrid slugs={["not-a-real-game"]} emptyTitle="No games in the library" />);
    expect(screen.getByText("No games in the library")).toBeInTheDocument();
  });

  it("frames a member's new game and badges it, leaving the rest plain", () => {
    render(
      <GameSlugGrid
        slugs={[game.slug, other.slug]}
        newSlugs={new Set([game.slug])}
        emptyTitle="none"
      />,
    );

    expect(tile(game.title).className).toContain("card-frame-new");
    expect(tile(other.title).className).not.toContain("card-frame-new");
    expect(screen.getAllByText(/^New$/)).toHaveLength(1);
  });

  it("leaves the New frame off when no set is given", () => {
    // Wishlist / favorites: a game there is explicitly NOT owned, so the
    // "this member bought it" signal must not fire even for a new slug.
    render(<GameSlugGrid slugs={[game.slug]} emptyTitle="none" />);

    expect(tile(game.title).className).not.toContain("card-frame-new");
    expect(screen.queryByText(/^New$/)).not.toBeInTheDocument();
  });
});
