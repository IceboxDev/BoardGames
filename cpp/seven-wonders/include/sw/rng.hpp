// Mulberry32 PRNG + Fisher-Yates, byte-identical to packages/core/src/lib/rng.ts.
// uint32 wraparound == JS `|0`/`Math.imul`; unsigned >> == JS `>>>`; the final
// double division reproduces Math.random()-range values exactly (both IEEE-754).
#pragma once
#include <cstdint>
#include <utility>

namespace sw {

struct Rng {
  uint32_t s;
  explicit Rng(uint32_t seed) : s(seed) {}

  // Matches: s=(s+0x6d2b79f5)|0; t=imul(s^(s>>>15),1|s);
  //          t=(t+imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/2^32;
  double next() {
    s = s + 0x6d2b79f5u;
    uint32_t t = (s ^ (s >> 15)) * (1u | s);
    t = (t + (t ^ (t >> 7)) * (61u | t)) ^ t;
    return double(t ^ (t >> 14)) / 4294967296.0;
  }

  // Math.floor(next() * n) for n >= 0 (truncation == floor for non-negatives).
  int below(int n) { return int(next() * n); }
};

// In-place Fisher-Yates; identical RNG consumption to shuffleInPlace in rng.ts.
template <class T>
inline void shuffle(T* a, int len, Rng& rng) {
  for (int i = len - 1; i > 0; i--) {
    int j = rng.below(i + 1);
    std::swap(a[i], a[j]);
  }
}

}  // namespace sw
