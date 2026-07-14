// Determinization for imperfect-information search (M2). Because hands rotate a
// fixed direction each turn, seat `me` knows every opponent hand within rotation
// distance (turn-1); the single remaining un-held hand is pinned by deck
// elimination. So the set of UNKNOWN hands is a pure function of the turn — and
// collapses to zero by turn 4 in a 5-player age. A determinization keeps me's
// hand + all public state fixed and re-partitions only the unknown hands
// (uniformly) — so late-age it equals the truth (the phase gate is automatic).
#pragma once
#include "sw/rng.hpp"
#include "sw/state.hpp"

namespace sw {

// Rotation distance from `me` to seat `j` for the age's pass direction.
inline int passDist(int age, int me, int j) {
  return passLeft(age) ? (j - me + N) % N : (me - j + N) % N;
}

// Number of opponent hands `me` genuinely cannot pin down (0 => perfect info).
// A single un-held hand is pinned by elimination, so it counts as known.
inline int numUnknownHands(const GameState& s, int me) {
  int nu = 0;
  for (int j = 0; j < N; j++)
    if (j != me && passDist(s.age, me, j) >= s.turn) nu++;
  return nu > 1 ? nu : 0;
}

// A full state consistent with `me`'s information: me's hand + all public state
// unchanged, unknown opponent hands re-partitioned uniformly, and the decks me
// cannot see (future ages) reshuffled. Sampled from the true state's circulating
// cards (valid for forward simulation).
GameState determinize(const GameState& trueState, int me, Rng& rng);

}  // namespace sw
