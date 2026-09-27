// The Hunger engine: a port of packages/core/src/games/the-hunger/
// (game-engine.ts, rules.ts, board.ts, scoring.ts) with exact trace parity.
#pragma once
#include <string>
#include <vector>

#include "hg/state.hpp"

namespace hg {

// ---- rng (Mulberry32, as game-engine.random / determinize.mulberry32) -----

struct Mulberry32 {
  int32_t a;
  explicit Mulberry32(uint32_t seed) : a(int32_t(seed)) {}
  double next() {
    a = int32_t(uint32_t(a) + 0x6d2b79f5u);
    uint32_t ua = uint32_t(a);
    uint32_t t = (ua ^ (ua >> 15)) * (1u | ua);
    t = (t + ((t ^ (t >> 7)) * (61u | t))) ^ t;
    return double(t ^ (t >> 14)) / 4294967296.0;
  }
  double operator()() { return next(); }
};

// ---- board (board.ts) ------------------------------------------------------

struct Graph {
  const BoardData* b;
  uint64_t wells;  // Well or Castle
  uint8_t dist[MAX_SPACES][MAX_SPACES];
};
const Graph& graphOf(int board);
inline const Graph& graphOf(const GameState& s) { return graphOf(s.board); }
inline bool isWell(const Graph& g, int sp) { return (g.wells >> sp) & 1; }

struct Dest {
  int16_t to;
  int8_t spent;
};
/** walkDestinations, already sorted by localeCompare of the space id. */
int walkDestinations(const Graph& g, int from, int speed, bool bat, uint64_t occupied, Dest* out);
int mistDestinations(const Graph& g, int from, int16_t* out);
int spicyDestinations(const Graph& g, int from, int speed, Dest* out);
int confuseDestination(const Graph& g, int from, int steps = 4);
int pushDestinations(const Graph& g, int from, int16_t* out);

// ---- rules (rules.ts) ------------------------------------------------------

using Actions = std::vector<Action>;

int activePlayer(const GameState& s);
int deciderOf(const TurnState& t);
void legalActions(const GameState& s, int player, Actions& out);

bool hasHuman(const PlayerState& p);
bool hasKeyword(const PlayerState& p, uint16_t kw);
int passiveCount(const PlayerState& p, int kind);
int playAreaSpeed(const PlayCard* cards, int n);
inline int playAreaSpeed(const PlayerState& p) { return playAreaSpeed(p.playArea.v, p.playArea.n); }
int humansBonusVp(const PlayerState& p);
inline bool isReturned(const PlayerState& p) { return p.castleTile >= 0; }
bool ownsRose(const PlayerState& p);
int huntCost(const Card* pile, int n, int col);
int digestCategoryOf(int effect);
int closerCount(const GameState& s, int seat);
struct HuntsLeft {
  int general, col1;
};
HuntsLeft huntsLeft(const TurnState& t);
bool huntBlocked(const GameState& s, const PlayerState& p, const TurnState& t);
inline const Space& spaceOf(const GameState& s, int sp) { return boardOf(s).spaces[sp]; }

// ---- engine (game-engine.ts) -----------------------------------------------

GameState createInitialState(int playerCount, uint32_t seed, Mode mode,
                             bool beginnerSafeMountains = false, int board = -1);
/** applyInPlace: `a` MUST be legal for `player` (it is not validated). */
void apply(GameState& s, int player, const Action& a);
double random(GameState& s);

// ---- scoring (scoring.ts) --------------------------------------------------

struct Tally {
  int humans[NUM_CATEGORIES];
  int humanTotal;
  int familiars, powers;
  int distinctFamiliars, distinctPowers;
  int digestedHumans;
  int bonus;
  bool hasRose;
  int castleOrder;  // -1 = null
  // humanCards: the owned Human cards' defs (vp + keywords are all Missions read)
  int nHumanCards;
  uint8_t humanDefs[CAP_DECK * 2];
};
struct MissionContext {
  const Tally* me;
  const Tally* others[MAX_PLAYERS];
  int nOthers;
  int preScore;
  int otherPreScores[MAX_PLAYERS];
};
void tally(const PlayerState& p, const int8_t* choices, int nChoices, Tally& out);
int missionScore(const MissionDef& m, const MissionContext& ctx);
int cardBonuses(const PlayerState& p);
void fateOf(const GameState& s, const PlayerState& p, int& fate, int& delta);
void computeResult(GameState& s);
/** missionContext(state, seat): tallies + preScores are written to the buffers. */
void missionContext(const GameState& s, int seat, Tally* tallies, int* pre, MissionContext& ctx);

// ---- canonical text + hash (search/canon.ts) -------------------------------

std::string canonicalState(const GameState& s);
uint64_t fnv1a64(const std::string& text);
std::string hex64(uint64_t h);
inline std::string stateHash(const GameState& s) { return hex64(fnv1a64(canonicalState(s))); }
std::string canonicalAction(const GameState& s, const Action& a);

}  // namespace hg
