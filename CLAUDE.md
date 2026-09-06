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

## Styling tokens & style guard

Tailwind v4; every color utility compiles to a `var(--color-*)` that `lib/theme/apply.ts` can override, so **chrome must be spelled in tokens**. The vocabulary (all in `packages/web/src/index.css`):

- **Ink:** `text-fg-strong` (headings, hero numbers) > `fg-primary` > `fg-secondary` > `fg-muted` > `fg-disabled`. `text-white` is ONLY ink on a colored fill (a solid button, a gradient badge). `text-on-accent` for ink on the accent.
- **Lines / fills:** `border-line-soft` / `border-line` / `border-line-strong` (5/10/20%), `ring-line`, `divide-line`; `bg-fill-soft` / `bg-fill` / `bg-fill-strong` (4/6/10%). Never `border-white/10` or `bg-white/5` — those alphas cannot be themed. A stronger white alpha is `fg-strong/NN`.
- **Radius roles:** `rounded-card-md…3xl` (panels, thumbs, dialogs; scale with `--radius-card-scale`) and `rounded-ui-md/lg` (controls; `--radius-ui-scale`). Never a static `rounded-lg`; `rounded-full` stays literal. Constants in `components/ui/radii.ts`.
- **Stacking:** `z-lift` (5) / `z-raised` / `z-raised-2` / `z-raised-3` for local ordering inside one component; `z-nav` / `z-overlay` / `z-modal` / `z-tooltip` / `z-takeover` for portaled layers. Never a numeric `z-*` (strict lint).
- **Layout constants:** `--layout-nav-h` (`h-nav`, `pt-nav`, `top-below-nav`, `min-h-below-nav`), `--layout-board-rail-w` / `--layout-history-rail-w` (`w-board-rail`, `w-history-rail`), `--layout-fan-h` (`h-fan`), `--aspect-card` (`aspect-card`), `max-w-modal-full(-xl/-2xl)`. Add a `@utility` pair rather than a `h-[3rem]` at a call site.
- **Captions:** `tracking-label` / `tracking-pill` / `tracking-eyebrow` via `<MicroLabel>` / `<Eyebrow>` / `<Badge>`; never `tracking-wider`.
- New tokens/scales are registered in `lib/cn.ts` (twMerge groups) so `cn()` resolves conflicts.

`scripts/lint-styles.mjs` enforces this (runs in `pnpm lint` + pre-commit): strict rules (stacking, card aspect, red-*) fail on any hit; ratchet rules fail on NEW hits against `scripts/style-baseline.json`. After removing hits run `node scripts/lint-styles.mjs --update` (down-only). `pages/ui-gallery-coverage.test.ts` fails when a `components/ui` export is missing from `/dev/ui`.

**Page primitives:** every route is a route-level `lazy` module under an `<AuthLayout mode>` group in `App.tsx` (never wrap a page in `AuthGuard` yourself); `RouteFallback` / `BoardFallback` are the only loading screens; player-scoped pages (`/u/:userId/*`) render through `PlayerPageFrame` / `PlayerQueryBoundary`. Metrics use `StatTile`; meters `ProgressBar`; search fields `SearchInput`; multi-select rows `CheckRow`; single-pick rows `SelectableCard variant="row"`; dialogs `Modal` (`density="compact"` for canvas dialogs) with `ModalBody` + `ModalFooter`.

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
- **`packages/server`** — Hono HTTP/WebSocket server persisting to **Turso/libsql** (`@libsql/client`, remote-only — there is no local SQLite file and no `better-sqlite3`). Hosts tournament runners and game sessions. Schema changes, backups and the migration workflow: [`docs/database-operations.md`](docs/database-operations.md).

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

### Untrusted actions (server-authoritative safety)

The WS envelope types a game action as `z.unknown()`, so **the spec is what stands between a hostile frame and the engine**. Engines signal an illegal move by throwing, and an XState action that throws with no error observer is re-raised on a macrotask — which is how one malformed frame used to kill the process and every concurrent game with it.

Four layers, outermost first. Adding a game means participating in the first two:

1. **`GameMachineSpec.validateAction(snapshot, player, raw)`** (required) turns an untrusted payload into a machine event or rejects it with a reason. Build it with the helpers in `packages/core/src/machines/action-validation.ts`:
   - `playerActionValidator` — **preferred**. The action must be structurally equal to one the engine enumerated via `getLegalActions`, and the event is rebuilt from the *engine's own object*, so no client bytes reach game logic. Used by durak, parks, exploding-kittens, sushi-go, 7-wonders, sky-team.
   - `directEventValidator` — same guarantee for machines whose client events *are* the actions (lost-cities, set).
   - `envelopeActionValidator` — well-formedness only; the engine adjudicates. Used by **pandemic**, whose UI doesn't drive from `legalActions`.
   `player` is the authenticated seat — build any seat field in the event from it, never from `raw`.
2. **`safeApply(label, fn)`** wraps every engine call inside an `assign`, so an engine throw becomes "move rejected, state unchanged" instead of a dead actor.
3. The session manager subscribes with an **observer object carrying an `error` handler** (`sessions/manager.ts`), so a residual throw ends one session, not the process.
4. `lib/process-guards.ts` catches `uncaughtException` / `unhandledRejection`, surviving isolated faults and exiting only on a burst.

Legality checks are not a substitute for `getLegalActions` being complete: if the UI can construct a legal move the enumeration doesn't list, `playerActionValidator` will reject it. Sky Team's `spend-reroll` and Sushi Go's chopsticks pair are worked examples of handling that in the validator.

### Game board layout structure

Every game board uses `GameScreen` from `web/src/components/game-layout/`. This component owns all shared layout — games must NOT add their own outer wrappers.

**Props:**
- `background` — class on root container (e.g. `"bg-black"`)
- `contentClassName` — extra classes on content area (e.g. `"mx-auto max-w-2xl"`). Gap and padding are built-in.
- `sidebar` — history log content (right rail). GameScreen provides the rail chrome (aside, "History" heading, scroll).
- `leftSidebar` / `leftSidebarTitle` / `leftSidebarLabel` — left rail spanning the board height (score, player list, status track). `leftSidebarTitle` is the wide-screen heading; `leftSidebarLabel` names the phone sheet when the rail draws its own header (durak/exploding-kittens "Players", sky-team "Approach"). Used by lost-cities, durak, exploding-kittens, 7-wonders, sky-team, set, dnd.
- `fan` — card hand component (CardFan, PlayerHand). Pinned to bottom.
- `fanActions` — controls above the card fan (Confirm, Pass/Take, status). The row reserves `min-h-9` so the board doesn't jump when actions appear.
- `noPadding` — skip padding and flex-col (for edge-to-edge SVG boards)
- `mobileRails` — `"sheet"` (default) or `"none"`. See "Phone layout" below.
- `pinSidebars` — legacy escape hatch: rails stay in the row at every width. No game uses it.

**Phone layout (default, no per-game work):** below `lg` (64rem) both rails leave the board row and re-surface in a bottom sheet (`Drawer side="bottom"`) behind a rail bar of pill buttons ("Score"/"History") rendered between the board and the fan tray. The rail content is mounted in exactly one place at a time — the row OR the sheet, decided by `useMediaQuery(WIDE_BOARD_QUERY)` in JS — so stateful rail content is never double-mounted. A game that re-surfaces its rail content inside the board itself (decrypto's `MobilePanels`) passes `mobileRails="none"`. Rail widths are the layout tokens `w-board-rail` / `w-history-rail` (`--layout-board-rail-w`, `--layout-history-rail-w` in `index.css`).

**DOM structure (enforced by GameScreen, wide viewport):**
```
GameScreen outer        relative z-raised flex min-h-0 flex-1 [+ background]
├── Column              flex min-h-0 min-w-0 flex-1 flex-col
│   ├── Board row       flex min-h-0 flex-1 px-1 sm:px-4
│   │   ├── <aside>     w-board-rail shrink-0 bg-surface-900/60 p-4     ← only when leftSidebar is set
│   │   └── Content     flex min-h-0 min-w-0 flex-1 flex-col gap-2 px-2 pt-3 sm:px-4 sm:pt-4 overflow-y-auto lg:overflow-visible [+ contentClassName]
│   │       └── {children}
│   ├── Rail bar        (narrow only) flex shrink-0 gap-2 border-t border-line px-2 py-1.5
│   └── Fan area        shrink-0 flex flex-col gap-2 px-4 pb-4 pt-2   ← only when fan is set
│       ├── {fanActions}   flex min-h-9 items-center justify-center
│       └── {fan}
└── <aside>             w-history-rail shrink-0 rounded-card-xl my-2 mr-2 bg-surface-900/60   ← only when sidebar is set
```

**Rules:**
- `GameBoard` renders `<GameScreen>` as its root element. Games must NOT add outer wrappers, spacing, or padding — `GameScreen` owns all of it.
- `fan` is ONLY the card hand component. Controls (buttons, status) go in `fanActions`.
- For edge-to-edge SVG boards (Pandemic, Sky Team), pass `noPadding` to skip padding and flex-col so the board fills the content area.
- Shared in-game primitives live beside GameScreen in `game-layout/`: `PromptRow` (the "Title · message" action-bar status row, with the cyan/amber turn tones and the pulsing waiting dot) and `GameDialogPanel` (tinted resolve-now panels — defuse/favor/steal-style dialogs). Card faces compose `cardChrome()` from `components/card-fan/card-chrome.ts` for the shared selected-ring/hover/disabled formula. Do not re-hand-roll any of these.

### Intricate-board rendering standard

Games with non-card-style spatial layouts (maps, instrument panels, hex grids, dungeons) use **declarative SVG + React + framer-motion** via the primitives in `packages/web/src/components/board/` (`BoardSurface`, `BoardLayer`, `BoardSlot`, `BoardArc`, `BoardOverlay`). Sky Team and Pandemic are the two reference ports — see `packages/web/src/games/sky-team/components/board/` and `packages/web/src/games/pandemic/components/board/`. Full decision record and escape-hatch criterion: [`docs/intricate-board-rendering.md`](docs/intricate-board-rendering.md). Card-style games keep using plain React DOM.

### Adding a new game

**For a catalog-only entry** (browse + RSVP voting, no playable surface — covers most additions):

1. Run `pnpm bgg-sync --add` after adding `{ slug, bggId, displayTitle? }` to `scripts/bgg-new-games.json`. It downloads a BGG image, optimizes it, computes the accent hex, and appends a new entry to `packages/core/src/games/catalog.json`.
2. **Thumbnail (required).** The downloaded BGG image is a raw box photo — a *placeholder*, not the finished thumbnail. Add a prompt to the root `PROMPTS.md` (mirror a sibling entry; reuse a family's shared style block if the game belongs to one), generate the 16:9 house-style art, and replace `assets/thumbnail.png`.
3. **Descriptions (required).** Run `pnpm gen-descriptions --slug <slug>` to write the three length variants. Without them the game falls back to BGG's raw HTML description, which reads nothing like the rest of the catalog.
4. No code changes needed — the registry picks it up.

Steps 2 and 3 are not optional: `catalog-completeness.test.ts` fails the build for any catalog game missing its descriptions file or its `PROMPTS.md` prompt, and `bgg-sync --add` prints the same checklist on completion.

**For a playable game**: do the catalog-entry steps above, then:

1. Create `packages/web/src/games/<slug>/index.ts` exporting `satisfies PlayableModule` (component, mode, tournament strategies, etc. — see `types.ts` for the full shape). No base fields (`slug`, `bggId`, `accentHex`, `family`, `displayTitle`, `bggOverrides`) here — those live in `catalog.json` only.
2. If the game has non-trivial logic, put it in `packages/core/src/games/<slug>/` and add exports to core's `package.json`.
3. Register the server-side state machine in `packages/server/src/sessions/machine-registry.ts` (REQUIRED — the server runs every game's machine, including solo-vs-AI) and add the room config in `packages/core/src/protocol/room-config.ts` (for multiplayer rooms / AI seating).
   Registering means your `GameMachineSpec` must implement **`validateAction`** — see "Untrusted actions" below. It is a required member, so this is enforced at compile time; `packages/server/src/sessions/action-validation.test.ts` then fuzzes your game automatically.
4. Use `GameScreen` for the board layout — see "Game board layout structure" above.
