#include "sw/mcts.hpp"
#include "sw/rules.hpp"
#include "sw/setup.hpp"
#include "tinytest.hpp"

using namespace sw;

// Fast smoke test — the heavy win-rate benchmark lives in `sw7 eval` (-O3).
TEST_CASE("mcts: returns a legal move at the opening") {
  GameState st = createInitialState(123, SideMode::Random, false);
  MctsConfig cfg;
  cfg.iterations = 200;
  cfg.seed = 1;
  Move m = mctsChooseMove(st, 0, cfg);
  CHECK(isLegal(st, 0, m));
}

TEST_CASE("mcts: returns a legal move in an Edifice game too") {
  GameState st = createInitialState(999, SideMode::Random, true);
  MctsConfig cfg;
  cfg.iterations = 150;
  cfg.seed = 7;
  Move m = mctsChooseMove(st, 0, cfg);
  CHECK(isLegal(st, 0, m));
}
