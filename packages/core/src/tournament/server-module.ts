/**
 * Server-only AI seams — engine pools, LLM agents — for the local tournament
 * runner. Core must not depend on the server package (its typecheck would
 * follow the import), so a simulator that wants the server's own agent imports
 * the module by path at run time and narrows what it needs from it.
 */

import { pathToFileURL } from "node:url";

const SERVER_SRC = new URL("../../../server/src/", import.meta.url);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** `packages/server/src/<path>`'s exports, untyped — narrow each one before use. */
export async function importServerModule(path: string): Promise<Record<string, unknown>> {
  const url = new URL(path, SERVER_SRC);
  const mod: unknown = await import(pathToFileURL(url.pathname).href);
  if (!isRecord(mod)) throw new Error(`server module ${path} did not load`);
  return mod;
}
