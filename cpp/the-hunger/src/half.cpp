// float <-> IEEE half (training shards, the embedded LIL2 network).
#include <cstdint>
#include <cstring>

#include "hg/half.hpp"

namespace hg {

uint16_t toHalf(float f) {
  uint32_t x;
  std::memcpy(&x, &f, 4);
  uint32_t sign = (x >> 16) & 0x8000;
  int32_t exp = int32_t((x >> 23) & 0xff) - 127 + 15;
  uint32_t mant = x & 0x7fffff;
  if (exp <= 0) {
    if (exp < -10) return uint16_t(sign);
    mant |= 0x800000;
    uint32_t shift = uint32_t(14 - exp);
    uint32_t h = mant >> shift;
    if ((mant >> (shift - 1)) & 1) h++;
    return uint16_t(sign | h);
  }
  if (exp >= 31) return uint16_t(sign | 0x7c00);
  uint32_t h = sign | (uint32_t(exp) << 10) | (mant >> 13);
  if (mant & 0x1000) h++;  // round half up
  return uint16_t(h);
}

float fromHalf(uint16_t h) {
  uint32_t sign = uint32_t(h & 0x8000) << 16;
  int exp = (h >> 10) & 0x1f;
  uint32_t mant = h & 0x3ff;
  uint32_t x;
  if (exp == 0) {
    if (mant == 0) {
      x = sign;
    } else {
      exp = 1;
      while (!(mant & 0x400)) mant <<= 1, exp--;
      mant &= 0x3ff;
      x = sign | uint32_t(exp - 15 + 127) << 23 | mant << 13;
    }
  } else if (exp == 31) {
    x = sign | 0x7f800000 | mant << 13;
  } else {
    x = sign | uint32_t(exp - 15 + 127) << 23 | mant << 13;
  }
  float f;
  std::memcpy(&f, &x, 4);
  return f;
}

}  // namespace hg
