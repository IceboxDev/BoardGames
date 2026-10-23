// Chess opening trainer — `/api/trainers/chess/*`.
//
//   GET    /link                 the linked lichess account + game counts (or null)
//   POST   /link {token}         link: reads the token's account from lichess once, never stores it
//   DELETE /link                 unlink (imported games go, trees stay)
//   POST   /games {games}        store a batch of imported games (repeats ignored)
//   GET    /games?color&cursor   the member's games as one colour, oldest first, paged
//   GET    /repertoires          the member's opening trees (summaries)
//   POST   /repertoires          start a new tree
//   GET    /repertoires/:id      one tree in full
//   PUT    /repertoires/:id      save a build / rename (409 when another tab saved first)
//   DELETE /repertoires/:id
//   GET    /library              the member's folders and saved lines
//   PUT    /library              save them whole (409 when another tab saved first)
//   POST   /evals {items}        deep evaluations for tree positions: known ones now, the rest queued
//   POST   /evals/queue {items}  where waiting positions stand in the farm's queue (for an ETA)
//                                for the analysis farm (see chess-farm.ts)
//   POST   /explorer/lookup {fens}   the shared lichess explorer answers we already have
//   POST   /explorer {entries}       keep answers this browser fetched from lichess
//
// The browser does all lichess traffic itself (export, explorer, cloud eval);
// stored games are only shape-checked here — the tree builder replays them
// and keeps each one's legal prefix.

import { BEST_MOVE_SPEC } from "@boardgames/core/games/chess/trainer/eval-policy";
import {
  ChessExplorerLookupBodySchema,
  ChessExplorerLookupResponseSchema,
  ChessExplorerSaveBodySchema,
  ChessExplorerSaveResponseSchema,
  ChessGamesPageSchema,
  ChessGamesQuerySchema,
  ChessLinkBodySchema,
  ChessLinkResponseSchema,
  ChessUploadGamesBodySchema,
  ChessUploadGamesResponseSchema,
  CreateRepertoireBodySchema,
  EvalQueueBodySchema,
  EvalQueueResponseSchema,
  EvalRequestBodySchema,
  EvalRequestResponseSchema,
  LibraryResponseSchema,
  RepertoireListSchema,
  RepertoireSchema,
  UpdateLibraryBodySchema,
  UpdateRepertoireBodySchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { lookupExplorer, saveExplorer } from "../lib/chess-trainer/explorer-cache.ts";
import { farmStats, queuePlaces, requestEvals } from "../lib/chess-trainer/farm-store.ts";
import {
  createRepertoire,
  deleteLink,
  deleteRepertoire,
  insertGames,
  listRepertoires,
  readGamesPage,
  readLibrary,
  readLink,
  readRepertoire,
  updateRepertoire,
  writeLibrary,
  writeLink,
} from "../lib/chess-trainer/store.ts";
import { errorResponse, zJsonBody, zQuery } from "../lib/error-response.ts";

export const chessTrainerRoutes = authedApp();

const LICHESS_ACCOUNT_URL = "https://lichess.org/api/account";
const LichessAccountSchema = z.object({ id: z.string().min(1), username: z.string().min(1) });

chessTrainerRoutes.get("/link", async (c) => {
  const link = await readLink(getDb(), c.get("user").id);
  return c.json(ChessLinkResponseSchema.parse({ link }));
});

chessTrainerRoutes.post("/link", zJsonBody(ChessLinkBodySchema), async (c) => {
  const user = c.get("user");
  let res: Response;
  try {
    res = await fetch(LICHESS_ACCOUNT_URL, {
      headers: { Authorization: `Bearer ${c.req.valid("json").token}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return errorResponse(c, 502, "Couldn't reach lichess", "LICHESS_UNREACHABLE");
  }
  if (res.status === 401) return errorResponse(c, 400, "lichess refused the token", "BAD_TOKEN");
  if (!res.ok) return errorResponse(c, 502, "lichess didn't answer", "LICHESS_UNREACHABLE");
  const account = LichessAccountSchema.safeParse(await res.json().catch(() => null));
  if (!account.success) return errorResponse(c, 502, "Unexpected lichess answer", "LICHESS_SHAPE");
  const db = getDb();
  await writeLink(db, user.id, account.data.id, account.data.username);
  return c.json(ChessLinkResponseSchema.parse({ link: await readLink(db, user.id) }));
});

chessTrainerRoutes.delete("/link", async (c) => {
  const db = getDb();
  await deleteLink(db, c.get("user").id);
  return c.json(ChessLinkResponseSchema.parse({ link: null }));
});

chessTrainerRoutes.post("/games", zJsonBody(ChessUploadGamesBodySchema), async (c) => {
  const user = c.get("user");
  const db = getDb();
  if (!(await readLink(db, user.id)))
    return errorResponse(c, 409, "Connect lichess first", "NOT_LINKED");
  const stored = await insertGames(db, user.id, c.req.valid("json").games);
  const link = await readLink(db, user.id);
  return c.json(ChessUploadGamesResponseSchema.parse({ stored, link }));
});

chessTrainerRoutes.get("/games", zQuery(ChessGamesQuerySchema), async (c) => {
  const { color, cursor } = c.req.valid("query");
  const page = await readGamesPage(getDb(), c.get("user").id, color, cursor);
  return c.json(ChessGamesPageSchema.parse(page));
});

chessTrainerRoutes.get("/repertoires", async (c) => {
  const repertoires = await listRepertoires(getDb(), c.get("user").id);
  return c.json(RepertoireListSchema.parse({ repertoires }));
});

chessTrainerRoutes.post("/repertoires", zJsonBody(CreateRepertoireBodySchema), async (c) => {
  const user = c.get("user");
  const db = getDb();
  const id = await createRepertoire(db, user.id, c.req.valid("json"));
  return c.json(RepertoireSchema.parse(await readRepertoire(db, user.id, id)), 201);
});

chessTrainerRoutes.get("/repertoires/:id", async (c) => {
  const rep = await readRepertoire(getDb(), c.get("user").id, c.req.param("id"));
  if (!rep) return errorResponse(c, 404, "Not found");
  return c.json(RepertoireSchema.parse(rep));
});

chessTrainerRoutes.put("/repertoires/:id", zJsonBody(UpdateRepertoireBodySchema), async (c) => {
  const user = c.get("user");
  const db = getDb();
  const body = c.req.valid("json");
  const rep = await readRepertoire(db, user.id, c.req.param("id"));
  if (!rep) return errorResponse(c, 404, "Not found");
  if (body.tree && body.tree.color !== rep.color) {
    return errorResponse(c, 400, "The tree is for the other colour");
  }
  const result = await updateRepertoire(db, user.id, rep.id, body);
  if (!result.ok) {
    return result.reason === "missing"
      ? errorResponse(c, 404, "Not found")
      : errorResponse(c, 409, "Saved from another tab — reload it", "VERSION_CONFLICT");
  }
  return c.json(RepertoireSchema.parse(await readRepertoire(db, user.id, rep.id)));
});

chessTrainerRoutes.delete("/repertoires/:id", async (c) => {
  const gone = await deleteRepertoire(getDb(), c.get("user").id, c.req.param("id"));
  if (!gone) return errorResponse(c, 404, "Not found");
  return c.body(null, 204);
});

chessTrainerRoutes.get("/library", async (c) => {
  return c.json(LibraryResponseSchema.parse(await readLibrary(getDb(), c.get("user").id)));
});

chessTrainerRoutes.put("/library", zJsonBody(UpdateLibraryBodySchema), async (c) => {
  const user = c.get("user");
  const { expectedVersion, library } = c.req.valid("json");
  const result = await writeLibrary(getDb(), user.id, expectedVersion, library);
  if (!result.ok) {
    return errorResponse(c, 409, "Saved from another tab — reload it", "VERSION_CONFLICT");
  }
  return c.json(LibraryResponseSchema.parse({ library, version: result.version }));
});

chessTrainerRoutes.post("/evals", zJsonBody(EvalRequestBodySchema), async (c) => {
  const db = getDb();
  // An opponent position no game of yours reached, on no extension (stage 0), is a
  // deviation leaf — where you left your tree: not analysed (the tree
  // discourages going there). A line end's extension (stage 1–3) is.
  const items = c.req
    .valid("json")
    .items.filter((i) => i.kind !== "opp" || i.reach > 0 || i.stage > 0);
  const { results, queued } = await requestEvals(db, c.get("user").id, BEST_MOVE_SPEC, items);
  const { done: _d, failed: _f, ...farm } = await farmStats(db);
  return c.json(EvalRequestResponseSchema.parse({ results, queued, farm }));
});

chessTrainerRoutes.post("/evals/queue", zJsonBody(EvalQueueBodySchema), async (c) => {
  const { items } = c.req.valid("json");
  const out = await queuePlaces(getDb(), BEST_MOVE_SPEC, items);
  return c.json(EvalQueueResponseSchema.parse(out));
});

chessTrainerRoutes.post("/explorer/lookup", zJsonBody(ChessExplorerLookupBodySchema), async (c) => {
  const { fens } = c.req.valid("json");
  const found = await lookupExplorer(getDb(), fens);
  return c.json(ChessExplorerLookupResponseSchema.parse({ results: Object.fromEntries(found) }));
});

chessTrainerRoutes.post("/explorer", zJsonBody(ChessExplorerSaveBodySchema), async (c) => {
  const { entries } = c.req.valid("json");
  const saved = await saveExplorer(getDb(), entries);
  return c.json(ChessExplorerSaveResponseSchema.parse({ ok: true, saved }));
});
