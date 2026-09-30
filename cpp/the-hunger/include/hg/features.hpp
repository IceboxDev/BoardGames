#pragma once
// Network inputs for Lilith: a SPARSE encoding of what `observer` may know
// (hands, play areas, deck and discard contents are public; deck ORDER, the
// Hunt deck, the Tavern, face-down Chests, rivals' Missions and the Crypt piles
// are not — exactly what determinize() resamples). Seats are relative to the
// observer (0 = me, then clockwise), padded to 6.
//
// Layout (FEATURE_DIM total): [global G_DIM][observer-private O_DIM][seat × 6 × SEAT_DIM].
// Actions get their own sparse encoding (ACTION_DIM) for the policy head.
//
// Changing the layout changes FEATURE_VERSION; weights carry it in their header.
#include <cstdint>

#include "hg/engine.hpp"

namespace hg {

constexpr int FEATURE_VERSION = 1;
constexpr int G_DIM = 704;
constexpr int O_DIM = 101;
constexpr int SEAT_DIM = 762;
constexpr int FEATURE_DIM = G_DIM + O_DIM + MAX_PLAYERS * SEAT_DIM;
constexpr int ACTION_DIM = 595;
constexpr int MAX_ACTION_FEATS = 48;

struct SparseFeatures {
  int n = 0;
  uint16_t idx[1536];
  float val[1536];
  void add(int i, float v) {
    if (v != 0 && n < 1536) idx[n] = uint16_t(i), val[n] = v, n++;
  }
};

struct ActionFeatures {
  int n = 0;
  uint16_t idx[MAX_ACTION_FEATS];
  float val[MAX_ACTION_FEATS];
  void add(int i, float v) {
    if (v != 0 && n < MAX_ACTION_FEATS) idx[n] = uint16_t(i), val[n] = v, n++;
  }
};

/** Relative seat of `seat` from `observer`'s chair. */
inline int relSeat(int seat, int observer, int n) { return (seat - observer + n) % n; }

void encodeState(const GameState& s, int observer, SparseFeatures& out);
void encodeAction(const GameState& s, const Action& a, ActionFeatures& out);

}  // namespace hg
