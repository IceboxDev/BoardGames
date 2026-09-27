// Value-net training data: Nosferatu self-play (ε-random moves for
// coverage), positions sampled along the way, one row per seat, labelled with
// that seat's actual outcome. Forks workers; each writes its own shard.
//
//   pnpm --filter @boardgames/core exec tsx src/games/the-hunger/search/gen-value.ts \
//     --games 100000 --out ../../scratch/hunger-value/gen0 [--workers 23] [--eps 0.05] [--p 0.04]
//     [--policy nosferatu|dracula]   (dracula = policy iteration on the current value net)
//
// Shard format (little-endian): rows of FEATURES float16 features followed by
// 6 float32 targets: utility, win, placement, margin (sigmoid), survived, players.
import { fork } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyUnchecked, createInitialState } from "../game-engine";
import { getActivePlayer, getLegalActions } from "../rules";
import type { GameState } from "../types";
import { mulberry32 } from "./determinize";
import { draculaPick } from "./dracula";
import { encodeView, FEATURE_VERSION, FEATURES } from "./features";
import { rolloutAction } from "./rollout";
import { outcomeTargets as targetsFor } from "./utility";

export const TARGETS = 6;

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
/** IEEE float32 → float16 bits (round-to-nearest; features are small, finite). */
function toHalf(v: number): number {
  f32[0] = v;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  const exp = ((x >>> 23) & 0xff) - 127 + 15;
  const mant = x & 0x7fffff;
  if (exp <= 0) return sign; // flush tiny values to zero
  if (exp >= 31) return sign | 0x7bff; // clamp to max half
  return sign | (exp << 10) | ((mant + 0x1000) >>> 13);
}

type Policy = "nosferatu" | "dracula";

function worker(job: { games: number[]; eps: number; p: number; out: string; policy: Policy }) {
  const feats: Uint16Array[] = [];
  const targets: number[] = [];
  const x = new Float32Array(FEATURES);
  for (const g of job.games) {
    const rand = mulberry32(g * 7919 + 17);
    const n = 2 + (g % 5);
    const mode = g % 5 === 4 ? "rookie" : "elder";
    let s = createInitialState({
      playerCount: n,
      strategies: Array(n).fill("heuristic-v1"),
      seed: (g * 2654435761) >>> 0,
      options: { mode },
    });
    const sampled: { state: GameState }[] = [];
    for (let step = 0; s.phase !== "game-over" && step < 20000; step++) {
      const seat = getActivePlayer(s);
      const legal = getLegalActions(s, seat);
      if (legal.length > 1 && rand() < job.p) sampled.push({ state: s });
      const action =
        legal.length > 1 && rand() < job.eps
          ? legal[Math.floor(rand() * legal.length)]
          : job.policy === "dracula"
            ? draculaPick(s, seat, legal)
            : rolloutAction(s).action;
      s = applyUnchecked(s, seat, action);
    }
    if (s.phase !== "game-over") continue;
    for (const { state } of sampled) {
      for (let seat = 0; seat < n; seat++) {
        encodeView(state, seat, x);
        feats.push(Uint16Array.from(x, toHalf));
        targets.push(...targetsFor(s, seat));
      }
    }
  }
  const rows = feats.length;
  const buf = Buffer.alloc(rows * (FEATURES * 2 + TARGETS * 4));
  let off = 0;
  for (let i = 0; i < rows; i++) {
    Buffer.from(feats[i].buffer).copy(buf, off);
    off += FEATURES * 2;
    for (let t = 0; t < TARGETS; t++) {
      buf.writeFloatLE(targets[i * TARGETS + t], off);
      off += 4;
    }
  }
  writeFileSync(job.out, buf);
  process.send?.({ rows });
}

const argv = process.argv.slice(2);
if (argv[0] === "--worker") {
  worker(JSON.parse(argv[1]));
} else {
  const flag = (k: string, d: string) => {
    const i = argv.indexOf(`--${k}`);
    return i === -1 ? d : argv[i + 1];
  };
  const games = Number(flag("games", "20000"));
  const offset = Number(flag("offset", "0"));
  const out = flag("out", "../../scratch/hunger-value/gen0");
  const workers = Number(flag("workers", String(Math.max(1, availableParallelism() - 1))));
  mkdirSync(out, { recursive: true });
  const self = fileURLToPath(import.meta.url);
  let rows = 0;
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: workers }, (_, w) => {
      const ids: number[] = [];
      for (let g = w; g < games; g += workers) ids.push(g + offset);
      const job = {
        games: ids,
        eps: Number(flag("eps", "0.05")),
        p: Number(flag("p", "0.04")),
        out: join(out, `shard-${w}.bin`),
      };
      return new Promise<void>((resolve, reject) => {
        const child = fork(self, ["--worker", JSON.stringify(job)], {
          execArgv: ["--import", "tsx"],
        });
        child.on("message", (m: unknown) => {
          rows += (m as { rows: number }).rows;
        });
        child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`worker ${code}`))));
      });
    }),
  );
  writeFileSync(
    join(out, "meta.json"),
    JSON.stringify(
      {
        featureVersion: FEATURE_VERSION,
        features: FEATURES,
        targets: TARGETS,
        rows,
        games,
        offset,
      },
      null,
      2,
    ),
  );
  console.log(`rows ${rows} in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${out}`);
}
