import type { SkillPlayerRef, SpotlightPayload } from "@boardgames/core/protocol";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SpotlightModalView } from "./SpotlightModal";

// A spotlight is group news about ONE member, shown to everyone — so the two
// things worth pinning are the voice switch (the subject reads "you", the rest
// read a name) and the fact that nobody who lost ground is ever named.

const PLAYERS: Record<string, SkillPlayerRef> = {
  u1: { name: "Riccardo Giordano", image: null },
  u2: { name: "Mantas Kandratavičius", image: null },
  u3: { name: "Paul Keppner", image: null },
};

const CROWN: SpotlightPayload = {
  event: { kind: "trait-climb", trait: "pln", from: 4, to: 1, fieldSize: 6 },
  runnersUp: [{ userId: "u3", event: { kind: "streak-lead", length: 4 } }],
  proof: {
    rows: [
      { userId: "u1", rank: 1, value: "88" },
      { userId: "u2", rank: 2, value: "81" },
    ],
  },
};

function renderSpotlight(payload: SpotlightPayload, viewerId: string | null) {
  return render(
    <MemoryRouter>
      <SpotlightModalView
        payload={payload}
        subjectUserId="u1"
        viewerId={viewerId}
        players={PLAYERS}
        accentHex="#6366f1"
        onDismiss={() => {}}
        onCta={() => {}}
      />
    </MemoryRouter>,
  );
}

describe("SpotlightModalView", () => {
  it("addresses the subject in second person", () => {
    renderSpotlight(CROWN, "u1");
    expect(screen.getByText("You're the group's new Planning leader")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /see your stats/i })).toBeInTheDocument();
  });

  it("addresses everyone else by the subject's first name", () => {
    renderSpotlight(CROWN, "u2");
    expect(screen.getByText("Riccardo is the group's new Planning leader")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /see riccardo's stats/i })).toBeInTheDocument();
  });

  it("shows the move as a rank jump and the board it happened on", () => {
    renderSpotlight(CROWN, "u2");
    expect(screen.getByText("4th")).toBeInTheDocument();
    expect(screen.getByText("1st")).toBeInTheDocument();
    expect(screen.getByText("Planning leaderboard")).toBeInTheDocument();
  });

  it("mentions a runner-up once, and by a different person than the headline", () => {
    renderSpotlight(CROWN, "u2");
    expect(screen.getByText("Also moving up")).toBeInTheDocument();
    expect(screen.getByText("Paul is on four straight wins")).toBeInTheDocument();
  });

  it("drops a proof row for a member the side-car can no longer name", () => {
    renderSpotlight(
      {
        ...CROWN,
        proof: {
          rows: [
            { userId: "u1", rank: 1, value: "88" },
            { userId: "gone", rank: 2, value: "81" },
          ],
        },
      },
      "u2",
    );
    expect(screen.queryByText(/unknown player/i)).not.toBeInTheDocument();
  });

  it("renders an event with no board of its own", () => {
    renderSpotlight(
      {
        event: { kind: "profile-unlocked", ratedMatches: 9, distinctGames: 3 },
        runnersUp: [],
        proof: null,
      },
      "u2",
    );
    expect(screen.getByText("Riccardo's skill profile just unlocked")).toBeInTheDocument();
    expect(screen.getByText("All six traits")).toBeInTheDocument();
    expect(screen.queryByText("The board now")).not.toBeInTheDocument();
  });
});
