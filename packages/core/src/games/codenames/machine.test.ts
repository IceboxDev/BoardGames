import { afterEach, describe, expect, it } from "vitest";
import { type ActorRefFrom, createActor, waitFor } from "xstate";
import type { CodenamesAiAgent } from "./ai/agent";
import {
  buildClueInput,
  buildGuessInput,
  codenamesMachine,
  codenamesSpec,
  phaseOf,
  withCodenamesAgent,
} from "./machine";
import { CodenamesReplayLogSchema } from "./record";
import type { CodenamesBeats, CodenamesMachineEvent, CodenamesPlayerView } from "./types";

const FAST: Partial<CodenamesBeats> = { aiStart: 1, aiGuess: 1 };
const AI = "codenames-medium";

type Actor = ActorRefFrom<typeof codenamesMachine>;
type Start = Omit<Extract<CodenamesMachineEvent, { type: "START" }>, "type">;

let agent: CodenamesAiAgent | null = null;

function startActor(overrides: Partial<Start> = {}): Actor {
  const actor = createActor(agent ? withCodenamesAgent(agent) : codenamesMachine);
  actor.start();
  actor.send({
    type: "START",
    seed: 99,
    ai: [AI, AI, AI, AI],
    language: "en",
    clueTimerSec: 0,
    guessTimerSec: 0,
    beats: FAST,
    ...overrides,
  });
  return actor;
}

function send(actor: Actor, player: number, action: unknown): { ok: boolean; reason?: string } {
  const validated = codenamesSpec.validateAction(actor.getSnapshot(), player, {
    type: "PLAYER_ACTION",
    action,
  });
  if (!validated.ok) return { ok: false, reason: validated.reason };
  actor.send(validated.event);
  return { ok: true };
}

const view = (actor: Actor, seat: number): CodenamesPlayerView =>
  codenamesSpec.getPlayerView(actor.getSnapshot(), seat);

async function gameOver(actor: Actor): Promise<void> {
  await waitFor(actor, (s) => codenamesSpec.isGameOver(s), { timeout: 10_000 });
}

/**
 * A test agent that "remembers" its spymaster's targets, so its operative
 * plays them perfectly — the full win path, without the operative ever being
 * handed the key by the machine.
 */
function telepathicAgent(): CodenamesAiAgent {
  let targets: number[] = [];
  return {
    giveClue: async (input) => {
      targets = input.cards.filter((c) => c.kind === "own" && !c.revealed).map((c) => c.index);
      return {
        word: "zqx",
        count: Math.min(9, targets.length),
        targets,
        reasoning: "All of them, telepathically.",
        considered: [{ word: "zqy", count: 2, targets: targets.slice(0, 2) }],
      };
    },
    guess: async () => ({
      picks: targets,
      notes: targets.map((card) => ({ card, confidence: 0.9, why: "I just know" })),
      reasoning: "Reading minds.",
    }),
  };
}

afterEach(() => {
  agent = null;
});

describe("codenames machine — AI-only games", () => {
  it("the fallback agent plays a whole game to a decided result", async () => {
    const actor = startActor();
    await gameOver(actor);
    const outcome = codenamesSpec.getOutcome(actor.getSnapshot());
    expect(outcome).toMatchObject({ kind: "teams", teamOf: [0, 1, 0, 1] });
    const log = codenamesSpec.getReplayLog(actor.getSnapshot());
    expect(CodenamesReplayLogSchema.parse(log).turns.length).toBeGreaterThan(0);
  });

  it("a perfect agent wins on the starting team's first turn", async () => {
    agent = telepathicAgent();
    const actor = startActor();
    await gameOver(actor);
    const game = actor.getSnapshot().context.game;
    expect(game.result).toMatchObject({ winner: game.startingTeam, reason: "agents" });
    expect(game.turns).toHaveLength(1);
  });

  it("keeps what each clue and guess meant, for the review", async () => {
    agent = telepathicAgent();
    const actor = startActor();
    await gameOver(actor);
    const turn = view(actor, 2).turns[0];
    expect(turn?.note?.reasoning).toBe("All of them, telepathically.");
    expect(turn?.note?.targets).toHaveLength(9);
    expect(turn?.note?.considered[0]?.word).toBe("zqy");
    expect(turn?.note?.standIn).toBe(false);
    expect(turn?.guessNotes?.[0]?.picks[0]).toMatchObject({ confidence: 0.9, why: "I just know" });
    expect(view(actor, 2).aiStandIn).toBe(false);
    const log = CodenamesReplayLogSchema.parse(codenamesSpec.getReplayLog(actor.getSnapshot()));
    expect(log.turns[0]?.note?.targets).toHaveLength(9);
  });

  it("flags games the stand-in played", async () => {
    const actor = startActor();
    await gameOver(actor);
    expect(view(actor, 0).aiStandIn).toBe(true);
    expect(view(actor, 0).turns[0]?.note?.standIn).toBe(true);
  });

  it("a throwing agent falls back and the game still ends", async () => {
    agent = {
      giveClue: () => Promise.reject(new Error("boom")),
      guess: () => Promise.reject(new Error("boom")),
    };
    const actor = startActor();
    await gameOver(actor);
    expect(actor.getSnapshot().context.game.result).not.toBeNull();
  });

  it("an illegal clue is replaced by a legal fallback", async () => {
    agent = {
      giveClue: async (input) => ({ word: input.cards[0]?.word ?? "x", count: 2 }),
      guess: async (input) => ({ picks: [999, -1, input.words[0]?.index ?? 0] }),
    };
    const actor = startActor();
    await gameOver(actor);
    const game = actor.getSnapshot().context.game;
    expect(game.turns[0]?.clue?.word).toBe("thing");
    expect(game.turns[0]?.guesses[0]?.card).toBeGreaterThanOrEqual(0);
  });
});

describe("codenames machine — people at the table", () => {
  it("a human spymaster and operative play a turn", async () => {
    const actor = startActor({ ai: [null, AI, null, AI], seed: 5 });
    const game = actor.getSnapshot().context.game;
    if (game.startingTeam !== 0) {
      // Blue (AI) opens; wait for Red's turn.
      await waitFor(actor, (s) => s.context.game.currentTeam === 0 || s.matches("gameOver"));
    }
    if (actor.getSnapshot().matches("gameOver")) return;
    await waitFor(actor, (s) => phaseOf(s) === "clue");

    expect(view(actor, 0).mustGiveClue).toBe(true);
    expect(send(actor, 2, { kind: "give-clue", clue: { word: "zqx", count: 1 } }).ok).toBe(false);
    const word = actor.getSnapshot().context.game.words[0] as string;
    expect(send(actor, 0, { kind: "give-clue", clue: { word, count: 1 } }).reason).toMatch(/table/);
    expect(send(actor, 0, { kind: "give-clue", clue: { word: "zqx", count: 1 } }).ok).toBe(true);
    expect(phaseOf(actor.getSnapshot())).toBe("guessing");

    const operative = view(actor, 2);
    expect(operative.canGuess).toBe(true);
    expect(operative.canEndTurn).toBe(false);
    const own = actor.getSnapshot().context.game.key.indexOf(0);
    expect(send(actor, 2, { kind: "guess", card: own }).ok).toBe(true);
    expect(view(actor, 2).guessesMade).toBe(1);
    expect(send(actor, 2, { kind: "end-turn" }).ok).toBe(true);
    expect(actor.getSnapshot().context.game.currentTeam).toBe(1);
  });

  it("keeps a person's clue targets secret from their operatives until the end", async () => {
    const actor = startActor({ ai: [null, null, null, null] });
    const game = actor.getSnapshot().context.game;
    const team = game.currentTeam;
    const mine = game.key.flatMap((k, i) => (k === team ? [i] : [])).slice(0, 2);
    expect(
      send(actor, team, { kind: "give-clue", clue: { word: "zqx", count: 2 }, targets: mine }).ok,
    ).toBe(true);
    expect(view(actor, team).turns[0]?.note?.targets).toEqual(mine);
    expect(view(actor, 2 + team).turns[0]?.note).toBeUndefined();
    expect(view(actor, 1 - team).turns[0]?.note).toBeUndefined();
    expect(view(actor, -1).turns[0]?.note).toBeUndefined();
    // The next spymaster's prompt remembers its own intent; operatives never see it.
    expect(JSON.stringify(buildGuessInput(actor.getSnapshot().context.game))).not.toMatch(
      /intended|targets/,
    );
    // The clue being answered is not "history" — or it reads as an earlier, unfinished one.
    expect(buildGuessInput(actor.getSnapshot().context.game).history).toHaveLength(0);
    send(actor, 2 + team, { kind: "guess", card: mine[0] as number });
    send(actor, 2 + team, { kind: "end-turn" });
    send(actor, 1 - team, { kind: "give-clue", clue: { word: "zqy", count: 1 } });
    const opp = actor
      .getSnapshot()
      .context.game.key.findIndex(
        (k, i) => k === 1 - team && !actor.getSnapshot().context.game.revealed[i],
      );
    send(actor, 2 + (1 - team), { kind: "guess", card: opp });
    send(actor, 2 + (1 - team), { kind: "end-turn" });
    const history = buildClueInput(actor.getSnapshot().context.game).history;
    expect(history[0]?.intended).toHaveLength(2);
    expect(history[1]?.intended).toBeUndefined();
  });

  it("redacts the key from operatives and the operative AI's input", async () => {
    const actor = startActor({ ai: [null, null, null, null] });
    expect(view(actor, 0).cards.every((c) => c.key !== null)).toBe(true);
    expect(view(actor, 2).cards.every((c) => c.key === null)).toBe(true);
    expect(view(actor, -1).cards.every((c) => c.key === null)).toBe(true);
    const input = JSON.stringify(buildGuessInput(actor.getSnapshot().context.game));
    expect(input).not.toMatch(/assassin|bystander|"kind"/);
  });

  it("chat and pointers stay with the team", async () => {
    const actor = startActor({ ai: [null, null, null, null] });
    expect(send(actor, 0, { kind: "chat", text: "psst" }).ok).toBe(false);
    expect(send(actor, 2, { kind: "chat", text: "red here" }).ok).toBe(true);
    expect(view(actor, 2).chat).toHaveLength(1);
    expect(view(actor, 3).chat).toHaveLength(0);
    expect(view(actor, -1).chat).toHaveLength(0);

    const team = actor.getSnapshot().context.game.currentTeam;
    send(actor, team, { kind: "give-clue", clue: { word: "zqx", count: 2 } });
    const op = 2 + team;
    expect(send(actor, op, { kind: "mark", card: 4 }).ok).toBe(true);
    expect(view(actor, op).cards[4]?.marks).toEqual([op]);
    expect(view(actor, 2 + (1 - team)).cards[4]?.marks).toEqual([]);
  });

  it("rejects malformed and spoofed payloads", () => {
    const actor = startActor({ ai: [null, null, null, null] });
    const snap = actor.getSnapshot();
    for (const raw of [null, 1, { type: "X" }, { type: "PLAYER_ACTION" }]) {
      expect(codenamesSpec.validateAction(snap, 0, raw).ok).toBe(false);
    }
    expect(send(actor, 0, { kind: "give-clue", clue: { word: "two words", count: 1 } }).ok).toBe(
      false,
    );
    expect(send(actor, 0, { kind: "give-clue", clue: { word: "zqx", count: 10 } }).ok).toBe(false);
    expect(send(actor, 2, { kind: "guess", card: 0 }).ok).toBe(false); // no clue yet
    expect(send(actor, 9, { kind: "chat", text: "ghost" }).ok).toBe(false);
  });
});

describe("codenames machine — timers", () => {
  it("an expired clue timer passes the turn", async () => {
    const actor = startActor({ ai: [null, null, null, null], clueTimerSec: 0.05 });
    const first = actor.getSnapshot().context.game.currentTeam;
    expect(view(actor, 2).deadlineTs).not.toBeNull();
    await waitFor(actor, (s) => s.context.game.currentTeam !== first, { timeout: 2000 });
    expect(actor.getSnapshot().context.game.turns[0]?.end).toBe("clue-timeout");
  });

  it("the guess timer keeps one deadline across guesses", async () => {
    const actor = startActor({ ai: [null, null, null, null], guessTimerSec: 0.2 });
    const game = actor.getSnapshot().context.game;
    const team = game.currentTeam;
    send(actor, team, { kind: "give-clue", clue: { word: "zqx", count: 3 } });
    const deadline = view(actor, 2 + team).deadlineTs;
    send(actor, 2 + team, { kind: "guess", card: game.key.indexOf(team) });
    expect(view(actor, 2 + team).deadlineTs).toBe(deadline);
    await waitFor(actor, (s) => s.context.game.currentTeam !== team, { timeout: 2000 });
    expect(actor.getSnapshot().context.game.turns[0]?.end).toBe("guess-timeout");
  });
});
