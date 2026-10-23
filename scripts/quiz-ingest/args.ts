// Shared argument handling for the quiz-ingest CLI.

import {
  ACTOR_KINDS,
  type HistoryActor,
  RunIdSchema,
} from "../../packages/core/src/quiz/history-schema.ts";
import { runExists } from "../quiz/lib/runs-io.ts";

export const argv = process.argv.slice(2);

/** `--name=value` (the last one wins), or undefined. */
export function argValue(name: string): string | undefined {
  const hits = argv.filter((a) => a.startsWith(`--${name}=`));
  return hits.at(-1)?.slice(name.length + 3);
}

export const hasFlag = (name: string) => argv.includes(`--${name}`);

/** Positional arguments after the command. */
export const positionals = () => argv.slice(1).filter((a) => !a.startsWith("--"));

export const today = () => new Date().toISOString().slice(0, 10);
/** An ISO timestamp to the second, UTC. */
export const nowIso = () => `${new Date().toISOString().slice(0, 19)}Z`;

export function die(msg: string): never {
  console.error(`[quiz-ingest] ${msg}`);
  process.exit(1);
}

/**
 * `--actor-kind=human|agent|script --actor=<name> [--model=<id>]` → the
 * structured actor, or undefined when none of them is given. The name falls
 * back to `--by`, the kind to `fallbackKind`.
 */
export function actorFromFlags(fallback?: Partial<HistoryActor>): HistoryActor | undefined {
  const kind = argValue("actor-kind");
  const name = argValue("actor") ?? argValue("by") ?? fallback?.name;
  const model = argValue("model");
  if (!kind && !argValue("actor") && !model) {
    return fallback?.kind && fallback.name ? (fallback as HistoryActor) : undefined;
  }
  const k = kind ?? fallback?.kind ?? "human";
  if (!(ACTOR_KINDS as readonly string[]).includes(k))
    die(`--actor-kind must be one of ${ACTOR_KINDS.join("|")}`);
  if (!name) die("--actor=<name> is required with --actor-kind / --model");
  return { kind: k as HistoryActor["kind"], name, ...(model ? { model } : {}) };
}

/** `--by`, else the actor's name, else the default. */
export function byFromFlags(actor: HistoryActor | undefined, fallback = "coordinator"): string {
  return argValue("by") ?? actor?.name ?? fallback;
}

const warned = new Set<string>();

/** `--run=<id>`, validated; warns when the run has no folder in the archive yet. */
export function runFromFlags(): string | undefined {
  const run = argValue("run");
  if (run === undefined) return undefined;
  if (!RunIdSchema.safeParse(run).success) die(`bad --run id ${run}`);
  if (!runExists(run) && !warned.has(run)) {
    warned.add(run);
    console.warn(
      `[quiz-ingest] warning: run ${run} has no run.json yet (quiz-ingest run open ${run} …)`,
    );
  }
  return run;
}

/** Split a comma list flag. */
export const listFlag = (name: string) =>
  argValue(name)
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
