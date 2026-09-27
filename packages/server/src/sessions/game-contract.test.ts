/**
 * The whole-game contract, for EVERY registered game at its smallest and
 * largest table: start it the way the server does (`prepareStart`), play it to
 * the end with people making random legal moves through `validateAction` and
 * the game's own AI in the other seats, then check what the rest of the app
 * relies on — a well-formed shared outcome, a replay log, a result, and player
 * views that survive JSON.
 *
 * This is what catches a spec whose outcome misreads the game (Durak's loser
 * recorded as the winner), a game that can hang (Durak's out-of-cards attacker),
 * or a view that doesn't serialise (Set's `selected` as a `Set`). Timers are
 * faked, so the games' pacing costs nothing.
 */

import { phaseOf as decryptoPhase } from "@boardgames/core/games/decrypto/machine";
import { setQuestionSource } from "@boardgames/core/games/quiztopia/question-source";
import { findAllSets } from "@boardgames/core/games/set/deck";
import type { SetPvpPlayerView } from "@boardgames/core/games/set/pvp-machine";
import type { SetCardData } from "@boardgames/core/games/set/types";
import { rngFrom, rngStateFromSeed } from "@boardgames/core/lib/rng";
import { strategiesFor } from "@boardgames/core/machines/manifest";
import { type GameOutcome, GameOutcomeSchema, seatResult } from "@boardgames/core/machines/outcome";
import type { StartSeat } from "@boardgames/core/machines/seats";
import type { AnyGameMachineSpec } from "@boardgames/core/machines/types";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type AnyActorRef, createActor } from "xstate";
import { getRegisteredSlugs, getServerGame } from "../games/registry.ts";
import { getContentStore } from "../lib/quiztopia/content-store.ts";
import { prepareStart } from "./start.ts";

/** Bounds a runaway game: a finished game never needs this many moves. */
const MAX_STEPS = 20_000;

/**
 * Who sits where. Seat 0 is a person; the rest are the game's easiest AI where
 * it has one. Two games need a different table to stay fast or playable
 * without a real person.
 */
function tableFor(spec: AnyGameMachineSpec, seats: number): StartSeat[] {
  const { slug } = spec.manifest;
  // Lost Cities' AIs are all tree searches — people on both sides keep it quick.
  if (slug === "lost-cities") return [{ kind: "human" }, { kind: "human" }];
  // Decrypto: the person takes the last seat (the interceptor at three; the
  // second Black encryptor at four), so the model-free fallback AI covers the rest.
  if (slug === "decrypto") {
    const ai: StartSeat = { kind: "ai", strategy: spec.manifest.strategies[0]?.id ?? "" };
    return [...Array.from({ length: seats - 1 }, () => ai), { kind: "human" }];
  }
  const easiest = strategiesFor(spec.manifest, seats)[0];
  return Array.from(
    { length: seats },
    (_, i): StartSeat =>
      i === 0 || !easiest ? { kind: "human" } : { kind: "ai", strategy: easiest.id },
  );
}

type Rng = () => number;

/** A move a person could make now, as the wire action, or `null` to wait. */
type MoveFinder = (spec: AnyGameMachineSpec, actor: AnyActorRef, seat: number, rng: Rng) => unknown;

/** Any legal action, uniformly. */
const randomLegal: MoveFinder = (spec, actor, seat, rng) => {
  const legal = spec.getLegalActions(actor.getSnapshot(), seat);
  return legal.length > 0 ? legal[Math.floor(rng() * legal.length)] : null;
};

/** Set: random picks almost never make a set, so play one that is on the table. */
const setMove: MoveFinder = (spec, actor, seat) => {
  const snapshot = actor.getSnapshot();
  const legal = spec.getLegalActions(snapshot, seat) as { type: string; cardId?: number }[];
  const view = spec.getPlayerView(snapshot, seat) as SetPvpPlayerView;
  const table = view.slots.filter((c): c is SetCardData => c !== null);
  const set = findAllSets(table)[0];
  if (!set) return null;
  const pick = set.find((card) => !view.selected.includes(card.id));
  const select = legal.find((a) => a.type === "SELECT_CARD" && a.cardId === pick?.id);
  if (select) return select;
  return legal.find((a) => a.type === "CALL_SET") ?? null;
};

/** Decrypto: clue text isn't enumerable, so a person encrypting writes fresh words. */
let clueCounter = 0;
const decryptoMove: MoveFinder = (spec, actor, seat, rng) => {
  const legal = randomLegal(spec, actor, seat, rng);
  if (legal !== null) return legal;
  const snapshot = actor.getSnapshot();
  if (decryptoPhase(snapshot) !== "clueWriting") return null;
  const ctx = snapshot.context as {
    current: { encryptor: number; clues: unknown; skipped: boolean }[];
  };
  const mine = ctx.current.find((t) => t.encryptor === seat && t.clues === null && !t.skipped);
  if (!mine) return null;
  const word = () => `quux${++clueCounter}`;
  return { kind: "submit-clues", clues: [word(), word(), word()] };
};

/**
 * Pandemic lists some moves as descriptors the player completes (a charter
 * flight's destination, a cure's cards) — its UI composes those, which is why
 * it validates the envelope and lets the engine adjudicate. Play the concrete ones.
 */
const PANDEMIC_CONCRETE = new Set([
  "drive_ferry",
  "direct_flight",
  "shuttle_flight",
  "build_station",
  "treat_disease",
  "share_give",
  "share_take",
  "dispatcher_move_to_pawn",
  "dispatcher_move_as",
  "contingency_take",
  "pass",
  "discard_card",
]);
const pandemicMove: MoveFinder = (spec, actor, seat, rng) => {
  const legal = (spec.getLegalActions(actor.getSnapshot(), seat) as { kind: string }[]).filter(
    (a) => PANDEMIC_CONCRETE.has(a.kind),
  );
  return legal.length > 0 ? legal[Math.floor(rng() * legal.length)] : null;
};

const MOVES: Readonly<Record<string, MoveFinder>> = {
  set: setMove,
  decrypto: decryptoMove,
  pandemic: pandemicMove,
};

/** The view must survive the wire; a `Set` or `Map` would silently turn into `{}`. */
function expectJsonSafe(value: unknown, what: string): void {
  expect(JSON.parse(JSON.stringify(value)), what).toEqual(value);
}

function expectOutcomeFits(outcome: GameOutcome, seats: number): void {
  if (outcome.kind === "ranked") expect(outcome.placements).toHaveLength(seats);
  if (outcome.kind === "teams") expect(outcome.teamOf).toHaveLength(seats);
  for (let seat = 0; seat < seats; seat++) {
    expect(["win", "loss", "draw"]).toContain(seatResult(outcome, seat));
  }
}

async function playToEnd(slug: string, seatCount: number, seed: number): Promise<void> {
  const game = getServerGame(slug);
  if (!game) throw new Error(`no game ${slug}`);
  const { spec } = game;
  const seats = tableFor(spec, seatCount);
  const started = prepareStart(spec, seats, {}, seed);
  if (!started.ok) throw new Error(`${slug} at ${seatCount}: ${started.reason}`);

  const actor = createActor(game.createMachine());
  let failure: unknown;
  actor.subscribe({ error: (err) => (failure = err) });
  actor.start();
  actor.send(started.event);

  const rng = rngFrom({ rngState: rngStateFromSeed(seed) });
  const findMove = MOVES[slug] ?? randomLegal;
  const humans = seats.flatMap((s, i) => (s.kind === "human" ? [i] : []));

  let idle = 0;
  for (let step = 0; !spec.isGameOver(actor.getSnapshot()); step++) {
    expect(step, `${slug} at ${seatCount} did not finish`).toBeLessThan(MAX_STEPS);
    expect(failure).toBeUndefined();

    let moved = false;
    for (const seat of humans) {
      const action = findMove(spec, actor, seat, rng);
      if (action === null) continue;
      const snapshot = actor.getSnapshot();
      const active = spec.getActivePlayer(snapshot);
      if (active !== -1 && active !== seat) continue;
      const validated = spec.validateAction(snapshot, seat, { type: "PLAYER_ACTION", action });
      expect(validated.ok, `${slug}: a legal move was rejected: ${JSON.stringify(action)}`).toBe(
        true,
      );
      if (!validated.ok) break;
      actor.send(validated.event);
      // A machine mid-beat (an AI's pause, a reveal) may not take the move yet;
      // only a changed state counts as a move made.
      moved = actor.getSnapshot() !== snapshot;
      break;
    }
    if (step % 50 === 0) {
      for (const seat of humans)
        expectJsonSafe(spec.getPlayerView(actor.getSnapshot(), seat), `${slug} view`);
    }
    // Nobody can move: let the AI think and the game's own beats play out.
    if (moved) {
      idle = 0;
    } else {
      const before =
        JSON.stringify(actor.getSnapshot().value) +
        JSON.stringify(spec.getPlayerView(actor.getSnapshot(), humans[0] ?? 0));
      await vi.advanceTimersByTimeAsync(1_000);
      const after =
        JSON.stringify(actor.getSnapshot().value) +
        JSON.stringify(spec.getPlayerView(actor.getSnapshot(), humans[0] ?? 0));
      idle = before === after ? idle + 1 : 0;
      if (idle > 30) {
        const snap = actor.getSnapshot();
        throw new Error(
          `${slug} at ${seatCount} stalled in ${JSON.stringify(snap.value)}; active ${spec.getActivePlayer(snap)}; legal per seat ${seats.map((_, i) => spec.getLegalActions(snap, i).length).join(",")}; humans ${humans}`,
        );
      }
    }
  }

  const snapshot = actor.getSnapshot();
  expect(failure).toBeUndefined();
  const outcome = spec.getOutcome(snapshot);
  expect(outcome, `${slug}: no outcome at game over`).not.toBeNull();
  const parsed = GameOutcomeSchema.parse(outcome);
  expectOutcomeFits(parsed, seatCount);
  expectJsonSafe(parsed, `${slug} outcome`);

  const log = spec.getReplayLog(snapshot);
  expect(log, `${slug}: no replay log at game over`).not.toBeNull();
  expect(JSON.parse(JSON.stringify(log))).toMatchObject({ formatVersion: expect.any(Number) });
  expect(spec.getResult(snapshot), `${slug}: no result at game over`).not.toBeNull();
  for (const seat of humans)
    expectJsonSafe(spec.getPlayerView(snapshot, seat), `${slug} final view`);
  actor.stop();
}

beforeAll(() => {
  // Quiztopia deals from the real content the server ships.
  setQuestionSource(getContentStore());
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe.each(getRegisteredSlugs())("%s plays to a well-formed end", (slug) => {
  const manifest = getServerGame(slug)?.spec.manifest;
  if (!manifest) throw new Error(`no manifest for ${slug}`);
  const sizes = [...new Set([manifest.seats.min, manifest.seats.max])];

  it.each(sizes)("at %i seats", async (seats) => {
    await playToEnd(slug, seats, 1_000 + seats);
  }, 120_000);
});
