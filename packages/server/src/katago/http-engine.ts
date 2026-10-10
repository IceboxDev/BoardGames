/**
 * KataGo on the separate `katago` service (`bridge.ts`), reached over
 * Railway's private network. Same contract as the child engine.
 */
import { z } from "zod";
import { type KataGoEngine, type KataGoQuery, KataGoResponseSchema } from "./protocol.ts";

const BridgeReplySchema = z.object({ responses: z.array(KataGoResponseSchema) });

export function createHttpEngine(baseUrl: string, secret: string): KataGoEngine {
  let lastError: string | null = null;
  return {
    async query(q: KataGoQuery, timeoutMs: number) {
      try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/query`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
          body: JSON.stringify({ query: q, timeoutMs }),
          signal: AbortSignal.timeout(timeoutMs + 2_000),
        });
        if (!res.ok) throw new Error(`KataGo bridge ${res.status}`);
        lastError = null;
        return BridgeReplySchema.parse(await res.json()).responses;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        throw err;
      }
    },
    status() {
      return { ready: lastError === null, detail: lastError ?? "remote" };
    },
  };
}
