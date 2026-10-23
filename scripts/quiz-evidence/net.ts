// The crawler's network side: one polite fetch (IPv4, honest user agent,
// per-host spacing, Retry-After back-off, timeouts, a size cap), the page →
// text step (Wikipedia through its plain-text extract API, other pages through
// extractText), and the Wayback Machine (Save Page Now, falling back to the
// closest existing capture).

import dns from "node:dns";
import net from "node:net";
import {
  extractText,
  parseRetryAfter,
  parseWikipediaUrl,
  wikipediaExtractUrl,
  wikipediaPageUrl,
} from "./lib.ts";

// IPv4 first: this network's IPv6 route is unreliable, and an honest
// crawler should fail fast rather than hang on a dead family.
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily(false);

export const USER_AGENT =
  "BoardGamesQuizEvidence/1.0 (private quiz trainer; contact quiz-content-check@users.noreply.local)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Spaces requests per key (a host, or a lane like SPN): each waits for the previous one's slot. */
export class Spacer {
  private next = new Map<string, number>();
  private chain = new Map<string, Promise<void>>();
  constructor(private readonly gapMs: (key: string) => number) {}

  /** Resolves when `key` may send its next request. */
  wait(key: string): Promise<void> {
    const prev = this.chain.get(key) ?? Promise.resolve();
    const mine = prev.then(async () => {
      const at = this.next.get(key) ?? 0;
      const now = Date.now();
      if (at > now) await sleep(at - now);
      this.next.set(key, Math.max(Date.now(), this.next.get(key) ?? 0) + this.gapMs(key));
    });
    this.chain.set(
      key,
      mine.catch(() => {}),
    );
    return mine;
  }

  /** Push `key`'s next slot out (a 429 / 503 told us to wait). */
  penalize(key: string, ms: number): void {
    this.next.set(key, Math.max(this.next.get(key) ?? 0, Date.now() + ms));
  }
}

/** A failure with a short machine reason (`http-404`, `timeout`, `unsupported-type` …). */
export class FetchError extends Error {
  constructor(
    readonly reason: string,
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
  }
}

export interface FetchedText {
  status: number;
  finalUrl: string;
  contentType: string;
  body: string;
}

export interface FetchOptions {
  spacer: Spacer;
  timeoutMs?: number;
  maxBytes?: number;
  retries?: number;
  accept?: string;
  /** The spacer key; the URL's host by default. */
  key?: string;
}

const MAX_BACKOFF_MS = 120_000;

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FetchError("too-large", `body over ${maxBytes} bytes`);
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

function decode(bytes: Uint8Array, contentType: string): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** GET a URL politely; throws FetchError. Retries 429 / 503 (honouring Retry-After) and network errors. */
export async function politeFetch(url: string, opts: FetchOptions): Promise<FetchedText> {
  const retries = opts.retries ?? 3;
  const key = opts.key ?? new URL(url).hostname;
  for (let attempt = 0; ; attempt++) {
    await opts.spacer.wait(key);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Api-User-Agent": USER_AGENT,
          Accept: opts.accept ?? "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
          "Accept-Language": "en,de;q=0.8,*;q=0.5",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      });
    } catch (err) {
      const e = err as { name?: string; cause?: { code?: string }; message?: string };
      const reason =
        e.name === "TimeoutError" || e.name === "AbortError"
          ? "timeout"
          : `network-${(e.cause?.code ?? "error").toLowerCase()}`;
      if (attempt < Math.min(retries, 1)) {
        await sleep(5_000);
        continue;
      }
      throw new FetchError(reason, e.message ?? String(err));
    }
    if ((res.status === 429 || res.status === 503) && attempt < retries) {
      const wait = Math.min(
        MAX_BACKOFF_MS,
        parseRetryAfter(res.headers.get("retry-after")) ?? 5_000 * 2 ** attempt,
      );
      await res.body?.cancel();
      opts.spacer.penalize(key, wait);
      continue;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      await res.body?.cancel();
      throw new FetchError(`http-${res.status}`, `${res.status} ${res.statusText}`, res.status);
    }
    const bytes = await readCapped(res, opts.maxBytes ?? 10_000_000);
    return {
      status: res.status,
      finalUrl: res.url || url,
      contentType,
      body: decode(bytes, contentType),
    };
  }
}

export interface PageText {
  text: string;
  finalUrl: string;
  /** "wikipedia-extract" | "html" | "text". */
  via: string;
}

const MIN_TEXT = 50;

/** A source page's readable text. Wikipedia goes through the extract API; PDFs / images are refused. */
export async function fetchPageText(url: string, spacer: Spacer): Promise<PageText> {
  const wiki = parseWikipediaUrl(url);
  if (wiki) {
    const res = await politeFetch(wikipediaExtractUrl(wiki.lang, wiki.title), {
      spacer,
      accept: "application/json",
    });
    let data: unknown;
    try {
      data = JSON.parse(res.body);
    } catch {
      throw new FetchError("bad-json", "extract API answered with non-JSON");
    }
    const page = (
      data as { query?: { pages?: { title?: string; missing?: boolean; extract?: string }[] } }
    ).query?.pages?.[0];
    if (!page || page.missing) throw new FetchError("wiki-missing", `no page ${wiki.title}`);
    const title = page.title ?? wiki.title;
    const extract = (page.extract ?? "").trim();
    if (extract.length < MIN_TEXT) throw new FetchError("empty-text", "empty extract");
    return {
      text: `${title}\n\n${extract}`.replace(/\n{3,}/g, "\n\n"),
      finalUrl: wikipediaPageUrl(wiki.lang, title),
      via: "wikipedia-extract",
    };
  }
  const res = await politeFetch(url, { spacer });
  const ct = res.contentType.toLowerCase();
  let text: string;
  let via: string;
  if (ct.includes("html") || ct.includes("xml") || (ct === "" && /<html\b/i.test(res.body))) {
    text = extractText(res.body);
    via = "html";
  } else if (ct.startsWith("text/plain")) {
    text = res.body.replace(/\r\n/g, "\n").trim();
    via = "text";
  } else {
    throw new FetchError("unsupported-type", `content type ${ct || "unknown"}`);
  }
  if (text.length < MIN_TEXT) throw new FetchError("empty-text", `${text.length} chars of text`);
  return { text, finalUrl: res.finalUrl, via };
}

// ── Wayback Machine ──────────────────────────────────────────────────────

export const SPN_GAP_MS = 15_000;
const SPN_KEY = "web.archive.org/save";
const WAYBACK_CAPTURE = /^https?:\/\/web\.archive\.org\/web\/\d{14}/;

export interface Archived {
  archiveUrl: string;
  /** "save" (a fresh capture) or "closest" (an existing one). */
  via: "save" | "closest";
}

/**
 * An archive copy of `url`: Save Page Now (anonymous, at most one per
 * SPN_GAP_MS on its own spacer key), else the closest existing capture from
 * the availability API. Throws FetchError when neither gives one.
 */
export async function archivePage(url: string, spacer: Spacer): Promise<Archived> {
  let saveError = "";
  try {
    const res = await politeFetch(`https://web.archive.org/save/${url}`, {
      spacer,
      key: SPN_KEY,
      timeoutMs: 120_000,
      retries: 1,
      maxBytes: 20_000_000,
    });
    const loc = res.finalUrl;
    if (WAYBACK_CAPTURE.test(loc))
      return { archiveUrl: loc.replace(/^http:/, "https:"), via: "save" };
    saveError = `save answered ${res.status} at ${loc}`;
  } catch (err) {
    saveError = err instanceof FetchError ? err.reason : String(err);
  }
  const res = await politeFetch(
    `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
    { spacer, accept: "application/json" },
  );
  let closest: { available?: boolean; url?: string } | undefined;
  try {
    closest = (
      JSON.parse(res.body) as {
        archived_snapshots?: { closest?: { available?: boolean; url?: string } };
      }
    ).archived_snapshots?.closest;
  } catch {
    closest = undefined;
  }
  if (closest?.available && closest.url && WAYBACK_CAPTURE.test(closest.url)) {
    return { archiveUrl: closest.url.replace(/^http:/, "https:"), via: "closest" };
  }
  throw new FetchError("no-archive", `save failed (${saveError}) and no existing capture`);
}

/** Per-host spacing: ~1 request a second everywhere, SPN on its own slower lane. */
export function defaultSpacer(): Spacer {
  return new Spacer((key) => (key === SPN_KEY ? SPN_GAP_MS : 1_000));
}
