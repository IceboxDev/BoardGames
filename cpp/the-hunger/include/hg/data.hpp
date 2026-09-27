// Static content tables for The Hunger. The VALUES are generated from the TS
// content by scripts/gen-cpp-hunger.ts (src/*.gen.cpp); the enums here follow
// the vocab orders that script uses — keep the two in step.
#pragma once
#include <cstdint>

#include "hg/data.gen.hpp"

namespace hg {

// ---- vocabularies ----------------------------------------------------------

enum CardType : int8_t { CT_HUMAN, CT_STARTING, CT_POWER, CT_FAMILIAR, CT_ITEM };
/** HUMAN_CATEGORIES order. */
enum Category : int8_t { CAT_NONE = -1, CAT_VILLAGER, CAT_RELIGIOUS, CAT_MILITARY, CAT_NOBLE };
constexpr int NUM_CATEGORIES = 4;

enum Keyword : uint16_t {
  KW_FAST = 1 << 0,
  KW_SLOW = 1 << 1,
  KW_SPICY = 1 << 2,
  KW_CONFUSE = 1 << 3,
  KW_HOLY_WATER = 1 << 4,
  KW_GREGARIOUS = 1 << 5,
  KW_READY = 1 << 6,
  KW_PERMANENT = 1 << 7,
  KW_UNIQUE = 1 << 8,
  KW_INSPIRING = 1 << 9,
};

enum ManipKind : int8_t { MK_NONE, MK_DRAW, MK_DISCARD_DRAW };
enum PassiveKind : int8_t {
  PK_NONE = -1,
  PK_HUNT_VP_PER_HUMAN,
  PK_EXTRA_HUNT,
  PK_BAT,
  PK_MIST,
  PK_END_TURN_VP,
  PK_WELL_SPEED,
  PK_HUMAN_HUNT_VP,
  PK_STAY_EXTRA_HUNT,
  PK_VP_PER_MISSION,
  PK_SPEED_PER_HUMAN_WORTH,
  PK_HUMANS_BONUS,
  PK_PUSH_TAX,
};
enum When : int8_t { W_ALWAYS, W_HUNTED, W_NOT_HUNTED };
enum ActivatedKind : int8_t {
  AK_NONE = -1,
  AK_DISCARD_FOR_COL1_HUNT,
  AK_DIGEST_WITH_CARD,
  AK_REDRAW_HAND,
  AK_HYPNOSIS
};
enum EndGameKind : int8_t { EG_NONE = -1, EG_IF_HAS, EG_IF_FAMILY, EG_PER_CATEGORY, EG_PER_FAMILY };

enum StdKind : int8_t {
  SK_NONE = -1,
  SK_PER_CATEGORY,
  SK_MAJORITY,
  SK_FEWEST_HUMANS,
  SK_HAS_ROSE,
  SK_HOST,
  SK_PER_BONUS,
  SK_PER_HUMAN_WORTH,
  SK_NONE_WORTH,
  SK_SAME_TYPE,
  SK_PER_KEYWORD,
  SK_PER_DISTINCT,
  SK_LEAST_TYPE,
  SK_MOST_TYPE,
  SK_SCORE_RANK,
  SK_COUNT_HUMANS,
  SK_MISSIONARY,
  SK_SETS,
  SK_PER_DIGESTED,
  SK_FIRST_HOME,
};
/** MissionDef::of: 0..3 a category, 4 all Humans, 5 Familiars. */
constexpr int8_t OF_HUMANS = 4, OF_FAMILIARS = 5;
enum InstantKind : int8_t {
  IK_NONE = -1,
  IK_DIGEST_HAND,
  IK_FREE_HUNT_AFTER_COL3,
  IK_FREE_HUNT_SAME_COLUMN,
  IK_TAKE_BONUS,
  IK_FREE_FAMILIAR,
  IK_VP_PER_CLOSER,
};
enum BonusKind : int8_t {
  BK_HUMAN,
  BK_HUMAN_CHOICE,
  BK_SPEED,
  BK_EXTRA_HUNT,
  BK_DISCARD_DRAW,
  BK_DRAW_TO_PLAY,
  BK_MISSION,
  BK_PARASOL,
  BK_VELVET,
};

/** board-schema REGIONS order. */
enum Region : int8_t { R_CASTLE, R_CEMETERY, R_MOUNTAINS, R_PLAINS, R_FOREST };
/** board-schema PATHS order; -1 = no path. */
enum PathKind : int8_t { PATH_NONE = -1, PATH_ROAD, PATH_RAIL, PATH_BOAT };
/** board-schema SPACE_EFFECTS order. */
enum SpaceEffect : int8_t {
  E_NONE,
  E_CASTLE,
  E_CEMETERY,
  E_CHEST,
  E_CHEST_OPEN,
  E_CRYPT,
  E_LABYRINTH,
  E_MARKET,
  E_CHURCH,
  E_MANSION,
  E_BARRACKS,
  E_SHIP,
  E_TAVERN,
  E_WELL,
};

// ---- tables ----------------------------------------------------------------

struct Manipulation {
  int8_t kind;  // ManipKind
  int8_t n;
  int8_t withHuman;  // -1 = undefined
  bool mandatory;
  int8_t times;  // discard-draw uses (default 1)
};
struct Passive {
  int8_t kind;  // PassiveKind
  int8_t n;
  int8_t when;
  int8_t min, max, atLeast, speed, vp;
};
struct Activated {
  int8_t kind;  // ActivatedKind
  int8_t vp;
  int8_t draw;
};
struct EndGame {
  int8_t kind;      // EndGameKind
  int16_t other;    // def index (if-has)
  int8_t family;    // family index
  int8_t category;  // per-category
  int8_t vp;
};
struct CardDef {
  const char* id;
  int8_t type;
  int8_t category;
  int8_t family;
  bool speedVar;
  int8_t speedBase;
  int8_t speedHuman;
  int8_t vp;
  uint16_t kw;
  Manipulation manip;
  int8_t nPassives;
  Passive passives[2];
  Activated act;
  int8_t huntBonusRegion;
  int8_t huntBonusVp;
  bool onHuntDigest;
  EndGame endGame;
  bool rookie;
  int8_t rookieCopies;
  int8_t copies;
};

struct MissionDef {
  const char* id;
  int8_t vp;
  bool fivePlus;
  bool whiteTitle;
  int8_t std;  // StdKind
  int8_t category;
  int8_t of;
  int8_t vpEach;
  int8_t perBeaten;
  int8_t min;
  int8_t max;  // -1 = undefined
  int8_t atLeast;
  uint16_t keywords;
  int8_t distinct;  // CardType for per-distinct
  int8_t rank;      // 0 highest, 1 lowest
  int8_t instant;   // InstantKind
  int8_t instRegion;
};

struct BonusDef {
  const char* id;
  int8_t kind;  // BonusKind
  int8_t category;
  int8_t n;
};

struct Space {
  const char* id;
  int8_t region;
  int8_t path;
  int8_t effect;
  int8_t mountainPenalty;  // -1 = undefined
};

struct BoardData {
  const char* side;
  int n;
  const Space* spaces;
  const uint16_t* adjStart;
  const uint8_t* adj;
  int castle, labyrinth, tavern;
  const uint8_t* castleDist;
  const uint8_t* labyrinthDist;
  const uint8_t* cuRank;      // JS default sort rank of the id
  const uint8_t* localeRank;  // localeCompare rank of the id
  int nChests;
  const uint8_t* chests;  // chest + chest-open spaces, board order
  int nCrypts;
  const uint8_t* crypts;  // crypt spaces, board order
};

extern const char* const FAMILY_NAMES[NUM_FAMILIES];
extern const CardDef CARD_DEFS[NUM_DEFS];
extern const char* const CARD_NAMES[NUM_CARDS];
extern const uint8_t CARD_DEF[NUM_CARDS];
extern const uint8_t HUNT_EXPAND[NUM_HUNT];
extern const uint8_t ROOKIE_A[NUM_ROOKIE_A];
extern const uint8_t ROOKIE_REST[NUM_ROOKIE_REST];
extern const uint8_t ROSE_EXPAND[NUM_ROSES];
extern const uint8_t STARTING_EXPAND[MAX_PLAYERS][NUM_STARTING];
extern const MissionDef MISSION_DEFS[NUM_MISSIONS];
extern const uint8_t MISSION_ORDER[NUM_MISSIONS];
extern const BonusDef BONUS_DEFS[NUM_BONUS];
extern const uint8_t BONUS_EXPAND[NUM_BONUS];
/** Indexed by BoardId: A, B, test. */
extern const BoardData BOARD_DATA[3];

inline const CardDef& cardDef(int card) { return CARD_DEFS[CARD_DEF[card]]; }
inline bool hasKw(int card, uint16_t kw) { return (cardDef(card).kw & kw) != 0; }
inline int cardSpeed(int card, bool humanInPlay) {
  const CardDef& d = cardDef(card);
  if (!d.speedVar) return d.speedBase;
  return humanInPlay ? d.speedHuman : d.speedBase;
}

extern const char* const CATEGORY_NAMES[NUM_CATEGORIES];
extern const char* const REGION_NAMES[5];

}  // namespace hg
