#include "sw/setup.hpp"

#include <cassert>

#include "sw/cards.hpp"
#include "sw/edifice.hpp"
#include "sw/rng.hpp"

namespace sw {

// Physical card instances for one age (base cards only), in table order — one id
// per copy whose min-player threshold is met. Matches deck.ts ageCardIds.
static int ageCardIds(int age, uint8_t* out) {
  int n = 0;
  for (int i = 0; i < NUM_CARD_TYPES; i++) {
    const Card& c = CARD_TYPES[i];
    if (c.age != age || c.isGuild()) continue;
    for (int k = 0; k < c.numCopies; k++)
      if (c.copies[k] <= N) out[n++] = uint8_t(i);
  }
  return n;
}

// Shuffled deck for an age; age III mixes in (N+2) shuffled guilds first.
static int buildAgeDeck(int age, uint8_t* out, Rng& rng) {
  int n = ageCardIds(age, out);
  if (age == 3) {
    uint8_t guilds[16];
    int g = 0;
    for (int i = 0; i < NUM_CARD_TYPES; i++)
      if (CARD_TYPES[i].isGuild()) guilds[g++] = uint8_t(i);
    shuffle(guilds, g, rng);
    for (int k = 0; k < N + 2; k++) out[n++] = guilds[k];
  }
  shuffle(out, n, rng);
  return n;
}

GameState createInitialState(uint32_t seed, SideMode sideMode, bool edifice) {
  Rng rng(seed);
  GameState st;
  st.seed = seed;
  st.age = 1;
  st.turn = 1;
  st.phase = Phase::Selecting;

  // 1) assignWonders: shuffle all 7 wonders, take first N; side per wonder.
  uint8_t wonders[NUM_WONDERS];
  for (int i = 0; i < NUM_WONDERS; i++) wonders[i] = uint8_t(i);
  shuffle(wonders, NUM_WONDERS, rng);
  for (int i = 0; i < N; i++) {
    st.players[i] = PlayerState{};
    st.players[i].wonderId = wonders[i];
    st.players[i].side = (sideMode == SideMode::Random) ? (rng.next() < 0.5 ? 0 : 1)
                                                        : uint8_t(sideMode);
    st.players[i].coins = STARTING_COINS;
  }

  // 2) age-1 deck dealt now; ages 2 & 3 pre-shuffled and stored.
  uint8_t deck1[MAX_DECK];
  int d1 = buildAgeDeck(1, deck1, rng);
  assert(d1 == 7 * N);
  (void)d1;
  for (int p = 0; p < N; p++) {
    st.handCount[p] = 7;
    for (int k = 0; k < 7; k++) st.hands[p][k] = deck1[p * 7 + k];
  }
  st.deck2Count = uint8_t(buildAgeDeck(2, st.deck2, rng));
  st.deck3Count = uint8_t(buildAgeDeck(3, st.deck3, rng));

  // 3) edifice: one project per age (shuffle the age's 5, take first).
  if (edifice) {
    st.edificeCount = 3;
    for (int age = 1; age <= 3; age++) {
      uint8_t pool[8];
      int m = 0;
      for (int i = 0; i < NUM_EDIFICES; i++)
        if (EDIFICES[i].age == age) pool[m++] = uint8_t(i);
      shuffle(pool, m, rng);
      EdSlot& slot = st.edifices[age - 1];
      slot.age = uint8_t(age);
      slot.edificeId = pool[0];
      slot.pawnsTotal = slot.pawnsLeft = uint8_t(participationPawnCount(N));
      slot.status = EdStatus::Project;
      slot.numParticipants = 0;
    }
  }
  return st;
}

}  // namespace sw
