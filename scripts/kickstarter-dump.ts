// Kickstarter project dumper — feeds the Purchase Manager's code-side workflow.
//
// Grabs a campaign's update posts from its public Atom feed, converts the
// rich text to readable markdown with inline image references, and downloads
// every image (the infographics carry half the information).
//
// Usage:
//   npx tsx scripts/kickstarter-dump.ts <project URL> [--out <dir>]
//
// Output (default ./kickstarter-dumps/<slug>/ — git-ignored):
//   project.json  — what little metadata the feed exposes
//   updates.json  — raw structured posts as the feed serves them
//   updates.md    — the digest to hand to Claude (text + [image ...] markers)
//   images/       — u<N>-01.* … for every post
//
// HARD LIMIT (measured 2026-09-02): Kickstarter's Cloudflare wall 403s curl
// AND headless chromium on the project page, individual post pages, posts.json
// and the GraphQL endpoint — consistently, not a retry lottery. The ONLY
// reachable source is `/posts.atom`, which serves the 10 MOST RECENT posts
// with full HTML. Campaigns with >10 updates: older posts cannot be scraped —
// paste those by hand. (Backer-only posts arrive empty and are flagged.)
//
// Pledge details ("Manage your pledge") are auth-gated and not scraped —
// paste those once by hand. After a run, just tell Claude:
// "new Kickstarter dump in kickstarter-dumps/<slug> — fold it in".

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const ORIGIN = "https://www.kickstarter.com";
// The feed serves at most this many posts; hitting it exactly means older
// updates are missing AND our 1..N numbering no longer matches Kickstarter's.
const FEED_CAP = 10;

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
  fail("usage: npx tsx scripts/kickstarter-dump.ts <kickstarter project URL> [--out <dir>]");
}

const projectMatch = urlArg.match(/kickstarter\.com\/projects\/([^/]+)\/([^/?#]+)/);
if (!projectMatch) fail(`not a Kickstarter project URL: ${urlArg}`);
const [, creatorSlug, projectSlug] = projectMatch;
const base = `${ORIGIN}/projects/${creatorSlug}/${projectSlug}`;
const outDir = outDirArg ?? join("kickstarter-dumps", projectSlug);

// ── Fetch helpers ──────────────────────────────────────────────────────

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

function curlOnce(url: string): Promise<Buffer> {
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

const MAX_ATTEMPTS = 4;

async function curl(url: string): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await curlOnce(url);
    } catch (err) {
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Entity decoding ────────────────────────────────────────────────────

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

/** One level of XML unescaping — the atom feed HTML-escapes each post's HTML. */
function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// ── HTML → markdown-ish text ───────────────────────────────────────────

/**
 * Flatten post HTML into readable markdown. `imageRef` maps an image URL to
 * the local file marker rendered in its place, so infographics keep their
 * position in the flow.
 */
function htmlToText(html: string, imageRef: (src: string) => string): string {
  let s = html;
  s = s.replace(/<img\b[^>]*?src="([^"]+)"[^>]*>/gi, (_, src) => `\n${imageRef(src)}\n`);
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(div|p|h[1-6]|li|tr|figure|figcaption)>/gi, "\n");
  s = s.replace(/<li\b[^>]*>/gi, "- ");
  s = s.replace(/<(b|strong)\b[^>]*>/gi, "**").replace(/<\/(b|strong)>/gi, "**");
  s = s.replace(/<a\b[^>]*?href="([^"]+)"[^>]*>(.*?)<\/a>/gis, (_, href, text) =>
    href.startsWith("http") ? `${text} (${decodeEntities(href)})` : text,
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
  return m ? `.${m[1].toLowerCase().replace("jpeg", "jpg")}` : ".png";
}

// ── Atom parsing ───────────────────────────────────────────────────────

interface KickstarterPost {
  number: number; // 1 = oldest captured; only Kickstarter's true "Update #N" when the feed wasn't capped
  postId: string;
  title: string;
  publishedAt: string;
  updatedAt: string | null;
  url: string;
  contentHtml: string;
}

function tag(entry: string, name: string): string | null {
  const m = entry.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : null;
}

function parseFeed(xml: string): { feedTitle: string | null; posts: KickstarterPost[] } {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  // Newest-first in the feed → oldest-first here, numbered 1..N.
  entries.reverse();
  const posts = entries.map((entry, i): KickstarterPost => {
    const postId = entry.match(/FreeformPost\/(\d+)/)?.[1] ?? `unknown-${i + 1}`;
    return {
      number: i + 1,
      postId,
      title: xmlUnescape(tag(entry, "title") ?? "(untitled)").trim(),
      publishedAt: tag(entry, "published") ?? "",
      updatedAt: tag(entry, "updated"),
      url: entry.match(/href="([^"]+)"/)?.[1] ?? `${base}/posts/${postId}`,
      contentHtml: xmlUnescape(tag(entry, "content") ?? ""),
    };
  });
  const feedTitle = tag(xml.split("<entry>")[0], "title");
  return {
    feedTitle: feedTitle ? xmlUnescape(feedTitle).replace(/^Kickstarter:\s*/, "").trim() : null,
    posts,
  };
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  await mkdir(join(outDir, "images"), { recursive: true });

  const feedUrl = `${base}/posts.atom`;
  process.stderr.write(`fetching ${feedUrl}\n`);
  const { feedTitle, posts } = parseFeed((await curl(feedUrl)).toString("utf8"));
  if (posts.length === 0) fail(`no posts in ${feedUrl} — wrong URL, or a not-yet-launched project`);
  const capped = posts.length >= FEED_CAP;

  const sections: string[] = [];
  let imageCount = 0;
  for (const p of posts) {
    const images: { local: string; url: string }[] = [];
    let inlineIdx = 0;
    const text = htmlToText(p.contentHtml, (src) => {
      inlineIdx += 1;
      const url = decodeEntities(src);
      const local = join("images", `u${p.number}-${String(inlineIdx).padStart(2, "0")}${extFromUrl(url)}`);
      images.push({ local, url });
      return `[image ${local}]`;
    });

    for (const img of images) {
      const target = join(outDir, img.local);
      if (existsSync(target)) continue;
      try {
        await writeFile(target, await curl(img.url));
        imageCount += 1;
        await sleep(200);
      } catch (err) {
        process.stderr.write(`  image failed: ${img.url} (${String(err)})\n`);
      }
    }

    sections.push(
      [
        `## Post ${p.number}/${posts.length} — ${p.title}`,
        `- Published: ${p.publishedAt}`,
        `- URL: ${p.url}`,
        "",
        text || "*(empty content — likely a backers-only post; paste it by hand)*",
      ].join("\n"),
    );
  }

  const header = [
    `# ${feedTitle ?? projectSlug} — Kickstarter dump`,
    `- Campaign: ${base}`,
    `- Creator: ${creatorSlug}`,
    `- Fetched: ${new Date().toISOString()}`,
    `- Posts captured: ${posts.length}`,
    ...(capped
      ? [
          "",
          `**WARNING: Kickstarter's atom feed serves only the ${FEED_CAP} most recent posts,`,
          "and this dump hit that cap — OLDER UPDATES ARE MISSING and the post numbers",
          "here are relative to the capture, not Kickstarter's own Update #. Ask the",
          "owner to paste anything older by hand.**",
        ]
      : []),
    "",
    "Inline `[image images/…]` markers show where each infographic sat in the",
    "post — read the referenced files alongside the text.",
    "",
  ].join("\n");

  await writeFile(join(outDir, "updates.md"), `${header}\n${sections.join("\n\n---\n\n")}\n`);
  await writeFile(join(outDir, "updates.json"), `${JSON.stringify(posts, null, 2)}\n`);
  await writeFile(
    join(outDir, "project.json"),
    `${JSON.stringify(
      {
        base,
        creatorSlug,
        projectSlug,
        name: feedTitle,
        fetchedAt: new Date().toISOString(),
        postsCaptured: posts.length,
        feedCapped: capped,
      },
      null,
      2,
    )}\n`,
  );

  if (capped) {
    process.stderr.write(
      `\nWARNING: hit the ${FEED_CAP}-post feed cap — older updates are missing (see updates.md header).\n`,
    );
  }
  console.log(`\n${posts.length} post(s), ${imageCount} new image(s) → ${outDir}`);
  console.log(`Hand it over with: "new Kickstarter dump in ${outDir} — fold it in"`);
}

main().catch((err) => fail(String(err)));
