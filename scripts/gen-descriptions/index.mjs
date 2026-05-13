// Description-generation pipeline. One CLI entry point.
//
// Usage:
//   pnpm gen-descriptions --slug <slug>          # one game
//   pnpm gen-descriptions --all                  # every BGG-listed game (bggId > 0)
//   pnpm gen-descriptions --missing              # only games without an existing
//                                                # descriptions.generated.ts
//   pnpm gen-descriptions --concurrency 5        # default 5
//   pnpm gen-descriptions --dry-run              # log only, don't write files
//
// Required env (loaded from packages/server/.env via --env-file):
//   OPENAI_API_KEY   — secret key for the OpenAI Responses API
//   OPENAI_MODEL     — optional, defaults to "gpt-5.5"
//
// The script reads the BGG snapshot at packages/core/src/bgg/snapshot.json
// (the same source the web bundle uses) so the model sees identical context
// to what the user already sees in the carousel.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runPool } from "./concurrency.mjs";
import { writeGameDescriptions } from "./write-game-file.mjs";
// `./openai-call.mjs` is imported lazily inside main() so --help and
// --dry-run work without the `openai` package installed.

const SNAPSHOT_PATH = "packages/core/src/bgg/snapshot.json";
const GAMES_ROOT = "packages/web/src/games";
const DEFAULT_CONCURRENCY = 5;

function die(msg) {
  console.error(`[gen-descriptions] ${msg}`);
  process.exit(1);
}

function parseFlags() {
  const args = process.argv.slice(2);
  const flags = {
    slug: null,
    all: false,
    missing: false,
    concurrency: DEFAULT_CONCURRENCY,
    dryRun: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--slug") flags.slug = args[++i];
    else if (a === "--all") flags.all = true;
    else if (a === "--missing") flags.missing = true;
    else if (a === "--concurrency") flags.concurrency = Number(args[++i]);
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else die(`unknown flag: ${a}`);
  }
  const modes = [flags.slug != null, flags.all, flags.missing].filter(Boolean).length;
  if (modes === 0) die("specify exactly one of --slug, --all, or --missing (or --help)");
  if (modes > 1) die("flags --slug, --all, --missing are mutually exclusive");
  if (!Number.isFinite(flags.concurrency) || flags.concurrency < 1) {
    die(`--concurrency must be a positive integer (got ${flags.concurrency})`);
  }
  return flags;
}

function printHelp() {
  console.log(`gen-descriptions — research-grounded game descriptions via OpenAI Responses API.

Modes (exactly one):
  --slug <slug>     one game
  --all             every BGG-listed game (bggId > 0)
  --missing         only games without an existing descriptions.generated.ts

Options:
  --concurrency <N> in-flight calls (default ${DEFAULT_CONCURRENCY})
  --dry-run         log plan, don't call OpenAI or write files
  -h, --help        this message
`);
}

async function loadSnapshot() {
  if (!existsSync(SNAPSHOT_PATH)) die(`snapshot missing at ${SNAPSHOT_PATH} — run \`pnpm bgg-sync\` first`);
  const raw = await readFile(SNAPSHOT_PATH, "utf8");
  return JSON.parse(raw);
}

function pickSlugs(flags, snapshot) {
  const allSlugs = Object.keys(snapshot).sort();
  if (flags.slug) {
    if (!snapshot[flags.slug]) die(`slug "${flags.slug}" not in snapshot`);
    return [flags.slug];
  }
  if (flags.all) {
    // BGG-listed games only — homebrew (bggId: 0) doesn't have research material
    // and would burn a call returning generic Wikipedia-tier prose.
    return allSlugs.filter((s) => (snapshot[s]?.id ?? 0) > 0);
  }
  if (flags.missing) {
    return allSlugs.filter((s) => {
      if ((snapshot[s]?.id ?? 0) === 0) return false;
      const target = join(GAMES_ROOT, s, "descriptions.generated.ts");
      return !existsSync(target);
    });
  }
  return [];
}

async function main() {
  const flags = parseFlags();
  const snapshot = await loadSnapshot();
  const slugs = pickSlugs(flags, snapshot);

  if (slugs.length === 0) {
    console.log("[gen-descriptions] nothing to do");
    return;
  }

  console.log(
    `[gen-descriptions] ${slugs.length} game(s) targeted, concurrency=${flags.concurrency}${flags.dryRun ? " (dry-run)" : ""}`,
  );

  if (flags.dryRun) {
    for (const s of slugs) console.log(`  would generate: ${s}`);
    return;
  }

  // Eagerly trip on missing env so we don't burn 30 minutes of partial runs.
  if (!process.env.OPENAI_API_KEY) {
    die("OPENAI_API_KEY not set in packages/server/.env");
  }

  // Lazy-import the OpenAI client so --help / --dry-run / missing-env paths
  // don't require the `openai` package to be installed.
  const { generateForGame } = await import("./openai-call.mjs");

  const startedAt = Date.now();
  const { succeeded, failed } = await runPool({
    items: slugs,
    limit: flags.concurrency,
    work: async (slug) => {
      const entry = snapshot[slug];
      const { data, meta } = await generateForGame(entry);
      const path = await writeGameDescriptions({ slug, data, meta: { ...meta, slug } });
      return { path, data };
    },
    onResult: (slug, { path, data }) => {
      console.log(
        `  ✓ ${slug} → ${path} (tight=${data.tight.length}, default=${data.default.length}, loose=${data.loose.length}, sources=${data.sources.length})`,
      );
    },
    onError: (slug, err) => {
      console.error(`  ✗ ${slug} — ${err.message}`);
    },
  });

  const elapsedMin = ((Date.now() - startedAt) / 60_000).toFixed(1);
  console.log(
    `\n[gen-descriptions] ${succeeded.length} succeeded, ${failed.length} failed in ${elapsedMin} min`,
  );
  if (failed.length > 0) {
    console.log("Failed slugs (re-run with --slug to retry):");
    for (const { item } of failed) console.log(`  ${item}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
