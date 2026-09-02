// Gamefound project dumper — feeds the Purchase Manager's code-side workflow.
//
// Walks every published update of a Gamefound campaign (they're server-
// rendered with the full update JSON embedded in the page, no auth needed),
// converts the rich text to readable markdown with inline image references,
// and downloads every image (the infographics carry half the information).
//
// Usage:
//   npx tsx scripts/gamefound-dump.ts <project-or-update URL> [--out <dir>]
//
// Output (default ./gamefound-dumps/<slug>/ — git-ignored):
//   project.json  — project metadata (name, creator, phase, ids)
//   updates.json  — raw structured updates as Gamefound serves them
//   updates.md    — the digest to hand to Claude (text + [image ...] markers)
//   images/       — u<N>-header.* and u<N>-01.* … for every update
//
// Pledge details ("Your pledge") are auth-gated and not scraped — paste those
// once by hand; they only change when the order changes. After a run, just
// tell Claude: "new Gamefound dump in gamefound-dumps/<slug> — fold it in".

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const ORIGIN = "https://gamefound.com";

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

// ── CLI ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const outDirArg = outFlag !== -1 ? args[outFlag + 1] : undefined;
const urlArg = args.filter((_, i) => outFlag === -1 || (i !== outFlag && i !== outFlag + 1))[0];
if (!urlArg) {
  fail(
    "usage: npx tsx scripts/gamefound-dump.ts <gamefound project URL> [--out <dir>]",
  );
}

const projectMatch = urlArg.match(/gamefound\.com\/(?:[a-z]{2}\/)?projects\/([^/]+)\/([^/?#]+)/);
if (!projectMatch) fail(`not a Gamefound project URL: ${urlArg}`);
const [, creatorSlug, projectSlug] = projectMatch;
const base = `${ORIGIN}/en/projects/${creatorSlug}/${projectSlug}`;
const outDir = outDirArg ?? join("gamefound-dumps", projectSlug);

// ── Fetch helpers ──────────────────────────────────────────────────────

// Gamefound's WAF 403s Node's fetch outright (client fingerprinting) and is
// even picky about curl's Accept header — adding `image/webp` to it flips a
// 200 into a 403 (verified 2026-09-02). Shell out to curl with EXACTLY this
// header set; don't "improve" it.
const CURL_ARGS = [
  "-sS",
  "--fail",
  "--location",
  "--max-time",
  "60",
  "-H",
  `User-Agent: ${UA}`,
  "-H",
  "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "-H",
  "Accept-Language: en-US,en;q=0.9",
];

function curl(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      [...CURL_ARGS, url],
      { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(`GET ${url} failed: ${stderr.toString().trim() || err.message}`));
        else resolve(stdout);
      },
    );
  });
}

async function fetchText(url: string): Promise<string> {
  return (await curl(url)).toString("utf8");
}

const fetchBinary = curl;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Extract the JSON object that starts at the first `{` after `marker`.
 * Brace-scans with a string-literal state machine, so braces and escaped
 * quotes inside the JSON's HTML payloads can't derail it.
 */
function extractJsonAfter(html: string, marker: string): unknown {
  const at = html.lastIndexOf(marker);
  if (at === -1) throw new Error(`marker not found: ${marker}`);
  const start = html.indexOf("{", at + marker.length);
  if (start === -1) throw new Error(`no JSON object after marker: ${marker}`);
  let depth = 0;
  let inString = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(start, i + 1));
    }
  }
  throw new Error(`unterminated JSON after marker: ${marker}`);
}

// ── HTML → markdown-ish text ───────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * Flatten Gamefound rich text into readable markdown. `imageRef` maps an
 * image URL to the local file marker rendered in its place, so infographics
 * keep their position in the flow.
 */
function htmlToText(html: string, imageRef: (src: string) => string): string {
  let s = html;
  s = s.replace(/<img\b[^>]*?src="([^"]+)"[^>]*>/gi, (_, src) => `\n${imageRef(src)}\n`);
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(div|p|h[1-6]|li|tr)>/gi, "\n");
  s = s.replace(/<li\b[^>]*>/gi, "- ");
  s = s.replace(/<(b|strong)\b[^>]*>/gi, "**").replace(/<\/(b|strong)>/gi, "**");
  s = s.replace(/<a\b[^>]*?href="([^"]+)"[^>]*>(.*?)<\/a>/gis, (_, href, text) =>
    href.startsWith("http") ? `${text} (${href})` : text,
  );
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  s = s.replace(/\*\*\s*\*\*/g, ""); // empty bold pairs
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

function extFromUrl(url: string): string {
  const m = url.match(/\.(png|jpe?g|webp|gif)(?:\?|$)/i);
  return m ? `.${m[1].toLowerCase()}` : ".png";
}

// ── Main ───────────────────────────────────────────────────────────────

interface GamefoundUpdate {
  sequenceNumber: number;
  title: string;
  abstract: string | null;
  content: string;
  imageUrl: string | null;
  publishedAt: string;
  likesCount: number;
  nextUpdateUrl: string | null;
  projectUpdateID: number;
}

async function main() {
  await mkdir(join(outDir, "images"), { recursive: true });

  const updates: GamefoundUpdate[] = [];
  let projectMeta: Record<string, unknown> | null = null;
  let pageUrl: string | null = `${base}/updates/1`;

  while (pageUrl) {
    process.stderr.write(`fetching ${pageUrl}\n`);
    const html = await fetchText(pageUrl);

    if (projectMeta === null) {
      try {
        const state = extractJsonAfter(html, "window.__INITIAL_STATE__ =") as {
          analyticsConfig?: { project?: Record<string, unknown> };
          projectContext?: { project?: { shortDescription?: string } };
        };
        projectMeta = {
          ...(state.analyticsConfig?.project ?? {}),
          shortDescription: state.projectContext?.project?.shortDescription ?? null,
        };
      } catch {
        projectMeta = {};
      }
    }

    const props = extractJsonAfter(
      html,
      "App.Components.Projects.ProjectUpdateContent, ",
    ) as { props?: { update?: GamefoundUpdate } };
    const update = props.props?.update;
    if (!update) throw new Error(`no update payload on ${pageUrl}`);
    updates.push(update);

    pageUrl = update.nextUpdateUrl ? `${ORIGIN}${update.nextUpdateUrl}` : null;
    if (pageUrl) await sleep(500);
  }

  // Download every image and build the digest.
  const sections: string[] = [];
  let imageCount = 0;
  for (const u of updates) {
    const images: { local: string; url: string }[] = [];
    const register = (url: string, name: string): string => {
      const local = join("images", name);
      images.push({ local, url });
      return local;
    };

    let headerRef: string | null = null;
    if (u.imageUrl) {
      headerRef = register(u.imageUrl, `u${u.sequenceNumber}-header${extFromUrl(u.imageUrl)}`);
    }
    let inlineIdx = 0;
    const text = htmlToText(u.content ?? "", (src) => {
      inlineIdx += 1;
      const name = `u${u.sequenceNumber}-${String(inlineIdx).padStart(2, "0")}${extFromUrl(src)}`;
      return `[image ${register(src, name)}]`;
    });

    for (const img of images) {
      const target = join(outDir, img.local);
      if (existsSync(target)) continue;
      try {
        await writeFile(target, await fetchBinary(img.url));
        imageCount += 1;
        await sleep(200);
      } catch (err) {
        process.stderr.write(`  image failed: ${img.url} (${String(err)})\n`);
      }
    }

    sections.push(
      [
        `## Update #${u.sequenceNumber} — ${u.title}`,
        `- Published: ${u.publishedAt}`,
        `- URL: ${base}/updates/${u.sequenceNumber}`,
        u.abstract ? `- Abstract: ${u.abstract}` : null,
        headerRef ? `- Header image: ${headerRef}` : null,
        "",
        text,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
    );
  }

  const header = [
    `# ${String(projectMeta?.name ?? projectSlug)} — Gamefound dump`,
    `- Campaign: ${base}`,
    `- Creator: ${String(projectMeta?.creatorName ?? creatorSlug)}`,
    `- Updates page: ${base}/updates`,
    `- Fetched: ${new Date().toISOString()}`,
    `- Updates captured: ${updates.length}`,
    "",
    "Inline `[image images/…]` markers show where each infographic sat in the",
    "post — read the referenced files alongside the text.",
    "",
  ].join("\n");

  await writeFile(join(outDir, "updates.md"), `${header}\n${sections.join("\n\n---\n\n")}\n`);
  await writeFile(join(outDir, "updates.json"), `${JSON.stringify(updates, null, 2)}\n`);
  await writeFile(
    join(outDir, "project.json"),
    `${JSON.stringify({ base, creatorSlug, projectSlug, fetchedAt: new Date().toISOString(), ...projectMeta }, null, 2)}\n`,
  );

  console.log(`\n${updates.length} update(s), ${imageCount} new image(s) → ${outDir}`);
  console.log(`Hand it over with: "new Gamefound dump in ${outDir} — fold it in"`);
}

main().catch((err) => fail(String(err)));
