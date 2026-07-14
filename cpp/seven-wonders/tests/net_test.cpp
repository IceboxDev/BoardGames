#include <cmath>
#include <vector>

#include "sw/net.hpp"
#include "sw/rules.hpp"
#include "sw/setup.hpp"
#include "tinytest.hpp"

using namespace sw;

TEST_CASE("features: encode fills exactly FEAT_DIM with sane values") {
  GameState st = createInitialState(1, SideMode::Random, false);
  std::vector<float> f(FEAT_DIM, -999.0f);
  encodeFeatures(st, 0, f.data());  // asserts idx == FEAT_DIM internally
  CHECK(std::abs(f[0] - 3.0f / 20.0f) < 1e-6f);  // seat 0 coins/20 at start
  bool anyUnset = false;
  for (float x : f)
    if (x == -999.0f) anyUnset = true;
  CHECK(!anyUnset);
}

TEST_CASE("policyIndex is within bounds for opening moves") {
  GameState st = createInitialState(2, SideMode::Random, false);
  MoveBuffer b;
  legalActions(st, 0, b);
  REQUIRE(b.count > 0);
  for (int i = 0; i < b.count; i++) {
    int pi = policyIndex(st, 0, b.moves[i]);
    CHECK(pi >= 0 && pi < POLICY_DIM);
  }
}

TEST_CASE("net forward: zero weights -> value 0.5, zero policy logits") {
  Net net;
  net.W1.assign(H1 * FEAT_DIM, 0);
  net.b1.assign(H1, 0);
  net.W2.assign(H2 * H1, 0);
  net.b2.assign(H2, 0);
  net.Wp.assign(POLICY_DIM * H2, 0);
  net.bp.assign(POLICY_DIM, 0);
  net.Wv.assign(VALUE_DIM * H2, 0);
  net.bv.assign(VALUE_DIM, 0);
  std::vector<float> f(FEAT_DIM, 0.3f), pol(POLICY_DIM), val(VALUE_DIM);
  net.eval(f.data(), pol.data(), val.data());
  for (float v : val) CHECK(std::abs(v - 0.5f) < 1e-6f);
  for (float p : pol) CHECK(std::abs(p) < 1e-6f);
}
