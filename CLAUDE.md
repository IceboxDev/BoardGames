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

Pre-commit hook (lefthook): runs `biome check` on staged files and the style guard, then `scripts/pre-commit-checks.mjs` — two lanes (typechecks one at a time beside test suites one at a time), only for the packages the staged files can break (core or root config → all three; web or server → itself). Never all suites at once: that was ~40 vitest workers and starved the machine.

Pre-push hook: `scripts/check-live-games.mjs` reads production `/api/health` (`liveGames`) and refuses the push while a Blood on the Clocktower room game is live — a deploy ends every live game (sessions are process memory). `ALLOW_LIVE_DEPLOY=1 git push` overrides; an unreachable health check never blocks.

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
- **`packages/server`** — Hono HTTP/WebSocket server persisting to **Turso/libsql** (`@libsql/client`, remote-only — there is no local SQLite file and no `better-sqlite3`). Hosts game sessions and rooms, and stores finished matches (`matches/store.ts`: one `session_replays` row per game with its `outcome_json`, `seed` and a `replay_seats` row per seat; the table-companion tools' finished games / sessions go to `companion_records` via `matches/companion-store.ts`). It runs no tournaments — see "AI tournaments" below. Schema changes, backups and the migration workflow: [`docs/database-operations.md`](docs/database-operations.md).

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
- **`useSessionFlow`** (`web/src/hooks/useSessionFlow.ts`) — every game component's session state: `phase` (setup / waiting / playing / finished), `view` (kept after game over), `seat`, `seats` / `seatNames` (room seat order respected; each seat's `image` is a person's profile picture — a room slot's server-set `avatarUrl`, served by `GET /api/avatars/:userId?v=` from `lib/player-avatars.ts`, looked up when the seat is taken or retaken; in solo, the player's own), `start`, `endActions` (the shared game-over buttons) and `sendAction`. Games render per phase and never touch the transport, seat mapping or navigation. Solo seats are `againstAi(n, strategy)` or an explicit `SeatRequest[]`.
- **One wire envelope** — every game action travels as `{ type: "PLAYER_ACTION", action, player? }` (`PlayerActionEnvelopeSchema`); `player` only claims one of the sender's own human seats (Pandemic solo).
- **`GameDefinition` / `PlayableModule`** (`web/src/games/types.ts`) — registry entry for each game (metadata + lazy component). Every game is server-authoritative; there is no per-game "local" mode. The mode picker (`ModeSelect`) is one screen for all games: the solo card comes from `soloMode` (`ai` / `trainer` / `companion` / `solver` — identical within a group), the Multiplayer card is the same everywhere (disabled + "Coming soon" with `multiplayerComingSoon`), Match History is always there, How to Play needs `rulesUrl` (an imported `assets/*.pdf`), AI Tournament needs `tournamentResults`. `ModeSelectRoute.test.tsx` pins this for the whole registry, including "every game has a rulebook" and "every game with AI has a tournament".
- **`ServerGame.afterGameOver`** (`server/src/games/registry.ts`) — a game's own follow-up writes once a session is over and its match saved, run by the session manager after the players' game-over frame, isolated (a throw is logged, never reaches the session) and required to be idempotent. Quiztopia uses it to record every judged table question as a trainer review for the seats it tested (`server/src/lib/quiztopia/game-reviews.ts`, policy in `core/games/quiztopia/game-reviews.ts`); clients cannot post game reviews.
- **Trainer review outbox** (`web/src/lib/review-outbox.ts`) — the one durable queue for trainer grades (Quiztopia, Geography): cross-tab Web Locks, removal by id, backoff replay, and `classifySendFailure` as the single rule for what a failed send means (only 400/404/410/413/422 drop a review; 401/429/5xx/offline keep it). A trainer's live submits use the same classifier. A progress reset runs inside `outbox.exclusive`.
- **AI ledger** (`server/src/lib/ai/ledger.ts`) — every `structuredGenerate` call is recorded: one `[ai]` log line (model, tokens, the gateway's billed cost, time, call id), per-feature totals since boot (`aiSpendTotals`), the last 200 calls in memory, and — off the deployed server, or wherever `AI_TRACE_DIR` points — the full prompt and answer appended to `scratch/ai-traces/<date>.jsonl`. `structuredGenerateTraced` also returns the call's record, so a caller can keep cost and ids with what the answer became.
- **Dev logging** — `packages/server/src/lib/game-log.ts` (server: session/action/snapshot/AI/game-over) and `packages/web/src/lib/game-log.ts` (client: WS send/recv, dropped sends) emit a unified, dev-only `[game:<slug>]` trace for every game. Use these to debug a stuck/hung session: a gap after `ai-thinking` = slow/blocking AI, a `send DROPPED` = the socket wasn't open.
- **Game registry** (`web/src/games/registry.ts`) — merges three sources:
  1. `core/src/games/catalog.json` — Zod-validated browse-only metadata for *every* game (slug, bggId, accentHex, family, displayTitle, bggOverrides).
  2. `import.meta.glob("./*/index.ts")` — playable extras (component, solo mode, rulebook, replay viewer, `tournamentResults`, …); the registry attaches the core manifest as `def.manifest` and `assets/background.png` (when present) as `def.backgroundImage`. Only playable games have an `index.ts`; catalog-only games live entirely in `catalog.json`.
  3. The bundled BGG snapshot + per-game `descriptions.generated.ts` + thumbnail webp.

  Resolved entries are discriminated on `kind: "catalog" | "playable"` — TS narrows playable fields automatically inside `def.kind === "playable"` branches.

### Current games

Every playable game is **server-authoritative** (registered in `packages/server/src/games/registry.ts`; seats, strategies and options in each game's `manifest.ts`). The AI runs server-side inside each game's machine via a `fromPromise` actor; external agents (7 Wonders' C++ search, Decrypto's LLM, The Hunger's worker pool) are injected per session with `machine.provide` (`withSevenWondersAgent`, `withDecryptoAgent`), never through module globals. Also playable but not in the table: 7 Wonders (random / C++ search) and Decrypto (LLM agent).

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
| Quiztopia | — (co-op quiz referee for 1–6 humans; solo "Trainer" = spaced-repetition flashcards + wiki over the 177 transcribed cards in `core/src/games/quiztopia/content/`, served as CDN chunks to the web and read from disk by the server). Content reports: a flag on every question/article surface → `quiztopia_reports` (member: "Your reports" at `wiki/reports`; admin: `/admin?tab=reports`, whose "Copy fix brief" names the content file, JSON location and card photo — content is fixed at the source, never in the browser) |
| Sensō: Battle for Japan | Kami = Tenka's card play + a max^n search of the whole rewards phase (default, `mcts/`); Tenka = paired PIMC over deals weighted by a learned opponent model, playouts by a net distilled from search; Shōgun = determinized Monte Carlo + one-reward lookahead; Daimyō / Warlord one-ply heuristics; random. Bench: `pnpm --filter @boardgames/core bench -- kami tenka --mirror` (paired seeds; `scratch/bench/kami/NOTES.md` has the ladder's numbers). |
| The Hunger | Full rulebook transcription: `core/src/games/the-hunger/RULES.md` (read it before touching rules or AI). Lilith (`lilith`, top tier "Master"): Dracula whose playouts also let her imagined self follow a plan — the Rose run at 2–4p (`cpp/the-hunger/src/runner.cpp`, built from the user's winning games) and at 5–6p a plan FOUND by CMA-ES over the 14-number executor (`src/exec.cpp`, `train/exec_opt.py`; the numbers live in `search/dracula.ts` `LILITH_PLAN_5P/6P`, `lilithForTable`). Each plan is scored by its better line (`goals`), each plan's own moves are also candidates (`goalArms` — without it the capped Nosferatu-first plan list never offers them at big tables), and she follows her chosen plan without re-searching (`followPlan`). Beats Dracula at every size: +19.5 / +39.5 / +51.5 / +44.0 / +42.5 paired Δwin at 2–6p (200 held-out deals each); research log incl. the failed neural-net / learned-policy / crude-portfolio attempts in `scratch/bench/hunger/NOTES.md` (their code stays in the C++ CLI only). Dracula (`dracula`, "Expert"): C++ search (`cpp/the-hunger`, exact TS parity — `make -C cpp/the-hunger test`) run as WebAssembly (`search/wasm-agent.ts`, module embedded by `pnpm build-hunger-wasm`; regenerate after ANY change under cpp/the-hunger/src) — Strigoi's algorithm at ~20× the rollouts plus whole-turn plan arms and a survival-tier margin; beats live-equivalent Strigoi at 2–6p (C++ bench `cpp/the-hunger/build/hg duel`). Strigoi (`strigoi`, `search/`): determinized Monte Carlo — each legal move is played to sunrise in worlds sampled from the seat's view (`search/determinize.ts`, pools sorted so it provably can't peek) with Nosferatu rollouts, budget spent by sequential halving; live rooms run it on a `worker_threads` pool (`server/src/games/hunger-ai-pool.ts`, bound per session with `withHungerAiOffload`; falls back to Nosferatu's move) because it thinks ~1 s. Nosferatu (`heuristic-v1`, `ai-heuristic.ts`): greedy hunting under a Speed budget for the run home; `random`. Search uses `applyUnchecked` (hand-written `search/clone.ts`, ~15× `applyActionPure`). Bench: `pnpm --filter @boardgames/core bench:hunger -- strigoi heuristic-v1 --tables 2,4,6` (each deal paired with an all-Nosferatu replay; notes in `scratch/bench/hunger/NOTES.md`). Missions (all 50), the Starting deck, the 3 Roses, the 22 Familiars, the 80 Humans, the 20 Powers and the 26 Bonus tokens are real. The board is `content/boards/board-a.json`, mapped on the board art with the dev editor at `/dev/hunger-board` (drafts autosave via a dev-only Vite endpoint in `web/dev/hunger-board-plugin.ts`; Publish writes the file the game loads, only when `boardProblems` reports no errors). Side B (Elder) is derived from it in `content/boards.ts` — the printed sides differ only in Mountain survival. Cemetery rules key off the `cemetery` region, not a space type. Rules tests run on the fixed `content/test-board.ts`. Table rulings in `rulings.ts`. |
| The Resistance | Hidden-role team game, 5–10, base + Targeting / Blind Spies (`core/src/games/the-resistance/RULES.md`). Solo card is the **Solver** (`solver/`: exact Bayesian inference over every spy set, hard/soft behavioural assumptions with contradiction relaxing, proofs, best teams, graded misplays from each decider's own perspective, rollout win chance) — for hand-entered tabletop games (`localStorage`), finished online matches and a live per-seat rail in rooms. Bots: `analyst` (plays the Solver's recommendations from its own view; spies decide cards independently — no coordination) and `random`; analyst self-play favours the Resistance. |
| Codenames | Team word game, 4–8 (`core/src/games/codenames/RULES.md`). Roles come from the **seat index** (`seating.ts`: 0/1 = Red/Blue spymaster, then alternating operatives), so rooms pick teams by seat (see "Lobby seat picking"). Our own EN/DE word lists (`words/`); clue legality is mechanical and shared by server, AI and the web composer (`clue-rules.ts`). Team chat (spymasters read-only) and pointers are game actions, shown only when another person sits on your team; optional clue/guess timers. AI: Decrypto-style LLM tiers `codenames-medium/hard/expert` (`server/src/games/codenames-agent.ts`, env `CODENAMES_MODEL_*`, `withCodenamesAgent`), deadline-raced and sanitized, deterministic stand-in without a key (the board shows an "AI offline" badge when it played). Strategy: a prompt playbook plus the position's read from `ai/situation.ts` (the +1 guess and leftovers, ∞/0 clues, the endgame race, the other side's misses); the spymaster gives one idea per size (4/3/2/1 words, `ideaSizes`) in one answer, and the Mastermind test-reads every idea through a keyless operative model and keeps the one that reads best (`readScore`: the read is played like an operative — later picks only while the reader is ≥ 50 % sure — a miss priced by what it hits, and each target it didn't find held against the clue; the spymaster's own pick gets +0.3). Targets are only the team's own agents and never one the spymaster rated a `stretch` (`toCandidate`; the core sanitizer drops any other card too). Thinking effort is low for every tier (medium was tried: 45–110 s clues in production; `CODENAMES_CLUE_REASONING_EFFORT` overrides); the clue call is capped (58 s, then a quick call) inside the machine's 90 s deadline. German clues are told to keep umlauts/ß. Admins read recent AI calls in full (prompt, answer, cost) at `/api/admin/ai-calls[/:id]`, on production too (in memory, cleared by a deploy). Each clue names its targets with a short reason per word, and a word still owed from an earlier clue goes to the +1 guess, not into the new clue's number (`toCandidate`, enforced in code). The operative's AI input has no key field at all. **Notes** (`notes.ts`): every clue keeps what it meant (targets, reasoning, alternatives, test read — a person's from the cards they tap while composing) and every AI guess its confidence and why; a clue's note is as secret as the key (own spymaster, or all at game over). Notes also carry each answer's billed cost and AI ledger ids; the replay log has the game's total `aiCost`, logged at game over. The game-over debrief and replays share `components/review/ReviewScreen.tsx` (highlights, race chart, turn cards, board per turn); fixtures at `/dev/codenames-preview?scene=…`. |
| Codenames: Duet | Co-op for 2 (`core/src/games/codenames-duet/RULES.md`), sharing Codenames' board, clue rules, words and AI (`withDuetAgent`). Two-sided key, timer tokens (7–11), sudden death; each seat sees only its own side. Same notes and debrief (`buildDuetReview`). |
| Chess | Own rules engine (`core/src/games/chess/engine/`: pure functions, perft-verified to depth 5–6, SAN/FEN/UCI/PGN, every FIDE draw rule — fivefold/75-move automatic, threefold/50-move claimable). Server-side clocks (Fischer increment; the flag is a delayed transition re-armed per turn), resign, draw offers, takebacks (instant vs AI, by consent vs people), claim-win after a 60 s disconnect. AI ladder: Stockfish 19 (lite WASM) as long-lived **child processes** on `server/src/games/chess-engine-pool.ts` (`CHESS_AI_ENGINES`), tiers by `UCI_Elo` 1400–2700 + full strength, bound with `withChessAgent`; `fallback-ai.ts` alpha-beta plays `random` and covers any engine failure. Post-game analysis runs the same Stockfish in a browser Web Worker (eval bar/graph, best-move arrows, ?!/?/?? grades, accuracy). Why child processes, not workers: `chess/ENGINE-NOTES.md`. **Opening trainer** (the mode picker's Trainer card, `/play/chess/solo/trainer`, `web/src/games/chess/trainer/`): connects lichess by OAuth PKCE in the browser (the token stays there; the server only reads its account once), imports every standard game into `chess_imported_games` (migration 0055, routes `server/src/auth-routes/chess-trainer.ts`), and builds personal opening trees with `core/games/chess/trainer/builder.ts` — rules in its header (all moves played against you, padded to 3 by engine/most-popular, lines grow while some game still follows the tree; resumable from the cached tree) — in a Web Worker. The trainer is ONE board screen (`trainer/board/BoardScreen.tsx` on `GameScreen`): a folder rail (your own folders and saved lines under White/Black — `core/games/chess/trainer/library.ts`, one versioned doc per member in `chess_trainer_library`, migration 0057, `TreeView` from components/ui), the board (free moves, position in the URL `?side&line&ply`; "★ Make it my move" sets a tree choice and rebuilds), and a move explorer (tree / your games via the build worker's `stats` / lichess DB / engine in one table). One tree per colour, auto-created and built in the background. "Best move" is `BEST_MOVE_V1` (`trainer/eval-policy.ts`: Stockfish single-PV to a depth tiered by how many of your games reach the position, d38–50; candidates re-searched with `searchmoves`; Lc0 W−L breaks ties within 15 cp; opponents MultiPV 3), computed by the **analysis farm**: positions queue in `chess_eval_jobs` (migration 0056, `POST /api/trainers/chess/evals`), a worker on ws21 (`server/src/scripts/chess-farm/`, README there; `/api/chess-farm/*` behind `CHESS_FARM_TOKEN`) claims them, reuses lichess cloud / ChessDB when deep enough, and fills the shared `chess_position_evals` cache; builds park `awaiting-eval` positions and rebuild in waves. Popular = lichess explorer (needs the token). |
| Chess Bughouse | 4 seats, 2 boards, teams {0,3} v {1,2} (`core/src/games/chess-bughouse/`), reusing the chess engine with pockets and drops; captures go to the partner's pocket, promoted pieces return as pawns; first mate/flag/resign on either board ends it (`teams` outcome). Both boards play at once (`getActivePlayer` -1) in a **parallel** machine — one region per board with its own flag timer and AI. Partner signals ("Need ♞", "Sit!") are game actions seen by the team only. Bots: Fairy-Stockfish (`BUGHOUSE_AI_ENGINES`, ~360 MB each) via `withBughouseAgent`. |
| Connect 4 | 7×6 / 6×5 / 8×7, optional PopOut, best-of-1/3/5 series, resign (`core/src/games/connect-4/RULES.md`). Ladder: Blocker (win/block in one), Lookahead (alpha-beta 6 ply), Deep Search (iterative deepening, node-budgeted), Perfect (exact Pons-style bitboard solver, `solver/bitboard-solver.ts`, hi/lo 32-bit halves; picks uniformly at random among moves within a disc of the best — a win one disc later, a defence one disc shorter, only the best within 2 discs of the end — `analysis.ts:nearBestMoves`, so it never changes a result yet varies game to game). **Opening books** make 6×5 and 7×6 exact from the first disc (`solver/book.ts`: every position up to N discs, a perfect hash, 2 bytes a position, base64 modules `solver/books/<board>.gen.ts` loaded on demand with `loadOpeningBook(s)` — the server's AI workers, the tournament CLI and the browser's solver worker load them; sync callers without one just search). Build: `pnpm --filter @boardgames/core c4-book -- --board 7x6 --depth 10` (native `solver/native/c4solve.c` via gcc, fanned over cores, checkpointed in `scratch/c4-book/`; only the deepest level is searched — a few CPU-hours — the rest is backed up by negamax; every entry verified). 8×7 has no book (too big): exact from ~disc 14, the deep search's suggestion before, and the UI says so; PopOut is never solved (positions repeat). Deep Search and Perfect think on a worker pool (`server/src/games/connect4-ai-pool.ts` on the generic `worker-pool.ts`, `withConnect4AiOffload`; falls back to Lookahead). Every budget is a node count, so seeded games replay exactly. Every search past the book runs on the C engine as WebAssembly (`solver/native/c4core.h` — shared with the book builder's `c4solve.c` — via `c4wasm.c`, embedded by `pnpm --filter @boardgames/core c4-wasm` into `solver/wasm/c4-wasm.gen.ts`; wasi-sdk 34 in `~/.local`, as for The Hunger; ~5× the JS solver, which remains the fallback and the parity reference, `wasm-engine.test.ts`). Hints, the eval bar (quick win/draw/loss, then exact), every column's outcome (`evaluateColumns`) and post-game grades run the same solver in one shared browser worker (`web/src/games/connect-4/logic/solver-client.ts`): one position or one move per job, by priority (what's on screen → the analysis → likely-next → background), grades cached per move by the game's prefix, so the background grading during play (`useBackgroundAnalysis`) is exactly what the game-over screen asks for. The game-over screen and match-history replays share one **analysis board** (`components/analysis/AnalysisBoard.tsx`): ply = the position *after* that many moves, `#7` chips (that colour wins with their 7th disc from here) over every column, a who-was-winning graph, per-move stories (win → draw, slower win, only move), key moments, what-if side lines and "learn from your mistakes" — state in `logic/useAnalysisBoard.ts` (a reducer), rules in `logic/analysis-model.ts`, words in `logic/text.ts`. Replays are rebuilt by the engine (`replay-log.ts:replayPositions`). |
| Go | Chinese area scoring, positional superko, handicap, komi, Fischer / byo-yomi clocks (`core/src/games/go/RULES.md`). Seat = colour (seat 0 Black). Scoring phase: dead-stone proposal → toggle / accept (keyed) / resume; 3 resumes lock to "all alive". Engine `game.ts` (pure, reference) + `fast/fast-board.ts` (mutable, parity-tested). Bots: Pebble (`heuristic`, one ply, inline) and Brook (`mcts`, UCT+RAVE, on the `go-ai-worker` pool via `games/worker-pool.ts`); `katago-5k/-1k/-5d` sample KataGo's human-style policy for that rank, `katago-max` searches (`server/src/katago/`, `withGoAi(goServerAi())`), each falling back to Brook with an "engine fallback" badge when KataGo is absent. KataGo runs as the separate `katago` Railway service (`docker/katago/Dockerfile`, `katago/bridge.ts`; env `KATAGO_URL` + `KATAGO_BRIDGE_SECRET`) or locally (`KATAGO_BIN` + `KATAGO_MODEL` [+ `KATAGO_HUMAN_MODEL`]). Every finished match is queued for a KataGo review (`go_reviews`, migration 0052, runner `games/go-reviews.ts`); members import SGFs at `/go/review`. Dev lab `/dev/go-preview`. Bench: `pnpm --filter @boardgames/core tournament go --strategies heuristic,mcts` (KataGo tiers aren't local-runnable). |
| Blood on the Clocktower | Stand-in bots only (`online/bots.ts`, strategy `dummy` — scripted placeholders for a real AI later; a bot player decides from its own `playerView`, the bot Storyteller from the whole game; `nextBotPlan`/`runBotPlan`, paced by the machine's one timer). The day runs on public timers (`timer` Storyteller action: discussion → nominations → defence per nomination → dusk) and players' `ready`; the bot Storyteller moves on when a timer runs out or every person is ready. The web names each part in `online/day-parts.ts` (phase track, announcement card, centre of the square). Companion card = the phone **companion** for a table game (`web/.../companion/`, client-only). Singleplayer card (`solo/bots`) = the online game alone, as the Storyteller or a player, every other seat a bot. Rooms = the **fully online** game (TB + BMR): room seat 0 is the Storyteller (`manifest.seatNames`), 6–21 seats. Truth = the companion's `CompanionState`, edited only through typed Grimoire actions (`core/.../actions.ts`, one per reducer — `actions.test.ts` fails on a reducer without one). Online layer `core/.../online/`: `state.ts` (room seat vs chair: `CompanionPlayer.roomSeat`), `apply.ts` (`applyOnline`, pure; the validator dry-runs it; player moves are judged on PUBLIC facts only — `publicLife`, never the Grimoire — so a refusal can't leak; Storyteller moves carry `rev`), `view.ts` (the only path secrets travel — `online.test.ts` scans every player view after every step), `setup-stage.ts` (digital deal from the seeded bag), `resolutions.ts` (a woken player's answer → one-click Grimoire edits); `wake-prompts.ts` / `info.ts` (what a woken player is asked / told, truth pre-filled). Undo winds back the truth only; what the town saw stays, struck through. Outcome `teams` with `moderatorSeats: [0]` (`seatResult` "moderator", migration 0054). The Storyteller's own history also gets a `companion_records` row (`server/src/games/botc-records.ts`). No live persistence — see the pre-push hook. Hot-seat sandbox `/dev/botc-online?scene=setup|reveal|night|day|over&players=N&seat=S`. |

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

**Off-turn actions and seat connections.** Rooms reject an action from a seat that isn't `getActivePlayer` unless the spec's optional `acceptsOffTurn(snapshot, seat, raw)` says it is one a waiting seat may send (resigning, answering an offer; chess and Go use it) — `validateAction` still adjudicates it. A game that must react to players leaving sets `observesConnections` on its `ServerGame` entry: the room manager then sends the machine `{ type: "SEAT_CONNECTION", seat, connected }` on every drop/return (`manager.ts:seatConnectionChanged`); chess and bughouse arm a 60 s `ABANDON_READY` timer from it to offer `claim-win`.

### Lobby seat picking

A game whose seats are roles (`manifest.seatNames`) takes its roles from the packed seat index, and rooms choose who sits where through the synced `RoomState.seatOrder`. A lobby config can't do this, because the config is host-only and never syncs.
- `swap-seats`: the host may swap any two slots. A guest may swap only **their own slot with an AI-held one**, which is how they take a bot's seat.
- `shuffle-seats`: host only. It permutes the filled slots' seats; open slots keep their ranks (`room-manager.ts`, tested in `room-seat-picking.test.ts`).
- In rooms with three or more slots, `Lobby.tsx` lists rows in seat order, gives each one a "Swap seat…" control and shows the host a "Shuffle seats" button. Two-seat games keep the single swap button.
- `rematch-room` (host, after the game): the next game starts at once with the same seats, AI and the options the last one started with (`Room.lastConfig`), and needs every person still connected. `rotateBy` moves seats first (`rotatedFrom`: wraps within seats `by` apart, so teams by seat parity survive odd tables); a game offers rotations through `PlayableModule.rematchRotations` (Codenames: "Rotate spymasters", 2). `useSessionFlow` gives the host Rematch + rotations and guests `waitingForHost`.

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
- `backdrop` — a CSS `background-image` under the whole board (a texture or a soft glow), drawn over `background` (7 Wonders' faint lamp glow)
- `contentClassName` — extra classes on content area (e.g. `"mx-auto max-w-2xl"`). Gap and padding are built-in.
- `sidebar` — history log content (right rail). GameScreen provides the rail chrome (aside, "History" heading, scroll).
- `leftSidebar` / `leftSidebarTitle` / `leftSidebarLabel` — left rail spanning the board height (score, player list, status track). `leftSidebarTitle` is the wide-screen heading; `leftSidebarLabel` names the phone sheet when the rail draws its own header (durak/exploding-kittens "Players", sky-team "Approach"). Used by lost-cities, durak, exploding-kittens, 7-wonders, sky-team, set, dnd.
- `fan` — card hand component (CardFan, PlayerHand). Pinned to bottom.
- `fanActions` — controls above the card fan (Confirm, Pass/Take, status). The row is a FIXED one-line `h-actions` and the fan slot a FIXED `h-fan`, identical in every game and phase: content fits the space, the board never moves. A game whose hand empties (Sensō's rewards phase) fills the slot with something else (`TricksTray`) rather than dropping `fan`.
- `actionBar` — a game-wide control bar pinned to the very bottom of the column (screen edge to the History rail, below the fan tray), on every view, fan or not. For games whose controls outgrow the one-line `fanActions` row or that show no hand most of the time (The Hunger). Build it with `GameActionBar` (`start` / centred children / `end`) — the slot itself is a bare wrapper and centres nothing.
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
4. Create `packages/web/src/games/<slug>/index.ts` exporting `satisfies PlayableModule` (component, `soloMode` when not `ai`, `rulesUrl` from `assets/rules.pdf`, replay viewer, `tournamentResults` loader — see `types.ts`). No base fields (`slug`, `bggId`, `accentHex`, `family`, `displayTitle`, `bggOverrides`) here — those live in `catalog.json` only.
5. The game component drives everything through `useSessionFlow`; the setup screen reads seats and strategies from `def.manifest` (`PvAISetupScreen`), the game-over screen renders `flow.endActions`. Match history and replays need nothing game-specific beyond a replay viewer.
6. Use `GameScreen` for the board layout — see "Game board layout structure" above.

### AI tournaments

Tournaments are **run locally, never on the server**. The site only shows their committed results. To run one, export a `simulator` from the game's `tournament-runner.ts`, list it in `core/src/tournament/simulators.ts`, then:

```bash
pnpm --filter @boardgames/core tournament <slug> [--games N] [--players N]
```

The CLI plays paired seeds with seats alternated, fanned over worker processes, and merges into `packages/web/src/games/<slug>/tournament-results.generated.ts` (validated by `TournamentResultsSchema`). It writes nothing if any game failed. Point the game's `index.ts` `tournamentResults` at that file; `TournamentResultsView` renders it.
