/**
 * The lichess explorer through our server's shared cache
 * (`POST /api/trainers/chess/explorer/lookup`, migration 0064): a position's
 * answer is fetched from lichess once, by whoever needs it first, and then read
 * from the server by everyone. Lookups are batched (one request per burst of
 * positions); a miss goes to lichess through the paced queue (`client.ts`),
 * and what came back is saved to the server in batches. Answers are kept here
 * for the life of the page too.
 */
import {
  ChessExplorerLookupBodySchema,
  ChessExplorerLookupResponseSchema,
  ChessExplorerSaveBodySchema,
  ChessExplorerSaveResponseSchema,
  type ExplorerAnswer,
  MAX_EXPLORER_LOOKUP,
  MAX_EXPLORER_SAVE,
} from "@boardgames/core/protocol";
import { ApiError, apiFetch } from "../../../../lib/api-fetch";
import { type ExplorerMove, explorerMoves, type LichessPriority } from "./client";

const BASE = "/api/trainers/chess/explorer";
/** Positions asked within this long go to the server in one lookup. */
const LOOKUP_BATCH_MS = 25;
/** Fetched answers wait this long to be saved together. */
const SAVE_BATCH_MS = 2_000;
/** A lookup our server turned away for the rate limit is asked again after this. */
const LOOKUP_RETRY_MS = 3_000;

const memo = new Map<string, Promise<ExplorerMove[]>>();

const toMoves = (a: ExplorerAnswer): ExplorerMove[] =>
  a.moves
    .map((m) => ({ ...m, games: m.white + m.draws + m.black }))
    .sort((x, y) => y.games - x.games);

// ── Server lookups, batched ──────────────────────────────────────────

let lookupWaiting = new Map<string, ((a: ExplorerAnswer | null) => void)[]>();
let lookupTimer: ReturnType<typeof setTimeout> | null = null;

function flushLookups() {
  lookupTimer = null;
  const batch = lookupWaiting;
  lookupWaiting = new Map();
  const fens = [...batch.keys()];
  for (let i = 0; i < fens.length; i += MAX_EXPLORER_LOOKUP) {
    const chunk = fens.slice(i, i + MAX_EXPLORER_LOOKUP);
    apiFetch(`${BASE}/lookup`, {
      method: "POST",
      body: { fens: chunk },
      request: ChessExplorerLookupBodySchema,
      response: ChessExplorerLookupResponseSchema,
    })
      .then(({ results }) => {
        for (const fen of chunk)
          for (const done of batch.get(fen) ?? []) done(results[fen] ?? null);
      })
      .catch((err: unknown) => {
        // Turned away for the rate limit: ask the server again, not lichess.
        if (err instanceof ApiError && err.status === 429) {
          setTimeout(() => {
            for (const fen of chunk)
              for (const done of batch.get(fen) ?? []) void lookup(fen).then(done);
          }, LOOKUP_RETRY_MS);
          return;
        }
        // The server can't answer: everything counts as a miss and goes to lichess.
        for (const fen of chunk) for (const done of batch.get(fen) ?? []) done(null);
      });
  }
}

function lookup(fen: string): Promise<ExplorerAnswer | null> {
  return new Promise((resolve) => {
    lookupWaiting.set(fen, [...(lookupWaiting.get(fen) ?? []), resolve]);
    if (lookupTimer === null) lookupTimer = setTimeout(flushLookups, LOOKUP_BATCH_MS);
  });
}

// ── Saving what lichess answered, batched ────────────────────────────

let toSave: (ExplorerAnswer & { fen: string })[] = [];
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function flushSaves() {
  saveTimer = null;
  const batch = toSave;
  toSave = [];
  for (let i = 0; i < batch.length; i += MAX_EXPLORER_SAVE) {
    void apiFetch(BASE, {
      method: "POST",
      body: { entries: batch.slice(i, i + MAX_EXPLORER_SAVE) },
      request: ChessExplorerSaveBodySchema,
      response: ChessExplorerSaveResponseSchema,
    }).catch(() => {
      // Not kept this time: the next member to need it fetches it again.
    });
  }
}

function save(fen: string, moves: readonly ExplorerMove[]) {
  const games = moves.reduce((t, m) => t + m.games, 0);
  toSave.push({
    fen,
    games,
    moves: moves.map(({ uci, white, draws, black }) => ({ uci, white, draws, black })),
  });
  if (saveTimer === null) saveTimer = setTimeout(flushSaves, SAVE_BATCH_MS);
}

/**
 * The lichess database's moves at `fen`, most played first: from the shared
 * cache when anyone has fetched it, else from lichess (and then shared).
 */
export function cachedExplorerMoves(
  fen: string,
  token: string,
  priority: LichessPriority = "now",
): Promise<ExplorerMove[]> {
  const hit = memo.get(fen);
  if (hit) return hit;
  const next = lookup(fen).then(async (cached) => {
    if (cached) return toMoves(cached);
    const moves = await explorerMoves(fen, token, priority);
    save(fen, moves);
    return moves;
  });
  memo.set(fen, next);
  next.catch(() => memo.delete(fen));
  return next;
}
