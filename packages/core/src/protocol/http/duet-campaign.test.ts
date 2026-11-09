import { describe, expect, it } from "vitest";
import {
  CampaignDetailResponseSchema,
  CreateCampaignBodySchema,
  RecordTableGameBodySchema,
  UpdateCampaignBodySchema,
} from "./duet-campaign.ts";

describe("duet campaign protocol", () => {
  it("parses a campaign with its games", () => {
    const parsed = CampaignDetailResponseSchema.parse({
      campaign: {
        id: "c_12345678",
        name: "Night Owls",
        partnerKind: "member",
        guestName: null,
        members: [{ userId: "u1", name: "Mantas", image: null }],
        createdBy: "u1",
        createdAt: "2026-11-09T10:00:00.000Z",
        archived: false,
        cleared: 1,
        gamesPlayed: 2,
        wins: 1,
        lastPlayedAt: "2026-11-09T11:00:00.000Z",
        games: [
          {
            id: "s-1",
            city: "prague",
            won: true,
            agentsFound: 15,
            tokensLeft: 2,
            mode: "solo",
            replayId: 7,
            playedAt: "2026-11-09T11:00:00.000Z",
            recordedBy: null,
            note: null,
          },
        ],
      },
    });
    expect(parsed.campaign.games[0]?.city).toBe("prague");
  });

  it("rejects an unknown city, a bad partner and an empty update", () => {
    const body = { clientId: "abcdefgh12", city: "atlantis", won: true };
    expect(RecordTableGameBodySchema.safeParse(body).error?.issues[0]?.path).toEqual(["city"]);
    expect(
      CreateCampaignBodySchema.safeParse({ name: "X", partner: { kind: "robot" } }).success,
    ).toBe(false);
    expect(UpdateCampaignBodySchema.safeParse({}).success).toBe(false);
  });

  it("caps a table game's numbers", () => {
    const r = RecordTableGameBodySchema.safeParse({
      clientId: "abcdefgh12",
      city: "paris",
      won: false,
      agentsFound: 16,
    });
    expect(r.error?.issues[0]?.path).toEqual(["agentsFound"]);
  });
});
