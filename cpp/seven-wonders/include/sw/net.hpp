// Policy+value network for the AlphaZero-style search (M1). A small MLP whose
// weights are trained in Python and loaded from a flat binary file — this keeps
// the C++ engine self-contained (inference is hand-rolled matmuls, no ML deps).
//
// Seat-relative encoding: features and the value vector are oriented to a
// "perspective" seat p, so ONE network serves all seats. eval(feat, p=self):
//   value[k]  = predicted rank-reward of seat (p+k) mod N   (value[0] = self)
//   policy    = logits over (cardType, action-code) for the perspective seat
#pragma once
#include <cstdint>
#include <vector>

#include "sw/cards.hpp"
#include "sw/move.hpp"
#include "sw/state.hpp"

namespace sw {

// ── Architecture (mirror these in the Python trainer) ────────────────────────
inline constexpr int PER_SEAT_FEATS = 19;
inline constexpr int FEAT_DIM = PER_SEAT_FEATS * N /*95*/ + NUM_CARD_TYPES_CT /*78 hand*/ +
                                3 /*age*/ + 6 /*turn*/ + 5 /*misc*/;  // = 187
inline constexpr int POLICY_DIM = NUM_CARD_TYPES_CT * 4;              // (cardType, code) = 312
inline constexpr int VALUE_DIM = N;                                   // per-seat rank reward
inline constexpr int H1 = 128;
inline constexpr int H2 = 128;
inline constexpr uint32_t WEIGHTS_MAGIC = 0x53574e31;  // "SWN1"

// Policy bucket for a selecting move: cardType * 4 + code
// (0 discard, 1 play, 2 build-wonder, 3 build-wonder+participate).
inline int policyIndex(const GameState& st, int seat, const Move& m) {
  int ct = st.hands[seat][m.card];
  int code = m.kind == MoveKind::Discard      ? 0
             : m.kind == MoveKind::PlayCard    ? 1
             : (m.participate ? 3 : 2);
  return ct * 4 + code;
}

// Seat-relative feature encoding (writes exactly FEAT_DIM floats).
void encodeFeatures(const GameState& st, int perspective, float* out);

struct Net {
  bool loaded = false;
  std::vector<float> W1, b1, W2, b2, Wp, bp, Wv, bv;

  bool load(const char* path);
  // feat[FEAT_DIM] -> policy[POLICY_DIM] (logits), value[VALUE_DIM] (in [0,1]).
  void eval(const float* feat, float* policy, float* value) const;
};

}  // namespace sw
