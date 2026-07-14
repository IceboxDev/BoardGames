#include "helpers.hpp"
#include "sw/engine.hpp"
#include "sw/rng.hpp"
#include "sw/rules.hpp"
#include "sw/scoring.hpp"
#include "sw/setup.hpp"
#include "tinytest.hpp"

using namespace sw;
using namespace tsw;

static int sci(int g, int c, int t, int w) {
  int counts[3] = {g, c, t};
  return scoreScience(counts, w);
}

TEST_CASE("scoring: science n^2 + 7 per set") {
  CHECK_EQ(sci(2, 2, 2, 0), 26);  // 12 + 14
  CHECK_EQ(sci(3, 0, 0, 0), 9);
  CHECK_EQ(sci(1, 1, 1, 0), 10);  // 3 + 7
}

TEST_CASE("scoring: wildcards assigned optimally") {
  CHECK_EQ(sci(1, 1, 0, 1), 10);  // -> {1,1,1}
  CHECK_EQ(sci(0, 0, 0, 3), 10);  // -> {1,1,1}
  CHECK_EQ(sci(2, 2, 1, 1), 26);  // -> {2,2,2} beats {3,2,1}=21
}

TEST_CASE("scoring: guild counts neighbours' cards") {
  GameState st = blankState();
  give(st, 0, "Workers Guild");        // points-per-brown on both neighbours
  give(st, leftOf(0), "Lumber Yard");  // brown
  give(st, leftOf(0), "Ore Vein");     // brown
  give(st, rightOf(0), "Clay Pool");   // brown
  GameResult r = scoreFinal(st);
  CHECK_EQ(r.breakdowns[0].guilds, 3);  // 1 * (2 left + 1 right)
}

TEST_CASE("scoring: winner tiebreak is most coins") {
  GameState st = blankState();
  for (int i = 0; i < N; i++) st.players[i].coins = 0;
  st.players[0].coins = 4;  // coin category floor(4/3)=1
  st.players[1].coins = 5;  // coin category floor(5/3)=1, but more actual coins
  GameResult r = scoreFinal(st);
  CHECK_EQ(r.totals[0], 1);
  CHECK_EQ(r.totals[1], 1);
  CHECK_EQ(r.winner, 1);
}

TEST_CASE("scoring: full game — total equals sum of categories, winner is max") {
  GameState st = createInitialState(2024, SideMode::Random, true);
  Rng rng(42);
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
  GameResult r = scoreFinal(st);
  int maxTotal = -1000;
  for (int i = 0; i < N; i++) {
    const ScoreBreakdown& s = r.breakdowns[i];
    int sum = s.military + s.coins + s.wonder + s.civilian + s.commercial + s.guilds + s.science +
              s.edifice;
    CHECK_EQ(s.total, sum);
    maxTotal = std::max(maxTotal, s.total);
  }
  CHECK_EQ(r.totals[r.winner], maxTotal);
}
