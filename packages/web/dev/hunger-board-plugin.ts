// Dev-server endpoints behind the Hunger board editor (`/dev/hunger-board`).
// `vite serve` only: nothing here exists in a build.
//
//   GET  /__dev/hunger-board/:side          the draft if there is one, else the published board
//   PUT  /__dev/hunger-board/:side/draft    save work in progress (any state, even broken)
//   PUT  /__dev/hunger-board/:side          publish — refused while the board has errors
//
// Files live beside the engine: core/src/games/the-hunger/content/boards/.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import {
  BoardFileSchema,
  boardProblems,
} from "../../core/src/games/the-hunger/content/board-schema";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(HERE, "../../core/src/games/the-hunger/content/boards");
// Side B is derived from side A (content/boards.ts), so only A is edited.
const ROUTE = /^\/__dev\/hunger-board\/(a)(\/draft)?$/;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => ok(body));
    req.on("error", fail);
  });
}

export function hungerBoardPlugin(): Plugin {
  return {
    name: "hunger-board-editor",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = req.url ? ROUTE.exec(req.url.split("?")[0]) : null;
        if (!match) return next();
        const side = match[1];
        const draft = Boolean(match[2]);
        const published = resolve(DIR, `board-${side}.json`);
        const draftFile = resolve(DIR, `board-${side}.draft.json`);
        const reply = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        try {
          if (req.method === "GET" && !draft) {
            const file = existsSync(draftFile) ? draftFile : published;
            return reply(200, {
              board: JSON.parse(readFileSync(file, "utf8")),
              fromDraft: file === draftFile,
            });
          }
          if (req.method !== "PUT") return reply(405, { error: "GET or PUT" });
          const parsed = BoardFileSchema.safeParse(JSON.parse(await readBody(req)));
          if (!parsed.success) return reply(400, { error: parsed.error.message });
          const board = { ...parsed.data, side: side.toUpperCase() };
          if (!draft) {
            const errors = boardProblems(board).filter((p) => p.level === "error");
            if (errors.length > 0) {
              return reply(422, { error: errors.map((e) => e.message).join("; ") });
            }
          }
          writeFileSync(draft ? draftFile : published, `${JSON.stringify(board, null, 2)}\n`);
          return reply(200, { ok: true });
        } catch (e) {
          return reply(500, { error: String(e) });
        }
      });
    },
  };
}
