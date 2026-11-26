# Codenames: Duet — rules as implemented

Transcribed from the rulebook. **Please verify against your copy**, especially the guess limit and the sudden-death turn order, which are marked below.

## Setup
- 25 words, dealt the same way as in Codenames (`../codenames/board.ts`).
- A two-sided key. Seat 0 holds side A and seat 1 holds side B. Each side has 9 agents, 3 assassins and 13 bystanders.
- Across both sides:
  - 3 cards are agents on both sides
  - 5 are agents on A only and bystanders on B
  - 5 are agents on B only and bystanders on A
  - 1 is an agent on A and an assassin on B
  - 1 is an agent on B and an assassin on A
  - 1 is an assassin on both sides
  - 1 is an assassin on A and a bystander on B
  - 1 is an assassin on B and a bystander on A
  - 7 are bystanders on both sides
- That makes **15 distinct agents**.
- Timer tokens: 9 by default. The lobby can set 7–11; mission-map cities use 6–11.
- Free mistakes (mission map): a city written *tokens–mistakes* (Cairo 9–5) starts with only *mistakes* tokens bystander side up, the rest checkmark side up. The standard game (Prague 9–9) has every token bystander side up. Config `mistakes`; absent = all of them.

## A turn
1. The clue-giver gives one word and a number. The same clue rules as Codenames apply.
2. The partner guesses. **Every guess is judged against the clue-giver's side.**
   - **Agent:** the card is covered for both players and the partner may keep guessing.
     - *Ruling: Duet has no number + 1 limit; the number is only information.* (verify)
     - *Table agreement: WORD X says WORD describes X words. With k words still owed — each earlier clue's number minus the agents found on its turn — and X + k = every agent left on the giver's side, the clue is WORD ∞ instead (the guesser works out X = left − k). ∞ needs k ≥ 1: with nothing owed a clue carries its number, even one for the last agent.*
   - **Bystander:** the card is marked as that side's bystander and the turn ends. It stays guessable when the other player gives the clue.
   - **Assassin:** the pair loses.
3. Every turn spends timer tokens (rulebook, "Using the timer tokens"; `spendTokens`):
   - **A stop or a timeout** takes a checkmark-side token while one is left, otherwise a bystander-side one. Stopping never uses up a free mistake you still have room for.
   - **A bystander** takes a bystander-side token. With none left it takes **two** checkmark-side tokens: the mistake costs two turns (the turn records `tokensSpent: 2`). If that empties the bank, sudden death follows as usual.
   - In the standard game every token is bystander side, so every turn costs exactly one.
4. Players take turns giving clues. A player with no agents left on their own side has nothing to clue, so the other player gives every clue from then on.

## Sudden death
- When the last token is spent and agents remain, there are no more clues.
- Players guess **alternately**, starting with the player who would have guessed next. A player whose partner has no agents left keeps guessing. *Ruling: in sudden death the rulebook lets either player guess in any order; alternating keeps the AI partner's guesses well-defined.* (verify)
- Any guess that isn't an agent loses.

## Winning
- All 15 agents found: the pair wins.

## Table rules
- The clue-giver can't chat from their clue until the end of the turn.
- Timers work as in Codenames, except there is no timer in sudden death.

## Campaign (mission map)
- 26 cities and their routes are in `campaign/map.ts`, transcribed from the printed sheet.
- You start in Prague (9–9). Winning a mission completes that city; you may then take any mission connected to a completed one. From Prague: Berlin, Cairo or Moscow.
- A completed mission can be played again. A loss changes nothing but the number of games played.
- Progress is derived from the games alone (`campaign/progress.ts`).
