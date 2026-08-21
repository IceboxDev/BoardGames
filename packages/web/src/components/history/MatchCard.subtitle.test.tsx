import type { MatchRecord } from "@boardgames/core/history/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MatchCard } from "./MatchCard";

// Exact shape of prod row id=53 (Intarsia edited to scenario "Standard").
const intarsia: MatchRecord = {
  id: 53,
  dateKey: null,
  playedAt: "2026-07-10T20:00:00.000Z",
  gameSlug: "intarsia",
  gameTitle: "Intarsia",
  outcome: {
    kind: "free-for-all",
    players: [
      { userId: "u1", displayName: "Mantas", score: 116 },
      { userId: "u2", displayName: "Jaqueline", score: 100 },
    ],
    scenario: "Standard",
  },
  notes: null,
  recordedBy: "u1",
  recordedAt: "2026-07-10 20:00:00",
  updatedAt: "2026-07-16 23:05:22",
  sortOrder: 0,
};

// A game with no variant axis and no stored scenario — the fixed-variant
// config supplies "Standard" retroactively (prod rows had no subtitle).
const connect4: MatchRecord = {
  ...intarsia,
  id: 70,
  gameSlug: "connect-4",
  gameTitle: "Connect 4",
  outcome: {
    kind: "free-for-all",
    players: [
      { userId: "u1", displayName: "Mantas", score: 3 },
      { userId: "u2", displayName: "Jaqueline", score: 2 },
    ],
  },
};

const decryptoTeams = (sizes: number[]): MatchRecord => ({
  ...intarsia,
  id: 85,
  gameSlug: "decrypto",
  gameTitle: "Decrypto",
  outcome: {
    kind: "teams",
    teams: sizes.map((n, t) => ({
      members: Array.from({ length: n }, (_, i) => ({
        userId: `t${t}p${i}`,
        displayName: `Player ${t}${i}`,
      })),
    })),
    winnerTeamIndices: [0],
  },
});

describe("MatchCard subtitle", () => {
  it("shows the persisted scenario under the title", () => {
    render(<MatchCard match={intarsia} isAdmin={false} currentUserId={null} />);
    expect(screen.getByText("Standard")).toBeInTheDocument();
  });

  it("fixed-variant games subtitle legacy records with no stored scenario", () => {
    render(<MatchCard match={connect4} isAdmin={false} currentUserId={null} />);
    expect(screen.getByText("Standard")).toBeInTheDocument();
  });

  it("derives Decrypto's variant from the table shape", () => {
    const { unmount } = render(
      <MatchCard match={decryptoTeams([2, 3])} isAdmin={false} currentUserId={null} />,
    );
    expect(screen.getByText("Standard")).toBeInTheDocument();
    unmount();
    render(<MatchCard match={decryptoTeams([2, 1])} isAdmin={false} currentUserId={null} />);
    expect(screen.getByText("Interceptor")).toBeInTheDocument();
  });
});
