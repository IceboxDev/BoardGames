#!/usr/bin/env node
// ── Style guard ───────────────────────────────────────────────────────────
//
// Enforces design-system invariants that Biome can't express. Two tiers:
//
//   STRICT (zero tolerance — fail on any hit):
//     • STACKING — overlay/modal files (*Modal*.tsx / *Overlay*.tsx) use the
//       z-overlay / z-modal / z-tooltip tokens, never raw z-30/40/50 / z-[…].
//       index.css owns the stacking order as a single source of truth.
//     • DANGER COLOR — app chrome (everything under packages/web/src except
//       games/) uses the rose danger tone, never Tailwind red-*. Files where
//       red is a *literal* color (card art, the calendar fire) are allowlisted.
//
//   RATCHET (baseline in scripts/style-baseline.json — fail only on NEW hits):
//     • no-gray-palette      use surface-*/fg-* tokens, not gray/slate/zinc/neutral.
//     • no-raw-indigo        use accent-* tokens, not raw indigo-* (accent IS
//                            indigo-500). The `accent-indigo` accent-color util
//                            is exempt — the util alternation never includes it.
//     • arbitrary-text-size  use the text-2xs/3xs/4xs micro scale (or the
//                            standard text-* scale), not text-[Npx] / text-[Nrem].
//     • tailwind-important   no `!`-important class overrides — add a Button/Chip
//                            variant or a shared primitive instead of fighting one.
//     • glow-shadow-literal  use shadow-glow-* tokens, not a hand-rolled
//                            shadow-[0_0_…rgb(…)].
//
//   The baseline pins the per-file count of pre-existing hits: a new file (or a
//   new hit in a pinned file) fails the check; removing hits is always allowed.
//   After removing some, run `node scripts/lint-styles.mjs --update` to ratchet
//   the baseline down. The goal is a shrinking baseline — once a rule reaches
//   zero everywhere, delete its baseline section and it is effectively STRICT.
//
// Runs in `pnpm lint` and the lefthook pre-commit. Exits 1 on any violation.
// `--update` rewrites the baseline from the current tree (and still enforces
// the STRICT rules).

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB = join(SCRIPT_DIR, "..", "packages", "web", "src");
const BASELINE_PATH = join(SCRIPT_DIR, "style-baseline.json");
const UPDATE = process.argv.includes("--update");

// ── Strict rules ──────────────────────────────────────────────────────────

// Files where `red-*` is a literal color, not a danger/status accent.
const RED_ALLOWLIST = new Set([
  "pages/DeckPreview.tsx", // playing-card suit + card-back art
  "components/offline/Calendar.tsx", // fire-heat effect (red→orange gradient)
]);

const RED_RE =
  /\b(?:text|bg|border|ring|from|via|to|placeholder|divide|shadow|outline|fill|stroke|decoration|accent)-red-\d/;
const STACK_RE = /\bz-(?:30|40|50)\b|\bz-\[/;

// ── Ratchet rules ─────────────────────────────────────────────────────────

// Color/utility prefixes that take a palette value (used to scope the gray /
// indigo bans to real classes, never bare identifiers).
const UTIL =
  "(?:bg|text|border|ring|divide|from|to|via|placeholder|fill|stroke|outline|decoration)";

const RATCHET_RULES = [
  {
    name: "no-gray-palette",
    re: new RegExp(`\\b${UTIL}-(?:gray|slate|zinc|neutral)-\\d`, "g"),
    hint: "use surface-*/fg-* tokens, not gray/slate/zinc/neutral",
  },
  {
    name: "no-raw-indigo",
    re: new RegExp(`\\b${UTIL}-indigo-\\d`, "g"),
    hint: "use the accent-* tokens, not raw indigo-* (accent IS indigo)",
  },
  {
    name: "arbitrary-text-size",
    re: /\btext-\[[0-9.]+(?:px|rem)\]/g,
    hint: "use the text-2xs/3xs/4xs micro scale (or the standard text-* scale)",
  },
  {
    name: "tailwind-important",
    // `!` directly before a Tailwind utility. Variant prefixes sit before the
    // `!` (hover:!bg-…) so they aren't matched here. Two branches: value
    // utilities must be followed by `-<value>` (so JS negations of short names
    // like `!p.isOut` / `!m.length` / `!w` never match), and the handful of
    // bare display/text utilities (`!flex`, `!hidden`, …) match on a boundary.
    re: /\!(?:bg|text|border|shadow|ring|rounded|gap|space|divide|w|h|min-w|max-w|min-h|max-h|p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|inset|top|right|bottom|left|z|opacity|leading|tracking|from|to|via|order|col|row|object|overflow|cursor|place|content|aspect|whitespace|font|items|justify|self|grid|flex)-|\!(?:flex|grid|block|hidden|inline|table|contents|truncate|italic|underline|uppercase|lowercase|capitalize|sr-only)\b/g,
    hint: "no !important overrides — add a variant to the primitive instead",
  },
  {
    name: "glow-shadow-literal",
    re: /shadow-\[0_0_[^\]]*rgb/g,
    hint: "use the shadow-glow-* tokens",
  },
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (/\.(tsx|ts)$/.test(name) && !/\.test\./.test(name)) {
      yield full;
    }
  }
}

function countMatches(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

const baseline =
  existsSync(BASELINE_PATH) && !UPDATE
    ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
    : {};

const strictViolations = [];
const ratchetViolations = [];
const nextBaseline = {};
for (const rule of RATCHET_RULES) nextBaseline[rule.name] = {};

for (const file of walk(WEB)) {
  const rel = relative(WEB, file).split("\\").join("/");
  const base = rel.split("/").pop();
  const isGame = rel.startsWith("games/");
  const isOverlayFile = /(?:Modal|Overlay)\.tsx$/.test(base);
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");

  // Strict rules — per line.
  lines.forEach((line, i) => {
    if (isOverlayFile && STACK_RE.test(line)) {
      strictViolations.push({ rel, line: i + 1, rule: "stacking", text: line.trim() });
    }
    if (!isGame && !RED_ALLOWLIST.has(rel) && RED_RE.test(line)) {
      strictViolations.push({ rel, line: i + 1, rule: "red", text: line.trim() });
    }
  });

  // Ratchet rules — per file count vs baseline.
  for (const rule of RATCHET_RULES) {
    const count = countMatches(text, rule.re);
    if (count > 0) nextBaseline[rule.name][rel] = count;
    if (UPDATE) continue;
    const allowed = baseline[rule.name]?.[rel] ?? 0;
    if (count > allowed) {
      ratchetViolations.push({ rel, rule: rule.name, hint: rule.hint, count, allowed });
    }
  }
}

if (UPDATE) {
  // Drop empty rule sections for tidiness.
  for (const name of Object.keys(nextBaseline)) {
    if (Object.keys(nextBaseline[name]).length === 0) delete nextBaseline[name];
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(nextBaseline, null, 2)}\n`);
  const total = Object.values(nextBaseline).reduce(
    (a, files) => a + Object.values(files).reduce((b, n) => b + n, 0),
    0,
  );
  console.log(`✓ style-guard: baseline written (${total} pinned hit(s) across ${Object.keys(nextBaseline).length} rule(s))`);
}

let failed = false;

if (strictViolations.length > 0) {
  failed = true;
  console.error(`\n✖ style-guard: ${strictViolations.length} strict violation(s)\n`);
  for (const v of strictViolations) {
    const hint =
      v.rule === "stacking"
        ? "use z-overlay / z-modal / z-tooltip (index.css owns the stacking order)"
        : "use the rose danger tone, not Tailwind red-* (allowlist literal-red files in scripts/lint-styles.mjs)";
    console.error(`  ${v.rel}:${v.line}  [${v.rule}] ${hint}`);
    console.error(`    ${v.text}`);
  }
}

if (ratchetViolations.length > 0) {
  failed = true;
  console.error(`\n✖ style-guard: ${ratchetViolations.length} new design-token violation(s)\n`);
  for (const v of ratchetViolations) {
    const delta = v.allowed > 0 ? ` (${v.count} > baseline ${v.allowed})` : " (new file)";
    console.error(`  ${v.rel}  [${v.rule}]${delta} — ${v.hint}`);
  }
  console.error(
    "\n  Fix the new hit(s). If you instead REMOVED hits and the baseline is stale,",
  );
  console.error("  run `node scripts/lint-styles.mjs --update` to ratchet the baseline down.\n");
}

if (failed) process.exit(1);

if (!UPDATE) console.log("✓ style-guard: no violations (strict rules clean, ratchet rules at/below baseline)");
