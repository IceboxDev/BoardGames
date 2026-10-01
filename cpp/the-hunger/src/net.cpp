#include "hg/net.hpp"

#include "hg/half.hpp"

#include <cmath>
#include <cstdio>
#include <cstring>

namespace hg {

// File: uint32 magic, int32[8] = {FEATURE_VERSION, FEATURE_DIM, H1, H2, H3, V_DIM, Q_DIM, ACTION_DIM},
// then float32 tensors in this order (row-major, PyTorch's [out][in] for dense layers):
//   W1 [FEATURE_DIM][H1] (embedding rows), b1 [H1], W2 [H2][H1], b2, W3 [H3][H2], b3,
//   Wv [V_DIM][H3], bv, Wq [Q_DIM][H3], bq, E [ACTION_DIM][Q_DIM], B [ACTION_DIM].
static const size_t SIZES[] = {
    size_t(FEATURE_DIM) * H1, H1, size_t(H2) * H1, H2, size_t(H3) * H2, H3,
    size_t(V_DIM) * H3,       V_DIM, size_t(Q_DIM) * H3, Q_DIM, size_t(ACTION_DIM) * Q_DIM, ACTION_DIM,
};

bool Net::parse(const float* f, size_t count) {
  std::vector<float>* dst[] = {&W1, &b1, &W2, &b2, &W3, &b3, &Wv, &bv, &Wq, &bq, &E, &B};
  size_t need = 0;
  for (size_t s : SIZES) need += s;
  if (count != need) {
    std::fprintf(stderr, "net: %zu floats, expected %zu\n", count, need);
    return false;
  }
  for (int i = 0; i < 12; i++) {
    dst[i]->assign(f, f + SIZES[i]);
    f += SIZES[i];
  }
  return loaded = true;
}

bool Net::loadBytes(const uint8_t* data, size_t n) {
  loaded = false;
  if (n < 36) return false;
  uint32_t magic;
  int32_t hdr[8];
  std::memcpy(&magic, data, 4);
  std::memcpy(hdr, data + 4, 32);
  const int32_t want[8] = {FEATURE_VERSION, FEATURE_DIM, H1, H2, H3, V_DIM, Q_DIM, ACTION_DIM};
  if ((magic != NET_MAGIC && magic != NET_MAGIC_F16) || std::memcmp(hdr, want, sizeof want) != 0) {
    std::fprintf(stderr, "net: header mismatch (feature layout or architecture changed)\n");
    return false;
  }
  std::vector<float> f;
  if (magic == NET_MAGIC_F16) {  // half-precision tensors (the embedded live copy)
    size_t count = (n - 36) / 2;
    f.resize(count);
    for (size_t i = 0; i < count; i++) {
      uint16_t h;
      std::memcpy(&h, data + 36 + 2 * i, 2);
      f[i] = fromHalf(h);
    }
  } else {
    size_t count = (n - 36) / 4;
    f.resize(count);
    std::memcpy(f.data(), data + 36, count * 4);
  }
  return parse(f.data(), f.size());
}

#ifndef __wasi__  // the WebAssembly build loads from memory only (no WASI file imports)
bool Net::load(const std::string& path) {
  std::FILE* fp = std::fopen(path.c_str(), "rb");
  if (!fp) return loaded = false;
  std::vector<uint8_t> bytes;
  uint8_t buf[1 << 16];
  size_t k;
  while ((k = std::fread(buf, 1, sizeof buf, fp)) > 0) bytes.insert(bytes.end(), buf, buf + k);
  std::fclose(fp);
  return loadBytes(bytes.data(), bytes.size());
}
#endif

static inline float relu(float x) { return x > 0 ? x : 0; }

void Net::forward(const SparseFeatures& x, NetOutput& out) const {
  alignas(32) float h1[H1], h2[H2], h3[H3];
  std::memcpy(h1, b1.data(), sizeof h1);
  for (int k = 0; k < x.n; k++) {
    const float* row = &W1[size_t(x.idx[k]) * H1];
    const float v = x.val[k];
    for (int j = 0; j < H1; j++) h1[j] += v * row[j];
  }
  for (int j = 0; j < H1; j++) h1[j] = relu(h1[j]);
  for (int i = 0; i < H2; i++) {
    const float* w = &W2[size_t(i) * H1];
    float s = b2[i];
    for (int j = 0; j < H1; j++) s += w[j] * h1[j];
    h2[i] = relu(s);
  }
  for (int i = 0; i < H3; i++) {
    const float* w = &W3[size_t(i) * H2];
    float s = b3[i];
    for (int j = 0; j < H2; j++) s += w[j] * h2[j];
    h3[i] = relu(s) + h2[i];
  }
  for (int i = 0; i < V_DIM; i++) {
    const float* w = &Wv[size_t(i) * H3];
    float s = bv[i];
    for (int j = 0; j < H3; j++) s += w[j] * h3[j];
    out.value[i] = s;
  }
  for (int i = 0; i < Q_DIM; i++) {
    const float* w = &Wq[size_t(i) * H3];
    float s = bq[i];
    for (int j = 0; j < H3; j++) s += w[j] * h3[j];
    out.q[i] = s;
  }
}

float Net::actionLogit(const NetOutput& out, const ActionFeatures& a) const {
  float logit = 0;
  for (int k = 0; k < a.n; k++) {
    const float* e = &E[size_t(a.idx[k]) * Q_DIM];
    float d = 0;
    for (int j = 0; j < Q_DIM; j++) d += out.q[j] * e[j];
    logit += a.val[k] * (d + B[a.idx[k]]);
  }
  return logit;
}

void Net::winProbs(const NetOutput& out, int nPlayers, float* p) const {
  float mx = -1e30f;
  for (int i = 0; i < nPlayers; i++) mx = std::max(mx, out.value[i * V_PER_SEAT]);
  float sum = 0;
  for (int i = 0; i < nPlayers; i++) sum += p[i] = std::exp(out.value[i * V_PER_SEAT] - mx);
  for (int i = 0; i < nPlayers; i++) p[i] /= sum;
  for (int i = nPlayers; i < MAX_PLAYERS; i++) p[i] = 0;
}

}  // namespace hg
