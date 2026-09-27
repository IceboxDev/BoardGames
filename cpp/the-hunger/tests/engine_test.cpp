// Engine smoke tests: whole seeded games terminate with a result, and a
// state copy is an independent value (search clones by assignment).
#include "hg/ai.hpp"
#include "tinytest.hpp"

using namespace hg;

TEST_CASE("random and heuristic games reach sunrise at every table size") {
  Actions legal;
  for (int n = 2; n <= 6; n++) {
    for (int mode = 0; mode < 2; mode++) {
      for (uint32_t seed = 1; seed <= 5; seed++) {
        GameState s = createInitialState(n, seed * 7919u + n, Mode(mode));
        Mulberry32 rng(seed);
        int steps = 0;
        while (s.phase != PH_OVER && steps++ < 20000) {
          int seat = activePlayer(s);
          legalActions(s, seat, legal);
          REQUIRE(!legal.empty());
          int idx = (seed % 2) ? int(rng() * legal.size()) : heuristicPick(s, seat, legal);
          Action a = legal[idx];
          apply(s, seat, a);
        }
        CHECK(s.phase == PH_OVER);
        CHECK(s.hasResult);
      }
    }
  }
}

TEST_CASE("a copied state is independent") {
  GameState a = createInitialState(4, 3, MODE_ELDER);
  GameState b = a;
  std::string ha = stateHash(a);
  b.players[0].deck.push(0);
  b.track[0][0].push(1);
  CHECK_EQ(stateHash(a), ha);
  CHECK(stateHash(b) != ha);
}
