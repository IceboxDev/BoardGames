// Value-type game state — trivially copyable (no pointers/heap), so a search-tree
// node clone is `GameState next = cur;` and `apply(next, move)` mutates in place.
// Mirrors packages/core/src/games/7-wonders/types.ts GameState/PlayerState.
#pragma once
#include <cstdint>

#include "sw/cards.hpp"
#include "sw/move.hpp"
#include "sw/resources.hpp"

namespace sw {

enum class Phase : uint8_t { Selecting, Revealing, Pending, GameOver };
enum class PendingKind : uint8_t { BabylonSeventh, Halikarnassos };
enum class EdStatus : uint8_t { Project, Built, Failed };

// Fixed caps (sized for a 5-player game with head-room; asserted in setup/apply).
inline constexpr int MAX_HAND = 8;
inline constexpr int MAX_TABLEAU = 32;
inline constexpr int MAX_DISCARD = 128;
inline constexpr int MAX_DECK = 40;
inline constexpr int MAX_TOKENS = 8;
inline constexpr int MAX_ED_TOKENS = 8;
inline constexpr int MAX_BONUS_PROD = 4;

struct PendingItem {
  PendingKind kind;
  uint8_t player;
};

struct EdSlot {
  uint8_t age;
  uint8_t edificeId;  // index into EDIFICES
  uint8_t pawnsTotal;
  uint8_t pawnsLeft;
  EdStatus status;
  uint8_t numParticipants;
  uint8_t participants[N];
};

struct PlayerState {
  uint8_t wonderId = 0;
  uint8_t side = 0;  // 0=A, 1=B
  uint8_t stagesBuilt = 0;
  bool freeBuildUsedThisAge = false;
  int16_t coins = 0;

  uint8_t numTableau = 0;
  uint8_t tableau[MAX_TABLEAU] = {};  // CardType ids
  uint64_t nameMask[2] = {0, 0};      // played nameIds (dup/chain check)

  uint8_t numTokens = 0;
  int8_t militaryTokens[MAX_TOKENS] = {};

  // ── Edifice (all empty/0 in a base game) ──
  uint8_t bonusShields = 0;
  uint8_t numVictory = 0;
  int8_t victoryTokens[MAX_ED_TOKENS] = {};
  uint8_t numDebt = 0;
  int8_t debtTokens[MAX_ED_TOKENS] = {};
  uint8_t numBonusProd = 0;
  uint8_t bonusProd[MAX_BONUS_PROD] = {};  // each a resource mask (choose one)
};

struct GameState {
  uint32_t seed = 0;
  uint8_t age = 1;
  uint8_t turn = 1;
  Phase phase = Phase::Selecting;

  PlayerState players[N];

  uint8_t handCount[N] = {};
  uint8_t hands[N][MAX_HAND] = {};  // CardType ids

  bool hasSelection[N] = {};
  Move selections[N];

  uint16_t discardCount = 0;
  uint8_t discard[MAX_DISCARD] = {};  // CardType ids

  uint8_t pendingCount = 0;
  PendingItem pendingQueue[2 * N];

  uint8_t deck2Count = 0, deck3Count = 0;
  uint8_t deck2[MAX_DECK] = {};
  uint8_t deck3[MAX_DECK] = {};

  uint8_t edificeCount = 0;  // 0 (base) or 3
  EdSlot edifices[3];
};

// ── nameMask helpers (dup-name / chain check) ────────────────────────────────
inline bool hasName(const PlayerState& p, int nameId) {
  return (p.nameMask[nameId >> 6] >> (nameId & 63)) & 1u;
}
inline void setName(PlayerState& p, int nameId) {
  p.nameMask[nameId >> 6] |= (uint64_t(1) << (nameId & 63));
}

// Add a played card to a tableau, keeping the nameMask in sync. Wonder-buried
// cards do NOT go through here (they are not part of the tableau).
inline void addTableauCard(PlayerState& p, uint8_t cardTypeId) {
  p.tableau[p.numTableau++] = cardTypeId;
  setName(p, cardType(cardTypeId).nameId);
}

}  // namespace sw
