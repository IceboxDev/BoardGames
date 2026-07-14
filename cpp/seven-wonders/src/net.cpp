#include "sw/net.hpp"

#include <cmath>
#include <cstdio>

namespace sw {

static bool readFloats(std::FILE* f, std::vector<float>& v, int n) {
  v.resize(n);
  return int(std::fread(v.data(), sizeof(float), n, f)) == n;
}

bool Net::load(const char* path) {
  loaded = false;
  std::FILE* f = std::fopen(path, "rb");
  if (!f) return false;
  int32_t hdr[5];
  uint32_t magic = 0;
  bool ok = std::fread(&magic, sizeof(magic), 1, f) == 1 &&
            std::fread(hdr, sizeof(int32_t), 5, f) == 5;
  if (ok && (magic != WEIGHTS_MAGIC || hdr[0] != FEAT_DIM || hdr[1] != H1 || hdr[2] != H2 ||
             hdr[3] != POLICY_DIM || hdr[4] != VALUE_DIM)) {
    ok = false;
    std::fprintf(stderr, "net: weights header mismatch (arch changed?)\n");
  }
  ok = ok && readFloats(f, W1, H1 * FEAT_DIM) && readFloats(f, b1, H1) &&
       readFloats(f, W2, H2 * H1) && readFloats(f, b2, H2) &&
       readFloats(f, Wp, POLICY_DIM * H2) && readFloats(f, bp, POLICY_DIM) &&
       readFloats(f, Wv, VALUE_DIM * H2) && readFloats(f, bv, VALUE_DIM);
  std::fclose(f);
  loaded = ok;
  return ok;
}

void Net::eval(const float* feat, float* policy, float* value) const {
  float h1[H1], h2[H2];
  for (int r = 0; r < H1; r++) {
    float s = b1[r];
    const float* w = &W1[r * FEAT_DIM];
    for (int k = 0; k < FEAT_DIM; k++) s += w[k] * feat[k];
    h1[r] = s > 0 ? s : 0;  // ReLU
  }
  for (int r = 0; r < H2; r++) {
    float s = b2[r];
    const float* w = &W2[r * H1];
    for (int k = 0; k < H1; k++) s += w[k] * h1[k];
    h2[r] = s > 0 ? s : 0;
  }
  for (int r = 0; r < POLICY_DIM; r++) {
    float s = bp[r];
    const float* w = &Wp[r * H2];
    for (int k = 0; k < H2; k++) s += w[k] * h2[k];
    policy[r] = s;  // logits
  }
  for (int r = 0; r < VALUE_DIM; r++) {
    float s = bv[r];
    const float* w = &Wv[r * H2];
    for (int k = 0; k < H2; k++) s += w[k] * h2[k];
    value[r] = 1.0f / (1.0f + std::exp(-s));  // sigmoid -> [0,1]
  }
}

}  // namespace sw
