// Every search heuristic in one place. None of these change what a VALID
// packing is (that is rules.hpp) — they bound how much of the candidate
// space is enumerated and how the search spends its time. Changing one can
// change which packings are found, never whether a found one is legal.
#pragma once
#include <cstdint>

namespace sp::tuning {

// ── Candidate generation (candidates.cpp) ──────────────────────────────
// Two-box columns taller than this share of the nominal height are left to
// stacked cells instead (keeps the column list short).
inline constexpr int kColumnMaxHeightPct = 80;
// Columns kept, best mismatch density first.
inline constexpr int kColumnCap = 3000;
// Three-wide cells are only built when at least this wide: they exist to
// partner the widest boxes.
inline constexpr int kTripleMinWidth = 250;
// Cells kept: every column-free cell, then column cells round-robin over
// width × height buckets, then a per-box coverage floor.
inline constexpr int kCellCap = 5000;
inline constexpr int kCellCoverageFloor = 60;
inline constexpr int kBucketMm = 25;

// Pile enumeration (depth-first over cells inside a width window).
inline constexpr int kMaxCellsPerPile = 6;
inline constexpr long long kPileCap = 1'500'000;
inline constexpr long long kPileNodeBudget = 400'000'000;
// Pass 1 walks column-free cells exhaustively; pass 2 adds columns under a
// per-anchor budget so the widest anchors cannot starve the narrow ones.
inline constexpr long long kPlainAnchorNodes = 5'000'000;
inline constexpr int kPlainAnchorRecords = 1 << 28;
inline constexpr long long kColumnAnchorNodes = 1'000'000;
inline constexpr int kColumnAnchorRecords = 800;

// FillAll keeps the cleanest piles per category, round-robin over width
// buckets, then a per-box coverage floor.
inline constexpr int kGroupPileQuota = 4000;
inline constexpr int kPlainPileQuota = 5000;
inline constexpr int kColumnPileQuota = 2500;
inline constexpr int kPileCoverageFloor = 40;

// ── Search (search.cpp) ────────────────────────────────────────────────
inline constexpr int kBeamWide = 1500;
inline constexpr int kBeamNarrow = 800;
// Shuffled-order beam passes and greedy restarts per objective.
inline constexpr int kMaxVolumeShuffledBeams = 2;
inline constexpr int kMaxVolumeGreedyRuns = 1;
inline constexpr int kMaxVolumeGreedyIterations = 20'000;
inline constexpr int kFillAllShuffledBeams = 14;
inline constexpr int kFillAllGreedyRuns = 6;
inline constexpr int kFillAllGreedyIterations = 150'000;
// Greedy keys are multiplied by uniform noise in [1 - x, 1 + x].
inline constexpr double kMaxVolumeGreedyNoise = 0.25;
inline constexpr double kFillAllGreedyNoise = 0.30;
// Greedy keys shrink by this share per mandatory box a pile carries — a
// preference, not a rule: putting such piles strictly first made every
// restart begin alike (measured: the same packing on every seed).
inline constexpr double kGreedyMandatoryPreference = 0.15;
// FillAll's greedy prefers clean piles: (holes + this) per mm of width. The
// offset keeps hole-free piles from all tying at zero, which noise could not
// reorder.
inline constexpr long long kFillAllGreedyHolesOffset = 200;
// Default --seed.
inline constexpr uint64_t kSearchSeed = 0x5EED5EEDull;

// ── Ranking and arrangement (driver.cpp, arrange.cpp) ──────────────────
// Two emitted packings differ by at least this many moved boxes (boxes of
// identical dimensions count as interchangeable).
inline constexpr int kMinMovedBoxes = 4;
// FillAll arranges this many of the best raw candidates to rank them on the
// holes left inside the nominal windows.
inline constexpr int kFillAllExactCandidates = 400;
// Layout attempts per shelf, and pile orders tried (best unverified first).
inline constexpr long long kArrangeTries = 100'000;
inline constexpr int kArrangeOrders = 16;

// ── Column library (library.cpp) ───────────────────────────────────────
// A column is kept while it adds coverage: a box seen in fewer columns than
// this, or a touching box pair seen fewer times than this.
inline constexpr int kLibraryPerBox = 10;
inline constexpr int kLibraryPerPair = 3;

}  // namespace sp::tuning
