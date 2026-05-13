# gen-descriptions

Research-grounded board-game descriptions. Hands each game's BGG metadata to
OpenAI's Responses API with `web_search` enabled, gets back three length
variants (tight / default / loose), validates them against a hard char-budget
schema, and writes per-game `descriptions.generated.ts` files into
`packages/web/src/games/<slug>/`.

## Quick start

```bash
# Set the key once
echo "OPENAI_API_KEY=sk-..." >> packages/server/.env

# Verify the plan before burning API credits
pnpm gen-descriptions --slug catan --dry-run

# Generate one game
pnpm gen-descriptions --slug catan

# Generate only games that don't have a file yet
pnpm gen-descriptions --missing

# Bulk: every BGG-listed game (~30–60 min at concurrency=5)
pnpm gen-descriptions --all
```

## Flags

| Flag | Effect |
|------|--------|
| `--slug <slug>` | One game by slug. |
| `--all` | Every BGG-listed game (`bggId > 0`). Homebrew skipped. |
| `--missing` | Only slugs without an existing `descriptions.generated.ts`. |
| `--concurrency <N>` | In-flight API calls, default 5. |
| `--dry-run` | Log the plan, don't call OpenAI or write files. |

Exactly one of `--slug`, `--all`, `--missing` is required.

## Required env (loaded from `packages/server/.env`)

- `OPENAI_API_KEY` — your secret key.
- `OPENAI_MODEL` — optional, defaults to `gpt-5.5`. Override if the API
  exposes the model under a versioned id (e.g. `gpt-5.5-preview-2026`).

## Output shape

Each successful run writes (or overwrites):

```ts
// packages/web/src/games/<slug>/descriptions.generated.ts
export const descriptions: GameDescriptions = {
  tight:   "...",  // ~140 chars
  default: "...",  // ~240 chars — carousel
  loose:   "...",  // ~360 chars — catalog
};

export const meta = {
  generatedAt: "2026-05-13T…",
  model: "gpt-5.5",
  durationMs: 32145,
  sources: ["https://…", "https://…"],
} as const;
```

The registry at `packages/web/src/games/registry.ts` picks up the file
automatically via `import.meta.glob` — no manual import in the game's
`index.ts` is required.

## Precedence

1. `bggOverrides.description` in `index.ts` (manual escape hatch) — wins,
   applies uniformly to all three variants.
2. `descriptions.generated.ts` (this script's output).
3. `bgg.description` (BGG raw) — fallback, repeated across all three slots.

## Re-running

Re-running on an already-generated slug overwrites the file. Review the diff
before committing — that's the primary quality gate.

## Failure handling

- Transient errors (429/5xx): retried up to 2 times with backoff.
- Schema validation failure (e.g. over-budget `default`): one retry with a
  reminder of the over-budget field.
- After retries exhaust: the slug is logged and skipped. The script exits
  non-zero so CI / pre-commit catches partial runs.

## What does *not* happen

- No Batch API — Responses + `web_search` aren't batch-able as of this writing.
- No description caching beyond the file write itself.
- No admin-UI integration — pnpm script only.
- No localization — English only.
- No homebrew (`bggId: 0`) generation — there's nothing to research.
