# Testing: verdicts the machine can't sway

A commit must pass or fail on its code. On a laptop that is swapping, on a slow CI runner and on an idle workstation, the same code gets the same verdict. The pre-commit hook may be slower on a busy machine, but it is never red because of it.

## The rules

1. **A default-tier test depends only on code and inputs.** It never depends on how fast the machine is, today's date, unpinned randomness, or the order in which unrelated async work happens to finish.
2. **Time limits only detect hangs.** There is one limit, `HANG_GUARD_MS` in `vitest.shared.ts` (120 s), and it is the same in every mode: quiet, hook, CI. Never pass a per-test timeout or `{ timeout: N }` on a wait.
3. **Wait for a signal, never for a duration.**

   | Waiting for | Use |
   |---|---|
   | A promise you can reach | `await` it, or a `signal()` resolved by the callback (`after-game-over.test.ts`) |
   | Activity-log writes (fire-and-forget) | `await activityWritesSettled()` (`server/src/lib/activity-log.ts`) |
   | React Query to finish before asserting something did *not* happen | `await querySettled(qc)` (`web/src/test/query-client.ts`) |
   | Timers inside the code: game clocks, mock-socket delivery, debounces | `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(ms)` |
   | An xstate actor reaching a state | `waitFor(actor, predicate)` with **no** timeout option (xstate's default is ∞; the hang guard covers a real hang) |
   | A UI element | `findBy*` / `waitFor` (testing-library's limit, see below) |
   | Today's date | `vi.useFakeTimers({ toFake: ["Date"], now: … })` |

4. **Pin randomness.** Use a seed. Where the code under test draws its own seed (a room's deal), make the test hold for every seed. `botc-room.test.ts` picks its nominee from the dealt characters for this reason.
5. **No real threads or processes under a fake clock.** A worker pool or engine answers in real time, which a fake-time loop can't wait for. Under a fake clock, set the pool size env to `0` (`GO_AI_WORKERS`, `CONNECT4_AI_WORKERS`, `HUNGER_AI_WORKERS`, `CHESS_AI_ENGINES`, `BUGHOUSE_AI_ENGINES`), as `sessions/game-contract.test.ts` does. Under test, the live deadlines that stop a hung engine stretch to the hang guard (`server/src/lib/live-deadline.ts`).
6. **Speed, strength and convergence claims go in the heavy tier** (`*.heavy.test.ts`, `pnpm test:heavy`). This covers "answers within 150 ms", "WASM is faster", "beats the heuristic" and "the sampler converges". The heavy tier never gates a commit. Its own CI job reports on it. A default-tier test asserts a count, a result or a reach (`solverInReach`), never an elapsed time.
7. **One React Query client for tests:** `testQueryClient()` (no retries, no GC timers).

`scripts/lint-tests.mjs` (in `pnpm lint` and the pre-commit hook) rejects all of the following in default-tier test files:
- per-test timeouts;
- `performance.now()`;
- `Date.now() - start`;
- sleeps of N > 0 ms;
- `process.env.CI` / `LEFTHOOK`;
- `new QueryClient(` in web tests.

A line that genuinely needs one of these carries `// lint-tests-allow: <rule> — <why>`.

## How a verdict is reached: `scripts/test-run.mjs`

`pnpm test`, the pre-commit hook and each CI test job all run a package's suite through `node scripts/test-run.mjs <pkg>`:

1. **Pass 1** runs the whole suite, with as many workers as free memory allows (`scripts/lib/test-resources.mjs`: `MemAvailable` against a measured cost per worker, at most half the cores). Locally the run is `nice`d. If it's green, that's the end of it.
2. **Pass 2** runs every file that failed again, **alone**: one file, one worker, `VITEST_ARBITRATION=1`. That flag raises web's `findBy`/`waitFor` limit from 10 s to the hang guard. Pass 2 is the verdict:
   - A test that fails alone too fails the run.
   - A test that only failed beside the others is **LOAD-SENSITIVE**. It shows as a yellow warning locally and a `::warning` on CI, and it is appended to `scratch/test-flakes.jsonl`. It never makes a commit red. It is still a bug in the test: `node scripts/test-flakes.mjs` lists them, so make each one wait on a signal, then run `--clear`.
3. A pass-1 crash with no report (an OOM-killed worker, for example) reruns the whole suite one file at a time.

Tests over 10 s are listed too, as `::warning` annotations on CI.

## Proving it: `scripts/test-stress.mjs`

`node scripts/test-stress.mjs [--rounds=3] [--balloon]` keeps every core spinning and runs all three suites round after round. `--balloon` also holds memory until about 1.5 GB is left. The suite passes when every round is green and the flakes log stays empty. Run it after changing test infrastructure, or when the flakes log fills up.

## Measurements (2026-11-05, laptop: 14 cores, 15 GB, swap full)

- **Before:** quiet runs took core 36 s, server 43 s, web 163 s (673 CPU-s, but only 86 s of that in test bodies). The hook failed four times in one afternoon on unrelated data commits.
- **Peak memory per worker:** core ~250 MB, server ~550 MB (engine processes), web ~450 MB.
- **Web's cost is per-file setup, not transforms:**
  - with `experimental.fsModuleCache`: 132 s / 572 CPU-s warm, against 132 s / 596 cold;
  - with dependency pre-bundling (`deps.optimizer.client`): no gain, and 2 files broke;
  - with `pool: "threads"`: 131 s / 620 CPU-s.
  
  None is worth keeping. Turning off animations in tests (`MotionGlobalConfig.skipAnimations`) cut web's test-body time from 86 s to 63 s. The remaining lever would be `isolate: false`, which shares module state between files; that is not taken.
