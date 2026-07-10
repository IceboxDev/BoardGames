# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install                  # install dependencies
pnpm dev                      # run web frontend (Vite dev server at localhost:5173)
pnpm dev:all                  # run both server and web concurrently
pnpm build                    # build all packages
pnpm lint                     # biome check (lint + format check)
pnpm lint:fix                 # biome check --write (auto-fix)
pnpm format                   # biome format --write
pnpm typecheck                # typecheck all packages
pnpm test                     # run vitest across core, server, and web
pnpm -r --filter @boardgames/web typecheck   # typecheck single package
```

Scripts in individual packages can be run with `pnpm --filter <pkg> <script>`, e.g. `pnpm --filter @boardgames/server dev`.

Pre-commit hook (lefthook): runs `biome check` on staged files, `pnpm -r typecheck`, and `pnpm test` in parallel.

## Code Style

Biome enforces formatting and linting. Key settings:
- 2-space indent, 100 char line width
- Double quotes, trailing commas, semicolons
- `useImportType: "error"` — use `import type` for type-only imports
- `noUnusedImports: "error"`
- `noExplicitAny: "error"` — never `any`. Use `unknown` and narrow with a schema.

## Wire protocol & schema validation

All HTTP, WebSocket, and SSE messages exchanged between `packages/web` and `packages/server` are defined as Zod 4 schemas in `@boardgames/core/protocol/*` and shared as the **single source of truth**. Hand-rolled defensive parsers and `as TheirShape` casts at the wire boundary are forbidden.

**Schema layout:**
- `packages/core/src/protocol/common.ts` — `ErrorResponseSchema`, branded `DateKey`/`IsoTimestamp`/`TimeOfDay`/`GameSlug`.
- `packages/core/src/protocol/http/*.ts` — request/response schemas grouped by feature (`calendar`, `availability`, `inventory`, `tournament`, `games`, `auth`).
- `packages/core/src/protocol/ws/*.ts` — `ServerMessageSchema` and `ClientMessageSchema` (discriminated unions on `type`), `RoomStateSchema`/`RoomSlotSchema`. Per-game `playerView`/`legalActions`/`result` payloads stay `z.unknown()` at the envelope; per-game schemas are a follow-up.
- Each schema file has an adjacent `*.test.ts` (good payload parses; bad payload throws with the expected issue path).
- Types are derived via `z.infer` (or `z.input` for raw form shapes), never re-declared as TS interfaces.

**Helper APIs (web):**
- `packages/web/src/lib/api-fetch.ts:apiFetch(path, { request?, response, body?, method?, signal? })` — every HTTP call site goes through this. Throws `ApiError` for non-2xx (with the server's `ErrorResponseSchema` envelope) and `SchemaError` for shape mismatch.
- `packages/web/src/lib/typed-query.ts:jsonQuery` / `jsonMutation` — React Query factories.
- `packages/web/src/lib/ws-client.ts:parseServerMessage(raw)` — typed WS envelope parser (throws `SchemaError`).

**Helper APIs (server):**
- `packages/server/src/lib/error-response.ts:zJsonBody(schema)` / `zQuery(schema)` / `errorResponse(c, status, msg, code?)` — wraps `@hono/zod-validator` with the shared error envelope.
- `packages/server/src/sessions/parse-client-message.ts:parseClientMessage(raw)` — typed inbound WS envelope parser.

**When adding a new endpoint:**
1. Define its request and response schemas in `core/protocol/http/<group>.ts` (or `ws/*.ts` for WS messages).
2. Add an adjacent `*.test.ts` covering one happy-path and 2–3 error cases.
3. Server route uses `zJsonBody`/`zQuery` for inputs and `Schema.parse(payload)` before `c.json(...)` for outputs.
4. Client uses `apiFetch(path, { response: ... })` (or the React Query factories). No raw `fetch` and no `as` casts at the boundary.

**Helper API signatures accept `StandardSchemaV1<unknown, T>`** (from `@standard-schema/spec`), not `z.ZodSchema`. The Zod implementation in `@boardgames/core` is swappable later; consumer call sites stay stable.

## Architecture

**pnpm monorepo** with three packages:

- **`packages/core`** — Game logic, rules, AI, and state machines. No UI dependencies. Exports via path-mapped subpaths (e.g. `@boardgames/core/games/lost-cities/types`).
- **`packages/web`** — React + Vite + Tailwind v4 frontend. Each game lives in `src/games/<slug>/` with a `GameDefinition` export in `index.ts`. Games auto-register via `registry.ts` using `import.meta.glob`.
- **`packages/server`** — Hono HTTP/WebSocket server with better-sqlite3 for persistence. Hosts tournament runners and game sessions.

### Game structure pattern

Each game follows a consistent split:

**Core** (`packages/core/src/games/<slug>/`):
- `types.ts` — game state types
- `game-engine.ts` / `rules.ts` — pure functions for state transitions and legal moves
- `machine.ts` — XState state machine implementing `GameMachineSpec` (defined in `core/src/machines/types.ts`)
- `scoring.ts` — scoring logic
- AI files (e.g. `ai-strategies.ts`, `mcts/`) where applicable

**Web** (`packages/web/src/games/<slug>/`):
- `<GameName>.tsx` — top-level game component
- `index.ts` — `GameDefinition` export (slug, title, description, lazy component)
- `components/` — UI components
- `logic/` — client-side game logic helpers

### Key abstractions

- **Runtime model — every playable game is SERVER-AUTHORITATIVE.** The XState machine *and* its AI run on the **server** (`packages/server/src/sessions/manager.ts` creates one actor per session); the browser only renders server state over a single WebSocket per `/play/:slug`, via `useGameShell` → `useRemoteGame` (solo vs AI) / `useMultiplayerRoom` (rooms). There is **no client-side game loop** for the 8 games. (`useLocalGame` exists *only* for Set's standalone trainer mini-mode — it is not how the 8 game sessions run.)
- **`GameMachineSpec`** (`core/src/machines/types.ts`) — generic interface every game machine implements (player views, legal actions, active player, result, game-over). The server's session manager drives this uniformly for all games.
- **`GameDefinition` / `PlayableModule`** (`web/src/games/types.ts`) — registry entry for each game (metadata + lazy component). The `mode` field is `"remote"` for all games today and is **not branched on at runtime** — it's vestigial, kept only for a hypothetical future client-only game. Don't infer "client-side" from it.
- **Dev logging** — `packages/server/src/lib/game-log.ts` (server: session/action/snapshot/AI/game-over) and `packages/web/src/lib/game-log.ts` (client: WS send/recv, dropped sends) emit a unified, dev-only `[game:<slug>]` trace for every game. Use these to debug a stuck/hung session: a gap after `ai-thinking` = slow/blocking AI, a `send DROPPED` = the socket wasn't open.
- **Game registry** (`web/src/games/registry.ts`) — merges three sources:
  1. `core/src/games/catalog.json` — Zod-validated browse-only metadata for *every* game (slug, bggId, accentHex, family, displayTitle, bggOverrides).
  2. `import.meta.glob("./*/index.ts")` — playable extras (component, mode, tournament strategies, …). Only playable games have an `index.ts`; catalog-only games live entirely in `catalog.json`.
  3. The bundled BGG snapshot + per-game `descriptions.generated.ts` + thumbnail webp.

  Resolved entries are discriminated on `kind: "catalog" | "playable"` — TS narrows playable fields automatically inside `def.kind === "playable"` branches.

### Current games

All 8 playable games are **server-authoritative** (`mode: "remote"`, registered in `machine-registry.ts`, multiplayer config in `room-config.ts`). The AI runs server-side inside each game's machine via a `fromPromise` actor.

| Game | AI |
|------|----|
| Lost Cities | ISMCTS + heuristic strategies |
| Exploding Kittens | ISMCTS |
| Durak | heuristic |
| Parks | heuristic |
| Sushi Go | heuristic |
| Sky Team | heuristic (co-op) |
| Pandemic | — (co-op; solo controls all roles) |
| Set | — (PvP / trainer) |

> Note: ISMCTS searches currently run on the server's **main thread**, so a heavy search blocks the Node event loop for all sessions. A worker-thread AI pool is a known scaling improvement.

### Game board layout structure

Every game board uses `GameScreen` from `web/src/components/game-layout/`. This component owns all shared layout — games must NOT add their own outer wrappers.

**Props:**
- `background` — class on root container (e.g. `"bg-black"`)
- `contentClassName` — extra classes on content area (e.g. `"mx-auto max-w-2xl"`). Gap-2 and padding are built-in.
- `sidebar` — history log content. GameScreen provides the sidebar chrome (aside, heading, scroll).
- `fan` — card hand component (CardFan, PlayerHand). Pinned to bottom.
- `fanActions` — controls above the card fan (Confirm, Pass/Take, status). Spaced with gap-2.
- `noPadding` — skip padding and flex-col (for edge-to-edge SVG boards)

**DOM structure (enforced by GameScreen):**
```
GameScreen outer        flex min-h-0 flex-1 [+ background]
├── Content wrapper     flex min-h-0 min-w-0 flex-1 flex-col gap-2 px-2 pt-2 sm:px-4 sm:pt-4 [+ contentClassName]
│   ├── Board area      flex min-h-0 flex-1 flex-col gap-2     ← only when fan is set
│   │   └── {children}
│   └── Fan area        shrink-0 flex flex-col gap-2            ← only when fan is set
│       ├── {fanActions}
│       └── {fan}
└── <aside>             w-72 shrink-0 rounded-xl my-2 mr-2     ← only when sidebar is set
```

When `fan` is omitted, children go directly into the content wrapper (no board/fan split).

**Rules:**
- `GameBoard` renders `<GameScreen>` as its root element. Games must NOT add outer wrappers, spacing, or padding — `GameScreen` owns all of it.
- `fan` is ONLY the card hand component. Controls (buttons, status) go in `fanActions`.
- For edge-to-edge SVG boards (Pandemic, Sky Team), pass `noPadding` to skip padding and flex-col so the board fills the content area.

### Intricate-board rendering standard

Games with non-card-style spatial layouts (maps, instrument panels, hex grids, dungeons) use **declarative SVG + React + framer-motion** via the primitives in `packages/web/src/components/board/` (`BoardSurface`, `BoardLayer`, `BoardSlot`, `BoardArc`, `BoardOverlay`). Sky Team and Pandemic are the two reference ports — see `packages/web/src/games/sky-team/components/board/` and `packages/web/src/games/pandemic/components/board/`. Full decision record and escape-hatch criterion: [`docs/intricate-board-rendering.md`](docs/intricate-board-rendering.md). Card-style games keep using plain React DOM.

### Adding a new game

**For a catalog-only entry** (browse + RSVP voting, no playable surface — covers most additions):

1. Run `pnpm bgg-sync --add` after adding `{ slug, bggId, displayTitle? }` to `scripts/bgg-new-games.json`. The script downloads the thumbnail, optimizes it, computes the accent hex, and appends a new entry to `packages/core/src/games/catalog.json`.
2. Optional: run `pnpm gen-descriptions --slug <slug>` to populate `packages/web/src/games/<slug>/descriptions.generated.ts`. Catalog entries without this file fall back to BGG's raw description.
3. No code changes needed — the registry picks it up.

**For a playable game**: do the catalog-entry steps above, then:

1. Create `packages/web/src/games/<slug>/index.ts` exporting `satisfies PlayableModule` (component, mode, tournament strategies, etc. — see `types.ts` for the full shape). No base fields (`slug`, `bggId`, `accentHex`, `family`, `displayTitle`, `bggOverrides`) here — those live in `catalog.json` only.
2. If the game has non-trivial logic, put it in `packages/core/src/games/<slug>/` and add exports to core's `package.json`.
3. Register the server-side state machine in `packages/server/src/sessions/machine-registry.ts` (REQUIRED — the server runs every game's machine, including solo-vs-AI) and add the room config in `packages/core/src/protocol/room-config.ts` (for multiplayer rooms / AI seating).
4. Use `GameScreen` for the board layout — see "Game board layout structure" above.
