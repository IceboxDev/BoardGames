import { describe, expect, it } from "vitest";
import { BgaEventSchema } from "../../../protocol/http/bga";
import { cardIdName } from "../types";
import {
  applyBgaEvent,
  initBgaFold,
  matchWonderId,
  spectatorNames,
  toSpectatorView,
} from "./adapter";
import sampleGame from "./fixtures/sample-game.json";

function foldFixture(upTo?: number) {
  let state = initBgaFold();
  for (const raw of sampleGame.events) {
    const event = BgaEventSchema.parse(raw);
    if (upTo !== undefined && event.seq > upTo) break;
    state = applyBgaEvent(state, event);
  }
  return state;
}

describe("bga adapter", () => {
  it("returns no view before the first gamedatas", () => {
    expect(toSpectatorView(initBgaFold())).toBeNull();
  });

  it("builds a spectator view (me: null) from gamedatas", () => {
    const view = toSpectatorView(foldFixture(0));
    expect(view).not.toBeNull();
    expect(view?.me).toBeNull();
    expect(view?.playerCount).toBe(3);
    expect(view?.players.map((p) => p.wonderId)).toEqual(["rhodes", "babylon", "giza"]);
    expect(view?.players.every((p) => p.coins === 3)).toBe(true);
    expect(spectatorNames(foldFixture(0))).toEqual(["Mantas", "Ada", "Bo"]);
  });

  it("folds plays, discards, coins, wonder stages and war tokens", () => {
    const view = toSpectatorView(foldFixture(7));
    if (!view) throw new Error("expected a view");

    const [rhodes, babylon, giza] = view.players;
    expect(rhodes.tableau.map(cardIdName)).toEqual(["Lumber Yard"]);
    expect(rhodes.stagesBuilt).toBe(1);
    expect(rhodes.militaryTokens).toEqual([1]);

    expect(babylon.tableau.map(cardIdName)).toEqual(["Apothecary"]);
    expect(babylon.scienceCounts.compass).toBe(1);

    expect(giza.tableau).toEqual([]);
    expect(giza.coins).toBe(6); // 3 + discard delta
    expect(view.discardCount).toBe(1);
  });

  it("ignores unknown notification types without breaking the fold", () => {
    const state = foldFixture(7);
    expect(state.unknownNotifTypes.has("someFutureNotifType")).toBe(true);
    expect(toSpectatorView(state)).not.toBeNull();
  });

  it("advances the age and keeps folding", () => {
    const view = toSpectatorView(foldFixture(9));
    if (!view) throw new Error("expected a view");
    expect(view.age).toBe(2);
    expect(view.players[1].tableau.map(cardIdName)).toEqual(["Apothecary", "Laboratory"]);
    expect(view.players[1].scienceCounts.gear).toBe(1);
  });

  it("a later gamedatas checkpoint rebuilds the fold from scratch", () => {
    let state = foldFixture(9);
    state = applyBgaEvent(state, {
      seq: 10,
      kind: "gamedatas",
      ts: 1,
      payload: {
        players: { "77": { id: "77", name: "Solo", coins: "9", wonder: "ephesos" } },
        playerorder: ["77"],
        age: "3",
      },
    });
    const view = toSpectatorView(state);
    expect(view?.playerCount).toBe(1);
    expect(view?.age).toBe(3);
    expect(view?.players[0].wonderId).toBe("ephesos");
    expect(view?.players[0].coins).toBe(9);
  });

  it("matches wonder ids from several naming styles", () => {
    expect(matchWonderId("The Hanging Gardens of Babylon")).toBe("babylon");
    expect(matchWonderId("halikarnassos_b")).toBe("halikarnassos");
    expect(matchWonderId("The Statue of Zeus in Olympia")).toBe("olympia");
    expect(matchWonderId("Lighthouse of Alexandria")).toBe("alexandria");
    expect(matchWonderId("something else entirely")).toBeNull();
  });
});
