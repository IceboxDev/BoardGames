import { type ChildProcess, fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { getDb } from "../db.ts";
import { tournamentRegistry } from "./game-registry.ts";

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

  if (entry.gameSlug === "exploding-kittens") {
    return {
      strategies: (entry.config as { strategies: string[] }).strategies,
      gamesPlayed: entry.gamesCompleted,
      wins: { ...entry.ekWins },
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

  if (entry.gameSlug === "exploding-kittens") {
    return {
      strategies: (entry.config as { strategies: string[] }).strategies,
      gamesPlayed: entry.gamesCompleted,
      wins: { ...entry.ekWins },
    };
  }

  return {};
}

function handleWorkerFailure(entry: TournamentEntry, error: Error | string): void {
  if (!running.has(entry.id)) return;
  for (const child of entry.children) child.kill();

  const db = getDb();
  db.prepare(
    `UPDATE tournaments SET status = 'aborted', completed_at = datetime('now') WHERE id = ?`,
  ).run(entry.id);

  console.error(`Tournament ${entry.id} worker error:`, error);
  const event = JSON.stringify({ kind: "error", message: String(error) });
  for (const send of entry.sseClients) {
    send(event);
  }

  running.delete(entry.id);
}

export function startTournament(gameSlug: string, config: Record<string, unknown>): { id: string } {
  if (!tournamentRegistry[gameSlug]) {
    throw new Error(`No tournament support for game: ${gameSlug}`);
  }

  const id = randomUUID();
  const db = getDb();
  const numGames = (config.numGames as number) ?? 100;

  db.prepare(
    `INSERT INTO tournaments (id, game_slug, config_json, status, progress_total) VALUES (?, ?, ?, 'running', ?)`,
  ).run(id, gameSlug, JSON.stringify(config), numGames);

  const workerCount = computeWorkerCount(numGames);
  const batches = distributeGameIndices(numGames, workerCount);
  const workerPath = fileURLToPath(new URL("./game-worker.ts", import.meta.url));

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

  const insertGame = db.prepare(
    "INSERT INTO tournament_games (tournament_id, game_index, log_json) VALUES (?, ?, ?)",
  );

  for (let w = 0; w < workerCount; w++) {
    const workerConfig = JSON.stringify({
      gameSlug,
      config,
      gameIndices: batches[w],
    });

    const child = fork(workerPath, [workerConfig], {
      execArgv: ["--import", "tsx"],
      serialization: "advanced",
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });

    entry.children.push(child);

    child.on("message", (msg: { kind: string; [key: string]: unknown }) => {
      if (!running.has(id)) return;

      if (msg.kind === "game") {
        if (gameSlug === "lost-cities") {
          insertGame.run(id, msg.gameIndex, JSON.stringify(msg.log));
          entry.totalScoreA += msg.scoreA as number;
          entry.totalScoreB += msg.scoreB as number;
          if ((msg.scoreA as number) > (msg.scoreB as number)) entry.aWins++;
          else if ((msg.scoreB as number) > (msg.scoreA as number)) entry.bWins++;
          else entry.draws++;
        } else if (gameSlug === "exploding-kittens") {
          const strategies = (config as { strategies: string[] }).strategies;
          const winner = msg.winner as number;
          if (winner >= 0 && winner < strategies.length) {
            const sid = strategies[winner];
            entry.ekWins[sid] = (entry.ekWins[sid] ?? 0) + 1;
          }
        }

        entry.gamesCompleted++;

        db.prepare("UPDATE tournaments SET progress_completed = ? WHERE id = ?").run(
          entry.gamesCompleted,
          id,
        );

        const event = JSON.stringify({
          kind: "progress",
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

          db.prepare(
            `UPDATE tournaments SET status = 'completed', result_json = ?, completed_at = datetime('now') WHERE id = ?`,
          ).run(JSON.stringify(result), id);

          const event = JSON.stringify({ kind: "complete", result });
          for (const send of entry.sseClients) {
            send(event);
          }

          running.delete(id);
        }
      } else if (msg.kind === "error") {
        handleWorkerFailure(entry, msg.message as string);
      }
    });

    child.on("error", (err) => {
      handleWorkerFailure(entry, err);
    });

    child.on("exit", (code) => {
      if (running.has(id) && code !== 0) {
        handleWorkerFailure(entry, `Worker exited with code ${code}`);
      }
    });
  }

  return { id };
}

export function abortTournament(id: string): boolean {
  const entry = running.get(id);
  if (!entry) return false;

  for (const child of entry.children) {
    child.kill();
  }

  const db = getDb();
  db.prepare(
    `UPDATE tournaments SET status = 'aborted', completed_at = datetime('now') WHERE id = ?`,
  ).run(id);

  const event = JSON.stringify({ kind: "error", message: "Tournament aborted" });
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

export function markStaleRunning(): void {
  const db = getDb();
  db.prepare(
    `UPDATE tournaments SET status = 'aborted', completed_at = datetime('now') WHERE status = 'running'`,
  ).run();
}
