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
import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
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

// Gamefound's WAF 403s Node's fetch consistently, and even with curl +
// browser headers it 403'd roughly a third of requests AT RANDOM (measured
// 2026-09-02: 4/12 rapid hits failed, independent of headers or URL). So:
// curl transport, and every request retries through the 403 lottery with
// backoff + jitter.
//
// Since 2026-10-11 Gamefound sits behind a Cloudflare "Just a moment…"
// challenge that curl can never pass. When a request comes back as that
// challenge, the run switches to a headless Chromium (playwright-core,
// driving the browser `npx playwright install` puts in ~/.cache/ms-playwright,
// or CHROME_PATH) that clears it once and fetches everything else.
const CURL_ARGS = [
  "-sS",
  "--location",
  "--max-time",
  "60",
  "-H",
  `User-Agent: ${UA}`,
  "-H",
  "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "-H",
  "Accept-Language: en-US,en;q=0.9",
  "--write-out",
  "\n%{http_code}",
];

class CloudflareChallenge extends Error {}

function curlOnce(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      [...CURL_ARGS, url],
      { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`GET ${url} failed: ${stderr.toString().trim() || err.message}`));
          return;
        }
        // --write-out appends "\n<status>"; split it back off the body.
        const cut = stdout.lastIndexOf(0x0a);
        const status = Number(stdout.subarray(cut + 1).toString());
        const body = stdout.subarray(0, cut);
        if (status >= 200 && status < 300) resolve(body);
        else if (status === 403 && /cf-chl|Just a moment/.test(body.toString("latin1")))
          reject(new CloudflareChallenge(`GET ${url}: Cloudflare challenge`));
        else reject(new Error(`GET ${url} failed: HTTP ${status}`));
      },
    );
  });
}

const MAX_ATTEMPTS = 6;

async function curl(url: string): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await curlOnce(url);
    } catch (err) {
      if (err instanceof CloudflareChallenge) throw err;
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        const backoff = 1000 * 2 ** (attempt - 1) + Math.random() * 500;
        process.stderr.write(`  retry ${attempt}/${MAX_ATTEMPTS - 1} in ${Math.round(backoff)}ms\n`);
        await sleep(backoff);
      }
    }
  }
  throw lastError;
}

// ── Browser fallback ──

type BrowserPage = import("playwright-core").Page;
let browser: import("playwright-core").Browser | null = null;
let page: BrowserPage | null = null;

function chromePath(): string | undefined {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(cache)) return undefined;
  const newest = readdirSync(cache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))[0];
  const exe = newest && join(cache, newest, "chrome-linux64", "chrome");
  return exe && existsSync(exe) ? exe : undefined;
}

async function browserPage(): Promise<BrowserPage> {
  if (page) return page;
  process.stderr.write("  Cloudflare challenge — switching to headless Chromium\n");
  const { chromium } = await import("playwright-core");
  const executablePath = chromePath();
  if (!executablePath) fail("no Chromium found — run `npx playwright install chromium` or set CHROME_PATH");
  browser = await chromium.launch({ executablePath, args: ["--headless=new"] });
  page = await browser.newPage({ userAgent: UA });
  return page;
}

/** Load `url` in the browser, waiting out the challenge; null if it never clears. */
async function browserGoto(url: string): Promise<import("playwright-core").Response | null> {
  const p = await browserPage();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const first = await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (first && first.status() < 400) return first;
    // The challenge page reloads itself into the real one once it clears.
    const real = await p
      .waitForResponse((r) => r.url() === url && r.status() < 400, { timeout: 30_000 })
      .catch(() => null);
    if (real) {
      await p.waitForLoadState("domcontentloaded");
      return real;
    }
    process.stderr.write(`  browser retry ${attempt}/3 for ${url}\n`);
  }
  return null;
}

let useBrowser = false;

async function fetchVia(url: string, kind: "text" | "binary"): Promise<Buffer> {
  if (!useBrowser) {
    try {
      return await curl(url);
    } catch (err) {
      if (!(err instanceof CloudflareChallenge)) throw err;
      useBrowser = true;
    }
  }
  const res = await browserGoto(url);
  if (!res) throw new Error(`GET ${url} failed: Cloudflare challenge never cleared`);
  // A page's embedded JSON is read from the rendered document; an image's
  // bytes from the response itself.
  return kind === "text" ? Buffer.from(await (await browserPage()).content()) : res.body();
}

async function fetchText(url: string): Promise<string> {
  return (await fetchVia(url, "text")).toString("utf8");
}

async function fetchBinary(url: string): Promise<Buffer> {
  // Images live on a CDN outside the challenge; try curl even mid-browser-run.
  try {
    return await curl(url);
  } catch {
    return fetchVia(url, "binary");
  }
}

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

main()
  .then(() => browser?.close())
  .catch((err) => fail(String(err)));
