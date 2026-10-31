// A curated private night (host picks, admin picks) lists its pickers' hyped
// games in the order they were picked; whose picks count comes from
// `deriveNightParticipants().voters`.

import { describe, expect, it } from "vitest";
import { rankNightLineup } from "./available-games.ts";

const hype = (user_id: string, game_slug: string, created_at: string) => ({
  user_id,
  game_slug,
  reaction: "hype" as const,
  created_at,
});
const playableSlugs = new Set(["azul", "jaipur", "wingspan", "carnegie"]);
const reactions = [
  hype("host", "azul", "2026-10-01 10:00:00"),
  hype("admin", "jaipur", "2026-10-01 10:00:01"),
  hype("guest", "wingspan", "2026-10-01 10:00:02"),
  hype("admin", "carnegie", "2026-10-01 10:00:03"),
];

describe("rankNightLineup — curated private nights", () => {
  it("host picks: the host's and the admins' picks, in pick order", () => {
    const { topSlugs } = rankNightLineup(
      {
        pickMode: "host",
        isPrivate: true,
        hostUserId: "host",
        voters: new Set(["host", "admin"]),
        playableSlugs,
      },
      reactions,
    );
    expect(topSlugs).toEqual(["azul", "jaipur", "carnegie"]);
  });

  it("admin picks: the admins' picks alone", () => {
    const { topSlugs } = rankNightLineup(
      {
        pickMode: "admin",
        isPrivate: true,
        hostUserId: "host",
        voters: new Set(["admin"]),
        playableSlugs,
      },
      reactions,
    );
    expect(topSlugs).toEqual(["jaipur", "carnegie"]);
  });
});
