// BackerKit crowdfunding project dumper — feeds the Purchase Manager's
// code-side workflow.
//
// The `/updates` index of a BackerKit crowdfunding page server-renders EVERY
// update's full rich text inline (the "Read more" clamp is CSS-only), so one
// page fetch captures the whole history. This script converts each update to
// readable markdown with inline image references and downloads every content
// image (images.backerkit.com is NOT behind the wall — plain curl works).
//
// Usage:
//   npx tsx scripts/backerkit-dump.ts <project-or-updates URL> [--out <dir>]
//   npx tsx scripts/backerkit-dump.ts <URL> --from-html <saved-page.html>
//
// Output (default ./backerkit-dumps/<slug>/ — git-ignored):
//   project.json  — slug/creator/fetch metadata
//   updates.json  — raw structured updates (id, title, ~date, content HTML)
//   updates.md    — the digest to hand to Claude (text + [image ...] markers)
//   images/       — u<N>-01.* … for every update (extension sniffed from bytes)
//
// TRANSPORT (measured 2026-09-02): www.backerkit.com sits behind a Cloudflare
// challenge that hard-403s curl. Headless chromium (--dump-dom) passes when
// the IP is "clean" but gets served the challenge page after rapid repeated
// hits — so this script fetches via chromium with long-backoff retries. If
// every attempt lands on "Just a moment…", DON'T keep hammering: grab the page
// with a real browser instead (Claude's Playwright MCP session gets through,
// or Ctrl+S in any logged-in browser) and re-run with --from-html <file>.
//
// CAVEATS: update dates only appear as relative text ("4 days ago"), so
// occurredOn dates in the digest are approximations — refine them from the
// posts' own wording. A campaign with very many updates may lazy-load the
// index; if the newest updates.md looks short, save a fully-scrolled page and
// use --from-html. Pledge details are auth-gated — paste those by hand.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ORIGIN = "https://www.backerkit.com";
const CHROMIUM = process.env.CHROMIUM_BIN ?? "/usr/bin/chromium";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

// ── CLI ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function takeFlag(name: string): string | undefined {
  const at = args.indexOf(name);
  if (at === -1) return undefined;
  const [, value] = args.splice(at, 2);
  return value;
}
const outDirArg = takeFlag("--out");
const fromHtml = takeFlag("--from-html");
const urlArg = args[0];
if (!urlArg) {
  fail(
    "usage: npx tsx scripts/backerkit-dump.ts <backerkit project URL> [--out <dir>] [--from-html <file>]",
  );
}

const projectMatch = urlArg.match(/backerkit\.com\/c\/projects\/([^/]+)\/([^/?#]+)/);
if (!projectMatch) fail(`not a BackerKit crowdfunding project URL: ${urlArg}`);
const [, creatorSlug, projectSlug] = projectMatch;
const base = `${ORIGIN}/c/projects/${creatorSlug}/${projectSlug}`;
const outDir = outDirArg ?? join("backerkit-dumps", projectSlug);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Transports ─────────────────────────────────────────────────────────

function chromiumOnce(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      CHROMIUM,
      ["--headless=new", "--disable-gpu", "--no-sandbox", `--user-agent=${UA}`, "--dump-dom", url],
      { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 120_000 },
      (err, stdout) => {
        if (err) reject(new Error(`chromium GET ${url} failed: ${err.message}`));
        else resolve(stdout);
      },
    );
  });
}

const looksChallenged = (html: string): boolean =>
  html.includes("<title>Just a moment") || !html.includes("community-object-title");

const BACKOFFS_MS = [5_000, 15_000, 30_000, 60_000];

async function fetchIndex(url: string): Promise<string> {
  for (let attempt = 0; attempt <= BACKOFFS_MS.length; attempt++) {
    const html = await chromiumOnce(url);
    if (!looksChallenged(html)) return html;
    if (attempt < BACKOFFS_MS.length) {
      process.stderr.write(
        `  Cloudflare challenge — retry ${attempt + 1}/${BACKOFFS_MS.length} in ${BACKOFFS_MS[attempt] / 1000}s\n`,
      );
      await sleep(BACKOFFS_MS[attempt]);
    }
  }
  fail(
    "every attempt hit the Cloudflare challenge. Save the updates page from a real browser " +
      "(Claude's Playwright MCP gets through, or Ctrl+S when logged in) and re-run with " +
      "--from-html <file>.",
  );
}

function curlBinary(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      ["-sS", "--fail", "--location", "--max-time", "60", "-H", `User-Agent: ${UA}`, url],
      { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(`GET ${url} failed: ${stderr.toString().trim() || err.message}`));
        else resolve(stdout);
      },
    );
  });
}

// ── Entity decoding + HTML → markdown-ish text ─────────────────────────

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

function htmlToText(html: string, imageRef: (src: string) => string): string {
  let s = html;
  s = s.replace(/<img\b[^>]*?src="([^"]+)"[^>]*>/gi, (_, src) => `\n${imageRef(src)}\n`);
  s = s.replace(/<h[1-6]\b[^>]*>/gi, "\n### ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(div|p|h[1-6]|li|tr|figure|figcaption|blockquote)>/gi, "\n");
  s = s.replace(/<li\b[^>]*>/gi, "- ");
  s = s.replace(/<(b|strong)\b[^>]*>/gi, "**").replace(/<\/(b|strong)>/gi, "**");
  s = s.replace(/<(i|em)\b[^>]*>/gi, "*").replace(/<\/(i|em)>/gi, "*");
  s = s.replace(/<a\b[^>]*?href="([^"]+)"[^>]*>(.*?)<\/a>/gis, (_, href, text) =>
    href.startsWith("http") ? `${text} (${decodeEntities(href)})` : text,
  );
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  s = s.replace(/\*\*\s*\*\*/g, "").replace(/\*\s*\*/g, "");
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

/** BackerKit blob URLs carry no extension — sniff the magic bytes instead. */
function extFromBytes(buf: Buffer): string {
  if (buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return ".jpg";
  if (buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return ".png";
  if (buf.subarray(0, 3).toString("ascii") === "GIF") return ".gif";
  if (buf.subarray(8, 12).toString("ascii") === "WEBP") return ".webp";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") return ".avif";
  return ".png";
}

/**
 * The image CDN is imgix: with `auto=compress,format` it serves AVIF, which
 * image tooling here can't read. Force JPEG via `fm=jpg` instead.
 */
function forceJpegUrl(url: string): string {
  const noAuto = url.replace(/([?&])auto=[^&]*&?/g, "$1").replace(/[?&]$/, "");
  return `${noAuto}${noAuto.includes("?") ? "&" : "?"}fm=jpg`;
}

// ── Index parsing ──────────────────────────────────────────────────────

interface BackerkitUpdate {
  number: number; // 1 = oldest captured
  updateId: string;
  title: string;
  relativeDate: string | null; // e.g. "4 days ago" — as rendered at fetch time
  approxDate: string | null; // YYYY-MM-DD derived from relativeDate; APPROXIMATE
  url: string;
  contentHtml: string;
}

function approxDateFrom(relative: string, now: Date): string | null {
  const m = relative.match(/(?:about |over |almost )?(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unitDays: Record<string, number> = {
    minute: 0,
    hour: 0,
    day: 1,
    week: 7,
    month: 30,
    year: 365,
  };
  const days = n * unitDays[m[2].toLowerCase()];
  const d = new Date(now.getTime() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Extract the inner HTML of the `trix-content` div starting at `from`, by div-depth. */
function extractTrixContent(html: string, from: number): string | null {
  const open = html.indexOf('<div class="trix-content">', from);
  if (open === -1) return null;
  const start = html.indexOf(">", open) + 1;
  const tag = /<\/?div\b/gi;
  tag.lastIndex = start;
  let depth = 1;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    depth += m[0] === "</div" ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  return null;
}

function parseIndex(html: string, now: Date): BackerkitUpdate[] {
  const anchor = new RegExp(
    `<a[^>]*class="community-object-title"[^>]*href="([^"]*/updates/(\\d+))"[^>]*>\\s*<p[^>]*>\\s*([\\s\\S]*?)\\s*</p>`,
    "g",
  );
  const found: { updateId: string; title: string; pos: number; url: string }[] = [];
  for (let m = anchor.exec(html); m; m = anchor.exec(html)) {
    if (found.some((f) => f.updateId === m?.[2])) continue; // index may link each update twice
    found.push({
      updateId: m[2],
      title: decodeEntities(m[3].replace(/<[^>]+>/g, "").trim()),
      pos: m.index,
      url: m[1].startsWith("http") ? m[1] : `${ORIGIN}${m[1]}`,
    });
  }
  // Document order is newest-first → reverse into oldest-first.
  found.reverse();
  return found.map((f, i): BackerkitUpdate => {
    const headerSeg = html.slice(Math.max(0, f.pos - 5000), f.pos);
    const agoMatches = [...headerSeg.matchAll(/>([^<>]*\bago\b[^<>]*)</g)];
    const relativeDate = agoMatches.at(-1)?.[1].trim() ?? null;
    const contentAt = html.indexOf(`id="project-update-${f.updateId}"`, f.pos);
    const contentHtml = contentAt === -1 ? null : extractTrixContent(html, contentAt);
    return {
      number: i + 1,
      updateId: f.updateId,
      title: f.title,
      relativeDate,
      approxDate: relativeDate ? approxDateFrom(relativeDate, now) : null,
      url: f.url,
      contentHtml: contentHtml ?? "",
    };
  });
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  await mkdir(join(outDir, "images"), { recursive: true });
  const now = new Date();

  let html: string;
  if (fromHtml) {
    html = await readFile(fromHtml, "utf8");
    if (looksChallenged(html)) fail(`${fromHtml} looks like the Cloudflare challenge page`);
  } else {
    const indexUrl = `${base}/updates`;
    process.stderr.write(`fetching ${indexUrl} via headless chromium\n`);
    html = await fetchIndex(indexUrl);
  }

  const updates = parseIndex(html, now);
  if (updates.length === 0) fail("no updates found — wrong URL, or the page markup changed");

  const sections: string[] = [];
  let imageCount = 0;
  for (const u of updates) {
    const pending: { name: string; url: string }[] = [];
    let inlineIdx = 0;
    const text = htmlToText(u.contentHtml, (src) => {
      inlineIdx += 1;
      const name = `u${u.number}-${String(inlineIdx).padStart(2, "0")}`;
      pending.push({ name, url: forceJpegUrl(decodeEntities(src)) });
      return `[image images/${name}.*]`;
    });

    let sectionText = text;
    for (const img of pending) {
      try {
        const bytes = await curlBinary(img.url);
        const local = join("images", `${img.name}${extFromBytes(bytes)}`);
        const target = join(outDir, local);
        if (!existsSync(target)) {
          await writeFile(target, bytes);
          imageCount += 1;
          await sleep(200);
        }
        sectionText = sectionText.replace(`[image images/${img.name}.*]`, `[image ${local}]`);
      } catch (err) {
        process.stderr.write(`  image failed: ${img.url} (${String(err)})\n`);
      }
    }

    sections.push(
      [
        `## Post ${u.number}/${updates.length} — ${u.title}`,
        `- Published: ~${u.approxDate ?? "unknown"} ("${u.relativeDate ?? "?"}" at fetch time — approximate, refine from the text)`,
        `- URL: ${u.url}`,
        "",
        sectionText || "*(empty content — parse miss? check updates.json)*",
      ].join("\n"),
    );
  }

  const header = [
    `# ${projectSlug} — BackerKit dump`,
    `- Campaign: ${base}`,
    `- Creator: ${creatorSlug}`,
    `- Fetched: ${now.toISOString()}${fromHtml ? ` (parsed from ${fromHtml})` : ""}`,
    `- Updates captured: ${updates.length}`,
    "",
    "Update dates are approximated from relative timestamps — cross-check each",
    "post's own wording. Inline `[image images/…]` markers show where each",
    "infographic sat in the post — read the referenced files alongside the text.",
    "",
  ].join("\n");

  await writeFile(join(outDir, "updates.md"), `${header}\n${sections.join("\n\n---\n\n")}\n`);
  await writeFile(join(outDir, "updates.json"), `${JSON.stringify(updates, null, 2)}\n`);
  await writeFile(
    join(outDir, "project.json"),
    `${JSON.stringify(
      {
        base,
        creatorSlug,
        projectSlug,
        fetchedAt: now.toISOString(),
        updatesCaptured: updates.length,
        source: fromHtml ? "from-html" : "chromium",
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\n${updates.length} update(s), ${imageCount} new image(s) → ${outDir}`);
  console.log(`Hand it over with: "new BackerKit dump in ${outDir} — fold it in"`);
}

main().catch((err) => fail(String(err)));
