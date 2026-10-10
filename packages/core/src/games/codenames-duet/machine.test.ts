import { describe, expect, it } from "vitest";
import { createActor, waitFor } from "xstate";
import type { CodenamesAiAgent } from "../codenames/ai/agent";
import { buildDuetGuessInput, duetMachine, duetSpec, withDuetAgent } from "./machine";
import { DuetReplayLogSchema } from "./record";

const AI = "codenames-medium";
const FAST = { aiStart: 1, aiGuess: 1 };

function start(agent: CodenamesAiAgent | null, ai: (string | null)[] = [AI, AI]) {
  const actor = createActor(agent ? withDuetAgent(agent) : duetMachine);
  actor.start();
  actor.send({
    type: "START",
    seed: 3,
    ai,
    language: "en",
    timerTokens: 9,
    clueTimerSec: 0,
    guessTimerSec: 0,
    beats: FAST,
  });
  return actor;
}

describe("duet machine", () => {
  it("the fallback pair plays a whole game to a result", async () => {
    const actor = start(null);
    await waitFor(actor, (s) => duetSpec.isGameOver(s), { timeout: 10_000 });
    const outcome = duetSpec.getOutcome(actor.getSnapshot());
    expect(outcome?.kind).toBe("coop");
    expect(DuetReplayLogSchema.parse(duetSpec.getReplayLog(actor.getSnapshot()))).toBeTruthy();
  });

  it("a perfect pair wins", async () => {
    let targets: number[] = [];
    const agent: CodenamesAiAgent = {
      giveClue: async (input) => {
        targets = input.cards.filter((c) => c.kind === "own" && !c.revealed).map((c) => c.index);
        return { word: "zqx", count: Math.min(9, targets.length) };
      },
      guess: async () => ({ picks: targets }),
    };
    const actor = start(agent);
    await waitFor(actor, (s) => duetSpec.isGameOver(s), { timeout: 10_000 });
    expect(actor.getSnapshot().context.game.result).toMatchObject({ won: true });
  });

  it("shows each player only their own side, and keeps it out of the guess input", () => {
    const actor = start(null, [null, null]);
    const snap = actor.getSnapshot();
    const a = duetSpec.getPlayerView(snap, 0);
    expect(a.cards.every((c) => c.mine !== null && c.theirs === null)).toBe(true);
    expect(duetSpec.getPlayerView(snap, -1).cards.every((c) => c.mine === null)).toBe(true);
    const giver = snap.context.game.giver;
    const send = (player: number, action: unknown) => {
      const v = duetSpec.validateAction(actor.getSnapshot(), player, {
        type: "PLAYER_ACTION",
        action,
      });
      if (v.ok) actor.send(v.event);
      return v.ok;
    };
    expect(send(1 - giver, { kind: "give-clue", clue: { word: "zqx", count: 1 } })).toBe(false);
    expect(send(giver, { kind: "give-clue", clue: { word: "zqx", count: 1 } })).toBe(true);
    expect(send(giver, { kind: "chat", text: "hint hint" })).toBe(false);
    expect(send(1 - giver, { kind: "chat", text: "hmm" })).toBe(true);
    const input = JSON.stringify(buildDuetGuessInput(actor.getSnapshot().context.game));
    expect(input).not.toMatch(/assassin|bystander|"kind"/);
  });
});
