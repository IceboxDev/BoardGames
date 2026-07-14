#pragma once
#include <cstring>
#include <initializer_list>

#include "sw/state.hpp"

namespace tsw {

inline int cardByName(const char* name) {
  for (int i = 0; i < sw::NUM_CARD_TYPES; i++)
    if (std::strcmp(sw::nameOf(sw::cardType(i).nameId), name) == 0) return i;
  return -1;
}

// All players on the same wonder/side, given coins, empty tableaux.
inline sw::GameState blankState(int wonder = sw::Giza, int side = 0, int coins = 10) {
  sw::GameState st;
  for (int i = 0; i < sw::N; i++) {
    st.players[i] = sw::PlayerState{};
    st.players[i].wonderId = uint8_t(wonder);
    st.players[i].side = uint8_t(side);
    st.players[i].coins = int16_t(coins);
  }
  return st;
}

inline void give(sw::GameState& st, int p, const char* name) {
  sw::addTableauCard(st.players[p], uint8_t(cardByName(name)));
}

inline void setHand(sw::GameState& st, int p, std::initializer_list<const char*> names) {
  st.handCount[p] = 0;
  for (auto n : names) st.hands[p][st.handCount[p]++] = uint8_t(cardByName(n));
}

}  // namespace tsw
