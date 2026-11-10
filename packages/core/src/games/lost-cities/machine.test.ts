import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { lostCitiesSpec } from "./machine";

function startPvP(seed = 11) {
  const actor = createActor(lostCitiesSpec.machine);
  actor.start();
  actor.send(
    lostCitiesSpec.buildStart({
      seats: [{ kind: "human" }, { kind: "human" }],
      config: lostCitiesSpec.manifest.config.parse({}),
      seed,
    }),
  );
  return actor;
}

function act(actor: ReturnType<typeof startPvP>, player: number, action: unknown) {
  const v = lostCitiesSpec.validateAction(actor.getSnapshot(), player, {
    type: "PLAYER_ACTION",
    action,
  });
  if (!v.ok) throw new Error(v.reason);
  actor.send(v.event);
}

/** One whole turn for `player`: discard the first card, then draw from the deck. */
function discardAndDraw(actor: ReturnType<typeof startPvP>, player: number) {
  const legal = () => lostCitiesSpec.getLegalActions(actor.getSnapshot(), player);
  const discard = legal().find((l) => l.phase === "play" && l.action.kind === "discard");
  act(actor, player, discard);
  const deck = legal().find((l) => l.phase === "draw" && l.action.kind === "draw-pile");
  act(actor, player, deck);
}

describe("lost cities player view", () => {
  it("never shows a seat the card the other seat drew from the deck", () => {
    const actor = startPvP();
    discardAndDraw(actor, 0);
    discardAndDraw(actor, 1);

    const snap = actor.getSnapshot();
    for (const viewer of [0, 1]) {
      const view = lostCitiesSpec.getPlayerView(snap, viewer);
      const deckDraws = view.actionLog.filter((e) => e.action === "draw-pile");
      expect(deckDraws).toHaveLength(2);
      // In the view, player 0 is always the viewer.
      const mine = deckDraws.find((e) => e.player === 0);
      const theirs = deckDraws.find((e) => e.player === 1);
      expect(mine?.card.id).not.toBe(-1);
      expect(view.playerHand.map((c) => c.id)).toContain(mine?.card.id);
      expect(theirs?.card.id).toBe(-1);
    }
  });

  it("keeps a draw from a discard pile visible to both seats", () => {
    const actor = startPvP();
    discardAndDraw(actor, 0);
    const legal = () => lostCitiesSpec.getLegalActions(actor.getSnapshot(), 1);
    act(
      actor,
      1,
      legal().find((l) => l.phase === "play" && l.action.kind === "discard"),
    );
    const fromDiscard = legal().find((l) => l.phase === "draw" && l.action.kind === "discard-pile");
    if (!fromDiscard) return; // both discards were the same colour this deal
    act(actor, 1, fromDiscard);
    const view = lostCitiesSpec.getPlayerView(actor.getSnapshot(), 0);
    const take = view.actionLog.find((e) => e.action === "draw-discard");
    expect(take?.card.id).not.toBe(-1);
  });
});
