# Chess engines — how they run, and why

Classical chess: **Stockfish 19** (`stockfish@19.0.0`, nmrugg's Stockfish.js, the
`stockfish-19-lite-single` build: 1.8 MB WASM, single-threaded, NNUE "lite" net).
Bughouse: **Fairy-Stockfish** (`fairy-stockfish-nnue.wasm@1.1.12`, variant
`bughouse`; pockets in the FEN as `[QPp]`, `P@e4` drops in UCI). Both GPL-3.0,
credited in each game's `rules.pdf`.

## Server: long-lived child processes (`server/src/games/chess-engine-pool.ts`)

- **Not worker threads.** Stockfish.js checks `worker_threads.isMainThread` and,
  inside a worker, switches to its *browser* worker protocol (`onmessage` /
  `postMessage`), so loading it in a Node worker fails ("Could not load the engine
  correctly"). Run directly (`node stockfish-19-lite-single.js`) it is a plain UCI
  CLI over stdin/stdout, so each engine is `spawn(process.execPath, [file])`.
- **Fairy needs its bytes handed over.** Its Emscripten 2.0 loader fetches the
  `.wasm` by URL, and Node ≥18's global `fetch` rejects a file path ("Failed to
  parse URL"). The pool boots it with a `node -e` bootstrap that passes
  `wasmBinary: fs.readFileSync(...)` and pipes stdin lines in as UCI commands.
- Memory (RSS, measured): Stockfish lite ≈ 130 MB per process; Fairy ≈ 360 MB
  (pthreads build reserves its heap up front). Hence defaults
  `CHESS_AI_ENGINES=2`, `BUGHOUSE_AI_ENGINES=1`; `Hash` is set to 16 MB.
- Both exit when stdin closes, so an engine never outlives the server.
- `UCI_Elo` accepts 1320–3190; the lowest tier (`sf-beginner`) is `Skill Level 0`
  at `depth 1` instead.
- Speed (laptop): Stockfish lite reaches depth 14 in ~150 ms from the start
  position; Fairy bughouse depth 9 in ~50–160 ms.

## Browser: post-game analysis (`web/src/games/chess/analysis/engine.ts`)

The same lite single-threaded Stockfish runs in a Web Worker (no SharedArrayBuffer,
so no COOP/COEP headers on Vercel). Stockfish.js reads its `.wasm` URL from the
worker URL's hash: `new Worker(\`${engineUrl}#${encodeURIComponent(wasmUrl)}\`)`,
both imported with Vite's `?url`. Loaded only when a player presses "Analyse".
A 7-move game analyses at depth 14 in ~2.5 s.

## Opening trainer (`web/src/games/chess/trainer/engine-provider.ts`)

A tree's engine choices try lichess's cloud eval first (up to move 12, when it
is as deep as the tree asks and has enough lines), then the browser Stockfish
above at the tree's depth. Cloud evals and the explorer write castling as the
king taking its rook (`e1h1`); `normalizeUcis` turns that back into `e1g1`.
"Most popular" is the lichess explorer's database (every rating and speed);
it needs the lichess OAuth token (401 without).

## Fallback

`fallback-ai.ts` (alpha-beta, material + piece-square tables, quiescence) plays
the `random` strategy, every strategy in tests, and any move the engine fails to
give (pool disabled, crashed, timed out, or an illegal reply).

## Not done (yet)

- A local AI tournament (`tournament-runner.ts`): `TournamentSimulator.simulate`
  is synchronous and the engines are async child processes owned by the server
  package. The ladder leans on Stockfish's own `UCI_Elo` calibration instead.
- Bughouse bots don't coordinate with their partner (no "sit"/"go" logic).
