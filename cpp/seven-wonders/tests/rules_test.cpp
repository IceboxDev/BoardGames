#include "helpers.hpp"
#include "sw/rules.hpp"
#include "tinytest.hpp"

using namespace sw;
using namespace tsw;

static int countFor(const MoveBuffer& b, int handIdx, MoveKind kind, PayKind pay) {
  int n = 0;
  for (int i = 0; i < b.count; i++)
    if (b.moves[i].card == handIdx && b.moves[i].kind == kind &&
        (kind != MoveKind::PlayCard || b.moves[i].pay == pay))
      n++;
  return n;
}

TEST_CASE("rules: activePlayer is -1 while selecting") {
  GameState st = blankState();
  CHECK_EQ(activePlayer(st), -1);
}

TEST_CASE("rules: fresh hand offers a discard for every card") {
  GameState st = blankState();
  setHand(st, 0, {"Lumber Yard", "Ore Vein", "Loom", "Baths", "Altar", "Workshop", "Stockade"});
  MoveBuffer b;
  legalActions(st, 0, b);
  int discards = 0;
  for (int i = 0; i < b.count; i++)
    if (b.moves[i].kind == MoveKind::Discard) discards++;
  CHECK_EQ(discards, 7);
  CHECK(b.count >= 7);
}

TEST_CASE("rules: already-selected player has no moves") {
  GameState st = blankState();
  setHand(st, 0, {"Lumber Yard"});
  st.hasSelection[0] = true;
  MoveBuffer b;
  legalActions(st, 0, b);
  CHECK_EQ(b.count, 0);
}

TEST_CASE("rules: duplicate name cannot be played (discard/wonder only)") {
  GameState st = blankState();  // Giza A stage 1 costs 2 wood
  give(st, 0, "Lumber Yard");   // 1 wood
  give(st, leftOf(0), "Lumber Yard");  // neighbour supplies the 2nd wood
  setHand(st, 0, {"Lumber Yard"});     // a third copy, in hand
  MoveBuffer b;
  legalActions(st, 0, b);
  CHECK_EQ(countFor(b, 0, MoveKind::PlayCard, PayKind::Resources), 0);
  CHECK_EQ(countFor(b, 0, MoveKind::PlayCard, PayKind::Chain), 0);
  CHECK_EQ(countFor(b, 0, MoveKind::Discard, PayKind::Resources), 1);
  // Stage 1 (2 wood) is buildable (own 1 + buy 1) -> at least one wonder move.
  CHECK(countFor(b, 0, MoveKind::BuildWonder, PayKind::Resources) >= 1);
}

TEST_CASE("rules: chain build short-circuits resource payments") {
  GameState st = blankState();
  give(st, 0, "Baths");             // Baths -> chains Aqueduct
  setHand(st, 0, {"Aqueduct"});
  MoveBuffer b;
  legalActions(st, 0, b);
  CHECK_EQ(countFor(b, 0, MoveKind::PlayCard, PayKind::Chain), 1);
  CHECK_EQ(countFor(b, 0, MoveKind::PlayCard, PayKind::Resources), 0);
}

TEST_CASE("rules: Olympia A builds the first card of each colour free") {
  GameState st = blankState(Olympia, 0);  // A: stage 2 = free-first-of-color
  st.players[0].stagesBuilt = 2;
  setHand(st, 0, {"Aqueduct", "Altar"});  // blue, 3 stone (unaffordable) / blue, costs nothing
  MoveBuffer b;
  legalActions(st, 0, b);
  CHECK_EQ(countFor(b, 0, MoveKind::PlayCard, PayKind::FreeBuild), 1);
  CHECK_EQ(countFor(b, 1, MoveKind::PlayCard, PayKind::FreeBuild), 0);  // free card: no offer

  give(st, 0, "Lumber Yard");  // another colour doesn't matter
  legalActions(st, 0, b);
  CHECK_EQ(countFor(b, 0, MoveKind::PlayCard, PayKind::FreeBuild), 1);

  give(st, 0, "Theater");  // a blue card already on the board
  legalActions(st, 0, b);
  CHECK_EQ(countFor(b, 0, MoveKind::PlayCard, PayKind::FreeBuild), 0);

  st.players[0] = PlayerState{};  // power not built yet
  st.players[0].wonderId = Olympia;
  st.players[0].stagesBuilt = 1;
  legalActions(st, 0, b);
  CHECK_EQ(countFor(b, 0, MoveKind::PlayCard, PayKind::FreeBuild), 0);
}

TEST_CASE("rules: Olympia B builds the first and the last card of each age free") {
  GameState st = blankState(Olympia, 1);  // B: stage 1 = first of age, stage 2 = last of age
  setHand(st, 0, {"Aqueduct"});
  MoveBuffer b;
  auto offered = [&](int stages, int turn) {
    st.players[0].stagesBuilt = uint8_t(stages);
    st.turn = uint8_t(turn);
    legalActions(st, 0, b);
    return countFor(b, 0, MoveKind::PlayCard, PayKind::FreeBuild);
  };
  CHECK_EQ(offered(0, 1), 0);
  CHECK_EQ(offered(1, 1), 1);
  CHECK_EQ(offered(1, 3), 0);
  CHECK_EQ(offered(1, 6), 0);
  CHECK_EQ(offered(2, 1), 1);
  CHECK_EQ(offered(2, 6), 1);
  CHECK_EQ(offered(2, 4), 0);

  give(st, 0, "Baths");  // Aqueduct now chains: chain only, no free-build
  CHECK_EQ(offered(2, 6), 0);
  CHECK_EQ(countFor(b, 0, MoveKind::PlayCard, PayKind::Chain), 1);
}

TEST_CASE("rules: no wonder move once all stages built") {
  GameState st = blankState();  // Giza A has 3 stages
  st.players[0].stagesBuilt = 3;
  setHand(st, 0, {"Loom"});
  MoveBuffer b;
  legalActions(st, 0, b);
  CHECK_EQ(countFor(b, 0, MoveKind::BuildWonder, PayKind::Resources), 0);
}
