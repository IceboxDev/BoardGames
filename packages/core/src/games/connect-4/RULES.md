# Connect 4 — rules and table rulings

Two players, Red (seat 0) and Yellow (seat 1). A seat keeps its colour for the
whole series; who opens alternates.

## Classic

- The board is `columns × rows`. Classic is **7×6**; tables can also choose
  **6×5** or **8×7** (`manifest.ts` `BOARD_SIZES`).
- On your turn, drop one disc into any column that isn't full. It falls to the
  lowest empty cell.
- Four (or more) of your discs in a line — horizontal, vertical or diagonal —
  wins at once.
- A full board with no four is a **draw** (`reason: "full"`).

## PopOut (Hasbro variant, `popOut: true`)

- On your turn, either drop a disc, or **pop** one of **your own** discs out of
  the bottom row. Everything above it in that column moves down one cell.
- A pop can complete fours for either colour.
  - Only the opponent's four → the opponent wins.
  - Both colours at once → **ruling: the popper wins.** The official sheet we
    found doesn't settle this; it's the common house reading.
- A full board doesn't end the game; pops stay legal.
  - If the side to move has no legal move (a full board and no disc of theirs
    on the bottom row), the game is drawn (`reason: "stalemate"`).
- **Ruling:** the same position (board + side to move) occurring for the third
  time draws (`reason: "repetition"`).
- **Ruling:** a game still going after 300 moves is drawn (`POPOUT_MOVE_CAP`),
  a backstop behind the repetition rule.

## Series (`bestOf: 1 | 3 | 5`)

- Game 1 opens with `firstPlayer` (Red, Yellow, or seeded random); after that
  the opener alternates every game.
- A drawn game counts for nobody. The series ends as soon as the leader can't
  be caught; a level series after the last game is a draw.
- Between games the finished board stays up. Either person starts the next
  game; it starts by itself after 8 s (`BETWEEN_GAMES_MS`), so a player who
  walks away can't stall it.

## Resigning

Any person may resign the game in progress at any time, even on the other
side's turn. The opponent wins that game; a series goes on if it's not decided.
AI seats never resign.

## Assists (`assists: true`)

Hints, the evaluation bar and post-game move grades come from the exact solver
running in the viewer's browser. Connect 4 has no hidden information, so this is
an honour system, not a security boundary: turning assists off hides the
buttons, it can't stop anyone running a solver.
