import { type ChildProcess, fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { TournamentStreamEventSchema } from "@boardgames/core/protocol";
import { getDb } from "../db.ts";
import { tournamentRegistry } from "./game-registry.ts";

/**
 * Build an SSE event JSON string after running it through
 * {@link TournamentStreamEventSchema}. Drift between server and client
 * surfaces as a thrown error here, not a silent skew on the consumer.
 */
function encodeSseEvent(event: unknown): string {
  return JSON.stringify(TournamentStreamEventSchema.parse(event));
}

function resolveWorker(): { path: string; isDev: boolean } {
  // Dev (tsx): this module lives in src/tournament/, sibling to game-worker.ts.
  // Prod (tsup bundle): this module is inlined into dist/index.js, and the
  // worker is emitted at dist/tournament/game-worker.js.
  const sibling = join(import.meta.dirname, "game-worker.ts");
  if (existsSync(sibling)) return { path: sibling, isDev: true };
  return {
    path: join(import.meta.dirname, "tournament", "game-worker.js"),
    isDev: false,
  };
}

interface TournamentEntry {
  id: string;
  children: ChildProcess[];
  sseClients: Set<(data: string) => void>;
  gamesCompleted: number;
  total: number;
  workersFinished: number;
  workerCount: number;
  gameSlug: string;
  config: Record<string, unknown>;
  aWins: number;
  bWins: number;
  draws: number;
  totalScoreA: number;
  totalScoreB: number;
  ekWins: Record<string, number>;
}

const running = new Map<string, TournamentEntry>();

export function getRunningTournaments(): string[] {
  return [...running.keys()];
}

function computeWorkerCount(numGames: number): number {
  return Math.min(numGames, Math.max(1, availableParallelism() - 1));
}

function distributeGameIndices(numGames: number, workerCount: number): number[][] {
  const batches: number[][] = Array.from({ length: workerCount }, () => []);
  for (let i = 0; i < numGames; i++) {
    batches[i % workerCount].push(i);
  }
  return batches;
}

function buildPartial(entry: TournamentEntry): Record<string, unknown> {
  if (entry.gameSlug === "lost-cities") {
    const cfg = entry.config as { strategyAId: string; strategyBId: string };
    return {
      strategyA: cfg.strategyAId,
      strategyB: cfg.strategyBId,
      gamesPlayed: entry.gamesCompleted,
      aWins: entry.aWins,
      bWins: entry.bWins,
      draws: entry.draws,
      totalScoreA: entry.totalScoreA,
      totalScoreB: entry.totalScoreB,
    };
  }

  if (entry.gameSlug === "sushi-go") {
    const cfg = entry.config as { strategyAId: string; strategyBId: string };
    return {
      strategyA: cfg.strategyAId,
      strategyB: cfg.strategyBId,
      gamesPlayed: entry.gamesCompleted,
      aWins: entry.aWins,
      bWins: entry.bWins,
      draws: entry.draws,
      totalScoreA: entry.totalScoreA,
      totalScoreB: entry.totalScoreB,
    };
  }

  if (entry.gameSlug === "exploding-kittens") {
    return {
      strategies: (entry.config as { strategies: string[] }).strategies,
      gamesPlayed: entry.gamesCompleted,
      wins: { ...entry.ekWins },
    };
  }

  if (entry.gameSlug === "durak") {
    return {
      strategies: (entry.config as { strategies: string[] }).strategies,
      gamesPlayed: entry.gamesCompleted,
      losses: { ...entry.ekWins },
    };
  }

  return {};
}

function buildFinalResult(entry: TournamentEntry): Record<string, unknown> {
  if (entry.gameSlug === "lost-cities") {
    const cfg = entry.config as { strategyAId: string; strategyBId: string };
    return {
      strategyA: cfg.strategyAId,
      strategyB: cfg.strategyBId,
      gamesPlayed: entry.gamesCompleted,
      aWins: entry.aWins,
      bWins: entry.bWins,
      draws: entry.draws,
      totalScoreA: entry.totalScoreA,
      totalScoreB: entry.totalScoreB,
    };
  }

  if (entry.gameSlug === "sushi-go") {
    const cfg = entry.config as { strategyAId: string; strategyBId: string };
    return {
      strategyA: cfg.strategyAId,
      strategyB: cfg.strategyBId,
      gamesPlayed: entry.gamesCompleted,
      aWins: entry.aWins,
      bWins: entry.bWins,
      draws: entry.draws,
      totalScoreA: entry.totalScoreA,
      totalScoreB: entry.totalScoreB,
    };
  }

  if (entry.gameSlug === "exploding-kittens") {
    return {
      strategies: (entry.config as { strategies: string[] }).strategies,
      gamesPlayed: entry.gamesCompleted,
      wins: { ...entry.ekWins },
    };
  }

  if (entry.gameSlug === "durak") {
    return {
      strategies: (entry.config as { strategies: string[] }).strategies,
      gamesPlayed: entry.gamesCompleted,
      losses: { ...entry.ekWins },
    };
  }

  return {};
}

async function handleWorkerFailure(entry: TournamentEntry, error: Error | string): Promise<void> {
  if (!running.has(entry.id)) return;
  for (const child of entry.children) child.kill();

  await getDb().execute({
    sql: `UPDATE tournaments SET status = 'aborted', completed_at = datetime('now') WHERE id = ?`,
    args: [entry.id],
  });

  console.error(`Tournament ${entry.id} worker error:`, error);
  const event = encodeSseEvent({ kind: "error", version: 1, message: String(error) });
  for (const send of entry.sseClients) {
    send(event);
  }

  running.delete(entry.id);
}

export async function startTournament(
  gameSlug: string,
  config: Record<string, unknown>,
): Promise<{ id: string }> {
  if (!tournamentRegistry[gameSlug]) {
    throw new Error(`No tournament support for game: ${gameSlug}`);
  }

  const id = randomUUID();
  const db = getDb();
  const numGames = (config.numGames as number) ?? 100;

  await db.execute({
    sql: `INSERT INTO tournaments (id, game_slug, config_json, status, progress_total) VALUES (?, ?, ?, 'running', ?)`,
    args: [id, gameSlug, JSON.stringify(config), numGames],
  });

  const workerCount = computeWorkerCount(numGames);
  const batches = distributeGameIndices(numGames, workerCount);
  const { path: workerPath, isDev } = resolveWorker();

  const entry: TournamentEntry = {
    id,
    children: [],
    sseClients: new Set(),
    gamesCompleted: 0,
    total: numGames,
    workersFinished: 0,
    workerCount,
    gameSlug,
    config,
    aWins: 0,
    bWins: 0,
    draws: 0,
    totalScoreA: 0,
    totalScoreB: 0,
    ekWins: {},
  };

  running.set(id, entry);

  for (let w = 0; w < workerCount; w++) {
    const workerConfig = JSON.stringify({
      gameSlug,
      config,
      gameIndices: batches[w],
    });

    const child = fork(workerPath, [workerConfig], {
      execArgv: isDev ? ["--import", "tsx"] : [],
      serialization: "advanced",
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });

    entry.children.push(child);

    child.on("message", (msg: { kind: string; [key: string]: unknown }) => {
      void handleWorkerMessage(entry, id, msg).catch((err) => {
        console.error(`Tournament ${id} message handler error:`, err);
      });
    });

    child.on("error", (err) => {
      void handleWorkerFailure(entry, err);
    });

    child.on("exit", (code) => {
      if (running.has(id) && code !== 0) {
        void handleWorkerFailure(entry, `Worker exited with code ${code}`);
      }
    });
  }

  return { id };
}

async function handleWorkerMessage(
  entry: TournamentEntry,
  id: string,
  msg: { kind: string; [key: string]: unknown },
): Promise<void> {
  if (!running.has(id)) return;
  const db = getDb();
  const config = entry.config;
  const gameSlug = entry.gameSlug;

  if (msg.kind === "game") {
    if (gameSlug === "lost-cities") {
      await db.execute({
        sql: "INSERT INTO tournament_games (tournament_id, game_index, log_json) VALUES (?, ?, ?)",
        args: [id, msg.gameIndex as number, JSON.stringify(msg.log)],
      });
      entry.totalScoreA += msg.scoreA as number;
      entry.totalScoreB += msg.scoreB as number;
      if ((msg.scoreA as number) > (msg.scoreB as number)) entry.aWins++;
      else if ((msg.scoreB as number) > (msg.scoreA as number)) entry.bWins++;
      else entry.draws++;
    } else if (gameSlug === "sushi-go") {
      const scoreA = msg.scoreA as number;
      const scoreB = msg.scoreB as number;
      await db.execute({
        sql: "INSERT INTO tournament_games (tournament_id, game_index, log_json) VALUES (?, ?, ?)",
        args: [
          id,
          msg.gameIndex as number,
          JSON.stringify({ scoreA, scoreB, aPlaysFirst: msg.aPlaysFirst }),
        ],
      });
      entry.totalScoreA += scoreA;
      entry.totalScoreB += scoreB;
      if (scoreA > scoreB) entry.aWins++;
      else if (scoreB > scoreA) entry.bWins++;
      else entry.draws++;
    } else if (gameSlug === "exploding-kittens") {
      const strategies = (config as { strategies: string[] }).strategies;
      const winner = msg.winner as number;
      if (winner >= 0 && winner < strategies.length) {
        const sid = strategies[winner];
        entry.ekWins[sid] = (entry.ekWins[sid] ?? 0) + 1;
      }
    } else if (gameSlug === "durak") {
      const strategies = (config as { strategies: string[] }).strategies;
      const durak = msg.durak as number;
      if (durak >= 0 && durak < strategies.length) {
        const sid = strategies[durak];
        entry.ekWins[sid] = (entry.ekWins[sid] ?? 0) + 1;
      }
    }

    entry.gamesCompleted++;

    await db.execute({
      sql: "UPDATE tournaments SET progress_completed = ? WHERE id = ?",
      args: [entry.gamesCompleted, id],
    });

    const event = encodeSseEvent({
      kind: "progress",
      version: 1,
      completed: entry.gamesCompleted,
      total: entry.total,
      partial: buildPartial(entry),
    });
    for (const send of entry.sseClients) {
      send(event);
    }
  } else if (msg.kind === "done") {
    entry.workersFinished++;

    if (entry.workersFinished === entry.workerCount) {
      const result = buildFinalResult(entry);

      await db.execute({
        sql: `UPDATE tournaments SET status = 'completed', result_json = ?, completed_at = datetime('now') WHERE id = ?`,
        args: [JSON.stringify(result), id],
      });

      const event = encodeSseEvent({ kind: "complete", version: 1, result });
      for (const send of entry.sseClients) {
        send(event);
      }

      running.delete(id);
    }
  } else if (msg.kind === "error") {
    await handleWorkerFailure(entry, msg.message as string);
  }
}

export async function abortTournament(id: string): Promise<boolean> {
  const entry = running.get(id);
  if (!entry) return false;

  for (const child of entry.children) {
    child.kill();
  }

  await getDb().execute({
    sql: `UPDATE tournaments SET status = 'aborted', completed_at = datetime('now') WHERE id = ?`,
    args: [id],
  });

  const event = encodeSseEvent({ kind: "error", version: 1, message: "Tournament aborted" });
  for (const send of entry.sseClients) {
    send(event);
  }

  running.delete(id);
  return true;
}

export function subscribeSse(id: string, send: (data: string) => void): () => void {
  const entry = running.get(id);
  if (!entry) return () => {};

  entry.sseClients.add(send);
  return () => {
    entry.sseClients.delete(send);
  };
}

export async function markStaleRunning(): Promise<void> {
  await getDb().execute(
    `UPDATE tournaments SET status = 'aborted', completed_at = datetime('now') WHERE status = 'running'`,
  );
}
