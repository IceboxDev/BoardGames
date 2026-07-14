// Core enums + constants, mirroring packages/core/src/games/7-wonders/types.ts.
// Resource bit order is load-bearing (RAW_MASK, payment masks) and MUST match TS:
//   wood, stone, clay, ore, glass, loom, papyrus  (raw = bits 0..3).
#pragma once
#include <cstdint>

namespace sw {

// Fixed player count for this engine (single knob; widen later if needed).
inline constexpr int N = 5;

// ── Resources ───────────────────────────────────────────────────────────────
enum Resource : uint8_t { Wood = 0, Stone, Clay, Ore, Glass, Loom, Papyrus };
inline constexpr int NUM_RESOURCES = 7;
inline constexpr uint8_t bit(Resource r) { return uint8_t(1u << r); }
inline constexpr uint8_t RAW_MASK = 0x0F;  // wood|stone|clay|ore

// ── Science symbols ─────────────────────────────────────────────────────────
enum Science : uint8_t { Gear = 0, Compass, Tablet };
inline constexpr int NUM_SCIENCE = 3;

// ── Card colors ─────────────────────────────────────────────────────────────
enum Color : uint8_t { Brown = 0, Grey, Blue, Yellow, Red, Green, Purple };
inline constexpr int NUM_COLORS = 7;

// ── Count scopes (self / neighbours) ────────────────────────────────────────
inline constexpr uint8_t SELF = 1, LEFT = 2, RIGHT = 4;

// ── Wonders ─────────────────────────────────────────────────────────────────
// Index order matches TS WONDER_IDS (shuffle parity depends on it).
enum WonderId : uint8_t {
  Giza = 0, Babylon, Olympia, Rhodes, Ephesos, Alexandria, Halikarnassos
};
inline constexpr int NUM_WONDERS = 7;

// ── Game constants ──────────────────────────────────────────────────────────
inline constexpr int STARTING_COINS = 3;
inline constexpr int TURNS_PER_AGE = 6;
inline constexpr int DISCARD_COIN_VALUE = 3;
inline constexpr int MILITARY_DEFEAT_POINTS = -1;
inline constexpr int MILITARY_VICTORY_POINTS[4] = {0, 1, 3, 5};  // by age (1..3)

// Seat topology (matches types.ts leftOf/rightOf/passDirection).
inline constexpr int leftOf(int i, int n = N) { return (i + 1) % n; }
inline constexpr int rightOf(int i, int n = N) { return (i - 1 + n) % n; }
// Hands pass left in ages I & III, right in age II.
inline constexpr int passLeft(int age) { return age != 2; }

}  // namespace sw
