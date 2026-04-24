# Sushi Go AI Strategy Analysis

Analysis of why the Nash equilibrium AI barely outperforms minimax (+1 avg point, 57% win rate) despite being the theoretically correct model for simultaneous-move games.

## Game Properties (2-Player)

- 3 rounds, 10 turns per round, 10-card starting hands
- Simultaneous card selection each turn
- **Turn 1**: opponent's hand is hidden (imperfect information)
- **Turn 2+**: both hands fully visible after first swap (`machine.ts:235`)
- Hands rotate left after each turn
- Only cross-round state: accumulated pudding count
- Pudding scored at game end only: +6 for most, no penalty for fewest (2-player rules)

## Why Nash Barely Beats Minimax

### 1. Most positions have pure-strategy equilibria

With perfect information from turn 2 onward, most turns have a clearly dominant action (complete a set, take the high-value nigiri, etc.). In these positions Nash and minimax produce the **same move**. The simultaneous-move advantage only matters in the minority of states where genuinely mixed equilibria exist — typically blocking/defense situations where neither player has a dominant choice.

### 2. Mixed strategy sampling introduces variance

`nash.ts` randomly samples from the computed mixed strategy each turn. This is *correct* for game-theoretic optimality — it's what makes Nash unexploitable. But it means individual games have high variance. With +1 avg advantage and ~5-6 point std dev, the 57% win rate follows directly from the statistics.

### 3. Minimax's sequential assumption is pessimistic, not wrong

Minimax models P0 picking first, then P1 responding optimally (`minimax.ts:148-160`). This is incorrect for simultaneous play but makes minimax **overly conservative** — it assumes the opponent always sees and counters its choice. In a game where most positions have dominant strategies anyway, pessimism rarely costs much.

## Shared Weaknesses (Both AIs)

These dominate the Nash-vs-minimax difference and explain why a human can beat both.

### Turn 1 heuristic is context-blind

Both AIs use an identical static card-value lookup for turn 1 (`nash.ts:596-623`, `minimax.ts:79-108`). No consideration of hand composition:

- Wasabi is always the top pick (value 4) even with zero nigiri in hand
- Sashimi is always 3.3 even with 4 sashimi visible (near-guaranteed set completion)
- Tempura is always 2.5 regardless of count
- No synergy awareness (wasabi + squid in same hand should boost wasabi value)

Turn 1 is the highest-impact decision: largest hand, maximum options, and the only turn with hidden information.

### Single-round evaluation only

Each round is solved independently. The cache resets on round boundaries (`nash.ts:88-92`, `minimax.ts:50-53`). The evaluation function (`evaluate.ts`) scores only the current round's tableau plus a pudding heuristic. No consideration of:

- **Cumulative score**: should play aggressive when behind, conservative when ahead
- **Expected future value**: round 1 evaluation should account for 2 more rounds of play
- **Risk adjustment**: when losing, high-variance strategies (sashimi triples) become more attractive than safe points (nigiri)

### No opponent modeling

Neither AI adapts to the opponent's observed behavior. Both play the same theoretical strategy regardless of what the opponent does. A human can recognize patterns (opponent hoards maki, opponent ignores pudding) and exploit them.

## Experiment Log

Tournament results (50-game batches, Nash vs Minimax):

| Run | Change | Nash WR | Avg Diff | Notes |
|-----|--------|---------|----------|-------|
| Baseline | R3 pudding fix only | 48.0% | -0.12 | |
| Iter 1 | Deterministic argmax | 56.0% | +1.26 | **Reverted** — overfits to beating minimax specifically |
| Iter 1 confirm | same | 50.0% | -0.30 | Confirms high variance in 50-game samples |
| Iter 2 | + context-aware turn 1 | 44.0% | -0.10 | **Reverted** — hurt because wasabi value depends on future rotated hands, not just current hand |

### Key learnings

- **Deterministic play is anti-opponent, not optimal.** Playing argmax of Nash weights helps against minimax specifically but abandons the theoretical guarantee that makes Nash correct. The mixed strategy IS the optimal play — it's what prevents any opponent from exploiting you.
- **Context-aware turn 1 backfired.** Devaluing wasabi when no nigiri are in the current hand is wrong because the hand rotates — nigiri in the *opponent's* hand will arrive in turn 2. The static heuristic (wasabi=4) implicitly accounts for the full round, not just the visible hand. A proper fix needs Monte Carlo sampling over possible opponent hands, not a local heuristic.
- **50-game samples have ~7% standard error.** Need 200+ games for reliable signal on small improvements. Results in the 45-55% range are indistinguishable from noise.

## Improvement Roadmap

### Done

- [x] **Round-aware pudding valuation** — `evaluate.ts` no longer adds per-pudding tiebreaker in round 3 (see `HYPERPARAMS.md`)

### Planned (genuinely game-theoretic improvements)

- [ ] **Monte Carlo turn 1 search** — Sample N opponent hands from remaining deck, run Nash solver from turn 2 for each, pick the turn-1 card that maximizes expected game value across samples. This is the correct approach to imperfect information on turn 1.
- [ ] **Cross-round score awareness** — `MiniMaxState.priorScoreDiff` field exists but is unused. Use it to adjust risk tolerance: when behind, the AI should prefer high-variance plays (sashimi > tempura). This isn't about a constant offset — it's about changing the *shape* of optimal play.
- [ ] **Better pudding valuation by round** — Current flat +6 across all rounds overvalues pudding in R1 (speculative lead) and is exact in R3. A discount schedule would be more accurate but prior attempt (R1=2, R2=3, R3=6) reduced Nash's edge — likely because the high pudding stakes create more mixed-equilibrium positions where Nash excels.

### Rejected approaches

- ~~Deterministic Nash mode~~ — Abandons game-theoretic optimality. Overfits to beating one specific opponent.
- ~~Best-response to opponent~~ — Same problem: tailors play to a specific opponent rather than being generally optimal.
- ~~Context-aware turn 1 heuristic~~ — Local hand composition is misleading because hands rotate. Need Monte Carlo, not heuristic tweaking.

## C++ Solver Benchmark

Ported the Nash backward induction to C++ (`solver/solver.cpp`, 1239 lines). Optimizations: Zobrist hashing, flat open-addressing hash table, `-O3 -march=native`.

**Per-solve timing (wasabi-wasabi cell, 10 random hand pairs):**

| Metric | Value |
|--------|-------|
| Mean | 2.2s |
| Median | 1.3s |
| Min/Max | 0.1s / 7.7s |
| Mean cache entries | ~1.8M unique states |

**What drives solve time:** Hands with many unique types create larger game trees. Chopsticks multiply the action space (12 single picks → 50+ with compound actions). LP calls (for mixed equilibria) are 5-87K per solve.

**Exhaustive precomputation is infeasible.** One cell (wasabi-wasabi) has ~21 billion (ME_hand, OPP_hand) pairs. At 2.2s/pair: ~1.5 million core-years. Even 1000 cores can't help.

**Why:** The game tree from turn 2→10 averages 1-3.5 million unique states per hand pair. There is no cross-pair cache sharing because different starting hands produce entirely different state spaces.

### Viable alternatives

1. **Monte Carlo turn-1 search** — Sample N opponent hands, solve from turn 2 for each, pick the turn-1 card maximizing expected value. N=10 samples × 12 card pairs = 120 solves ≈ 4.5 minutes. Could be precomputed for common hand distributions.
2. **Shallow search + evaluation** — Solve turns 2-6 exactly, use a learned evaluation at turn 6. Reduces tree by ~99%.
3. **Neural network value function** — Train on millions of exact solves to predict game values from (board, hands). Use as a fast lookup at runtime.
4. **Selective precomputation** — Precompute only for the most common hand compositions (high-frequency types like tempura, sashimi, dumpling dominate the deck).

## Architecture Notes

- Nash solver: backward induction on payoff matrices, LP for mixed strategies, double oracle for large action spaces (chopsticks) — `nash.ts`, `lp-solver.ts`
- C++ solver: faithful port of the above for benchmarking — `solver/solver.cpp` (Zobrist hash, flat hash table, same LP/DO algorithms)
- Minimax solver: alpha-beta with transposition table, sequential move assumption — `minimax.ts`
- Both share: `evaluate.ts` (terminal evaluation), `fast-game.ts` (compact state + apply/undo), `types.ts` (numeric encoding)
- Tournament runner: `run-tournament.ts` — simulates games, tracks scores (~25 sec/game)
- AI is always player 0 in internal `MiniMaxState` representation (`fast-game.ts:33`)
