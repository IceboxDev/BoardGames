#pragma once
// Lilith's network: sparse input → 512 → 256 → 256 (residual), two heads.
//   value : per relative seat (6) × [win logit, survive logit, score/100, placement 0..1]
//   policy: q = W·h (Q_DIM); an action's logit = q · Σ v·E[f] + Σ v·B[f] over its
//           sparse action features (features.hpp encodeAction)
// Inference is plain C++ (the first layer is a sum over the ~700 non-zero
// inputs, NNUE-style), so it runs in the CLI, self-play and WebAssembly alike.
// Weights: train/export.py writes a flat float32 file with a header; the
// PyTorch model in train/model.py is the same computation.
#include <cstdint>
#include <string>
#include <vector>

#include "hg/features.hpp"

namespace hg {

constexpr uint32_t NET_MAGIC = 0x4c494c31;      // "LIL1": float32 tensors
constexpr uint32_t NET_MAGIC_F16 = 0x4c494c32;  // "LIL2": float16 tensors
constexpr int H1 = 512, H2 = 256, H3 = 256, Q_DIM = 64;
constexpr int V_PER_SEAT = 4, V_DIM = MAX_PLAYERS * V_PER_SEAT;

struct NetOutput {
  float value[V_DIM];
  float q[Q_DIM];
};

class Net {
 public:
  bool loaded = false;
  /** From a file (CLI / self-play). */
  bool load(const std::string& path);
  /** From memory (WebAssembly embeds the bytes). */
  bool loadBytes(const uint8_t* data, size_t n);
  void forward(const SparseFeatures& x, NetOutput& out) const;
  float actionLogit(const NetOutput& out, const ActionFeatures& a) const;
  /** Win probability per relative seat (softmax over the seated ones). */
  void winProbs(const NetOutput& out, int nPlayers, float* p) const;

 private:
  bool parse(const float* f, size_t count);
  std::vector<float> W1, b1, W2, b2, W3, b3, Wv, bv, Wq, bq, E, B;
};

}  // namespace hg
