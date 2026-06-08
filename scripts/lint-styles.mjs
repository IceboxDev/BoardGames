#!/usr/bin/env node
// ── Style guard ───────────────────────────────────────────────────────────
//
// Enforces two design-system invariants that Biome can't express directly:
//
//   1. STACKING — overlay/modal components (files named *Modal*.tsx /
//      *Overlay*.tsx) must use the `z-overlay` / `z-modal` / `z-tooltip`
//      stacking tokens (or local z-0/10/20), never raw `z-30` / `z-40` /
//      `z-50` / `z-[…]`. index.css owns the stacking order as a single source
//      of truth; a hand-picked z-index silently breaks that contract.
//
//   2. DANGER COLOR — app chrome (everything under packages/web/src except
//      games/) must use the rose danger tone, never Tailwind `red-*`. Files
//      where red is a *literal* color (playing-card art, the calendar fire
//      effect) are allowlisted.
//
// Runs in `pnpm lint` and the lefthook pre-commit. Exits 1 on any violation.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB = join(SCRIPT_DIR, "..", "packages", "web", "src");

// Files where `red-*` is a literal color, not a danger/status accent.
const RED_ALLOWLIST = new Set([
  "pages/DeckPreview.tsx", // playing-card suit + card-back art
  "components/offline/Calendar.tsx", // fire-heat effect (red→orange gradient)
]);

const RED_RE =
  /\b(?:text|bg|border|ring|from|via|to|placeholder|divide|shadow|outline|fill|stroke|decoration|accent)-red-\d/;
const STACK_RE = /\bz-(?:30|40|50)\b|\bz-\[/;

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

const violations = [];
for (const file of walk(WEB)) {
  const rel = relative(WEB, file).split("\\").join("/");
  const base = rel.split("/").pop();
  const isGame = rel.startsWith("games/");
  const isOverlayFile = /(?:Modal|Overlay)\.tsx$/.test(base);
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (isOverlayFile && STACK_RE.test(line)) {
      violations.push({ rel, line: i + 1, rule: "stacking", text: line.trim() });
    }
    if (!isGame && !RED_ALLOWLIST.has(rel) && RED_RE.test(line)) {
      violations.push({ rel, line: i + 1, rule: "red", text: line.trim() });
    }
  });
}

if (violations.length > 0) {
  console.error(`\n✖ style-guard: ${violations.length} violation(s)\n`);
  for (const v of violations) {
    const hint =
      v.rule === "stacking"
        ? "use z-overlay / z-modal / z-tooltip (index.css owns the stacking order)"
        : "use the rose danger tone, not Tailwind red-* (allowlist literal-red files in scripts/lint-styles.mjs)";
    console.error(`  ${v.rel}:${v.line}  [${v.rule}] ${hint}`);
    console.error(`    ${v.text}`);
  }
  console.error("");
  process.exit(1);
}

console.log("✓ style-guard: no stacking or red-* violations in app chrome");
