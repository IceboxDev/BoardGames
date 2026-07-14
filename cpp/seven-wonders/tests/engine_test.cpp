#include "sw/engine.hpp"
#include "sw/rng.hpp"
#include "sw/rules.hpp"
#include "sw/setup.hpp"
#include "sw/wonders.hpp"
#include "tinytest.hpp"

using namespace sw;

// Drive one full random-legal game to game-over. Returns iterations used (or -1).
static int playRandomGame(uint32_t seed, bool edifice) {
  GameState st = createInitialState(seed, SideMode::Random, edifice);
  Rng rng(seed ^ 0x9e3779b9u);
  int iters = 0;
  while (!isGameOver(st)) {
    if (++iters > 100000) return -1;
    if (st.phase == Phase::Selecting) {
      for (int i = 0; i < N; i++)
        if (!st.hasSelection[i]) {
          MoveBuffer b;
          legalActions(st, i, b);
          if (b.count == 0) return -2;
          applySelection(st, i, b.moves[rng.below(b.count)]);
        }
      if (st.phase == Phase::Revealing) applyReveal(st);
    } else if (st.phase == Phase::Revealing) {
      applyReveal(st);
    } else {  // Pending
      int ap = activePlayer(st);
      MoveBuffer b;
      legalActions(st, ap, b);
      if (b.count == 0) return -3;
      applyPendingAction(st, ap, b.moves[rng.below(b.count)]);
    }
  }
  return iters;
}

TEST_CASE("engine: 400 random base games reach game-over") {
  int ok = 0;
  for (uint32_t s = 1; s <= 400; s++)
    if (playRandomGame(s * 2654435761u, false) > 0) ok++;
  CHECK_EQ(ok, 400);
}

TEST_CASE("engine: 400 random Edifice games reach game-over") {
  int ok = 0;
  for (uint32_t s = 1; s <= 400; s++)
    if (playRandomGame(s * 40503u + 7, true) > 0) ok++;
  CHECK_EQ(ok, 400);
}

TEST_CASE("engine: final state is well-formed") {
  GameState st = createInitialState(12345, SideMode::Random, true);
  Rng rng(999);
  while (!isGameOver(st)) {
    if (st.phase == Phase::Selecting) {
      for (int i = 0; i < N; i++)
        if (!st.hasSelection[i]) {
          MoveBuffer b;
          legalActions(st, i, b);
          applySelection(st, i, b.moves[rng.below(b.count)]);
        }
      if (st.phase == Phase::Revealing) applyReveal(st);
    } else if (st.phase == Phase::Revealing) {
      applyReveal(st);
    } else {
      int ap = activePlayer(st);
      MoveBuffer b;
      legalActions(st, ap, b);
      applyPendingAction(st, ap, b.moves[rng.below(b.count)]);
    }
  }
  CHECK_EQ(int(st.age), 3);
  for (int i = 0; i < N; i++) {
    const WonderSide& ws = wonderSide(st.players[i].wonderId, st.players[i].side);
    CHECK(st.players[i].stagesBuilt <= ws.numStages);
    CHECK(st.players[i].numTableau <= MAX_TABLEAU);
    CHECK(st.handCount[i] == 0);
  }
}

TEST_CASE("engine: clone is independent (apply does not touch the source)") {
  GameState a = createInitialState(777, SideMode::Random, false);
  GameState b = a;  // value copy = tree-node clone
  // Select for everyone on the clone, reveal it, leave `a` untouched.
  Rng rng(1);
  for (int i = 0; i < N; i++) {
    MoveBuffer buf;
    legalActions(b, i, buf);
    applySelection(b, i, buf.moves[rng.below(buf.count)]);
  }
  applyReveal(b);
  CHECK_EQ(int(a.turn), 1);
  CHECK_EQ(int(a.phase == Phase::Selecting ? 1 : 0), 1);
  for (int i = 0; i < N; i++) CHECK_EQ(int(a.hasSelection[i]), 0);
}
