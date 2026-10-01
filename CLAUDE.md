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
- **Layout constants:** `--layout-nav-h` (`h-nav`, `pt-nav`, `top-below-nav`, `min-h-below-nav`), `--layout-board-rail-w` / `--layout-history-rail-w` (`w-board-rail`, `w-history-rail`), `--layout-fan-h` (`h-fan`) / `--layout-actions-h` (`h-actions`), `--aspect-card` (`aspect-card`), `max-w-modal-full(-xl/-2xl)`. Add a `@utility` pair rather than a `h-[3rem]` at a call site.
- **Captions:** `tracking-label` / `tracking-pill` / `tracking-eyebrow` via `<MicroLabel>` / `<Eyebrow>` / `<Badge>`; never `tracking-wider`.
- New tokens/scales are registered in `lib/cn.ts` (twMerge groups) so `cn()` resolves conflicts.

`scripts/lint-styles.mjs` enforces this (runs in `pnpm lint` + pre-commit): strict rules (stacking, card aspect, red-*) fail on any hit; ratchet rules fail on NEW hits against `scripts/style-baseline.json`. After removing hits run `node scripts/lint-styles.mjs --update` (down-only). `pages/ui-gallery-coverage.test.ts` fails when a `components/ui` export is missing from `/dev/ui`.

**Page primitives:** every route is a route-level `lazy` module under an `<AuthLayout mode>` group in `App.tsx` (never wrap a page in `AuthGuard` yourself); `RouteFallback` / `BoardFallback` are the only loading screens; player-scoped pages (`/u/:userId/*`) render through `PlayerPageFrame` / `PlayerQueryBoundary`. Metrics use `StatTile`; meters `ProgressBar`; search fields `SearchInput`; multi-select rows `CheckRow`; single-pick rows `SelectableCard variant="row"`; dialogs `Modal` (`density="compact"` for canvas dialogs) with `ModalBody` + `ModalFooter`.

## Wire protocol & schema validation

All HTTP, WebSocket, and SSE messages exchanged between `packages/web` and `packages/server` are defined as Zod 4 schemas in `@boardgames/core/protocol/*` and shared as the **single source of truth**. Hand-rolled defensive parsers and `as TheirShape` casts at the wire boundary are forbidden.

**Schema layout:**
- `packages/core/src/protocol/common.ts` — `ErrorResponseSchema`, branded `DateKey`/`IsoTimestamp`/`TimeOfDay`/`GameSlug`.
- `packages/core/src/protocol/http/*.ts` — request/response schemas grouped by feature (`calendar`, `availability`, `inventory`, `games`, `auth`).
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
- **`packages/server`** — Hono HTTP/WebSocket server persisting to **Turso/libsql** (`@libsql/client`, remote-only — there is no local SQLite file and no `better-sqlite3`). Hosts game sessions and rooms, and stores finished matches (`matches/store.ts`: one `game_replays` row per game with its `outcome_json`, `seed` and a `replay_seats` row per seat). It runs no tournaments — see "AI tournaments" below. Schema changes, backups and the migration workflow: [`docs/database-operations.md`](docs/database-operations.md).

### Game structure pattern

Each game follows a consistent split:

**Core** (`packages/core/src/games/<slug>/`):
- `manifest.ts` — `defineManifest(...)`: seat range, seat names, AI strategies (`StrategyInfo` with a difficulty tier and optional seat range), default strategy, and a zod `config` schema whose `{}` parses to the defaults. Browser-safe; listed in `core/src/games/manifests.ts` (`GAME_MANIFESTS`).
- `types.ts` — game state types
- `game-engine.ts` / `rules.ts` — pure functions for state transitions and legal moves. Randomness comes from a seed (`lib/rng.ts`: `rngFrom` / `rngStateFromSeed`), never `Math.random`.
- `machine.ts` — XState state machine implementing `GameMachineSpec` (defined in `core/src/machines/types.ts`)
- `outcome.ts` — maps the game's result to the shared `GameOutcome` (helpers in `core/src/machines/outcome.ts`)
- `scoring.ts` — scoring logic
- `tournament-runner.ts` — optional headless `simulator` for the local tournament CLI
- AI files (e.g. `ai-strategies.ts`, `mcts/`) where applicable

**Web** (`packages/web/src/games/<slug>/`):
- `<GameName>.tsx` — top-level game component
- `index.ts` — `GameDefinition` export (slug, title, description, lazy component)
- `components/` — UI components
- `logic/` — client-side game logic helpers

### Key abstractions

- **Runtime model — every playable game is SERVER-AUTHORITATIVE.** The XState machine *and* its AI run on the **server** (`packages/server/src/sessions/manager.ts` creates one actor per session); the browser only renders server state over a single WebSocket per `/play/:slug`, via `useGameShell` → `useRemoteGame` (solo vs AI) / `useMultiplayerRoom` (rooms). There is **no client-side game loop** for any game. (`useLocalGame` exists *only* for Set's standalone trainer mini-mode.)
- **`GameMachineSpec`** (`core/src/machines/types.ts`) — generic interface every game machine implements: `manifest`, `buildStart({seats, config, seed})` (the ONLY way a START event is made — server-side, in `sessions/start.ts:prepareStart`, which checks seating against the manifest, strict-parses the config and draws the seed), player views, legal actions, active player, `validateAction`, `getOutcome` (shared `GameOutcome`: ranked / coop / teams) and `getReplayLog` (`{ formatVersion, … }`). The server's session manager drives this uniformly for all games; `AnyGameMachineSpec` is the erased form the registry holds.
- **`useSessionFlow`** (`web/src/hooks/useSessionFlow.ts`) — every game component's session state: `phase` (setup / waiting / playing / finished), `view` (kept after game over), `seat`, `seats` / `seatNames` (room seat order respected), `start`, `endActions` (the shared game-over buttons) and `sendAction`. Games render per phase and never touch the transport, seat mapping or navigation. Solo seats are `againstAi(n, strategy)` or an explicit `SeatRequest[]`.
- **One wire envelope** — every game action travels as `{ type: "PLAYER_ACTION", action, player? }` (`PlayerActionEnvelopeSchema`); `player` only claims one of the sender's own human seats (Pandemic solo).
- **`GameDefinition` / `PlayableModule`** (`web/src/games/types.ts`) — registry entry for each game (metadata + lazy component). The `mode` field is `"remote"` for all games today and is **not branched on at runtime** — it's vestigial, kept only for a hypothetical future client-only game. Don't infer "client-side" from it.
- **Dev logging** — `packages/server/src/lib/game-log.ts` (server: session/action/snapshot/AI/game-over) and `packages/web/src/lib/game-log.ts` (client: WS send/recv, dropped sends) emit a unified, dev-only `[game:<slug>]` trace for every game. Use these to debug a stuck/hung session: a gap after `ai-thinking` = slow/blocking AI, a `send DROPPED` = the socket wasn't open.
- **Game registry** (`web/src/games/registry.ts`) — merges three sources:
  1. `core/src/games/catalog.json` — Zod-validated browse-only metadata for *every* game (slug, bggId, accentHex, family, displayTitle, bggOverrides).
  2. `import.meta.glob("./*/index.ts")` — playable extras (component, mode, replay viewer, `tournamentResults`, …); the registry attaches the core manifest as `def.manifest`. Only playable games have an `index.ts`; catalog-only games live entirely in `catalog.json`.
  3. The bundled BGG snapshot + per-game `descriptions.generated.ts` + thumbnail webp.

  Resolved entries are discriminated on `kind: "catalog" | "playable"` — TS narrows playable fields automatically inside `def.kind === "playable"` branches.

### Current games

All 14 playable games are **server-authoritative** (registered in `packages/server/src/games/registry.ts`; seats, strategies and options in each game's `manifest.ts`). The AI runs server-side inside each game's machine via a `fromPromise` actor; external agents (7 Wonders' C++ search, Decrypto's LLM, The Hunger's worker pool) are injected per session with `machine.provide` (`withSevenWondersAgent`, `withDecryptoAgent`), never through module globals. Also playable but not in the table: 7 Wonders (random / C++ search) and Decrypto (LLM agent).

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
| Quiztopia | — (co-op quiz referee for 1–6 humans; solo "Trainer" = spaced-repetition flashcards + wiki over the 177 transcribed cards in `core/src/games/quiztopia/content/`, served as CDN chunks to the web and read from disk by the server) |
| Sensō: Battle for Japan | Kami = Tenka's card play + a max^n search of the whole rewards phase (default, `mcts/`); Tenka = paired PIMC over deals weighted by a learned opponent model, playouts by a net distilled from search; Shōgun = determinized Monte Carlo + one-reward lookahead; Daimyō / Warlord one-ply heuristics; random. Bench: `pnpm --filter @boardgames/core bench -- kami tenka --mirror` (paired seeds; `scratch/bench/kami/NOTES.md` has the ladder's numbers). |
| The Hunger | Full rulebook transcription: `core/src/games/the-hunger/RULES.md` (read it before touching rules or AI). Lilith (`lilith`, top tier "Master"): Dracula whose playouts also let her imagined self play the Rose run (`cpp/the-hunger/src/runner.cpp`, a scripted race out through the Chests to a Rose, Forest hunting and a Parasol-aware budget home, built from the user's winning games) — each plan is scored by its better line (`DraculaConfig.goals`), and she follows her chosen plan without re-searching (`followPlan`); beats Dracula at 3p/4p (+24 / +13.5 paired Δwin), research log in `scratch/bench/hunger/NOTES.md` (incl. the failed neural-net, learned-policy and goal-portfolio attempts; their code stays in the C++ CLI only). Dracula (`dracula`, "Expert"): C++ search (`cpp/the-hunger`, exact TS parity — `make -C cpp/the-hunger test`) run as WebAssembly (`search/wasm-agent.ts`, module embedded by `pnpm build-hunger-wasm`; regenerate after ANY change under cpp/the-hunger/src) — Strigoi's algorithm at ~20× the rollouts plus whole-turn plan arms and a survival-tier margin; beats live-equivalent Strigoi at 2–6p (C++ bench `cpp/the-hunger/build/hg duel`). Strigoi (`strigoi`, `search/`): determinized Monte Carlo — each legal move is played to sunrise in worlds sampled from the seat's view (`search/determinize.ts`, pools sorted so it provably can't peek) with Nosferatu rollouts, budget spent by sequential halving; live rooms run it on a `worker_threads` pool (`server/src/games/hunger-ai-pool.ts`, bound per session with `withHungerAiOffload`; falls back to Nosferatu's move) because it thinks ~1 s. Nosferatu (`heuristic-v1`, `ai-heuristic.ts`): greedy hunting under a Speed budget for the run home; `random`. Search uses `applyUnchecked` (hand-written `search/clone.ts`, ~15× `applyActionPure`). Bench: `pnpm --filter @boardgames/core bench:hunger -- strigoi heuristic-v1 --tables 2,4,6` (each deal paired with an all-Nosferatu replay; notes in `scratch/bench/hunger/NOTES.md`). Missions (all 50), the Starting deck, the 3 Roses, the 22 Familiars, the 80 Humans, the 20 Powers and the 26 Bonus tokens are real. The board is `content/boards/board-a.json`, mapped on the board art with the dev editor at `/dev/hunger-board` (drafts autosave via a dev-only Vite endpoint in `web/dev/hunger-board-plugin.ts`; Publish writes the file the game loads, only when `boardProblems` reports no errors). Side B (Elder) is derived from it in `content/boards.ts` — the printed sides differ only in Mountain survival. Cemetery rules key off the `cemetery` region, not a space type. Rules tests run on the fixed `content/test-board.ts`. Table rulings in `rulings.ts`. |
| The Resistance | Hidden-role team game, 5–10, base + Targeting / Blind Spies (`core/src/games/the-resistance/RULES.md`). Solo card is the **Solver** (`solver/`: exact Bayesian inference over every spy set, hard/soft behavioural assumptions with contradiction relaxing, proofs, best teams, graded misplays from each decider's own perspective, rollout win chance) — for hand-entered tabletop games (`localStorage`), finished online matches and a live per-seat rail in rooms. Bots: `analyst` (plays the Solver's recommendations from its own view; spies decide cards independently — no coordination) and `random`; analyst self-play favours the Resistance. |

> Note: ISMCTS searches currently run on the server's **main thread**, so a heavy search blocks the Node event loop for all sessions. The Hunger is the first game on a worker-thread pool (`server/src/games/hunger-ai-pool.ts`, bound into each session's machine with `withHungerAiOffload`); other games could move onto the same pattern.

### Untrusted actions (server-authoritative safety)

The WS envelope types a game action as `z.unknown()`, so **the spec is what stands between a hostile frame and the engine**. Engines signal an illegal move by throwing, and an XState action that throws with no error observer is re-raised on a macrotask — which is how one malformed frame used to kill the process and every concurrent game with it.

Four layers, outermost first. Adding a game means participating in the first two:

1. **`GameMachineSpec.validateAction(snapshot, player, raw)`** (required) turns an untrusted payload into a machine event or rejects it with a reason. Build it with the helpers in `packages/core/src/machines/action-validation.ts`:
   - `playerActionValidator` — **preferred**. The action must be structurally equal to one the engine enumerated via `getLegalActions`, and the event is rebuilt from the *engine's own object*, so no client bytes reach game logic. Used by every game except pandemic.
   - `envelopeActionValidator` — well-formedness only; the engine adjudicates. Used by **pandemic**, whose UI doesn't drive from `legalActions`.
   `player` is the authenticated seat — build any seat field in the event from it, never from `raw`.
2. **`safeApply(label, fn)`** wraps every engine call inside an `assign`, so an engine throw becomes "move rejected, state unchanged" instead of a dead actor.
3. The session manager subscribes with an **observer object carrying an `error` handler** (`sessions/manager.ts`), so a residual throw ends one session, not the process.
4. `lib/process-guards.ts` catches `uncaughtException` / `unhandledRejection`, surviving isolated faults and exiting only on a burst.

Legality checks are not a substitute for `getLegalActions` being complete: if the UI can construct a legal move the enumeration doesn't list, `playerActionValidator` will reject it. Sky Team's `spend-reroll` and Sushi Go's chopsticks pair are worked examples of handling that in the validator.

### Member activity trail (admin drawer)

What members did, for the admin's per-member drawer. One vocabulary, three consumers:

- **Vocabulary** — `core/src/protocol/http/activity-events.ts`: every event `type` with a zod schema for its `meta` (`ActivityMetaSchemas`), the page-view pages (`PAGE_VIEW_PAGES`), and `parseActivityMeta` (drops a malformed field, never the row). Rows are never rewritten: when a meta shape changes, keep the old fields as optional "legacy" members.
- **Write** — server `lib/activity-log.ts:logActivity(userId, type, meta)`, typed from that vocabulary. Log what the member *did* (a mutation, or a surface via the client's page-view beacon); **never log from a GET handler** — reads happen for many reasons (a modal's accent colour, a sub-page's data) and each read as a visit. Each row is stamped `logged_at_ms` when handled and the trail sorts by it (`sort_ms`, migration 0047), not by insertion id. Settings saves log a diff (`settingsChanges`).
- **Client beacons** — `web/src/lib/page-views.ts` (`reportPageView`, one serial queue per tab so the server's stamps follow the order things happened here), routes classified in `lib/page-classify.ts` (every reachable route should classify — test it in `page-classify.test.ts`). A navigation a greeting's button caused carries `activityNavState(greetingVia(kind))`; a URL tidy-up that isn't a new look carries `quietNavState()`.
- **Read** — `web/src/components/admin/activity/`: `trail.ts` folds several rows of one action into one line (the page a button opened into its "Followed …" line, a card shown into the answer that closed it, repeats into "×N"), `event-labels.ts` / `page-labels.ts` are `Record`s over the whole vocabulary, so **a new type or page without words fails the web typecheck** and `labels.test.ts` fails on a raw id in a line.

Adding an event: schema in `ActivityMetaSchemas` → `logActivity` call → entry in `EVENT_LABELS` (and a tone). Adding a page: `PAGE_VIEW_PAGES` → classifier or component beacon → `PAGE_LABELS`.

### Game board layout structure

Every game board uses `GameScreen` from `web/src/components/game-layout/`. This component owns all shared layout — games must NOT add their own outer wrappers.

**Props:**
- `background` — class on root container (e.g. `"bg-black"`)
- `contentClassName` — extra classes on content area (e.g. `"mx-auto max-w-2xl"`). Gap and padding are built-in.
- `sidebar` — history log content (right rail). GameScreen provides the rail chrome (aside, "History" heading, scroll).
- `leftSidebar` / `leftSidebarTitle` / `leftSidebarLabel` — left rail spanning the board height (score, player list, status track). `leftSidebarTitle` is the wide-screen heading; `leftSidebarLabel` names the phone sheet when the rail draws its own header (durak/exploding-kittens "Players", sky-team "Approach"). Used by lost-cities, durak, exploding-kittens, 7-wonders, sky-team, set, dnd.
- `fan` — card hand component (CardFan, PlayerHand). Pinned to bottom.
- `fanActions` — controls above the card fan (Confirm, Pass/Take, status). The row is a FIXED one-line `h-actions` and the fan slot a FIXED `h-fan`, identical in every game and phase: content fits the space, the board never moves. A game whose hand empties (Sensō's rewards phase) fills the slot with something else (`TricksTray`) rather than dropping `fan`.
- `actionBar` — a game-wide control bar pinned to the very bottom of the column (screen edge to the History rail, below the fan tray), on every view, fan or not. For games whose controls outgrow the one-line `fanActions` row or that show no hand most of the time (The Hunger).
- `noPadding` — skip padding and flex-col (for edge-to-edge SVG boards)
- `mobileRails` — `"sheet"` (default) or `"none"`. See "Phone layout" below.
- `pinSidebars` — legacy escape hatch: rails stay in the row at every width. No game uses it.

**Phone layout (default, no per-game work):** below `lg` (64rem) both rails leave the board row and re-surface in a bottom sheet (`Drawer side="bottom"`) behind a rail bar of pill buttons ("Score"/"History") rendered between the board and the fan tray. The rail content is mounted in exactly one place at a time — the row OR the sheet, decided by `useMediaQuery(WIDE_BOARD_QUERY)` in JS — so stateful rail content is never double-mounted. A game that re-surfaces its rail content inside the board itself (decrypto's `MobilePanels`) passes `mobileRails="none"`. Rail widths are the layout tokens `w-board-rail` / `w-history-rail` (`--layout-board-rail-w`, `--layout-history-rail-w` in `index.css`).

**DOM structure (enforced by GameScreen, wide viewport).** ONE gutter: every block is `gap-2` / `p-2` (8px) from its neighbours and the screen edge, spelled on the containers only — no block carries its own margin or outer padding, so the rails' top and bottom edges line up with the board's top and the fan's bottom, and the gap beside History equals the gap above the action row. A rail's `p-4` is internal.
```
GameScreen outer        relative z-raised flex min-h-0 flex-1 gap-2 p-2 [+ background]
├── Column              flex min-h-0 min-w-0 flex-1 flex-col gap-2
│   ├── Board row       flex min-h-0 flex-1 gap-2
│   │   ├── <aside>     w-board-rail shrink-0 rounded-card-xl bg-surface-900/60 p-4     ← only when leftSidebar is set
│   │   └── Content     flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto lg:overflow-visible [+ contentClassName]
│   │       └── {children}
│   ├── Rail bar        (narrow only) flex shrink-0 gap-2 border-t border-line py-1.5
│   └── Fan area        shrink-0 flex flex-col gap-2   ← only when fan is set
│       ├── {fanActions}   flex h-actions shrink-0 items-center justify-center
│       └── {fan}          flex h-fan shrink-0 items-center justify-center
│   └── Action bar      shrink-0   ← only when actionBar is set
└── <aside>             w-history-rail shrink-0 rounded-card-xl bg-surface-900/60 p-4   ← only when sidebar is set
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

1. Put the game in `packages/core/src/games/<slug>/` (see "Game structure pattern") and add exports to core's `package.json`. Write `manifest.ts` first and add it to `GAME_MANIFESTS` in `core/src/games/manifests.ts`.
2. Implement the full `GameMachineSpec` in `machine.ts`: `manifest`, `buildStart`, `validateAction` (with `playerActionValidator` — see "Untrusted actions"), `getOutcome`, `getReplayLog`. All are required, so a gap fails the compile. The START event takes a `seed`; the engine must not use `Math.random`.
3. Register it in `packages/server/src/games/registry.ts` (REQUIRED — the server runs every game, solo-vs-AI included). Rooms and solo starts then work from the manifest with no further server code. `registry.test.ts` checks the manifest; `sessions/game-contract.test.ts` plays the game to the end at its min and max seat counts (add a move finder there if the first legal action can't finish a game); `sessions/action-validation.test.ts` fuzzes `validateAction`.
4. Create `packages/web/src/games/<slug>/index.ts` exporting `satisfies PlayableModule` (component, mode, replay viewer, `tournamentResults` loader — see `types.ts`). No base fields (`slug`, `bggId`, `accentHex`, `family`, `displayTitle`, `bggOverrides`) here — those live in `catalog.json` only.
5. The game component drives everything through `useSessionFlow`; the setup screen reads seats and strategies from `def.manifest` (`PvAISetupScreen`), the game-over screen renders `flow.endActions`. Match history and replays need nothing game-specific beyond a replay viewer.
6. Use `GameScreen` for the board layout — see "Game board layout structure" above.

### AI tournaments

Tournaments are **run locally, never on the server**. The site only shows their committed results. To run one, export a `simulator` from the game's `tournament-runner.ts`, list it in `core/src/tournament/simulators.ts`, then:

```bash
pnpm --filter @boardgames/core tournament <slug> [--games N] [--players N]
```

The CLI plays paired seeds with seats alternated, fanned over worker processes, and merges into `packages/web/src/games/<slug>/tournament-results.generated.ts` (validated by `TournamentResultsSchema`). It writes nothing if any game failed. Point the game's `index.ts` `tournamentResults` at that file; `TournamentResultsView` renders it.
