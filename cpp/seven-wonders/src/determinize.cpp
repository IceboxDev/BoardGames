#include "sw/determinize.hpp"

namespace sw {

GameState determinize(const GameState& s, int me, Rng& rng) {
  GameState d = s;

  // Unknown opponent hands (>1 unheld; a lone unheld hand is pinned by elimination).
  int unk[N], nu = 0;
  for (int j = 0; j < N; j++)
    if (j != me && passDist(s.age, me, j) >= s.turn) unk[nu++] = j;

  if (nu > 1) {
    // Re-partition the union of the unknown hands' cards, keeping each seat's
    // (publicly known) hand size.
    uint8_t pool[N * MAX_HAND];
    int np = 0;
    for (int u = 0; u < nu; u++)
      for (int k = 0; k < s.handCount[unk[u]]; k++) pool[np++] = s.hands[unk[u]][k];
    shuffle(pool, np, rng);
    int idx = 0;
    for (int u = 0; u < nu; u++)
      for (int k = 0; k < s.handCount[unk[u]]; k++) d.hands[unk[u]][k] = pool[idx++];
  }

  // Decks me hasn't seen (future ages) get a fresh shuffle.
  if (s.age < 2) shuffle(d.deck2, d.deck2Count, rng);
  if (s.age < 3) shuffle(d.deck3, d.deck3Count, rng);
  return d;
}

}  // namespace sw
