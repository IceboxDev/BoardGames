import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { games } from "../../games/registry";
import { compareForHeadcount, coversWindow } from "../../lib/bgg-format";
import GameCarousel3D from "./GameCarousel3D";

// Regression for a locked two-player night: Codenames / Gloomhaven /
// Villainous were sorted to the FRONT of the carousel because each owns a
// sibling BGG rates "best at 2" — but the card that rendered was the family's
// canonical (best at 6 / 3 / 3), so it advertised a limp "Fits 2" in a slot
// its sibling had earned. The card must open on the sibling that won the sort.
//
// This pins the carousel's *default active member*. `families.test.ts` pins
// the `anchor` that feeds it; without this test, reverting the carousel back
// to `family.canonical` would leave every families test green.

/** Mirrors `useRsvpAvailability`: keep games covering the window, then rank. */
function rankedFor(lo: number, hi: number, slugs: string[]) {
  const owned = new Set(slugs);
  return games
    .filter((g) => owned.has(g.slug) && coversWindow(g, lo, hi))
    .sort((a, b) => compareForHeadcount(a, b, lo));
}

function renderAt(lo: number, hi: number, slugs: string[]) {
  render(
    <GameCarousel3D
      games={rankedFor(lo, hi, slugs)}
      minPlayers={lo}
      maxPlayers={hi}
      date=""
      reactions={{}}
    />,
  );
}

describe("GameCarousel3D — family card opens on the member that won the sort", () => {
  it("shows Codenames: Duet, not Codenames, on a two-player night", () => {
    renderAt(2, 2, ["codenames", "codenames-duet", "codenames-pictures"]);

    expect(screen.getByText("Codenames: Duet")).toBeInTheDocument();
    // The canonical must NOT be the face of the card. (Its variant chip still
    // reads "Original", so we assert on the title, not on the string anywhere.)
    expect(screen.queryByText("Codenames", { selector: "h3, h2, p" })).toBeNull();
    // And the badge it earned its position with is the one on display. It
    // renders twice by design — the thumbnail badge and the card-body meta
    // line — so assert presence, not uniqueness.
    expect(screen.getAllByText(/best at 2/i).length).toBeGreaterThan(0);
  });

  it("shows Gloomhaven: Jaws of the Lion, not Gloomhaven, on a two-player night", () => {
    renderAt(2, 2, ["gloomhaven", "gloomhaven-jaws-of-the-lion"]);

    expect(screen.getByText("Gloomhaven: Jaws of the Lion")).toBeInTheDocument();
    expect(screen.getAllByText(/best at 2/i).length).toBeGreaterThan(0);
  });

  it("shows the New base game for Villainous, whose New flag outranks best-at-2", () => {
    renderAt(2, 2, ["villainous", "villainous-introduction-to-evil"]);

    expect(screen.getByText("Villainous: The Worst Takes it All")).toBeInTheDocument();
    expect(screen.getByText(/^New$/i)).toBeInTheDocument();
  });

  it("still opens a family on its canonical when no sibling outranks it", () => {
    // A 6-player night: Codenames itself is best at 6, so it wins its own
    // family and the card opens on it — the anchor is not blindly "whoever is
    // not canonical".
    renderAt(6, 6, ["codenames", "codenames-pictures"]);

    expect(screen.getByText("Codenames")).toBeInTheDocument();
    expect(screen.getAllByText(/best at 6/i).length).toBeGreaterThan(0);
  });
});
