// A set of box indices — what cells, piles, packings and constraint groups
// are made of. Two 64-bit words keep the set algebra a few instructions
// while lifting the old 64-box ceiling to kMaxBoxes.
#pragma once
#include <algorithm>
#include <bit>
#include <compare>
#include <cstddef>
#include <cstdint>
#include <functional>

namespace sp {

inline constexpr int kMaxBoxes = 128;

class BoxSet {
 public:
  constexpr BoxSet() = default;

  static constexpr BoxSet single(int box) {
    BoxSet s;
    s.add(box);
    return s;
  }
  // {0, 1, …, n-1}
  static constexpr BoxSet firstN(int n) {
    BoxSet s;
    for (int word = 0; word < kWords; word++) {
      int bits = std::clamp(n - 64 * word, 0, 64);
      s.w_[word] = bits == 64 ? ~uint64_t{0} : (uint64_t{1} << bits) - 1;
    }
    return s;
  }

  constexpr bool has(int box) const { return (w_[box >> 6] >> (box & 63)) & 1; }
  constexpr bool empty() const { return (w_[0] | w_[1]) == 0; }
  constexpr bool any() const { return !empty(); }
  constexpr int count() const { return std::popcount(w_[0]) + std::popcount(w_[1]); }
  constexpr bool intersects(const BoxSet& o) const {
    return ((w_[0] & o.w_[0]) | (w_[1] & o.w_[1])) != 0;
  }
  // Every box of `o` is in this set.
  constexpr bool contains(const BoxSet& o) const {
    return (o.w_[0] & ~w_[0]) == 0 && (o.w_[1] & ~w_[1]) == 0;
  }
  constexpr BoxSet minus(const BoxSet& o) const {
    BoxSet s;
    s.w_[0] = w_[0] & ~o.w_[0];
    s.w_[1] = w_[1] & ~o.w_[1];
    return s;
  }
  constexpr BoxSet& add(int box) {
    w_[box >> 6] |= uint64_t{1} << (box & 63);
    return *this;
  }

  constexpr BoxSet& operator|=(const BoxSet& o) {
    w_[0] |= o.w_[0];
    w_[1] |= o.w_[1];
    return *this;
  }
  constexpr BoxSet& operator&=(const BoxSet& o) {
    w_[0] &= o.w_[0];
    w_[1] &= o.w_[1];
    return *this;
  }
  friend constexpr BoxSet operator|(BoxSet a, const BoxSet& b) { return a |= b; }
  friend constexpr BoxSet operator&(BoxSet a, const BoxSet& b) { return a &= b; }
  friend constexpr BoxSet operator^(BoxSet a, const BoxSet& b) {
    a.w_[0] ^= b.w_[0];
    a.w_[1] ^= b.w_[1];
    return a;
  }

  friend constexpr bool operator==(const BoxSet&, const BoxSet&) = default;
  // Numeric order (high word first): containers keyed by sets iterate the
  // same way on every platform.
  friend constexpr std::strong_ordering operator<=>(const BoxSet& a, const BoxSet& b) {
    if (auto c = a.w_[1] <=> b.w_[1]; c != 0) return c;
    return a.w_[0] <=> b.w_[0];
  }

  // Calls f(index) for every member, ascending.
  template <class F>
  constexpr void forEach(F&& f) const {
    for (int word = 0; word < kWords; word++)
      for (uint64_t w = w_[word]; w; w &= w - 1) f(64 * word + std::countr_zero(w));
  }

  size_t hash() const {
    uint64_t h = w_[0] * 0x9E3779B97F4A7C15ull ^ (w_[1] + 0x632BE59BD9B4E019ull);
    h ^= h >> 29;
    h *= 0xBF58476D1CE4E5B9ull;
    return static_cast<size_t>(h ^ (h >> 32));
  }

 private:
  static constexpr int kWords = 2;
  static_assert(kMaxBoxes == 64 * kWords);
  uint64_t w_[kWords] = {0, 0};
};

}  // namespace sp

template <>
struct std::hash<sp::BoxSet> {
  size_t operator()(const sp::BoxSet& s) const noexcept { return s.hash(); }
};
