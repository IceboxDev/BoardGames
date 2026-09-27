// GameState: a trivially-copyable value mirroring the TS `GameState`
// (types.ts) field for field — fixed-capacity arrays, no heap. Array order
// semantics are the TS ones: the END of `huntDeck`/`deck` is the top, `shift`
// takes index 0. Every id is an int (cards / Missions / Bonus tokens in JS
// string-sort order, spaces in board-file order); -1 stands for null.
#pragma once
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <type_traits>

#include "hg/data.hpp"

namespace hg {

[[noreturn]] inline void fail(const char* what) {
  std::fprintf(stderr, "hg: %s\n", what);
  std::abort();
}

/** A fixed-capacity vector with the TS array operations the engine uses. */
template <class T, int N>
struct Vec {
  using Size = std::conditional_t<(N < 256), uint8_t, uint16_t>;
  T v[N];
  Size n = 0;

  int size() const { return n; }
  bool empty() const { return n == 0; }
  T& operator[](int i) { return v[i]; }
  const T& operator[](int i) const { return v[i]; }
  T* begin() { return v; }
  T* end() { return v + n; }
  const T* begin() const { return v; }
  const T* end() const { return v + n; }
  T& back() { return v[n - 1]; }
  void clear() { n = 0; }
  void push(const T& x) {
    if (n >= N) fail("Vec overflow");
    v[n++] = x;
  }
  T pop() { return v[--n]; }
  /** Array.prototype.shift (caller checks non-empty). */
  T shift() {
    T x = v[0];
    std::memmove(v, v + 1, sizeof(T) * (n - 1));
    n--;
    return x;
  }
  void erase(int i) {
    std::memmove(v + i, v + i + 1, sizeof(T) * (n - i - 1));
    n--;
  }
  int indexOf(const T& x) const {
    for (int i = 0; i < n; i++)
      if (v[i] == x) return i;
    return -1;
  }
  bool contains(const T& x) const { return indexOf(x) >= 0; }
  /** splice(0, k): move the first k (at most size) into `out`. */
  template <int M>
  void spliceFront(int k, Vec<T, M>& out) {
    if (k > n) k = n;
    out.clear();
    for (int i = 0; i < k; i++) out.push(v[i]);
    std::memmove(v, v + k, sizeof(T) * (n - k));
    n -= k;
  }
  /** Remove every element equal to x (Array.filter(!== x)). */
  void removeAll(const T& x) {
    int w = 0;
    for (int i = 0; i < n; i++)
      if (!(v[i] == x)) v[w++] = v[i];
    n = w;
  }
};

enum Mode : int8_t { MODE_ELDER, MODE_ROOKIE };
enum BoardId : int8_t { BOARD_A, BOARD_B, BOARD_TEST };
enum Phase : int8_t { PH_SETUP, PH_PLAY, PH_OVER };
enum Step : int8_t {
  ST_MANIPULATE,
  ST_MOVE,
  ST_PUSH,
  ST_ACT,
  ST_DIGEST,
  ST_MISSIONS,
  ST_INSPIRE,
  ST_READY,
  ST_NANNY,
};
enum Fate : int8_t { F_CASTLE, F_CEMETERY, F_MOUNTAINS, F_ASHES };

constexpr int TURNS = 15;
constexpr int MAX_ROWS = MAX_PLAYERS + 1;

// Capacities (overflow aborts: raise them if a fuzz ever trips one).
constexpr int CAP_DECK = 128;
constexpr int CAP_HAND = 16;
constexpr int CAP_PLAY = 48;
constexpr int CAP_DIGESTED = 96;
constexpr int CAP_MISSIONS = 24;
constexpr int CAP_USED = 8;
constexpr int CAP_BONUS = 26;
constexpr int CAP_PILE = 48;
constexpr int CAP_HUNT_DECK = 128;
constexpr int CAP_TAVERN = 16;
constexpr int CAP_CRYPT = 24;
constexpr int CAP_OFFER = 24;

using Card = uint8_t;

struct PlayCard {
  Card id;
  bool resolved;
  uint8_t used;
  bool carried;
  bool operator==(const PlayCard& o) const { return id == o.id; }
};

struct BonusHolding {
  uint8_t id;
  bool used;
  int8_t chosen;  // Category or -1
};

struct PlayerState {
  Vec<Card, CAP_DECK> deck;
  Vec<Card, CAP_HAND> hand;
  Vec<PlayCard, CAP_PLAY> playArea;
  Vec<Card, CAP_DECK> discard;
  Vec<Card, CAP_DIGESTED> digested;
  Vec<uint8_t, CAP_MISSIONS> missions;
  Vec<uint8_t, CAP_USED> usedMissions;
  Vec<BonusHolding, CAP_BONUS> bonus;
  int16_t pos;
  int16_t placedAt;
  bool resting;
  int16_t vp;
  int8_t castleTile;   // -1 = null
  int8_t castleOrder;  // -1 = null
  int16_t hunted;
  bool parasolTurnUsed;
};

struct HuntedHuman {
  int8_t category, region;
};
struct TrackHunt {
  int8_t col, region;
  bool human;
};

struct TurnState {
  int8_t player;
  int8_t step;
  int8_t stage;
  int16_t bonusSpeed;
  int16_t speed;
  int16_t speedLeft;
  bool moved;
  bool spaceUsed;
  int8_t hunts;
  int8_t extraHunts;
  int8_t col1Hunts;
  int8_t col1Used;
  Vec<HuntedHuman, 32> huntedHumans;
  Vec<TrackHunt, 24> trackHunts;
  bool touched;
  Vec<int8_t, MAX_PLAYERS> nannyQueue;
  Vec<int8_t, MAX_PLAYERS> pushQueue;
  Vec<Card, 24> readyQueue;
  bool hasPick;
  int16_t pickSource;  // -1 = null (setup)
  Vec<uint8_t, CAP_OFFER> pickOffered;
  int8_t pickKeep;
  int8_t pendingInspire;
  int8_t pendingDigest;
  int8_t digestCategory;  // -1 = null
  bool confused;
  bool extraTurn;
};

struct MissionLine {
  uint8_t id;
  int8_t vp;
  bool isPublic;
  bool used;
};
struct CardLine {
  Card card;
  int8_t vp;
};
struct SeatBreakdown {
  int16_t duringPlay, cardBonuses, publicMissions, personalMissions, sunrise;
  int8_t fate;
  int16_t total;
  Vec<MissionLine, 2 + CAP_MISSIONS + CAP_USED> missions;
  Vec<CardLine, 40> cards;
};
struct Result {
  int16_t scores[MAX_PLAYERS];
  int8_t winner;  // -1 = null
  Vec<int8_t, MAX_PLAYERS> winners;
  int8_t placements[MAX_PLAYERS];
  SeatBreakdown breakdown[MAX_PLAYERS];
};

struct GameState {
  int32_t rng;
  int8_t mode;  // Mode
  int8_t board;  // BoardId
  bool beginnerSafeMountains;
  int8_t nPlayers;
  Vec<uint8_t, 2> setupOffers[MAX_PLAYERS];
  int8_t turn;
  int8_t phase;
  PlayerState players[MAX_PLAYERS];
  Vec<int8_t, MAX_PLAYERS> order;
  bool hasCurrent;
  TurnState current;
  Vec<Card, CAP_PILE> track[MAX_ROWS][3];
  int8_t nRows;
  Vec<Card, CAP_HUNT_DECK> huntDeck;
  Vec<Card, CAP_TAVERN> tavern;
  Vec<Card, 4> roses;
  /** Per BoardData::chests slot: token id or -1. */
  int8_t chests[MAX_CHESTS];
  /** Per BoardData::crypts slot. */
  Vec<uint8_t, CAP_CRYPT> crypts[MAX_CRYPTS];
  Vec<uint8_t, 2> publicMissions;
  Vec<int8_t, 6> castleTiles;
  int8_t castleArrivals;
  int16_t placeCounter;
  bool hasResult;
  Result result;
};

static_assert(std::is_trivially_copyable_v<GameState>);

inline const BoardData& boardOf(const GameState& s) { return BOARD_DATA[s.board]; }

// ---- actions ---------------------------------------------------------------

enum ActionType : int8_t {
  A_RESOLVE,
  A_USE_BONUS,
  A_END_MANIPULATION,
  A_MOVE,
  A_MIST,
  A_STAY,
  A_PUSH,
  A_SPACE,
  A_DIGEST,
  A_KEEP_MISSIONS,
  A_INSPIRE,
  A_HUNT,
  A_HUNT_TAVERN,
  A_HUNT_ROSE,
  A_READY,
  A_INSTANT,
  A_FAMILIAR,
  A_HYPNOSIS,
  A_DISCARD_PERMANENT,
  A_END_TURN,
};

/**
 * One action. Field use by type (-1 = absent):
 *   resolve: card, other=discard · use-bonus: token, other=discard ·
 *   move: space=to, spent · mist: space=to · push: space=to ·
 *   digest: card · keep-missions: keep (mask over Mission ints, kept in
 *   ascending = JS-sorted order) · inspire: space=crypt · hunt: row, col ·
 *   hunt-rose: card · ready: card, spent=0 deck / 1 discard ·
 *   instant: mission, row, col, card, space · familiar: card, other=target ·
 *   hypnosis: card, other=pick, row, col · discard-permanent: card
 */
struct Action {
  int8_t type = A_END_TURN;
  int16_t card = -1;
  int16_t other = -1;
  int16_t token = -1;
  int16_t space = -1;
  int16_t mission = -1;
  int8_t row = -1;
  int8_t col = -1;
  int8_t spent = -1;
  uint64_t keep = 0;
};

}  // namespace hg
