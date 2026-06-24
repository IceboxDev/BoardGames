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
//     • raw-heading-size     use <PageHeader> (or its SetupHeader preset), not a
//                            hand-rolled <h1>/<h2> carrying text-3xl/4xl/5xl.
//     • raw-card-chrome      use <Surface> (static) / <SelectableCard>
//                            (interactive), not a hand-rolled rounded + border +
//                            bg-surface panel.
//     • raw-async-ladder     wrap a React Query result in <QueryBoundary>, not a
//                            hand-rolled `isLoading ?` / `isPending ?` ternary.
//
//   The first five are TOKEN bans (use the design token, not a raw value); the
//   last three are PRIMITIVE-ADOPTION rules (use the shared component, not a
//   hand-rolled equivalent). Each rule may `scope` itself to app chrome — games/
//   and the components/ui/ primitives that DEFINE the chrome are exempt.
//
//   The baseline pins the per-file count of pre-existing hits: a new file (or a
//   new hit in a pinned file) fails the check; removing hits is always allowed.
//   After removing some, run `node scripts/lint-styles.mjs --update` to ratchet
//   the baseline down. The goal is a shrinking baseline — once a rule reaches
//   zero everywhere, delete its baseline section and it is effectively STRICT.
//
// Runs in `pnpm lint` and the lefthook pre-commit. Exits 1 on any violation.
// `--update` rewrites the baseline from the current tree — but it is DOWN-ONLY:
// it refuses to raise any rule's total (pass `--allow-increase` to override — a
// deliberate, diff-visible act). `--check-baseline [--base=<ref>]` is the CI
// gate: it asserts the committed baseline never grew vs a base ref (default
// origin/master), skipping gracefully when that ref isn't available.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB = join(SCRIPT_DIR, "..", "packages", "web", "src");
const BASELINE_PATH = join(SCRIPT_DIR, "style-baseline.json");
const UPDATE = process.argv.includes("--update");
// `--update` is down-only: it refuses to RAISE any rule's total (new violations
// must be fixed, not pinned). `--allow-increase` is the explicit, diff-visible
// escape hatch for the rare deliberate pin.
const ALLOW_INCREASE = process.argv.includes("--allow-increase");
// `--check-baseline [--base=<ref>]` (CI gate): assert the committed baseline is
// at or below a base git ref (default origin/master) for every rule. Skips
// gracefully when the ref isn't available (offline / fresh clone).
const CHECK_BASELINE = process.argv.includes("--check-baseline");

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
    // `!` (hover:!bg-…) so they aren't matched here. ONLY the value-utility form
    // (`!util-<value>`) is matched — the required trailing `-` means it never
    // collides with JS negations of short identifiers (`!grid`, `!hidden`,
    // `!p.isOut`, `!h`). Bare important display utilities (`!flex`, `!hidden`)
    // are deliberately NOT matched: rare in real code, and indistinguishable
    // from a JS negation at the regex level.
    re: /\!(?:bg|text|border|shadow|ring|rounded|gap|space|divide|w|h|min-w|max-w|min-h|max-h|p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|inset|top|right|bottom|left|z|opacity|leading|tracking|from|to|via|order|col|row|object|overflow|cursor|place|content|aspect|whitespace|font|items|justify|self|grid|flex)-/g,
    hint: "no !important overrides — add a variant to the primitive instead",
  },
  {
    name: "glow-shadow-literal",
    re: /shadow-\[0_0_[^\]]*rgb/g,
    hint: "use the shadow-glow-* tokens",
  },
  {
    name: "raw-heading-size",
    // A hand-rolled page heading: an <h1>/<h2> whose OWN class string carries a
    // large display size (text-3xl/4xl/5xl). `[^>]*` cannot cross the tag's `>`,
    // so only the heading element's attributes are inspected — a text-4xl on a
    // child or in the body never trips it. The large-title scale is owned by the
    // heading primitives (PageHeader, its SetupHeader preset, AuthCard) under
    // components/ui/, which is scoped out; everyone else composes those.
    re: /<h[12][^>]*\btext-(?:3xl|4xl|5xl)\b/g,
    hint: "use <PageHeader> (or its SetupHeader preset), not a hand-rolled <h1>/<h2> with text-3xl+",
    scope: (rel) => !rel.startsWith("games/") && !rel.startsWith("components/ui/"),
  },
  {
    name: "raw-card-chrome",
    // A hand-rolled bordered panel: one class string carrying rounded + border +
    // bg-surface together. The negative lookahead lets genuinely-interactive
    // surfaces through (hover:/focus:/cursor-/group-hover:) — those are
    // <SelectableCard> / inputs / link-cards, not a static <Surface>. The
    // chrome-OWNING primitives (Surface, Modal, SegmentedControl, AuthCard, …)
    // live under components/ui/ and games/ is exempt; both are scoped out.
    // Double-quoted class strings only — the static-panel norm; dynamic
    // template-literal chrome is rare and almost always interactive.
    re: /"(?=[^"]*\brounded-(?:md|lg|xl|2xl|3xl|full)\b)(?=[^"]*\bborder\b)(?=[^"]*\bbg-surface-\d)(?![^"]*(?:hover:|focus:|focus-visible:|cursor-|group-hover:))[^"]*"/g,
    hint: "use <Surface> for a static panel (or <SelectableCard> if interactive), not a hand-rolled rounded+border+bg-surface chain",
    scope: (rel) => !rel.startsWith("games/") && !rel.startsWith("components/ui/"),
  },
  {
    name: "raw-async-ladder",
    // A hand-rolled async ladder: an `isLoading ?` / `isPending ?` ternary in app
    // chrome. <QueryBoundary> renders loading/error/empty/data uniformly — a raw
    // ternary on the query flag re-invents it and usually drops the error branch.
    // Scoped to pages/ + components/ feature code; the async primitives live under
    // components/ui/ (excluded) and games/ run their own server-driven loop.
    re: /\b(?:isLoading|isPending)\s*\?/g,
    hint: "wrap the query in <QueryBoundary>, don't hand-roll an isLoading/isPending ternary",
    scope: (rel) =>
      (rel.startsWith("pages/") || rel.startsWith("components/")) &&
      !rel.startsWith("components/ui/"),
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

// Sum every rule's per-file counts → { rule: total }. The down-only checks let
// a rule's total shrink but never grow.
function ruleTotals(bl) {
  const totals = {};
  for (const [rule, files] of Object.entries(bl)) {
    totals[rule] = Object.values(files).reduce((a, n) => a + n, 0);
  }
  return totals;
}

const existing = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
  : {};

// `--check-baseline`: assert the committed baseline is at or below a base git
// ref for every rule — the gate that stops the baseline being ratcheted UP.
// Skips (passes) when the ref isn't fetched, so it never breaks offline work.
if (CHECK_BASELINE) {
  const baseArg = process.argv.find((a) => a.startsWith("--base="));
  const ref = baseArg
    ? baseArg.slice("--base=".length)
    : process.env.STYLE_BASELINE_BASE || "origin/master";
  let refJson;
  try {
    refJson = execSync(`git show ${ref}:scripts/style-baseline.json`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
  } catch {
    console.log(`✓ style-guard: baseline check skipped — ${ref}:scripts/style-baseline.json unavailable`);
    process.exit(0);
  }
  const before = ruleTotals(JSON.parse(refJson));
  const after = ruleTotals(existing);
  const grown = Object.keys(after)
    // A rule absent from the base ref is newly introduced in this change — its
    // seed baseline is reviewed as an ordinary diff, so 0→N is not "growth" here.
    // Only an EXISTING rule that grew is a down-only violation.
    .filter((rule) => before[rule] !== undefined && (after[rule] ?? 0) > before[rule])
    .map((rule) => `    ${rule}: ${before[rule]} → ${after[rule]}`);
  if (grown.length > 0) {
    console.error(`\n✖ style-guard: baseline grew vs ${ref} — it must be down-only\n`);
    console.error(grown.join("\n"));
    console.error("\n  New violations must be fixed, not pinned. A deliberate pin is a reviewable");
    console.error("  baseline increase — get it approved rather than letting it slip in.\n");
    process.exit(1);
  }
  console.log(`✓ style-guard: baseline is at or below ${ref} for every rule`);
  process.exit(0);
}

const baseline = UPDATE ? {} : existing;

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

  // Ratchet rules — per file count vs baseline. A rule may `scope` itself to a
  // subset of files (app chrome only); scoped-out files are neither checked nor
  // baselined for that rule.
  for (const rule of RATCHET_RULES) {
    if (rule.scope && !rule.scope(rel)) continue;
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
  // Down-only: refuse to raise any rule's total without an explicit opt-in, so
  // `--update` can never silently pin new violations.
  const before = ruleTotals(existing);
  const after = ruleTotals(nextBaseline);
  const grown = Object.keys(after)
    .filter((rule) => (after[rule] ?? 0) > (before[rule] ?? 0))
    .map((rule) => `    ${rule}: ${before[rule] ?? 0} → ${after[rule]}`);
  if (grown.length > 0 && !ALLOW_INCREASE) {
    console.error("\n✖ style-guard --update: refusing to RAISE the baseline (it is down-only)\n");
    console.error(grown.join("\n"));
    console.error("\n  Fix the new violation(s) instead of pinning them. If a pin is truly");
    console.error("  unavoidable, re-run with --allow-increase (shows up as a baseline diff).\n");
    process.exit(1);
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(nextBaseline, null, 2)}\n`);
  const total = Object.values(nextBaseline).reduce(
    (a, files) => a + Object.values(files).reduce((b, n) => b + n, 0),
    0,
  );
  const note = grown.length > 0 ? " — baseline RAISED via --allow-increase" : "";
  console.log(
    `✓ style-guard: baseline written (${total} pinned hit(s) across ${Object.keys(nextBaseline).length} rule(s))${note}`,
  );
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
