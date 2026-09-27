// V8's Math.exp (src/base/ieee754.cc), itself FreeBSD msun's e_exp.c
// (fdlibm). Ported so Strigoi's outcomeUtility is bit-identical to the TS one.
// Verified against Node over random arguments: `hg expcheck <file>`.
#include <cstdint>
#include <cstring>

#include "hg/ai.hpp"

namespace hg {

static inline uint32_t highWord(double x) {
  uint64_t b;
  std::memcpy(&b, &x, 8);
  return uint32_t(b >> 32);
}
static inline uint32_t lowWord(double x) {
  uint64_t b;
  std::memcpy(&b, &x, 8);
  return uint32_t(b);
}
static inline double fromWords(uint32_t hi, uint32_t lo) {
  uint64_t b = (uint64_t(hi) << 32) | lo;
  double d;
  std::memcpy(&d, &b, 8);
  return d;
}

double jsExp(double x) {
  static const double one = 1.0, halF[2] = {0.5, -0.5}, o_threshold = 7.09782712893383973096e+02,
                      u_threshold = -7.45133219101941108420e+02,
                      ln2HI[2] = {6.93147180369123816490e-01, -6.93147180369123816490e-01},
                      ln2LO[2] = {1.90821492927058770002e-10, -1.90821492927058770002e-10},
                      invln2 = 1.44269504088896338700e+00, P1 = 1.66666666666666019037e-01,
                      P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05,
                      P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08,
                      E = 2.718281828459045;
  static volatile double huge = 1.0e+300, twom1000 = 9.33263618503218878990e-302,
                         two1023 = 8.988465674311579539e307;

  double y, hi = 0.0, lo = 0.0, c, t, twopk;
  int32_t k = 0, xsb;
  uint32_t hx = highWord(x);
  xsb = int32_t((hx >> 31) & 1);
  hx &= 0x7fffffff;

  if (hx >= 0x40862E42) {
    if (hx >= 0x7ff00000) {
      uint32_t lx = lowWord(x);
      if (((hx & 0xfffff) | lx) != 0) return x + x;
      return (xsb == 0) ? x : 0.0;
    }
    if (x > o_threshold) return huge * huge;
    if (x < u_threshold) return twom1000 * twom1000;
  }

  if (hx > 0x3fd62e42) {
    if (hx < 0x3FF0A2B2) {
      if (x == 1.0) return E;
      hi = x - ln2HI[xsb];
      lo = ln2LO[xsb];
      k = 1 - xsb - xsb;
    } else {
      k = static_cast<int>(invln2 * x + halF[xsb]);
      t = k;
      hi = x - t * ln2HI[0];
      lo = t * ln2LO[0];
    }
    x = hi - lo;
  } else if (hx < 0x3e300000) {
    if (huge + x > one) return one + x;
  } else {
    k = 0;
  }

  t = x * x;
  if (k >= -1021)
    twopk = fromWords(uint32_t(0x3ff00000 + (k << 20)), 0);
  else
    twopk = fromWords(uint32_t(0x3ff00000 + ((k + 1000) << 20)), 0);
  c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k == 0) return one - ((x * c) / (c - 2.0) - x);
  y = one - ((lo - (x * c) / (2.0 - c)) - hi);
  if (k >= -1021) {
    if (k == 1024) return y * 2.0 * two1023;
    return y * twopk;
  }
  return y * twopk * twom1000;
}

}  // namespace hg
