import { describe, expect, it } from "vitest";
import { applyBgaEvent, type BgaFoldState, initBgaFold, toSpectatorView } from "./adapter";
import realCapture from "./fixtures/real-capture.json";

/**
 * Regression test against a REAL captured Board Game Arena game (5 players,
 * Edifice + Cities, played to the end). The fixture is the notifqueue slice of
 * the raw bridge stream (the WebSocket-tee copies are exact duplicates deduped
 * on `uid`, so dropping them keeps the fixture small without changing the
 * result). A separate synthetic case exercises the WebSocket envelope shape.
 */
function foldEvents(events: Array<{ kind: string; payload: unknown }>): BgaFoldState {
  let state = initBgaFold();
  for (const event of events) {
    state = applyBgaEvent(state, event as { kind: "gamedatas" | "notif"; payload: unknown });
  }
  return state;
}

describe("bga adapter — empty", () => {
  it("returns no view before the first gamedatas", () => {
    expect(toSpectatorView(initBgaFold())).toBeNull();
    const afterStrayNotif = applyBgaEvent(initBgaFold(), { kind: "notif", payload: {} });
    expect(toSpectatorView(afterStrayNotif)).toBeNull();
  });
});

describe("bga adapter — WebSocket envelope", () => {
  it("extracts notifs from a Centrifugo push frame", () => {
    let state = applyBgaEvent(initBgaFold(), {
      kind: "gamedatas",
      payload: {
        playerorder: [1, 2],
        players: { 1: { name: "A", wonder: 1, coin: 3 }, 2: { name: "B", wonder: 2, coin: 3 } },
        wonders: {
          1: { name: "Giza", side: "A", ress: ["S"] },
          2: { name: "Babylon", side: "B", ress: ["W"] },
        },
        card_types: { 6: { name: "Apothecary", category: "sci" } },
        age: 1,
      },
    });
    // A coinDelta wrapped in the ws push envelope.
    state = applyBgaEvent(state, {
      kind: "notif",
      payload: {
        source: "ws",
        data: {
          push: {
            pub: {
              data: { data: [{ uid: "u1", type: "coinDelta", args: { player_id: 1, coin: 9 } }] },
            },
          },
        },
      },
    });
    const view = toSpectatorView(state);
    expect(view?.players[0].coins).toBe(9);
  });
});

describe("bga adapter — real 5-player Edifice capture", () => {
  const view = toSpectatorView(foldEvents(realCapture));
  if (!view) throw new Error("expected a spectator view from the real capture");

  it("reconstructs the game to the end", () => {
    expect(view.age).toBe(3);
    expect(view.finished).toBe(true);
    expect(view.discardCount).toBe(15);
  });

  it("seats all five players with real names and wonders", () => {
    expect(view.players.map((p) => p.name)).toEqual([
      "Iceybin",
      "farussi",
      "Fourmironman",
      "tamphao",
      "Ruodwulf",
    ]);
    expect(view.players.map((p) => `${p.wonderName} [${p.side}]`)).toEqual([
      "The Hanging Gardens of Babylon [B]",
      "The Colossus of Rhodes [B]",
      "The Port of Carthage [A]",
      "The Pyramids of Giza [A]",
      "The Statue of Zeus in Olympia [A]",
    ]);
  });

  it("tracks coins, shields, wonder stages and tableaus", () => {
    expect(view.players.map((p) => p.coins)).toEqual([7, 4, 0, 2, 0]);
    expect(view.players.map((p) => p.shields)).toEqual([0, 8, 9, 6, 6]);
    expect(view.players.map((p) => p.stagesBuilt)).toEqual([2, 2, 3, 4, 3]);
    expect(view.players.map((p) => p.tableau.length)).toEqual([19, 16, 15, 14, 12]);
    expect(view.players[0].science.wild).toBe(2);
    expect(view.players[0].science.tablet).toBe(4);
  });

  it("resolves military conflict tokens", () => {
    expect(view.players[2].militaryTokens).toEqual([3, 5, 5]);
    expect(view.players[0].militaryTokens).toEqual([]);
  });

  it("reconstructs the three Edifices, all completed", () => {
    expect(view.edifices.map((e) => e.name)).toEqual([
      "Money Changer",
      "River Port",
      "Military School",
    ]);
    for (const e of view.edifices) {
      expect(e.status).toBe("built");
      expect(e.tokensLeft).toBe(0);
    }
    expect(view.edifices[0].reward).toBe("4🪙");
    expect(view.edifices[0].penalty).toBe("pay 2🪙");
    expect(view.edifices[2].penalty).toBe("discard a military card");
    expect(view.edifices[0].participants).toEqual(
      expect.arrayContaining(["tamphao", "Fourmironman", "Ruodwulf"]),
    );
  });

  it("assigns Edifice participation pawns to the right players", () => {
    expect(view.players[2].edificePawns).toEqual([1, 2, 3]);
    expect(view.players[3].edificePawns).toEqual([1, 2, 3]);
    expect(view.players[0].edificePawns).toEqual([]);
    expect(view.players[1].edificePawns).toEqual([]);
  });
});
