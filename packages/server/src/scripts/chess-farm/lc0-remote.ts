/**
 * Lc0 for workers without a GPU. ws21's worker serves its own Lc0 lane on
 * localhost (`LC0_SERVE_PORT`); each fleet instance reaches it through the
 * same reverse SSH tunnel as the farm API (`LC0_URL=http://localhost:3002`),
 * so a fleet search of your move gets the same tie-break as one on ws21.
 * Requests queue behind ws21's own on the one GPU (~1 min each).
 */
import { createServer, type Server } from "node:http";
import type { Lc0Move } from "@boardgames/core/games/chess/trainer/eval-policy";
import { Lc0MoveSchema } from "@boardgames/core/protocol";
import { z } from "zod";
import type { Lc0Source } from "./pipeline.ts";

const AskSchema = z.object({
  fen: z.string().min(10).max(100),
  nodes: z.number().int().min(1).max(1e8),
});
const AnswerSchema = z.object({ moves: z.array(Lc0MoveSchema) });

/** Serve `lane` on 127.0.0.1:`port` to callers holding `token`. */
export function serveLc0(
  lane: Lc0Source,
  port: number,
  token: string,
  log: (...a: unknown[]) => void,
): Server {
  const server = createServer((req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method !== "POST" || req.headers.authorization !== `Bearer ${token}`)
      return reply(403, {});
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", async () => {
      const ask = AskSchema.safeParse(
        (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        })(),
      );
      if (!ask.success) return reply(400, {});
      try {
        reply(200, { moves: await lane.rootStats(ask.data.fen, ask.data.nodes) });
      } catch (err) {
        log("lc0 for a fleet worker failed:", err instanceof Error ? err.message : err);
        reply(503, {});
      }
    });
  });
  server.listen(port, "127.0.0.1");
  return server;
}

/** Lc0 on another machine; retried for a while (the tunnel may be reconnecting), then a job failure. */
export class RemoteLc0 implements Lc0Source {
  readonly required = true;
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async rootStats(fen: string, nodes: number): Promise<Lc0Move[]> {
    let last: unknown;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const res = await fetch(this.url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
          body: JSON.stringify({ fen, nodes }),
          // Queued behind ws21's own searches and other fleet workers'.
          signal: AbortSignal.timeout(60 * 60_000),
        });
        if (res.ok) return AnswerSchema.parse(await res.json()).moves;
        last = new Error(`lc0 ${res.status}`);
      } catch (err) {
        last = err;
      }
      await new Promise((r) => setTimeout(r, 30_000));
    }
    throw last instanceof Error ? last : new Error("lc0 unreachable");
  }
}
