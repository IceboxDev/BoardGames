#include "sw/cards.hpp"
#include "sw/edifice.hpp"
#include "sw/wonders.hpp"
#include "tinytest.hpp"

using namespace sw;

// Base (non-guild) deck size for one age at player count N.
static int baseAgeCount(int age) {
  int total = 0;
  for (int i = 0; i < NUM_CARD_TYPES; i++) {
    const Card& c = CARD_TYPES[i];
    if (c.age != age || c.isGuild()) continue;
    for (int k = 0; k < c.numCopies; k++)
      if (c.copies[k] <= N) total++;
  }
  return total;
}

TEST_CASE("data: table sizes") {
  CHECK_EQ(NUM_CARD_TYPES, 78);
  CHECK_EQ(NUM_CARD_TYPES, NUM_CARD_TYPES_CT);  // compile-time constant stays in sync
  CHECK_EQ(NUM_NAMES, 75);
}

TEST_CASE("data: deck size is 7*N per age (N=5)") {
  // Ages I & II are all base cards; Age III = base + (N+2) guilds.
  CHECK_EQ(baseAgeCount(1), 7 * N);
  CHECK_EQ(baseAgeCount(2), 7 * N);
  CHECK_EQ(baseAgeCount(3) + (N + 2), 7 * N);
}

TEST_CASE("data: exactly 10 guilds, all purple/age3") {
  int guilds = 0;
  for (int i = 0; i < NUM_CARD_TYPES; i++) {
    if (CARD_TYPES[i].isGuild()) {
      guilds++;
      CHECK_EQ(CARD_TYPES[i].age, 3);
      CHECK_EQ(CARD_TYPES[i].color, (int)Purple);
    }
  }
  CHECK_EQ(guilds, N + 2 <= 10 ? 10 : 10);
}

TEST_CASE("data: chain targets are valid names that exist as cards") {
  for (int i = 0; i < NUM_CARD_TYPES; i++) {
    const Card& c = CARD_TYPES[i];
    for (int k = 0; k < c.numChain; k++) {
      int target = c.chainFrom[k];
      CHECK(target >= 0 && target < NUM_NAMES);
      bool found = false;
      for (int j = 0; j < NUM_CARD_TYPES; j++)
        if (CARD_TYPES[j].nameId == target) found = true;
      CHECK(found);
    }
  }
}

TEST_CASE("data: per-card array bounds respected") {
  for (int i = 0; i < NUM_CARD_TYPES; i++) {
    const Card& c = CARD_TYPES[i];
    CHECK(c.numEffects <= MAX_EFFECTS);
    CHECK(c.numChain <= MAX_CHAIN);
    CHECK(c.numCopies <= MAX_COPIES);
    CHECK(c.nameId < NUM_NAMES);
  }
}

TEST_CASE("data: wonders well-formed (7 wonders, stage/effect bounds)") {
  for (int w = 0; w < NUM_WONDERS; w++) {
    CHECK_EQ((int)WONDERS[w].id, w);
    for (int s = 0; s < 2; s++) {
      const WonderSide& side = WONDERS[w].sides[s];
      CHECK(side.numStages <= MAX_STAGES);
      CHECK(side.initialResource < NUM_RESOURCES);
      for (int st = 0; st < side.numStages; st++)
        CHECK(side.stages[st].numEffects <= MAX_STAGE_EFFECTS);
    }
  }
}

TEST_CASE("data: 15 edifices, 5 per age") {
  int perAge[4] = {0, 0, 0, 0};
  for (int i = 0; i < NUM_EDIFICES; i++) {
    CHECK(EDIFICES[i].numRewards <= MAX_ED_REWARDS);
    perAge[EDIFICES[i].age]++;
  }
  CHECK_EQ(perAge[1], 5);
  CHECK_EQ(perAge[2], 5);
  CHECK_EQ(perAge[3], 5);
}
