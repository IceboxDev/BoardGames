#include <cstring>

#include "sw/payment.hpp"
#include "tinytest.hpp"

using namespace sw;

static int cardByName(const char* name) {
  for (int i = 0; i < NUM_CARD_TYPES; i++)
    if (std::strcmp(nameOf(cardType(i).nameId), name) == 0) return i;
  return -1;
}

// All players Giza side A (initial resource = stone), 10 coins, empty tableau.
static GameState blank() {
  GameState st;
  for (int i = 0; i < N; i++) {
    st.players[i] = PlayerState{};
    st.players[i].wonderId = Giza;
    st.players[i].side = 0;
    st.players[i].coins = 10;
  }
  return st;
}

static void give(GameState& st, int player, const char* name) {
  int id = cardByName(name);
  addTableauCard(st.players[player], uint8_t(id));
}

static const uint8_t* costOf(int res, int amount = 1) {
  static uint8_t c[7];
  std::memset(c, 0, sizeof(c));
  if (res >= 0) c[res] = uint8_t(amount);
  return c;
}

TEST_CASE("payment: free cost -> single {0,0}") {
  GameState st = blank();
  PayResult r = solvePayments(st, 0, costOf(-1), 0);
  CHECK(r.affordable);
  CHECK_EQ(r.count, 1);
  CHECK_EQ(int(r.splits[0].left), 0);
  CHECK_EQ(int(r.splits[0].right), 0);
}

TEST_CASE("payment: own initial resource pays for free") {
  GameState st = blank();  // Giza A initial = stone
  PayResult r = solvePayments(st, 0, costOf(Stone), 0);
  CHECK(r.affordable);
  CHECK_EQ(r.count, 1);
  CHECK_EQ(int(r.splits[0].left) + int(r.splits[0].right), 0);
}

TEST_CASE("payment: unavailable resource -> not affordable") {
  GameState st = blank();  // everyone stone-only
  PayResult r = solvePayments(st, 0, costOf(Wood), 0);
  CHECK(!r.affordable);
}

TEST_CASE("payment: own brown card covers cost") {
  GameState st = blank();
  give(st, 0, "Lumber Yard");  // wood
  PayResult r = solvePayments(st, 0, costOf(Wood), 0);
  CHECK(r.affordable);
  CHECK_EQ(r.count, 1);
  CHECK_EQ(int(r.splits[0].left) + int(r.splits[0].right), 0);
}

TEST_CASE("payment: choice producer (Caravansery) satisfies any of its resources") {
  GameState st = blank();
  give(st, 0, "Caravansery");  // choose wood/stone/clay/ore
  CHECK(solvePayments(st, 0, costOf(Clay), 0).affordable);
  CHECK(solvePayments(st, 0, costOf(Ore), 0).affordable);
  // But only ONE unit per turn: two clay is not payable from it alone.
  CHECK(!solvePayments(st, 0, costOf(Clay, 2), 0).affordable);
}

TEST_CASE("payment: buy from left neighbour at default cost 2") {
  GameState st = blank();
  give(st, leftOf(0), "Lumber Yard");  // left = (0+1)%N
  PayResult r = solvePayments(st, 0, costOf(Wood), 0);
  CHECK(r.affordable);
  CHECK_EQ(r.count, 1);
  CHECK_EQ(int(r.splits[0].left), 2);
  CHECK_EQ(int(r.splits[0].right), 0);
}

TEST_CASE("payment: East Trading Post discounts raw from right to 1") {
  GameState st = blank();
  give(st, 0, "East Trading Post");   // raw discount from RIGHT
  give(st, rightOf(0), "Lumber Yard");  // right = (0-1+N)%N
  PayResult r = solvePayments(st, 0, costOf(Wood), 0);
  CHECK(r.affordable);
  CHECK_EQ(r.count, 1);
  CHECK_EQ(int(r.splits[0].left), 0);
  CHECK_EQ(int(r.splits[0].right), 1);  // discounted
}

TEST_CASE("payment: Pareto frontier when both neighbours can supply 2 wood") {
  GameState st = blank();
  give(st, leftOf(0), "Sawmill");   // produces 2 wood
  give(st, rightOf(0), "Sawmill");  // produces 2 wood
  PayResult r = solvePayments(st, 0, costOf(Wood, 2), 0);
  CHECK(r.affordable);
  // {0,4} both-right, {2,2} split, {4,0} both-left — none dominates another.
  REQUIRE(r.count == 3);
  CHECK_EQ(int(r.splits[0].left), 0);
  CHECK_EQ(int(r.splits[0].right), 4);
  CHECK_EQ(int(r.splits[1].left), 2);
  CHECK_EQ(int(r.splits[1].right), 2);
  CHECK_EQ(int(r.splits[2].left), 4);
  CHECK_EQ(int(r.splits[2].right), 0);
}

TEST_CASE("payment: bank coins gate affordability") {
  GameState st = blank();
  st.players[0].coins = 2;
  CHECK(solvePayments(st, 0, costOf(-1), 3).affordable == false);
  st.players[0].coins = 3;
  CHECK(solvePayments(st, 0, costOf(-1), 3).affordable);
}
