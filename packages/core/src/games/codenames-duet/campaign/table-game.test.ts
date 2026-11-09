import { describe, expect, it } from "vitest";
import { applyTableEvent, newTableGame, type TableEvent, type TableGame } from "./table-game";

const play = (game: TableGame, ...events: TableEvent["type"][]) =>
  events.reduce((g, type) => applyTableEvent(g, { type } as TableEvent), game);

describe("table game tracker", () => {
  it("starts a mission with its turns and free mistakes", () => {
    const g = newTableGame({ city: "berlin" });
    expect(g).toMatchObject({ tokens: 11, mistakesTotal: 2, mistakesLeft: 2, phase: "clue" });
    expect(newTableGame({ city: "prague" }).mistakesTotal).toBeNull();
  });

  it("a stop keeps the free mistakes; a bystander uses one, then costs two turns", () => {
    let g = play(newTableGame({ city: "berlin" }), "agent", "stop");
    expect(g).toMatchObject({ tokens: 10, mistakesLeft: 2, agentsFound: 1, giver: 1, turns: 1 });
    g = play(g, "bystander", "bystander");
    expect(g).toMatchObject({ tokens: 8, mistakesLeft: 0 });
    g = play(g, "bystander");
    expect(g.tokens).toBe(6);
  });

  it("the last turn spent starts sudden death, where any miss loses", () => {
    let g = newTableGame({ city: null, tokens: 7 });
    for (let i = 0; i < 7; i++) g = play(g, "stop");
    expect(g.phase).toBe("sudden-death");
    expect(play(g, "stop").phase).toBe("sudden-death");
    expect(play(g, "agent", "bystander")).toMatchObject({ phase: "lost", lostBy: "sudden-death" });
  });

  it("wins on the fifteenth agent and loses on the assassin", () => {
    const won = play(newTableGame({ city: "prague" }), ...Array(15).fill("agent"));
    expect(won.phase).toBe("won");
    expect(play(won, "assassin").phase).toBe("won");
    expect(play(newTableGame({ city: "prague" }), "assassin")).toMatchObject({
      phase: "lost",
      lostBy: "assassin",
    });
  });

  it("a player with no agents left stops giving clues", () => {
    let g = applyTableEvent(newTableGame({ city: "prague" }), { type: "clued-out", player: 0 });
    expect(g.giver).toBe(1);
    g = play(g, "stop", "stop");
    expect(g.giver).toBe(1);
  });
});
