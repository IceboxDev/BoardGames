#include <algorithm>
#include <array>
#include <fstream>
#include <vector>

#include "sw/engine.hpp"
#include "sw/rules.hpp"
#include "sw/scoring.hpp"
#include "sw/setup.hpp"
#include "tinytest.hpp"

using namespace sw;
using Canon = std::array<int, 5>;

// Engine-neutral canonical action: [code, cardTypeId, left, right, participate].
static Canon canonMove(const Move& m, const GameState& st, int player) {
  int off = m.seventh ? 10 : 0;
  int card = m.kind == MoveKind::PickDiscard  ? st.discard[m.card]
             : m.kind == MoveKind::SkipPending ? 0
                                                : st.hands[player][m.card];
  switch (m.kind) {
    case MoveKind::Discard: return {0 + off, card, 0, 0, 0};
    case MoveKind::PlayCard:
      if (m.pay == PayKind::Resources) return {1 + off, card, m.payLeft, m.payRight, 0};
      if (m.pay == PayKind::Chain) return {2 + off, card, 0, 0, 0};
      return {3 + off, card, 0, 0, 0};
    case MoveKind::BuildWonder:
      return {4 + off, card, m.payLeft, m.payRight, m.participate ? 1 : 0};
    case MoveKind::PickDiscard: return {5, card, 0, 0, 0};
    case MoveKind::SkipPending: return {6, 0, 0, 0, 0};
  }
  return {0, 0, 0, 0, 0};
}

// Replays every TS-recorded game: asserts the C++ legal set equals TS's at each
// decision and that final totals + winner match. This is the whole engine's
// correctness proof against the validated TS reference.
TEST_CASE("parity: C++ engine == TS engine (legal sets + final scores)") {
  std::ifstream in("tests/fixtures/traces.txt");
  if (!in.good()) {
    std::fprintf(stderr, "  [skipped: run `pnpm tsx scripts/dump-7wonders-parity.ts` first]\n");
    return;
  }
  int games = 0;
  in >> games;
  REQUIRE(games > 0);

  int legalMismatch = 0, chosenMissing = 0, scoreMismatch = 0, winnerMismatch = 0;
  int badSeed = 0;

  for (int g = 0; g < games; g++) {
    long seed = 0;
    int sideMode = 0, edifice = 0, dcount = 0;
    in >> seed >> sideMode >> edifice >> dcount;
    GameState st = createInitialState(uint32_t(seed), SideMode(sideMode), edifice != 0);
    bool aborted = false;

    auto decide = [&](int player) -> Move {
      int fplayer = 0, numLegal = 0;
      in >> fplayer >> numLegal;
      std::vector<Canon> tsSet(numLegal);
      for (auto& t : tsSet)
        for (int k = 0; k < 5; k++) in >> t[k];
      Canon chosen{};
      for (int k = 0; k < 5; k++) in >> chosen[k];

      MoveBuffer b;
      legalActions(st, player, b);
      std::vector<Canon> mySet;
      mySet.reserve(b.count);
      for (int i = 0; i < b.count; i++) mySet.push_back(canonMove(b.moves[i], st, player));

      std::vector<Canon> a = tsSet, c = mySet;
      std::sort(a.begin(), a.end());
      std::sort(c.begin(), c.end());
      if (a != c) {
        if (!legalMismatch && !badSeed) badSeed = int(seed);
        legalMismatch++;
      }

      for (int i = 0; i < b.count; i++)
        if (canonMove(b.moves[i], st, player) == chosen) return b.moves[i];
      chosenMissing++;
      if (!badSeed) badSeed = int(seed);
      aborted = true;
      return b.moves[0];  // unreachable path for a correct engine
    };

    // Drive identically to the TS producer.
    while (!isGameOver(st) && !aborted) {
      if (st.phase == Phase::Selecting) {
        for (int i = 0; i < N && !aborted; i++)
          if (!st.hasSelection[i]) applySelection(st, i, decide(i));
        if (!aborted && st.phase == Phase::Revealing) applyReveal(st);
      } else if (st.phase == Phase::Revealing) {
        applyReveal(st);
      } else {
        applyPendingAction(st, activePlayer(st), decide(activePlayer(st)));
      }
    }
    if (aborted) break;

    // Compare final scores.
    GameResult r = scoreFinal(st);
    int total[N], win = 0;
    for (int i = 0; i < N; i++) {
      in >> total[i];
      if (r.totals[i] != total[i]) {
        scoreMismatch++;
        if (!badSeed) badSeed = int(seed);
      }
    }
    in >> win;
    if (r.winner != win) {
      winnerMismatch++;
      if (!badSeed) badSeed = int(seed);
    }
  }

  CHECK_EQ(legalMismatch, 0);
  CHECK_EQ(chosenMissing, 0);
  CHECK_EQ(scoreMismatch, 0);
  CHECK_EQ(winnerMismatch, 0);
  if (badSeed) std::fprintf(stderr, "  first divergent seed: %d\n", badSeed);
}
