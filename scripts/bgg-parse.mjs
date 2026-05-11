// XML → BggGame parser shared by scripts/bgg-sync.mjs.
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
  trimValues: true,
});

function num(v) {
  if (v === undefined || v === "" || v === null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function arr(x) {
  if (x === undefined) return [];
  return Array.isArray(x) ? x : [x];
}

// HTML named entities BGG actually emits (apostrophes, dashes, accented
// Latin used in publisher/designer names, currency, fractions, …). We don't
// pull a full HTML5 table because BGG's surface is small and predictable;
// any future hole is a one-line patch.
const NAMED_ENTITIES = {
  amp: "&", quot: '"', apos: "'", lt: "<", gt: ">",
  nbsp: " ",
  copy: "©", reg: "®", trade: "™",
  mdash: "—", ndash: "–", hellip: "…", bull: "•", middot: "·",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  laquo: "«", raquo: "»", lsaquo: "‹", rsaquo: "›",
  sbquo: "‚", bdquo: "„", prime: "′", Prime: "″",
  zwnj: "‌", zwj: "‍",
  ensp: " ", emsp: " ", thinsp: " ",
  pound: "£", euro: "€", cent: "¢", yen: "¥",
  times: "×", divide: "÷", deg: "°", plusmn: "±",
  sup1: "¹", sup2: "²", sup3: "³", frac12: "½", frac14: "¼", frac34: "¾",
  para: "¶", sect: "§",
  iexcl: "¡", iquest: "¿",
  agrave: "à", aacute: "á", acirc: "â", atilde: "ã", auml: "ä", aring: "å",
  egrave: "è", eacute: "é", ecirc: "ê", euml: "ë",
  igrave: "ì", iacute: "í", icirc: "î", iuml: "ï",
  ograve: "ò", oacute: "ó", ocirc: "ô", otilde: "õ", ouml: "ö", oslash: "ø",
  ugrave: "ù", uacute: "ú", ucirc: "û", uuml: "ü",
  yacute: "ý", yuml: "ÿ",
  ccedil: "ç", ntilde: "ñ", szlig: "ß",
  Agrave: "À", Aacute: "Á", Acirc: "Â", Atilde: "Ã", Auml: "Ä", Aring: "Å",
  Egrave: "È", Eacute: "É", Ecirc: "Ê", Euml: "Ë",
  Igrave: "Ì", Iacute: "Í", Icirc: "Î", Iuml: "Ï",
  Ograve: "Ò", Oacute: "Ó", Ocirc: "Ô", Otilde: "Õ", Ouml: "Ö", Oslash: "Ø",
  Ugrave: "Ù", Uacute: "Ú", Ucirc: "Û", Uuml: "Ü",
  Yacute: "Ý",
  Ccedil: "Ç", Ntilde: "Ñ",
};

export function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(Number.parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
}

function pickName(item) {
  const names = arr(item.name);
  const primary = names.find((n) => n.type === "primary");
  return decodeEntities((primary ?? names[0])?.value ?? "");
}

function alternateNames(item) {
  return arr(item.name)
    .filter((n) => n.type === "alternate")
    .map((n) => decodeEntities(n.value ?? ""))
    .filter(Boolean);
}

function linkValuesByType(item, type) {
  return arr(item.link)
    .filter((l) => l.type === type)
    .map((l) => decodeEntities(l.value ?? ""))
    .filter(Boolean);
}

function relatedItemsByType(item, type) {
  return arr(item.link)
    .filter((l) => l.type === type)
    .map((l) => ({ id: Number(l.id ?? 0), name: decodeEntities(l.value ?? "") }))
    .filter((r) => r.id > 0 && r.name);
}

/**
 * Extract `bestPlayerCount` and `recommendedPlayerCount` from BGG's
 * poll-summary block. BGG hands us ready-made strings:
 *   <result name="bestwith"        value="Best with 4 players" />
 *   <result name="recommmendedwith" value="Recommended with 3–4 players" />
 *                                              ^^ note BGG's typo
 */
function pollPlayerCounts(item) {
  const summary = arr(item["poll-summary"]).find((p) => p.name === "suggested_numplayers");
  if (!summary) return { bestPlayerCount: null, recommendedPlayerCount: null };
  const results = arr(summary.result);
  const best = results.find((r) => r.name === "bestwith")?.value ?? "";
  const rec = results.find((r) => r.name === "recommmendedwith")?.value ?? "";

  // "Best with 4 players" or "Best with 4+ players" or "" (no votes)
  const bestMatch = best.match(/(\d+)/);
  const bestPlayerCount = bestMatch ? Number(bestMatch[1]) : null;

  // "Recommended with 3–4 players" / "Recommended with 4 players" / ""
  // Accept en-dash, em-dash, and hyphen.
  const recRange = rec.match(/(\d+)\s*[–—-]\s*(\d+)/);
  const recSingle = !recRange && rec.match(/(\d+)/);
  let recommendedPlayerCount = null;
  if (recRange) {
    recommendedPlayerCount = { min: Number(recRange[1]), max: Number(recRange[2]) };
  } else if (recSingle) {
    const n = Number(recSingle[1]);
    recommendedPlayerCount = { min: n, max: n };
  }

  return { bestPlayerCount, recommendedPlayerCount };
}

/**
 * Modal community-suggested age. Picks the bucket with the highest vote count.
 * Returns null when there are no votes or BGG returns no poll.
 */
function pollSuggestedAge(item) {
  const poll = arr(item.poll).find((p) => p.name === "suggested_playerage");
  if (!poll) return null;
  const buckets = arr(poll.results?.result);
  let best = null;
  let bestVotes = 0;
  for (const b of buckets) {
    const votes = Number(b.numvotes ?? 0);
    if (!Number.isFinite(votes) || votes <= 0) continue;
    if (votes > bestVotes) {
      bestVotes = votes;
      const m = String(b.value ?? "").match(/(\d+)/);
      best = m ? Number(m[1]) : null;
    }
  }
  return best;
}

/**
 * Weighted-average language-dependence level (1-5). Each level's vote count
 * is multiplied by its level number; the rounded mean is the result. Maps
 * roughly to: 1 = no text, 2 = some text, 3 = moderate, 4 = extensive,
 * 5 = unplayable in another language.
 */
function pollLanguageDependence(item) {
  const poll = arr(item.poll).find((p) => p.name === "language_dependence");
  if (!poll) return null;
  const results = arr(poll.results?.result);
  let totalVotes = 0;
  let weighted = 0;
  for (const r of results) {
    const level = Number(r.level ?? 0);
    const votes = Number(r.numvotes ?? 0);
    if (!Number.isFinite(level) || !Number.isFinite(votes) || level < 1 || level > 5) continue;
    totalVotes += votes;
    weighted += level * votes;
  }
  if (totalVotes === 0) return null;
  return Math.max(1, Math.min(5, Math.round(weighted / totalVotes)));
}

function parseRanks(item) {
  const ranks = arr(item.statistics?.ratings?.ranks?.rank);
  let bggRank = null;
  const subdomainRanks = [];
  for (const r of ranks) {
    const value = num(r.value); // null if "Not Ranked"
    if (r.type === "subtype" && r.name === "boardgame") {
      bggRank = value;
    } else if (r.type === "family") {
      subdomainRanks.push({
        name: String(r.name ?? ""),
        friendlyName: decodeEntities(r.friendlyname ?? ""),
        rank: value,
      });
    }
  }
  return { bggRank, subdomainRanks };
}

function normalizeItem(item) {
  const ratings = item.statistics?.ratings;
  const { bestPlayerCount, recommendedPlayerCount } = pollPlayerCounts(item);
  const { bggRank, subdomainRanks } = parseRanks(item);

  return {
    id: Number(item.id ?? 0),
    type: String(item.type ?? "boardgame"),
    name: pickName(item),
    alternateNames: alternateNames(item),
    description: decodeEntities(item.description ?? ""),
    yearPublished: num(item.yearpublished?.value),
    minPlayers: num(item.minplayers?.value),
    maxPlayers: num(item.maxplayers?.value),
    bestPlayerCount,
    recommendedPlayerCount,
    playingTime: num(item.playingtime?.value),
    minPlayTime: num(item.minplaytime?.value),
    maxPlayTime: num(item.maxplaytime?.value),
    minAge: num(item.minage?.value),
    suggestedAge: pollSuggestedAge(item),
    languageDependence: pollLanguageDependence(item),
    categories: linkValuesByType(item, "boardgamecategory"),
    mechanics: linkValuesByType(item, "boardgamemechanic"),
    families: linkValuesByType(item, "boardgamefamily"),
    designers: linkValuesByType(item, "boardgamedesigner"),
    artists: linkValuesByType(item, "boardgameartist"),
    publishers: linkValuesByType(item, "boardgamepublisher"),
    expansions: relatedItemsByType(item, "boardgameexpansion"),
    compilations: relatedItemsByType(item, "boardgamecompilation"),
    implementations: relatedItemsByType(item, "boardgameimplementation"),
    accessories: relatedItemsByType(item, "boardgameaccessory"),
    averageRating: num(ratings?.average?.value),
    geekRating: num(ratings?.bayesaverage?.value),
    averageWeight: num(ratings?.averageweight?.value),
    numRatings: num(ratings?.usersrated?.value),
    numComments: num(ratings?.numcomments?.value),
    numWeights: num(ratings?.numweights?.value),
    stddev: num(ratings?.stddev?.value),
    bggRank,
    subdomainRanks,
    owned: num(ratings?.owned?.value),
    trading: num(ratings?.trading?.value),
    wanting: num(ratings?.wanting?.value),
    wishing: num(ratings?.wishing?.value),
  };
}

export function parseBggXml(xml) {
  const parsed = parser.parse(xml);
  const items = arr(parsed.items?.item);
  const out = {};
  for (const item of items) {
    const game = normalizeItem(item);
    if (game.id) out[game.id] = game;
  }
  return out;
}

/**
 * Like `parseBggXml`, but additionally returns BGG's hosted image URLs per
 * id. Used transiently by the bgg-sync `--add` flow to download a thumbnail
 * for a new game. The image URLs are NEVER persisted to snapshot or DB —
 * we always render local optimized webp.
 */
export function parseBggThings(xml) {
  const parsed = parser.parse(xml);
  const items = arr(parsed.items?.item);
  const out = {};
  for (const item of items) {
    const game = normalizeItem(item);
    if (!game.id) continue;
    out[game.id] = {
      game,
      image: typeof item.image === "string" ? item.image : null,
      thumbnail: typeof item.thumbnail === "string" ? item.thumbnail : null,
    };
  }
  return out;
}
