#include "hg/samples.hpp"

#include <cstdio>
#include <cstring>

namespace hg {

void SampleShard::addDecision(const GameState& s, int observer, const Actions& legal,
                              const std::vector<float>& target) {
  thread_local SparseFeatures x;
  thread_local ActionFeatures af;
  encodeState(s, observer, x);
  players.push_back(uint8_t(s.nPlayers));
  for (int k = 0; k < x.n; k++) featIdx.push_back(x.idx[k]), featVal.push_back(toHalf(x.val[k]));
  featOff.push_back(uint32_t(featIdx.size()));
  for (size_t i = 0; i < legal.size(); i++) {
    encodeAction(s, legal[i], af);
    for (int k = 0; k < af.n; k++) actIdx.push_back(af.idx[k]), actVal.push_back(toHalf(af.val[k]));
    actFeatOff.push_back(uint32_t(actIdx.size()));
    policy.push_back(toHalf(target[i]));
  }
  actOff.push_back(uint32_t(actFeatOff.size() - 1));
  value.resize(value.size() + V_DIM, 0.f);
  mask.resize(mask.size() + MAX_PLAYERS, 0);
}

void SampleShard::finishGame(const GameState& end, size_t first, const std::vector<int>& observers) {
  const Result& r = end.result;
  const int n = end.nPlayers;
  for (size_t k = first; k < size(); k++) {
    int obs = observers[k - first];
    float* v = &value[k * V_DIM];
    uint8_t* m = &mask[k * MAX_PLAYERS];
    for (int i = 0; i < n; i++) {
      int rel = relSeat(i, obs, n);
      double win = 0;
      for (int w = 0; w < r.winners.size(); w++)
        if (r.winners[w] == i) win = 1.0 / r.winners.size();
      v[rel * V_PER_SEAT + 0] = float(win);
      v[rel * V_PER_SEAT + 1] = r.breakdown[i].fate != F_ASHES;
      v[rel * V_PER_SEAT + 2] = r.scores[i] / 100.0f;
      v[rel * V_PER_SEAT + 3] = n > 1 ? float(n - r.placements[i]) / float(n - 1) : 1.f;
      m[rel] = 1;
    }
  }
}

template <class T>
static bool put(std::FILE* f, const std::vector<T>& v) {
  return v.empty() || std::fwrite(v.data(), sizeof(T), v.size(), f) == v.size();
}

bool SampleShard::write(const std::string& path) const {
  std::FILE* f = std::fopen(path.c_str(), "wb");
  if (!f) return false;
  uint32_t hdr[6] = {SAMPLES_MAGIC, uint32_t(FEATURE_VERSION), uint32_t(size()),
                     uint32_t(featIdx.size()), uint32_t(policy.size()), uint32_t(actIdx.size())};
  bool ok = std::fwrite(hdr, 4, 6, f) == 6 && put(f, players) && put(f, featOff) && put(f, featIdx) &&
            put(f, featVal) && put(f, actOff) && put(f, actFeatOff) && put(f, actIdx) &&
            put(f, actVal) && put(f, policy) && put(f, value) && put(f, mask);
  std::fclose(f);
  return ok;
}

void SampleShard::truncate(size_t first) {
  if (first >= size()) return;
  players.resize(first);
  featOff.resize(first + 1);
  featIdx.resize(featOff.back());
  featVal.resize(featOff.back());
  actOff.resize(first + 1);
  actFeatOff.resize(actOff.back() + 1);
  policy.resize(actOff.back());
  actIdx.resize(actFeatOff.back());
  actVal.resize(actFeatOff.back());
  value.resize(first * V_DIM);
  mask.resize(first * MAX_PLAYERS);
}

template <class T>
static bool get(std::FILE* f, std::vector<T>& v, size_t n) {
  v.resize(n);
  return n == 0 || std::fread(v.data(), sizeof(T), n, f) == n;
}

bool SampleShard::read(const std::string& path) {
  std::FILE* f = std::fopen(path.c_str(), "rb");
  if (!f) return false;
  uint32_t h[6];
  bool ok = std::fread(h, 4, 6, f) == 6 && h[0] == SAMPLES_MAGIC && h[1] == uint32_t(FEATURE_VERSION);
  size_t n = h[2], nf = h[3], na = h[4], naf = h[5];
  ok = ok && get(f, players, n) && get(f, featOff, n + 1) && get(f, featIdx, nf) && get(f, featVal, nf) &&
       get(f, actOff, n + 1) && get(f, actFeatOff, na + 1) && get(f, actIdx, naf) &&
       get(f, actVal, naf) && get(f, policy, na) && get(f, value, n * V_DIM) &&
       get(f, mask, n * MAX_PLAYERS);
  std::fclose(f);
  return ok;
}

void SampleShard::clear() { *this = SampleShard{}; }

}  // namespace hg
