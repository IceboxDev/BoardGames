#pragma once
// Training samples (one per recorded decision) and their shard file format,
// read by train/data.py. Little-endian, CSR-style so numpy can map it:
//   u32 magic 'HGS1', u32 FEATURE_VERSION, u32 N, u32 F (state nnz), u32 A (actions), u32 AF (action nnz)
//   u8  players[N]
//   u8  legalCount... (not stored; from actOff)
//   u32 featOff[N+1]; u16 featIdx[F]; u16 featVal[F] (float16)
//   u32 actOff[N+1];  u32 actFeatOff[A+1]; u16 actIdx[AF]; u16 actVal[AF] (float16)
//   u16 policy[A] (float16 target probabilities, per sample summing to 1)
//   f32 value[N*V_DIM] (per relative seat: win share, survived, score/100, placement 0..1)
//   u8  mask[N*MAX_PLAYERS]
#include <cstdint>
#include <string>
#include <vector>

#include "hg/features.hpp"
#include "hg/half.hpp"
#include "hg/net.hpp"

namespace hg {

constexpr uint32_t SAMPLES_MAGIC = 0x31534748;  // "HGS1"

struct SampleShard {
  std::vector<uint8_t> players;
  std::vector<uint32_t> featOff{0};
  std::vector<uint16_t> featIdx, featVal;
  std::vector<uint32_t> actOff{0}, actFeatOff{0};
  std::vector<uint16_t> actIdx, actVal, policy;
  std::vector<float> value;
  std::vector<uint8_t> mask;
  size_t size() const { return players.size(); }
  /** Add a decision; value targets are filled in by finishGame(). */
  void addDecision(const GameState& s, int observer, const Actions& legal,
                   const std::vector<float>& target);
  /** Fill value targets for the last `count` decisions from the finished game. */
  void finishGame(const GameState& end, size_t first, const std::vector<int>& observers);
  /** Drop every decision from index `first` on (an unfinished game). */
  void truncate(size_t first);
  bool write(const std::string& path) const;
  bool read(const std::string& path);
  void clear();
};

}  // namespace hg
