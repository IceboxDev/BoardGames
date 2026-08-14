import type { ProfileEditable, ProfileStats, ProfileUserSummary } from "@boardgames/core/protocol";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfileHeader } from "./ProfileHeader";

// ── Regression: the "Edit profile" button must not fall over the avatar ──
//
// Button's base class is `relative` (its loading-spinner anchor). This header
// once pinned the button by passing `absolute right-3 top-3` through the
// Button's own className; the two position classes fought in the stylesheet,
// `relative` won by generated-CSS order, and the button dropped into normal
// flow at the card's left edge — floating on top of the avatar. The fix is
// structural: an absolutely-positioned WRAPPER owns the placement and the
// Button itself carries no position class. These tests pin that structure.

const user: ProfileUserSummary = {
  id: "u1",
  name: "Test Player",
  image: null,
  role: null,
  memberSince: "2026-04-01T00:00:00.000Z",
};

const profile: ProfileEditable = {
  tagline: null,
  bio: null,
  pronouns: null,
  location: null,
  accentHex: null,
  favorites: [],
  wishlist: [],
  links: [],
};

const stats: ProfileStats = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  winRate: null,
  performance: null,
  moderated: 0,
  ongoing: 0,
  scored: 0,
  gamesOwned: 0,
  distinctGames: 0,
  nightsAttended: 0,
  nightsTotal: 0,
  favoriteGameSlug: null,
  perGame: [],
};

function renderHeader(overrides: { isSelf?: boolean } = {}) {
  return render(
    <ProfileHeader
      user={user}
      profile={profile}
      stats={stats}
      isSelf={overrides.isSelf ?? true}
      canChangeAvatar
      onEdit={() => {}}
      onChangeAvatar={() => {}}
    />,
  );
}

describe("ProfileHeader — edit-button placement", () => {
  it("positions the wrapper, never the Button itself", () => {
    renderHeader();
    const button = screen.getByRole("button", { name: /edit profile/i });
    // The Button keeps its own `relative` spinner anchor…
    expect(button.className).toContain("relative");
    expect(button.className).not.toContain("absolute");
    // …and placement belongs to the wrapper pinned to the banner's corner.
    const wrapper = button.parentElement;
    expect(wrapper?.className).toContain("absolute");
    expect(wrapper?.className).toContain("right-3");
    expect(wrapper?.className).toContain("top-3");
  });

  it("renders no edit button for other players' profiles", () => {
    renderHeader({ isSelf: false });
    expect(screen.queryByRole("button", { name: /edit profile/i })).toBeNull();
  });
});
