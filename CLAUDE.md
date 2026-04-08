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
pnpm -r --filter @boardgames/web typecheck   # typecheck single package
```

Scripts in individual packages can be run with `pnpm --filter <pkg> <script>`, e.g. `pnpm --filter @boardgames/server dev`.

Pre-commit hook (lefthook): runs `biome check` on staged files and `pnpm -r typecheck` in parallel.

## Code Style

Biome enforces formatting and linting. Key settings:
- 2-space indent, 100 char line width
- Double quotes, trailing commas, semicolons
- `useImportType: "error"` — use `import type` for type-only imports
- `noUnusedImports: "error"`

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

- **`GameMachineSpec`** (`core/src/machines/types.ts`) — generic interface that all game machines implement: provides player views, legal actions, active player, game result, and game-over detection.
- **`GameDefinition`** (`web/src/games/types.ts`) — registry entry for each game with metadata and a lazy-loaded component. Games have a `mode` of `"remote"` (server-backed via WebSocket) or `"local"` (client-only).
- **Game registry** (`web/src/games/registry.ts`) — auto-discovers games via `import.meta.glob("./*/index.ts")`.

### Current games

| Game | Mode | AI |
|------|------|----|
| Lost Cities | local | MCTS + heuristic strategies |
| Exploding Kittens | local | — |
| Pandemic | local | — |
| Set | local | — |

### Game board layout structure

Every game with a history sidebar uses `HistorySidebar` from `web/src/components/action-log/`. This component owns all shared layout — games must NOT add their own outer wrappers.

**DOM structure (enforced by HistorySidebar):**
```
HistorySidebar outer    flex min-h-0 flex-1 [+ className]
├── Content wrapper     flex min-h-0 min-w-0 flex-1 flex-col px-2 pt-2 sm:px-4 sm:pt-4 [+ contentClassName]
│   └── {children}      game sections directly — NO wrapping div
└── <aside>             w-72 shrink-0 rounded-xl my-2 mr-2
```

**Rules:**
- The top-level game component (e.g. `Durak.tsx`) returns `<GameBoard>` directly — no wrapper div, no extra padding, no extra chrome around it.
- `GameBoard` renders `<HistorySidebar>` as its root element. Game-specific classes go in `contentClassName` (e.g. `"gap-2 mx-auto max-w-2xl"`).
- No bottom padding — the content wrapper uses `pt-2 px-2` / `sm:pt-4 sm:px-4` so the card fan sits flush at the bottom.
- For canvas games (Pandemic), pass `noPadding` to skip padding and flex-col.

**Card game inner layout pattern (children of HistorySidebar):**
```
[header / info bar]       — shrink-0
[board middle]            — flex-1 min-h-0 overflow-y-auto or overflow-hidden
[player hand / card fan]  — shrink-0, always at very bottom
```

The hand MUST use `shrink-0` (not `mt-auto`). The board middle MUST use `flex-1 min-h-0` with an overflow strategy. This ensures viewport-fitting without page scrolling.

### Adding a new game

1. Create `packages/web/src/games/<slug>/index.ts` exporting a `GameDefinition`
2. If the game has non-trivial logic, put it in `packages/core/src/games/<slug>/` and add exports to core's `package.json`
3. No routing changes needed — auto-discovered by the registry
4. If the game has a history sidebar, use `HistorySidebar` — see "Game board layout structure" above
