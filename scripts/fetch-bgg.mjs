// Dev-time BGG metadata fetcher. Reads each game's bggId from its index.ts,
// fetches the BGG XML API, parses, writes per-game `bgg.json` baked into git.
//
// Usage:
//   BGG_API_TOKEN=<uuid> pnpm fetch-bgg                # fetch missing only
//   BGG_API_TOKEN=<uuid> pnpm fetch-bgg --all          # refresh everything
//   BGG_API_TOKEN=<uuid> pnpm fetch-bgg lost-cities    # one specific slug
//
// Get a token at https://boardgamegeek.com/applications (manual approval).
// At runtime the server never touches BGG — the JSON files are bundled into
// the web build.

import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseBggXml } from "./bgg-parse.mjs";

const ROOT = "packages/web/src/games";

const args = process.argv.slice(2);
const refreshAll = args.includes("--all") || args.includes("-a");
const targetSlug = args.find((a) => !a.startsWith("-"));

const token = process.env.BGG_API_TOKEN;
if (!token) {
  console.error(
    "[fetch-bgg] BGG_API_TOKEN env var required.\n" +
      "  Register an application at https://boardgamegeek.com/applications,\n" +
      "  generate a token, then run:\n" +
      "    BGG_API_TOKEN=<uuid> pnpm fetch-bgg [slug|--all]",
  );
  process.exit(1);
}

const dirents = await readdir(ROOT, { withFileTypes: true });
const slugs = dirents.filter((d) => d.isDirectory()).map((d) => d.name);

const games = [];
for (const slug of slugs) {
  const indexPath = join(ROOT, slug, "index.ts");
  if (!existsSync(indexPath)) continue;
  const content = await readFile(indexPath, "utf8");
  const m = content.match(/bggId\s*:\s*(\d+)/);
  if (!m) {
    console.warn(`[fetch-bgg] ${slug}: no bggId found in index.ts, skipping`);
    continue;
  }
  games.push({ slug, bggId: Number(m[1]), dir: join(ROOT, slug) });
}

const targets = targetSlug
  ? games.filter((g) => g.slug === targetSlug)
  : refreshAll
    ? games
    : games.filter((g) => !existsSync(join(g.dir, "bgg.json")));

if (targets.length === 0) {
  console.log("[fetch-bgg] nothing to do (all games have bgg.json — pass --all to refresh)");
  process.exit(0);
}

const ids = targets.map((g) => g.bggId).join(",");
console.log(`[fetch-bgg] fetching ${targets.length} game(s): ${ids}`);

const url = `https://boardgamegeek.com/xmlapi2/thing?id=${ids}&stats=1`;
let xml = null;
for (let attempt = 0; attempt < 3; attempt++) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/xml, text/xml",
      Authorization: `Bearer ${token}`,
    },
  });
  if (res.status === 202) {
    console.log(`[fetch-bgg] BGG queued, retrying in 1.5s (attempt ${attempt + 1})`);
    await new Promise((r) => setTimeout(r, 1500));
    continue;
  }
  if (res.status === 401) {
    console.error("[fetch-bgg] 401 unauthorized — check BGG_API_TOKEN");
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`[fetch-bgg] BGG returned ${res.status}`);
    process.exit(1);
  }
  xml = await res.text();
  break;
}
if (!xml) {
  console.error("[fetch-bgg] BGG kept returning 202; gave up");
  process.exit(1);
}

const parsed = parseBggXml(xml);
let wrote = 0;
for (const t of targets) {
  const data = parsed[t.bggId];
  if (!data) {
    console.warn(`[fetch-bgg] ${t.slug}: BGG had no data for id ${t.bggId}`);
    continue;
  }
  await writeFile(join(t.dir, "bgg.json"), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`[fetch-bgg] ${t.slug} → ${data.name} (${data.yearPublished ?? "?"})`);
  wrote++;
}
console.log(`[fetch-bgg] wrote ${wrote} file(s)`);
