import { describe, expect, it } from "vitest";
import { mapSevenWondersLog, warLine } from "./log-mapper";

const text = (spans: readonly unknown[]) =>
  spans
    .map((s) =>
      typeof s === "string"
        ? s
        : ((s as { text?: string; card?: string }).text ?? (s as { card?: string }).card),
    )
    .join("");

describe("7 Wonders history", () => {
  it("tells a war line for every mix of results, in the past tense", () => {
    expect(warLine("You", [5, 5])).toBe("You won both battles · +10 VP");
    expect(warLine("Rhodes", [5, -1])).toBe("Rhodes won one battle and lost the other · +4 VP");
    expect(warLine("You", [0, 3])).toBe("You won one battle and tied the other · +3 VP");
    expect(warLine("Giza", [-1, 0])).toBe("Giza lost one battle and tied the other · −1 VP");
    expect(warLine("You", [-1, -1])).toBe("You lost both battles · −2 VP");
    expect(warLine("You", [0, 0])).toBe("You tied both battles · no change");
  });

  it("names each wonder stage and says how a card was paid for", () => {
    const blocks = mapSevenWondersLog(
      [
        {
          type: "reveal",
          age: 1,
          turn: 1,
          plays: [
            { playerIndex: 0, action: "build-wonder", cardId: "Baths@1#0" },
            { playerIndex: 1, action: "discard", cardId: "Baths@1#1" },
            {
              playerIndex: 2,
              action: "play-card",
              cardId: "Altar@1#0",
              payment: { kind: "resources", left: 1, right: 1 },
            },
          ],
        },
        {
          type: "reveal",
          age: 1,
          turn: 2,
          plays: [{ playerIndex: 0, action: "build-wonder", cardId: "Altar@1#1" }],
        },
        { type: "game-end", totals: [66, 40, 30], winner: 0 },
      ],
      0,
      ["You", "Rhodes", "Giza"],
    );
    const lines = blocks.flatMap((b) => b.actions.map((a) => text(a.spans)));
    expect(lines).toContain("You built wonder stage Ⅰ");
    expect(lines).toContain("You built wonder stage Ⅱ");
    expect(lines).toContain("Rhodes sold a card for 3🪙");
    expect(lines).toContain("Giza built Altar (paid 2🪙 to neighbours)");
    expect(lines).toContain("You won with 66 VP");
    // Oldest first: ActionLog turns the blocks around to show the newest on top.
    expect(blocks.map((b) => b.label)).toEqual(["Age Ⅰ · Turn 1", "Age Ⅰ · Turn 2", "Game over"]);
  });
});
