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
- Timer tokens: 9 by default. The lobby can set 7–11.

## A turn
1. The clue-giver gives one word and a number. The same clue rules as Codenames apply.
2. The partner guesses. **Every guess is judged against the clue-giver's side.**
   - **Agent:** the card is covered for both players and the partner may keep guessing.
     - *Ruling: Duet has no number + 1 limit; the number is only information.* (verify)
   - **Bystander:** the card is marked as that side's bystander and the turn ends. It stays guessable when the other player gives the clue.
   - **Assassin:** the pair loses.
3. Every turn spends one timer token, whether it ends on a bystander, a stop or a timeout.
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
