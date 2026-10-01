import {
  type ActivityEntry,
  type ActivityType,
  type GreetingKind,
  greetingKindOfVia,
  isActivityType,
  parseActivityMeta,
} from "@boardgames/core/protocol";
import { parseUtcStamp } from "../../../lib/date-format";
import type { DescribeContext } from "./describe-context";
import { EVENT_LABELS, type LineFold } from "./event-labels";
import { aboutFromShownDetail, greetingKindOfShownPage } from "./greeting-labels";
import { pageDestination } from "./page-labels";
import type { Tone } from "./tones";

// The activity trail as an admin reads it: rows in, lines out.
//
// Rows are facts as logged; a line is one thing the member did. Several rows
// can be one action, so the pipeline folds them — explicitly where the row
// says so, by neighbourhood only for rows logged before it could:
//
//   1. drop legacy phantoms — `profile-view` rows the profile GET logged for
//      a data fetch (a spotlight's accent colour, a profile sub-page), no
//      longer written since 2026-09-28;
//   2. fold the page a greeting's button opened into the "Followed …" line —
//      by its `via` (current rows) or by adjacency (legacy rows);
//   3. fold "Saw the spotlight" into the answer that closed it ("Dismissed
//      the group spotlight about Melanie" says both);
//   4. describe what's left (event-labels.ts);
//   5. fold runs of identical lines into one line with a count.
//
// Works oldest-first internally ("what happened next" is the natural question
// for every fold); returns newest-first like the API.

export interface TrailLine {
  /** Stable React key: the newest row id in the line. */
  key: number;
  /** Every row this line stands for, newest first. */
  ids: number[];
  /** When the newest of those rows happened, epoch ms. */
  at: number;
  text: string;
  tone: Tone;
  /** How many times the line happened in a row (the "×N"); 1 for a single line. */
  count: number;
  /** When each of those times happened, newest first (one entry per count). */
  times: number[];
}

interface Item {
  entry: ActivityEntry;
  at: number;
  /** Rows folded into this one (their ids ride along into the line). */
  folded: number[];
  fold: LineFold;
}

/** A trail row's time: the server's event stamp, else its insert second. */
export function entryTime(entry: ActivityEntry): number {
  if (entry.occurredAtMs !== undefined) return entry.occurredAtMs;
  return parseUtcStamp(entry.createdAt)?.getTime() ?? 0;
}

const PHANTOM_WINDOW_MS = 60 * 1000;
const CTA_WINDOW_MS = 60 * 1000;
/** How far after a CTA its `via` page view may land (other rows can interleave). */
const VIA_LOOKAHEAD = 5;
/** A card left on screen this long before it was answered is still one look. */
const ANSWER_WINDOW_MS = 30 * 60 * 1000;
/** Identical lines closer than this are one event reported twice, not a repeat. */
const DUPLICATE_WINDOW_MS = 10 * 1000;

/** Pages a greeting's button opened, before rows carried a `via`. */
const LEGACY_CTA_PAGES: Readonly<Record<GreetingKind, readonly string[]>> = {
  "purchase-vote-announce": ["purchase-vote"],
  "purchase-vote-reminder": ["purchase-vote"],
  arrival: ["profile-collection", "games"],
  spotlight: ["profile-skill"],
  "skill-intro": ["profile-skill"],
  "night-invite": ["calendar", "night"],
};

/** Profile pages whose own data fetch used to log a `profile-view` phantom. */
const PROFILE_PAGES: ReadonlySet<string> = new Set([
  "profile",
  "profile-matches",
  "profile-collection",
  "profile-purchases",
  "profile-nights",
  "profile-skill",
]);

function pageView(item: Item | undefined) {
  return item?.entry.type === "page-view" ? parseActivityMeta("page-view", item.entry.meta) : null;
}

function greetingResponse(item: Item | undefined) {
  return item?.entry.type === "greeting-response"
    ? parseActivityMeta("greeting-response", item.entry.meta)
    : null;
}

function near(a: Item, b: Item | undefined, windowMs: number): b is Item {
  return b !== undefined && Math.abs(a.at - b.at) <= windowMs;
}

/** Step 1 — legacy `profile-view` rows that were data fetches, not visits. */
function dropProfilePhantoms(items: Item[]): Item[] {
  const drop = new Set<Item>();
  items.forEach((item, i) => {
    if (item.entry.type !== "profile-view") return;
    const { targetUserId } = parseActivityMeta("profile-view", item.entry.meta);
    const neighbours = [items[i - 1], items[i + 1]].filter(
      (n): n is Item => near(item, n, PHANTOM_WINDOW_MS) && !drop.has(n),
    );
    // The page the member was actually on fetched its owner's profile.
    const onPage = neighbours.some((n) => {
      const view = pageView(n);
      return (
        view?.page !== undefined && PROFILE_PAGES.has(view.page) && view.detail === targetUserId
      );
    });
    // A spotlight card fetched its subject's profile for the accent colour —
    // which also tells us, for these legacy rows, who the spotlight was about.
    const spotlight = neighbours.filter(
      (n) => pageView(n)?.page === "skill-spotlight" || greetingResponse(n)?.kind === "spotlight",
    );
    if (!onPage && spotlight.length === 0) return;
    drop.add(item);
    for (const n of spotlight) n.fold.subjectUserId ??= targetUserId;
  });
  return items.filter((item) => !drop.has(item));
}

/** Step 2 — the page a greeting's button opened becomes the line's destination. */
function foldCtaDestinations(items: Item[], ctx: DescribeContext): Item[] {
  const drop = new Set<Item>();
  items.forEach((item, i) => {
    const response = greetingResponse(item);
    if (response?.action !== "cta" || response.kind === undefined) return;
    const kind = response.kind;
    const take = (target: Item) => {
      const view = pageView(target);
      drop.add(target);
      item.folded.push(target.entry.id);
      item.fold.destination = pageDestination(view?.page, view?.detail, ctx);
    };
    // Current rows: the page view names the greeting that opened it.
    for (let j = i + 1; j <= i + VIA_LOOKAHEAD && j < items.length; j++) {
      const candidate = items[j];
      if (!near(item, candidate, CTA_WINDOW_MS)) break;
      if (!drop.has(candidate) && greetingKindOfVia(pageView(candidate)?.via) === kind) {
        take(candidate);
        return;
      }
    }
    // Legacy rows: the destination's page view sits right next to the ack, on
    // either side (before the client serialised its requests it could race ahead).
    for (const candidate of [items[i + 1], items[i - 1]]) {
      const view = pageView(candidate);
      if (
        near(item, candidate, CTA_WINDOW_MS) &&
        !drop.has(candidate) &&
        view?.via === undefined &&
        view?.page !== undefined &&
        LEGACY_CTA_PAGES[kind].includes(view.page)
      ) {
        take(candidate);
        return;
      }
    }
  });
  return items.filter((item) => !drop.has(item));
}

/** Step 3 — a card being shown folds into the answer that closed it. */
function foldShownIntoAnswer(items: Item[]): Item[] {
  const drop = new Set<Item>();
  items.forEach((item, i) => {
    const view = pageView(item);
    const kind = greetingKindOfShownPage(view?.page);
    if (!kind) return;
    const next = items[i + 1];
    if (!near(item, next, ANSWER_WINDOW_MS) || greetingResponse(next)?.kind !== kind) return;
    drop.add(item);
    next.folded.push(item.entry.id, ...item.folded);
    const about = aboutFromShownDetail(kind, view?.detail);
    next.fold.subjectUserId ??= about.subjectUserId ?? item.fold.subjectUserId;
  });
  return items.filter((item) => !drop.has(item));
}

function describeKnown<K extends ActivityType>(
  type: K,
  item: Item,
  ctx: DescribeContext,
): { text: string; tone: Tone } {
  const label = EVENT_LABELS[type];
  return {
    text: label.describe(parseActivityMeta(type, item.entry.meta), ctx, item.fold),
    tone: label.tone,
  };
}

/** Step 4 — words and a tone for one (possibly folded) row. */
function describeItem(item: Item, ctx: DescribeContext): { text: string; tone: Tone } {
  const { type } = item.entry;
  if (isActivityType(type)) return describeKnown(type, item, ctx);
  // A type this build doesn't know yet (a newer server): say so, readably.
  return { text: `${type.replace(/-/g, " ")} (unrecognised activity)`, tone: "unknown" };
}

/** Step 5 — identical consecutive lines become one, with a count. */
function foldRepeats(lines: TrailLine[]): TrailLine[] {
  const out: TrailLine[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (prev && prev.text === line.text && prev.tone === line.tone) {
      const duplicate = line.at - prev.at < DUPLICATE_WINDOW_MS;
      out[out.length - 1] = {
        ...line,
        ids: [...line.ids, ...prev.ids],
        count: prev.count + (duplicate ? 0 : line.count),
        // A duplicate report is the same look: it keeps the earlier time.
        times: duplicate ? prev.times : [...line.times, ...prev.times],
      };
    } else {
      out.push(line);
    }
  }
  return out;
}

/**
 * The lines to show for a trail. `entries` are newest-first (as the API
 * returns them, across however many pages are loaded); so is the result.
 */
export function buildTrail(entries: readonly ActivityEntry[], ctx: DescribeContext): TrailLine[] {
  let items: Item[] = [...entries]
    .reverse()
    .map((entry) => ({ entry, at: entryTime(entry), folded: [], fold: {} }));
  items = dropProfilePhantoms(items);
  items = foldCtaDestinations(items, ctx);
  items = foldShownIntoAnswer(items);
  const lines = items.map((item): TrailLine => {
    const { text, tone } = describeItem(item, ctx);
    return {
      key: item.entry.id,
      ids: [item.entry.id, ...item.folded].sort((a, b) => b - a),
      at: item.at,
      text,
      tone,
      count: 1,
      times: [item.at],
    };
  });
  return foldRepeats(lines).reverse();
}
