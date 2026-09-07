import type {
  LogEntry,
  SensoPlayerView,
} from "@boardgames/core/games/senso-battle-for-japan/types";
import { describe, expect, it } from "vitest";
import { mapSensoLog } from "./log-mapper";

const view: Pick<SensoPlayerView, "me" | "players"> = {
  me: 0,
  players: [
    { index: 0, type: "human", clan: "takeda", handCount: 0, tricksWon: 0 },
    { index: 1, type: "ai", clan: "uesugi", handCount: 0, tricksWon: 0 },
  ],
};

const LOG: LogEntry[] = [
  { kind: "advantage-row", half: 1, row: ["takeda", "uesugi", "oda", "mori"] },
  { kind: "round-start", round: 1, trump: "takeda", firstPlayer: 0, cardsEach: 6 },
  {
    kind: "trick-won",
    round: 1,
    trick: 1,
    winner: 1,
    plays: [
      { seat: 0, card: "oda-3" },
      { seat: 1, card: "oda-9" },
    ],
  },
  {
    kind: "reward",
    round: 1,
    player: 1,
    tier: 5,
    action: { type: "aggression", region: 6, square: 0 },
    effects: [
      { kind: "removed", clan: "takeda", region: 6, square: 0 },
      { kind: "placed", clan: "uesugi", region: 6, square: 0 },
    ],
  },
  { kind: "reward-pass", round: 2, player: 0, tier: 1 },
  { kind: "bonus", player: 0, region: 3, square: 0, clan: "takeda" },
  { kind: "game-over", scores: [12, 15], winner: 1 },
];

function text(spans: readonly unknown[]): string {
  return spans
    .map((s) => {
      if (typeof s === "string") return s;
      if (s && typeof s === "object") {
        const span = s as { text?: string; card?: string };
        return span.text ?? span.card ?? "";
      }
      return "";
    })
    .join("");
}

describe("mapSensoLog", () => {
  it("groups entries into round blocks labelled with the trump clan", () => {
    const blocks = mapSensoLog(LOG, view, [null, "Aydan"]);
    expect(blocks.map((b) => b.label)).toEqual([
      "Round 1 · 武田 Takeda",
      "Round 2",
      "Round 4",
      "Round 8",
    ]);
    expect(blocks[0].actions).toHaveLength(4);
  });

  it("writes human sentences with clan-coloured names and card refs", () => {
    const [round1] = mapSensoLog(LOG, view, [null, "Aydan"]);
    const sentences = round1.actions.map((a) => text(a.spans));
    expect(sentences[1]).toBe(
      "Round 1 begins — 武田 Takeda holds the advantage; You lead (6 cards each)",
    );
    expect(sentences[2]).toBe("Aydan won conflict 1 with 織9");
    expect(sentences[3]).toBe("Aydan struck 武田 Takeda in region 7");
    expect(round1.actions[3].variant).toBe("danger");
  });

  it("describes passes, bonus cubes and the final result", () => {
    const blocks = mapSensoLog(LOG, view, []);
    expect(text(blocks[1].actions[0].spans)).toBe("You waived their reward");
    expect(text(blocks[2].actions[0].spans)).toBe("You placed a bonus cube in region 4");
    expect(text(blocks[3].actions[0].spans)).toBe("Uesugi takes the throne with 15 VP");
  });
});
