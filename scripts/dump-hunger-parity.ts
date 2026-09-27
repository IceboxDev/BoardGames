/**
 * Dump seeded The Hunger games from the TS engine for C++ cross-validation
 * (cpp/the-hunger/tests/parity_test.cpp, `hg parity <dir>`).
 *
 *   pnpm dump-hunger-parity                         # committed fixture set
 *   cd packages/core && npx tsx ../../scripts/dump-hunger-parity.ts \
 *     --out /tmp/hunger-parity --games 1000 [--offset 0] [--full | --full-games K] \
 *     [--strigoi G] [--rollouts R]
 *
 * Games cycle through 2–6 seats × elder/rookie; seats play random (own
 * Mulberry32 stream), heuristic-v1 (Nosferatu) or a mix. `--strigoi G` adds G
 * games with seat 0 on Strigoi at `--rollouts` (default 8) vs Nosferatu.
 *
 * One text file per batch. Per game:
 *   G <id> <players> <e|r> <safe 0|1> <seed> <policy per seat: r|h|s, comma-separated>
 *   I <stateHash of the initial state>
 * then per decision (lines before S describe the state BEFORE the action):
 *   L <canonical action>|<canonical action>|...   (--full, or the first --full-games K = 30)
 *   D <K> <stateHash of determinize(state, seat, mulberry32(K))>  (sampled)
 *   T <strigoi pick index> <rollouts>             (Strigoi seats)
 *   S <seat> <#legal> <fnv64 of the legal list joined by \n> <chosen> <heuristic pick> <stateHash after>
 * and at the end
 *   R <scores,...> <winners,...> <placements,...>
 *   E
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { heuristicPick } from "../packages/core/src/games/the-hunger/ai-heuristic.ts";
import { applyUnchecked, createInitialState } from "../packages/core/src/games/the-hunger/game-engine.ts";
import { getActivePlayer, getLegalActions } from "../packages/core/src/games/the-hunger/rules.ts";
import { canonicalAction, fnv1a64, stateHash } from "../packages/core/src/games/the-hunger/search/canon.ts";
import { determinize, mulberry32 } from "../packages/core/src/games/the-hunger/search/determinize.ts";
import { strigoiPick } from "../packages/core/src/games/the-hunger/search/strigoi.ts";
import { seedForGame } from "../packages/core/src/games/the-hunger/tournament-runner.ts";
import type { GameState, Mode } from "../packages/core/src/games/the-hunger/types.ts";

const argv = process.argv.slice(2);
const flag = (name: string, dflt?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? dflt : argv[i + 1];
};
const has = (name: string) => argv.includes(`--${name}`);

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(flag("out", resolve(REPO, "cpp/the-hunger/tests/fixtures")) as string);
const GAMES = Number(flag("games", "150"));
const OFFSET = Number(flag("offset", "0"));
const FULL = has("full");
/** Full legal lists for the first K games only (the committed set keeps a sample). */
const FULL_GAMES = Number(flag("full-games", "30"));
const STRIGOI = Number(flag("strigoi", "12"));
const ROLLOUTS = Number(flag("rollouts", "8"));
const PER_FILE = Number(flag("per-file", "50"));
const DET_EVERY = Number(flag("det-every", "5"));
mkdirSync(OUT, { recursive: true });

type Policy = "r" | "h" | "s";

function playGame(
  id: number,
  n: number,
  mode: Mode,
  safe: boolean,
  policies: Policy[],
  full: boolean,
): string[] {
  const seed = seedForGame(id);
  const lines = [`G ${id} ${n} ${mode === "rookie" ? "r" : "e"} ${safe ? 1 : 0} ${seed} ${policies.join(",")}`];
  let s: GameState = createInitialState({
    playerCount: n,
    strategies: policies.map(() => null),
    seed,
    options: { mode, beginnerSafeMountains: safe },
  });
  lines.push(`I ${stateHash(s)}`);
  const pick = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  let step = 0;
  while (s.phase !== "game-over") {
    if (++step > 20000) throw new Error(`game ${id}: no end`);
    const seat = getActivePlayer(s);
    const legal = getLegalActions(s, seat);
    if (legal.length === 0) throw new Error(`game ${id}: no legal action`);
    const canon = legal.map(canonicalAction);
    if (full) lines.push(`L ${canon.join("|")}`);
    if (step % DET_EVERY === 0) {
      const k = (Math.imul(step, 0x9e3779b1) ^ seed) >>> 0;
      lines.push(`D ${k} ${stateHash(determinize(s, seat, mulberry32(k)))}`);
    }
    const h = legal.indexOf(heuristicPick(s, seat, legal));
    let chosen: number;
    if (policies[seat] === "s") {
      const a = strigoiPick(s, seat, legal, { rollouts: ROLLOUTS, minPerArm: 4, timeMs: 0 });
      chosen = legal.indexOf(a);
      lines.push(`T ${chosen} ${ROLLOUTS}`);
    } else if (policies[seat] === "h") {
      chosen = h;
    } else {
      chosen = Math.floor(pick() * legal.length);
    }
    s = applyUnchecked(s, seat, legal[chosen]);
    lines.push(
      `S ${seat} ${legal.length} ${fnv1a64(canon.join("\n"))} ${chosen} ${h} ${stateHash(s)}`,
    );
  }
  const r = s.result;
  if (!r) throw new Error(`game ${id}: no result`);
  lines.push(`R ${r.scores.join(",")} ${r.winners.join(",")} ${r.placements.join(",")}`, "E");
  return lines;
}

function specFor(g: number): { n: number; mode: Mode; safe: boolean; policies: Policy[] } {
  const n = 2 + (g % 5);
  const mode: Mode = Math.floor(g / 5) % 2 === 1 ? "rookie" : "elder";
  const safe = g % 7 === 3;
  const kind = Math.floor(g / 10) % 3;
  const policies = Array.from({ length: n }, (_, i): Policy =>
    kind === 0 ? "r" : kind === 1 ? "h" : (i + g) % 2 === 0 ? "h" : "r",
  );
  return { n, mode, safe, policies };
}

const t0 = performance.now();
let steps = 0;
for (let start = OFFSET; start < OFFSET + GAMES; start += PER_FILE) {
  const end = Math.min(OFFSET + GAMES, start + PER_FILE);
  const out: string[] = [];
  for (let g = start; g < end; g++) {
    const { n, mode, safe, policies } = specFor(g);
    const lines = playGame(g, n, mode, safe, policies, FULL || g - OFFSET < FULL_GAMES);
    steps += lines.filter((l) => l.startsWith("S ")).length;
    out.push(...lines);
  }
  const file = resolve(OUT, `games-${String(start).padStart(6, "0")}.txt`);
  writeFileSync(file, `${out.join("\n")}\n`);
  console.log(`wrote ${file} (games ${start}..${end - 1})`);
}
if (STRIGOI > 0) {
  const out: string[] = [];
  for (let k = 0; k < STRIGOI; k++) {
    const g = 900000 + OFFSET + k;
    const n = 2 + (k % 3);
    const mode: Mode = k % 2 === 1 ? "rookie" : "elder";
    const policies: Policy[] = Array.from({ length: n }, (_, i) => (i === 0 ? "s" : "h"));
    const lines = playGame(g, n, mode, false, policies, FULL);
    steps += lines.filter((l) => l.startsWith("S ")).length;
    out.push(...lines);
    console.log(`strigoi game ${g} done`);
  }
  const file = resolve(OUT, `strigoi-${String(OFFSET).padStart(6, "0")}.txt`);
  writeFileSync(file, `${out.join("\n")}\n`);
  console.log(`wrote ${file}`);
}
console.log(
  `${GAMES} games + ${STRIGOI} strigoi, ${steps} decisions in ${((performance.now() - t0) / 1000).toFixed(1)}s`,
);
