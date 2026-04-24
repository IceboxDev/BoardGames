# Sushi Go AI Hyperparameters

Parameters that affect AI evaluation strength. Candidates for automated tuning via self-play optimization.

## Pudding Valuation (evaluate.ts)

Round-aware scoring for the pudding lead bonus (2-player rules: +6 for most at game end).

| Round | `leadBonus` | `perPuddingBonus` | Rationale |
|-------|-------------|--------------------|-----------|
| 1-2 | 6 | 0.3 | Lead bonus + margin tiebreaker for robustness across future rounds |
| 3 | 6 | 0 | Exact game scoring — only lead/no-lead matters |

- `leadBonus`: flat bonus added to score diff when one player has strictly more puddings
- `perPuddingBonus`: multiplied by `puddingDiff` (signed) and added to score diff. Encourages building a larger pudding margin in early rounds. Dropped in R3 because the margin doesn't matter once the game ends.

These values were hand-tuned. An optimizer could sweep `leadBonus` in [0, 8] and `perPuddingBonus` in [0, 2] per round, evaluating via tournament win rate against a fixed baseline.
