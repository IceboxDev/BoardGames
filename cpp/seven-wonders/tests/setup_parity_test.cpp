#include <fstream>

#include "sw/setup.hpp"
#include "tinytest.hpp"

using namespace sw;

// Cross-checks that C++ createInitialState reproduces the TS deal byte-for-byte
// from tests/fixtures/deals.txt (produced by dump-7wonders-parity.ts). This is
// the RNG-parity guarantee the whole engine's validation rests on.
TEST_CASE("parity: C++ deal == TS deal (wonders, hands, decks, edifices)") {
  std::ifstream in("tests/fixtures/deals.txt");
  REQUIRE(in.good());

  int blocks = 0;
  in >> blocks;
  REQUIRE(blocks > 0);

  int mismatches = 0;
  int firstBadSeed = 0;
  for (int b = 0; b < blocks; b++) {
    long seed = 0;
    int sideMode = 0, edifice = 0;
    in >> seed >> sideMode >> edifice;
    GameState st = createInitialState(uint32_t(seed), SideMode(sideMode), edifice != 0);

    int before = mismatches;
    for (int p = 0; p < N; p++) {
      int w = 0, s = 0;
      in >> w >> s;
      if (st.players[p].wonderId != w || st.players[p].side != s) mismatches++;
    }
    for (int p = 0; p < N; p++)
      for (int k = 0; k < 7; k++) {
        int id = 0;
        in >> id;
        if (st.hands[p][k] != id) mismatches++;
      }
    for (int k = 0; k < 35; k++) {
      int id = 0;
      in >> id;
      if (st.deck2[k] != id) mismatches++;
    }
    for (int k = 0; k < 35; k++) {
      int id = 0;
      in >> id;
      if (st.deck3[k] != id) mismatches++;
    }
    for (int k = 0; k < 3; k++) {
      int e = 0;
      in >> e;
      if (edifice && st.edifices[k].edificeId != e) mismatches++;
    }
    if (mismatches != before && firstBadSeed == 0) firstBadSeed = int(seed);
  }
  CHECK_EQ(mismatches, 0);
  if (mismatches) std::fprintf(stderr, "  first mismatching seed: %d\n", firstBadSeed);
}
