/**
 * Every server-run game: its machine spec, and the machine a new session runs.
 *
 * Adding a game means adding one entry here (and its manifest to
 * `@boardgames/core/games/manifests`); `registry.test.ts` keeps the two lists
 * identical. Games whose AI needs something only the server has — a native
 * binary, a model gateway, a worker pool — bind it into the machine per session through
 * XState's `provide`, so there is no module-global AI state anywhere.
 */

import { sevenWondersSpec, withSevenWondersAgent } from "@boardgames/core/games/7-wonders/machine";
import { botcSpec } from "@boardgames/core/games/blood-on-the-clocktower/machine";
import { chessSpec, withChessAgent } from "@boardgames/core/games/chess/machine";
import { bughouseSpec, withBughouseAgent } from "@boardgames/core/games/chess-bughouse/machine";
import { codenamesSpec, withCodenamesAgent } from "@boardgames/core/games/codenames/machine";
import { CodenamesReplayLogSchema } from "@boardgames/core/games/codenames/record";
import { duetSpec, withDuetAgent } from "@boardgames/core/games/codenames-duet/machine";
import { DuetReplayLogSchema } from "@boardgames/core/games/codenames-duet/record";
import { connect4Spec, withConnect4AiOffload } from "@boardgames/core/games/connect-4/machine";
import { decryptoSpec, withDecryptoAgent } from "@boardgames/core/games/decrypto/machine";
import { durakSpec } from "@boardgames/core/games/durak/machine";
import { explodingKittensSpec } from "@boardgames/core/games/exploding-kittens/machine";
import { goSpec, withGoAi } from "@boardgames/core/games/go/machine";
import { lostCitiesSpec } from "@boardgames/core/games/lost-cities/machine";
import { pandemicSpec } from "@boardgames/core/games/pandemic/machine";
import { parksSpec } from "@boardgames/core/games/parks/machine";
import { quiztopiaSpec } from "@boardgames/core/games/quiztopia/machine";
import { sensoSpec } from "@boardgames/core/games/senso-battle-for-japan/machine";
import { setPvpSpec } from "@boardgames/core/games/set/pvp-machine";
import { skyTeamSpec } from "@boardgames/core/games/sky-team/machine";
import { sushiGoSpec } from "@boardgames/core/games/sushi-go/machine";
import { theHungerSpec, withHungerAiOffload } from "@boardgames/core/games/the-hunger/machine";
import { resistanceSpec } from "@boardgames/core/games/the-resistance/machine";
import type { AnyGameMachineSpec } from "@boardgames/core/machines/types";
import type { AnyActorLogic } from "xstate";
import { getDb } from "../db.ts";
import { aiAvailable } from "../lib/ai";
import { getContentStore } from "../lib/quiztopia/content-store.ts";
import { recordGameReviews } from "../lib/quiztopia/game-reviews.ts";
import { botcAfterGameOver } from "./botc-records.ts";
import { engineAgent } from "./chess-agent.ts";
import { llmCodenamesAgent } from "./codenames-agent.ts";
import { connect4AiOffload } from "./connect4-ai-pool.ts";
import { openAiDecryptoAgent } from "./decrypto-agent.ts";
import { goServerAi } from "./go-ai.ts";
import { goAfterGameOver } from "./go-reviews.ts";
import { hungerAiOffload } from "./hunger-ai-pool.ts";
import { sevenWondersSearchAgent } from "./seven-wonders-agent.ts";

/** A session that just ended in game over, as `afterGameOver` sees it. */
export interface EndedGame {
  /** The session's id (an unguessable UUID): a stable namespace for follow-up writes. */
  readonly sessionId: string;
  readonly roomCode: string | null;
  /** The account in each seat, by seat index; `null` for an AI seat. */
  readonly seatUserIds: readonly (string | null)[];
  /** `spec.getReplayLog` of the final snapshot — erased here, so parse it, never cast it. */
  readonly replayLog: unknown;
  /** The saved match's `session_replays` id; `null` when saving failed. */
  readonly replayId: number | null;
  readonly endedAt: Date;
}

export interface ServerGame {
  readonly spec: AnyGameMachineSpec;
  /** The machine for a new session — the spec's own, or one with server-only AI bound in. */
  readonly createMachine: () => AnyActorLogic;
  /**
   * Game-specific writes once a game is over and its match saved (Quiztopia
   * turns the table's answers into trainer reviews). Runs after the
   * players got their game-over frame; a throw is logged by the session
   * manager and never affects the session. Must be idempotent: a game-over
   * snapshot can be emitted more than once.
   */
  readonly afterGameOver?: (ended: EndedGame) => Promise<void>;
  /**
   * Send the machine `{ type: "SEAT_CONNECTION", seat, connected }` when a room
   * seat drops out or comes back (`sessions/manager.ts:seatConnectionChanged`).
   * Chess uses it to let a player claim a game the opponent abandoned.
   */
  readonly observesConnections?: boolean;
}

function logAiCost(
  slug: string,
  ended: EndedGame,
  cost: { calls: number; usd: number } | undefined,
): void {
  if (!cost || cost.calls === 0) return;
  console.log(
    `[${slug}] game over · AI cost $${cost.usd.toFixed(4)} over ${cost.calls} calls · session ${ended.sessionId}${ended.replayId === null ? "" : ` · replay ${ended.replayId}`}`,
  );
}

/** A game whose machine runs exactly as the spec defines it. */
function plain(spec: AnyGameMachineSpec): ServerGame {
  return { spec, createMachine: () => spec.machine };
}

const SERVER_GAMES: readonly ServerGame[] = [
  {
    spec: sevenWondersSpec,
    createMachine: () => {
      const agent = sevenWondersSearchAgent();
      return agent ? withSevenWondersAgent(agent) : sevenWondersSpec.machine;
    },
  },
  {
    spec: decryptoSpec,
    // Checked per session: AI can be suspended and resumed at runtime.
    createMachine: () =>
      aiAvailable() ? withDecryptoAgent(openAiDecryptoAgent) : decryptoSpec.machine,
  },
  {
    spec: chessSpec,
    // Stockfish on the engine pool; without it the machine's built-in search plays.
    createMachine: () => {
      const agent = engineAgent("chess");
      return agent ? withChessAgent(agent) : chessSpec.machine;
    },
    observesConnections: true,
  },
  {
    spec: bughouseSpec,
    // Fairy-Stockfish on the engine pool; without it the built-in search plays.
    createMachine: () => {
      const agent = engineAgent("bughouse");
      return agent ? withBughouseAgent(agent) : bughouseSpec.machine;
    },
    observesConnections: true,
  },
  {
    spec: connect4Spec,
    // Deep Search and Perfect think on the worker pool; without it they run inline.
    createMachine: () => {
      const offload = connect4AiOffload();
      return offload ? withConnect4AiOffload(offload) : connect4Spec.machine;
    },
  },
  {
    spec: codenamesSpec,
    createMachine: () =>
      aiAvailable() ? withCodenamesAgent(llmCodenamesAgent) : codenamesSpec.machine,
    // A missing spymaster or a team's only guesser stalls the table: after a
    // short wait anyone left may hand the seat to an AI stand-in (`presence.ts`).
    observesConnections: true,
    // The game's AI bill in one line; the saved replay keeps it (`aiCost`) too.
    afterGameOver: async (ended) => {
      logAiCost(
        "codenames",
        ended,
        CodenamesReplayLogSchema.safeParse(ended.replayLog).data?.aiCost,
      );
    },
  },
  {
    spec: duetSpec,
    createMachine: () => (aiAvailable() ? withDuetAgent(llmCodenamesAgent) : duetSpec.machine),
    afterGameOver: async (ended) => {
      logAiCost(
        "codenames-duet",
        ended,
        DuetReplayLogSchema.safeParse(ended.replayLog).data?.aiCost,
      );
    },
  },
  {
    ...plain(botcSpec),
    // Seats come and go all evening: a dropped Storyteller pauses the vote clock.
    observesConnections: true,
    // The Storyteller's own Clocktower history gets the game too.
    afterGameOver: botcAfterGameOver,
  },
  plain(durakSpec),
  plain(explodingKittensSpec),
  {
    spec: goSpec,
    createMachine: () => withGoAi(goServerAi()),
    // Every finished match is queued for a KataGo review (when KataGo runs).
    afterGameOver: (ended) => goAfterGameOver(ended.replayId),
  },
  plain(lostCitiesSpec),
  plain(pandemicSpec),
  plain(parksSpec),
  {
    ...plain(quiztopiaSpec),
    // Every judged question becomes a review for the seats it tested.
    afterGameOver: async (ended) => {
      await recordGameReviews(getDb(), getContentStore(), ended);
    },
  },
  plain(sensoSpec),
  plain(setPvpSpec),
  plain(skyTeamSpec),
  plain(sushiGoSpec),
  {
    spec: theHungerSpec,
    // Search seats (Strigoi, Dracula) think on the shared worker pool.
    createMachine: () => {
      const offload = hungerAiOffload();
      return offload ? withHungerAiOffload(offload) : theHungerSpec.machine;
    },
  },
  plain(resistanceSpec),
];

const bySlug = new Map(SERVER_GAMES.map((game) => [game.spec.manifest.slug, game]));

export function getServerGame(slug: string): ServerGame | undefined {
  return bySlug.get(slug);
}

export function getRegisteredSlugs(): string[] {
  return [...bySlug.keys()];
}
