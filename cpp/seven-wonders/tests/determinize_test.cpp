#include <algorithm>
#include <vector>

#include "sw/determinize.hpp"
#include "sw/engine.hpp"
#include "sw/mcts.hpp"
#include "sw/rng.hpp"
#include "sw/rules.hpp"
#include "sw/setup.hpp"
#include "tinytest.hpp"

using namespace sw;

// Advance a random game to (age, turn) at a fresh selecting node.
static bool advanceTo(GameState& st, int age, int turn, Rng& rng) {
  while (!isGameOver(st)) {
    if (st.phase == Phase::Selecting && st.age == age && st.turn == turn) return true;
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
  return false;
}

TEST_CASE("belief: unknown-hand count collapses by turn (5p) = {4,3,2,0,0,0}") {
  int expect[7] = {0, 4, 3, 2, 0, 0, 0};
  for (int turn = 1; turn <= 6; turn++) {
    Rng rng(turn * 101 + 7);
    GameState st = createInitialState(turn * 999u + 1u, SideMode::Random, false);
    if (advanceTo(st, 1, turn, rng)) CHECK_EQ(numUnknownHands(st, 0), expect[turn]);
  }
}

TEST_CASE("determinize: me's hand + public unchanged, card multiset preserved") {
  Rng rng(4242);
  GameState st = createInitialState(31337u, SideMode::Random, false);
  REQUIRE(advanceTo(st, 1, 2, rng));  // turn 2: 3 unknown hands
  REQUIRE(numUnknownHands(st, 0) == 3);

  GameState d = determinize(st, 0, rng);

  // me's hand identical.
  REQUIRE(d.handCount[0] == st.handCount[0]);
  for (int k = 0; k < st.handCount[0]; k++) CHECK_EQ(d.hands[0][k], st.hands[0][k]);
  // hand sizes preserved for all seats.
  for (int j = 0; j < N; j++) CHECK_EQ(d.handCount[j], st.handCount[j]);
  // public state unchanged (coins, tableaus, stages).
  for (int j = 0; j < N; j++) {
    CHECK_EQ(d.players[j].coins, st.players[j].coins);
    CHECK_EQ(d.players[j].numTableau, st.players[j].numTableau);
    CHECK_EQ(int(d.players[j].stagesBuilt), int(st.players[j].stagesBuilt));
  }
  // the full multiset of circulating cards is preserved.
  std::vector<int> a, b;
  for (int j = 0; j < N; j++)
    for (int k = 0; k < st.handCount[j]; k++) {
      a.push_back(st.hands[j][k]);
      b.push_back(d.hands[j][k]);
    }
  std::sort(a.begin(), a.end());
  std::sort(b.begin(), b.end());
  CHECK(a == b);
}

TEST_CASE("determinize: is a no-op once information has collapsed (turn 5)") {
  Rng rng(55);
  GameState st = createInitialState(2024u, SideMode::Random, false);
  REQUIRE(advanceTo(st, 1, 5, rng));
  CHECK_EQ(numUnknownHands(st, 0), 0);
  GameState d = determinize(st, 0, rng);
  for (int j = 0; j < N; j++)
    for (int k = 0; k < st.handCount[j]; k++) CHECK_EQ(d.hands[j][k], st.hands[j][k]);
}

TEST_CASE("ismcts: returns a legal move under hidden information (turn 2)") {
  Rng rng(7);
  GameState st = createInitialState(12321u, SideMode::Random, false);
  REQUIRE(advanceTo(st, 1, 2, rng));
  REQUIRE(numUnknownHands(st, 0) == 3);
  MctsConfig cfg;
  cfg.iterations = 120;
  cfg.seed = 3;
  Move m = ismctsChooseMove(st, 0, cfg, nullptr, 4);
  CHECK(isLegal(st, 0, m));
}
