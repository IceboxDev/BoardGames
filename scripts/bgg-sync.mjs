// BGG cache populator — single source of truth for all game-related text.
// Writes:
//   1. The libsql `bgg_cache` table (server-side, used by /api/bgg)
//   2. `packages/core/src/bgg/snapshot.json` (bundled into the web build)
//
// Usage:
//   pnpm bgg-sync                    # refresh entries missing from snapshot
//   pnpm bgg-sync --all              # refresh every existing slug
//   pnpm bgg-sync --slug <slug>      # one slug only
//   pnpm bgg-sync --add              # scaffold + fetch new games listed in
//                                    #   scripts/bgg-new-games.json
//   pnpm bgg-sync --dry-run          # plan only, no writes
//
// Required env (loaded from packages/server/.env via --env-file):
//   BGG_API_TOKEN       — Bearer token from https://boardgamegeek.com/applications
//   TURSO_DATABASE_URL  — same as the running server uses
//   TURSO_AUTH_TOKEN    — same as the running server (optional for local libsql)

import { createClient } from "@libsql/client";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { extractOne } from "./extract-accents.mjs";
import { optimizeOne } from "../packages/web/scripts/optimize-thumbnails.mjs";
import { parseBggThings } from "./bgg-parse.mjs";

const GAMES_ROOT = "packages/web/src/games";
const CATALOG_PATH = join(GAMES_ROOT, "catalog.json");
const SNAPSHOT_PATH = "packages/core/src/bgg/snapshot.json";
const NEW_GAMES_PATH = "scripts/bgg-new-games.json";
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const BGG_BATCH_SIZE = 20;
const BGG_BATCH_DELAY_MS = 5000;
const BGG_RETRY_DELAY_MS = 1500;
const BGG_MAX_RETRIES = 3;

function die(msg) {
  console.error(`[bgg-sync] ${msg}`);
  process.exit(1);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) die(`missing env var ${name} (set it in packages/server/.env)`);
  return v;
}

function parseFlags() {
  const argv = process.argv.slice(2);
  let all = false;
  let dryRun = false;
  let add = false;
  let slug = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all" || a === "-a") all = true;
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--add") add = true;
    else if (a === "--slug") slug = argv[++i] ?? null;
    else if (a.startsWith("--")) die(`unknown flag: ${a}`);
    else if (!slug) slug = a;
  }
  return { all, slug, dryRun, add };
}

/**
 * Read every (slug, bggId) pair the registry will surface. The
 * authority is catalog.json — folders without a catalog entry are
 * stale and ignored (they'd be invisible to the registry anyway).
 */
async function readGameSlugs() {
  if (!existsSync(CATALOG_PATH)) {
    die(`${CATALOG_PATH} not found — run \`pnpm tsx scripts/migrate-catalog.mts\` first`);
  }
  const raw = await readFile(CATALOG_PATH, "utf8");
  const catalog = JSON.parse(raw);
  if (!Array.isArray(catalog)) die(`${CATALOG_PATH} must be a JSON array`);
  return catalog.map((c) => ({ slug: c.slug, bggId: c.bggId }));
}

/**
 * Read catalog.json into memory. Returned as the full array (not the
 * `(slug,bggId)` projection above) so callers that need to mutate
 * entries — `pnpm bgg-sync --add` for scaffolding new entries — can
 * splice into the same array we then write back.
 */
async function readCatalog() {
  const raw = await readFile(CATALOG_PATH, "utf8");
  return JSON.parse(raw);
}

/**
 * Persist catalog.json with the same format the migration produced:
 * sorted alphabetically by slug, 2-space indent, trailing newline.
 */
async function writeCatalog(entries) {
  const sorted = [...entries].sort((a, b) => a.slug.localeCompare(b.slug));
  await writeFile(CATALOG_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
}

async function readCurrentSnapshot() {
  if (!existsSync(SNAPSHOT_PATH)) return {};
  const raw = await readFile(SNAPSHOT_PATH, "utf8");
  return JSON.parse(raw);
}

function isValidBggGame(g) {
  if (!g || typeof g !== "object") return false;
  return (
    typeof g.id === "number" &&
    typeof g.type === "string" &&
    typeof g.name === "string" &&
    g.name.length > 0 &&
    typeof g.description === "string" &&
    Array.isArray(g.alternateNames) &&
    Array.isArray(g.categories) &&
    Array.isArray(g.mechanics) &&
    Array.isArray(g.families) &&
    Array.isArray(g.designers) &&
    Array.isArray(g.artists) &&
    Array.isArray(g.publishers) &&
    Array.isArray(g.expansions) &&
    Array.isArray(g.compilations) &&
    Array.isArray(g.implementations) &&
    Array.isArray(g.accessories) &&
    Array.isArray(g.subdomainRanks)
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchBatch(bggIds, token) {
  const url = `https://boardgamegeek.com/xmlapi2/thing?id=${bggIds.join(",")}&stats=1`;
  let xml = null;
  for (let attempt = 0; attempt < BGG_MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/xml, text/xml",
        Authorization: `Bearer ${token}`,
      },
    });
    if (res.status === 202) {
      console.log(
        `[bgg-sync] BGG queued, retrying in ${BGG_RETRY_DELAY_MS}ms (attempt ${attempt + 1}/${BGG_MAX_RETRIES})`,
      );
      await sleep(BGG_RETRY_DELAY_MS);
      continue;
    }
    if (res.status === 401) die("401 unauthorized — check BGG_API_TOKEN");
    if (!res.ok) die(`BGG returned ${res.status}: ${await res.text()}`);
    xml = await res.text();
    break;
  }
  if (!xml) die("BGG kept returning 202; gave up");

  const parsed = parseBggThings(xml);
  const out = {};
  for (const [k, v] of Object.entries(parsed)) {
    const id = Number(k);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (!isValidBggGame(v.game)) {
      console.warn(`[bgg-sync] BGG returned invalid shape for id=${id}, skipping`);
      continue;
    }
    out[id] = v;
  }
  return out;
}

async function readNewGames() {
  if (!existsSync(NEW_GAMES_PATH)) {
    die(
      `${NEW_GAMES_PATH} not found. Copy ${NEW_GAMES_PATH.replace(/\.json$/, ".example.json")} ` +
        "and fill in slug+bggId pairs for the games to add.",
    );
  }
  const raw = await readFile(NEW_GAMES_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) die(`${NEW_GAMES_PATH} must be a JSON array`);
  for (const e of parsed) {
    if (!e || typeof e !== "object") die("each new-game entry must be an object");
    if (typeof e.slug !== "string" || !SLUG_RE.test(e.slug)) {
      die(`invalid slug "${e.slug}" — kebab-case, max 64 chars`);
    }
    if (!Number.isInteger(e.bggId) || e.bggId <= 0) {
      die(`${e.slug}: bggId must be a positive integer`);
    }
    if (e.displayTitle !== undefined && typeof e.displayTitle !== "string") {
      die(`${e.slug}: displayTitle must be a string when present`);
    }
  }
  return parsed;
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) die(`failed to download ${url}: ${res.status}`);
  if (!res.body) die(`empty body downloading ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
}

/**
 * Scaffold a new catalog entry: download the thumbnail, optimize it,
 * compute an accent hex, and return a new catalog.json entry ready to
 * splice into the array.
 *
 * The entry is *catalog* by default — playable games still need their
 * own `<slug>/index.ts` and a follow-up commit. Returning the entry
 * (vs writing catalog.json here) keeps every scaffold in a run write
 * the file exactly once at the end.
 */
async function scaffoldSlug({ slug, bggId, displayTitle }, parsed) {
  const dir = join(GAMES_ROOT, slug);
  const assetsDir = join(dir, "assets");
  await mkdir(assetsDir, { recursive: true });

  // 1. Download BGG image (prefer full-res `image`; fall back to `thumbnail`).
  let accentHex = "#888888";
  const imageUrl = parsed.image ?? parsed.thumbnail;
  if (!imageUrl) {
    console.warn(`[bgg-sync] ${slug}: BGG has no image for id ${bggId}; skipping thumbnail`);
  } else {
    const pngPath = join(assetsDir, "thumbnail.png");
    await downloadFile(imageUrl, pngPath);
    console.log(`[bgg-sync] ${slug}: downloaded ${imageUrl} → ${pngPath}`);
    // 2. Optimize PNG → WebP next to it.
    await optimizeOne(pngPath);
    // 3. Extract accent color from the optimized image.
    const hex = await extractOne(slug);
    if (hex !== null) accentHex = hex;
  }

  const entry = { slug, bggId, accentHex };
  if (displayTitle) entry.displayTitle = displayTitle;
  return entry;
}

function sortKeysAlphabetically(obj) {
  return Object.keys(obj)
    .sort()
    .reduce((acc, k) => {
      acc[k] = obj[k];
      return acc;
    }, {});
}

async function writeSnapshotAtomic(snapshot) {
  const sorted = sortKeysAlphabetically(snapshot);
  const json = `${JSON.stringify(sorted, null, 2)}\n`;
  const tmp = `${SNAPSHOT_PATH}.tmp`;
  await writeFile(tmp, json);
  await rename(tmp, SNAPSHOT_PATH);
}

async function upsertCacheRows(db, rows) {
  if (rows.length === 0) return;
  await db.batch(
    rows.map((r) => ({
      sql: `INSERT INTO bgg_cache (slug, bgg_id, name, metadata_json, fetched_at, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(slug) DO UPDATE SET
              bgg_id = excluded.bgg_id,
              name = excluded.name,
              metadata_json = excluded.metadata_json,
              updated_at = datetime('now')`,
      args: [r.slug, r.bggId, r.data.name, JSON.stringify(r.data)],
    })),
    "write",
  );
}

async function main() {
  const flags = parseFlags();
  // Defer env checks past the dry-run early-out so the operator can preview
  // the plan without setting credentials.
  const slugs = await readGameSlugs();
  const snapshot = await readCurrentSnapshot();

  // Targets to refresh from the existing registry.
  let refreshTargets;
  if (flags.slug) {
    refreshTargets = slugs.filter((s) => s.slug === flags.slug);
    if (refreshTargets.length === 0) die(`no game with slug "${flags.slug}"`);
  } else if (flags.all) {
    refreshTargets = slugs;
  } else if (flags.add) {
    refreshTargets = []; // --add by itself only handles new games
  } else {
    refreshTargets = slugs.filter((s) => !(s.slug in snapshot));
  }

  // New-game targets from scripts/bgg-new-games.json.
  let scaffoldTargets = [];
  if (flags.add) {
    const newGames = await readNewGames();
    const existingSlugs = new Set(slugs.map((s) => s.slug));
    for (const e of newGames) {
      if (existingSlugs.has(e.slug)) {
        die(`${e.slug} already exists in the registry — refresh with \`pnpm bgg-sync --slug ${e.slug}\``);
      }
    }
    scaffoldTargets = newGames.map((e) => ({
      slug: e.slug,
      bggId: e.bggId,
      displayTitle: e.displayTitle,
      scaffold: true,
    }));
  }

  // bggId 0 is the homebrew sentinel — nothing to fetch.
  const refreshFetchable = refreshTargets.filter((s) => s.bggId > 0);
  const refreshSkipped = refreshTargets.filter((s) => s.bggId === 0);
  if (refreshSkipped.length > 0) {
    console.log(
      `[bgg-sync] skipping ${refreshSkipped.length} non-BGG game(s): ${refreshSkipped.map((s) => s.slug).join(", ")}`,
    );
  }

  const fetchable = [...refreshFetchable, ...scaffoldTargets];
  if (fetchable.length === 0) {
    console.log(
      "[bgg-sync] nothing to do (use --all to refresh, --slug X for one game, --add for new games)",
    );
    return;
  }

  console.log(
    `[bgg-sync] fetching ${fetchable.length} game(s) in batches of ${BGG_BATCH_SIZE}` +
      (scaffoldTargets.length > 0 ? ` (${scaffoldTargets.length} new)` : ""),
  );

  if (flags.dryRun) {
    for (const t of fetchable) {
      const tag = t.scaffold ? " [new]" : "";
      console.log(`  - ${t.slug} (bggId=${t.bggId})${tag}`);
    }
    console.log("[bgg-sync] dry run; no writes");
    return;
  }

  const token = requireEnv("BGG_API_TOKEN");
  const dbUrl = requireEnv("TURSO_DATABASE_URL");
  const dbAuth = process.env.TURSO_AUTH_TOKEN;

  // fetched[bggId] = { game: BggGame, image: string|null, thumbnail: string|null }
  const fetched = {};
  for (let i = 0; i < fetchable.length; i += BGG_BATCH_SIZE) {
    const batch = fetchable.slice(i, i + BGG_BATCH_SIZE);
    const ids = batch.map((b) => b.bggId);
    const result = await fetchBatch(ids, token);
    Object.assign(fetched, result);
    if (i + BGG_BATCH_SIZE < fetchable.length) {
      await sleep(BGG_BATCH_DELAY_MS);
    }
  }

  // Scaffold any new games BEFORE the registry build at next dev/build time.
  // We collect the new entries here and splice them into catalog.json in
  // one batched write at the end.
  const newCatalogEntries = [];
  for (const t of scaffoldTargets) {
    const parsed = fetched[t.bggId];
    if (!parsed) {
      console.warn(`[bgg-sync] ${t.slug}: BGG returned no data for id ${t.bggId}; cannot scaffold`);
      continue;
    }
    const entry = await scaffoldSlug(t, parsed);
    newCatalogEntries.push(entry);
  }
  if (newCatalogEntries.length > 0) {
    const catalog = await readCatalog();
    catalog.push(...newCatalogEntries);
    await writeCatalog(catalog);
    console.log(
      `[bgg-sync] added ${newCatalogEntries.length} entry/entries to ${CATALOG_PATH}: ${newCatalogEntries.map((e) => e.slug).join(", ")}`,
    );
  }

  let written = 0;
  let missing = 0;
  const upserts = [];
  for (const t of fetchable) {
    const parsed = fetched[t.bggId];
    if (!parsed) {
      console.warn(`[bgg-sync] ${t.slug}: BGG returned no data for id ${t.bggId}`);
      missing++;
      continue;
    }
    const data = parsed.game;
    snapshot[t.slug] = data;
    upserts.push({ slug: t.slug, bggId: t.bggId, data });
    written++;
  }

  await writeSnapshotAtomic(snapshot);

  const db = createClient({ url: dbUrl, authToken: dbAuth });
  try {
    await upsertCacheRows(db, upserts);
  } finally {
    db.close();
  }

  console.log(`[bgg-sync] wrote ${written} entry/entries to snapshot + db`);
  if (missing > 0) console.warn(`[bgg-sync] ${missing} entries missing from BGG response`);
}

main().catch((err) => {
  console.error("[bgg-sync] error:", err);
  process.exit(1);
});
