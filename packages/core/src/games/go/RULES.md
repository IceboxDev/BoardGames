# Go — the rules this engine plays

Chinese-style **area scoring**, as KataGo's `chinese` rules with positional superko
(`server/src/katago/protocol.ts:GO_RULES` sends exactly these to KataGo).

## Board and setup
- 9×9, 13×13 or 19×19 for play; the engine itself handles 5–19 (SGF review).
- Black moves first. **Seat 0 is Black** — the seat is the colour.
- **Komi** defaults to 7.5, or 0.5 in a handicap game; the lobby may set it.
- **Handicap** 2–9 (2–5 on 9×9) uses the fixed star-point layout (`handicap.ts`),
  and then White moves first. White also receives **one point per handicap stone**
  at the count (`whiteHandicapBonus = N`).

## Moves
- Place a stone on an empty point, or pass.
- Opponent chains left with no liberties are captured. **Suicide is illegal**,
  single- or multi-stone.
- **Positional superko**: no move may recreate any earlier whole-board position
  (`game.ts:legalPoints`). Passing is always legal.

## Ending
- Two consecutive passes end play and start the **scoring phase** (`session.ts`):
  a dead-stone proposal arrives (KataGo ownership, or a Monte Carlo estimate);
  either side may toggle whole chains dead/alive, **accept** the proposal (by its
  key, so a stale accept can't land on a changed proposal) or **resume** play.
  Any toggle clears both acceptances. Both accept → the board is counted.
- After **3 resumptions** every stone counts as alive: disputes are settled by
  playing on (area scoring makes capturing inside your own area cost nothing).
- If one side has accepted and the other does nothing for **3 minutes**, the
  proposal is counted. An AI accepts a proposal that matches its own reading and
  resumes play when a person accepts one it disagrees with.
- **Resignation** is available to both players at any time; **time-out** loses.

## Counting
Each side's stones on the board plus the empty regions only it borders, after
removing the agreed dead stones; White adds komi and the handicap bonus. An
empty region touching both colours is dame (so seki counts for nobody).
Integer komi can produce **jigo** (a draw).

## Clocks (`machines/clock.ts`)
None, **Fischer** (main time + increment, optional cap) or **byo-yomi** (main
time, then N periods; a move within a period resets it, overrunning uses one up).
Clocks pause in the scoring phase. AI seats are timed too.

## Take-backs
- Against the AI: granted at once, back to your previous move (your move and
  the AI's reply).
- Between people: the player who just moved may ask; the opponent allows or
  refuses (or simply plays on). An accepted take-back refunds no clock time.
