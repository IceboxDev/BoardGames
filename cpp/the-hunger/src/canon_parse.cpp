// Canonical text -> GameState. Mirrors src/canon.cpp's writer token for token:
// every literal the writer emits is matched verbatim, so any text the writer
// can produce parses, and canonicalState(parse(text)) == text byte for byte
// (tests/canon_parse_test.cpp checks that over TS self-play states).
#include "hg/canon_parse.hpp"

#include <algorithm>
#include <cstring>
#include <limits>
#include <string_view>

#include "hg/engine.hpp"

namespace hg {

namespace {

const char* const STEP_NAMES[] = {"manipulate", "move",     "push",    "act",  "digest",
                                  "missions",   "inspire", "ready", "nanny"};
const char* const PHASE_NAMES[] = {"setup", "play", "game-over"};
const char* const FATE_NAMES[] = {"castle", "cemetery", "mountains", "ashes"};
const char* const BOARD_NAMES[] = {"A", "B", "test"};

template <class T, int N>
constexpr int capOf(const Vec<T, N>&) {
  return N;
}

int lookup(std::string_view s, const char* const* names, int n) {
  for (int i = 0; i < n; i++)
    if (s == names[i]) return i;
  return -1;
}

int cardIndex(std::string_view s) {
  // CARD_NAMES is in JS code-unit order (= byte order for these ASCII ids).
  int lo = 0, hi = NUM_CARDS;
  while (lo < hi) {
    int mid = (lo + hi) / 2;
    if (std::string_view(CARD_NAMES[mid]) < s)
      lo = mid + 1;
    else
      hi = mid;
  }
  if (lo < NUM_CARDS && s == CARD_NAMES[lo]) return lo;
  return lookup(s, CARD_NAMES, NUM_CARDS);  // never expected; keeps a bad sort safe
}

int missionIndex(std::string_view s) {
  for (int i = 0; i < NUM_MISSIONS; i++)
    if (s == MISSION_DEFS[i].id) return i;
  return -1;
}

int bonusIndex(std::string_view s) {
  for (int i = 0; i < NUM_BONUS; i++)
    if (s == BONUS_DEFS[i].id) return i;
  return -1;
}

struct Parser {
  const char* base;
  const char* p;
  const char* end;
  std::string* err;
  const BoardData* b = nullptr;

  bool fail(const char* what) {
    if (err) {
      *err = "canonical state: ";
      *err += what;
      *err += " at offset ";
      *err += std::to_string(p - base);
      size_t left = size_t(end - p);
      *err += " near \"";
      err->append(p, std::min<size_t>(left, 40));
      *err += "\"";
    }
    return false;
  }

  bool lit(const char* s) {
    size_t n = std::strlen(s);
    if (size_t(end - p) < n || std::memcmp(p, s, n) != 0) return fail(("expected " + std::string(s)).c_str());
    p += n;
    return true;
  }
  bool peek(char c) const { return p < end && *p == c; }
  bool peekLit(const char* s) const {
    size_t n = std::strlen(s);
    return size_t(end - p) >= n && std::memcmp(p, s, n) == 0;
  }

  bool str(std::string_view& out) {
    if (!peek('"')) return fail("expected a string");
    const char* q = ++p;
    while (p < end && *p != '"') {
      if (*p == '\\' || (unsigned char)(*p) < 0x20) return fail("escape or control byte in string");
      p++;
    }
    if (p >= end) return fail("unterminated string");
    out = std::string_view(q, size_t(p - q));
    p++;
    return true;
  }

  bool integer(long long& out) {
    const char* q = p;
    bool neg = false;
    if (peek('-')) {
      neg = true;
      p++;
    }
    if (!(p < end && *p >= '0' && *p <= '9')) return fail("expected an integer");
    // The writer (std::to_string / String(n)) never pads: no leading zeros, no "-0".
    if (*p == '0' && p + 1 < end && p[1] >= '0' && p[1] <= '9') return fail("leading zero");
    long long v = 0;
    while (p < end && *p >= '0' && *p <= '9') {
      v = v * 10 + (*p - '0');
      if (v > (1ll << 40)) return fail("integer out of range");
      p++;
    }
    if (neg && v == 0) {
      p = q;
      return fail("negative zero");
    }
    out = neg ? -v : v;
    return true;
  }

  template <class T>
  bool num(T& out, long long lo = std::numeric_limits<T>::min(),
           long long hi = std::numeric_limits<T>::max()) {
    long long v;
    if (!integer(v)) return false;
    if (v < lo || v > hi) return fail("integer out of range for its field");
    out = T(v);
    return true;
  }
  /** optNum: null -> -1. */
  template <class T>
  bool optNum(T& out) {
    if (peekLit("null")) {
      p += 4;
      out = T(-1);
      return true;
    }
    return num(out, 0);
  }
  bool boolean(bool& out) {
    if (peekLit("true")) {
      p += 4;
      out = true;
      return true;
    }
    if (peekLit("false")) {
      p += 5;
      out = false;
      return true;
    }
    return fail("expected true/false");
  }

  bool card(int& out) {
    std::string_view s;
    if (!str(s)) return false;
    out = cardIndex(s);
    return out >= 0 || fail("unknown card id");
  }
  bool mission(int& out) {
    std::string_view s;
    if (!str(s)) return false;
    out = missionIndex(s);
    return out >= 0 || fail("unknown Mission id");
  }
  bool space(int& out) {
    std::string_view s;
    if (!str(s)) return false;
    for (int i = 0; i < b->n; i++)
      if (s == b->spaces[i].id) {
        out = i;
        return true;
      }
    return fail("unknown space id for this board");
  }
  bool named(int& out, const char* const* names, int n, const char* what) {
    std::string_view s;
    if (!str(s)) return false;
    out = lookup(s, names, n);
    return out >= 0 || fail(what);
  }

  template <class V, class X>
  bool put(V& v, const X& x) {
    if (v.n >= capOf(v)) return fail("array longer than the engine's capacity");
    v.v[v.n++] = x;
    return true;
  }

  /** A JSON array: `[` item (`,` item)* `]`, each item read by `item()`. */
  template <class F>
  bool array(F&& item) {
    if (!lit("[")) return false;
    if (peek(']')) {
      p++;
      return true;
    }
    for (;;) {
      if (!item()) return false;
      if (peek(',')) {
        p++;
        continue;
      }
      return lit("]");
    }
  }

  template <class V>
  bool cards(V& v) {
    v.clear();
    return array([&] {
      int c;
      return card(c) && put(v, Card(c));
    });
  }
  template <class V>
  bool missions(V& v) {
    v.clear();
    return array([&] {
      int m;
      return mission(m) && put(v, uint8_t(m));
    });
  }
  template <class V>
  bool seats(V& v, int n) {
    v.clear();
    return array([&] {
      int8_t x;
      return num(x, 0, n - 1) && put(v, x);
    });
  }

  bool player(PlayerState& pl, int index) {
    int idx, vamp;
    if (!lit("{\"index\":") || !num(idx) || !lit(",\"vampire\":") || !num(vamp)) return false;
    if (idx != index || vamp != index) return fail("player index/vampire must equal its seat");
    if (!lit(",\"deck\":") || !cards(pl.deck) || !lit(",\"hand\":") || !cards(pl.hand)) return false;
    if (!lit(",\"playArea\":")) return false;
    pl.playArea.clear();
    if (!array([&] {
          PlayCard c{};
          int id;
          if (!lit("{\"id\":") || !card(id) || !lit(",\"resolved\":") || !boolean(c.resolved) ||
              !lit(",\"used\":") || !num(c.used) || !lit(",\"carried\":") || !boolean(c.carried) ||
              !lit("}"))
            return false;
          c.id = Card(id);
          return put(pl.playArea, c);
        }))
      return false;
    if (!lit(",\"discard\":") || !cards(pl.discard) || !lit(",\"digested\":") ||
        !cards(pl.digested) || !lit(",\"missions\":") || !missions(pl.missions) ||
        !lit(",\"usedMissions\":") || !missions(pl.usedMissions) || !lit(",\"bonus\":"))
      return false;
    pl.bonus.clear();
    if (!array([&] {
          BonusHolding h{};
          std::string_view id;
          if (!lit("{\"id\":") || !str(id)) return false;
          int t = bonusIndex(id);
          if (t < 0) return fail("unknown Bonus token id");
          h.id = uint8_t(t);
          if (!lit(",\"used\":") || !boolean(h.used) || !lit(",\"chosen\":")) return false;
          if (peekLit("null")) {
            p += 4;
            h.chosen = -1;
          } else {
            int c;
            if (!named(c, CATEGORY_NAMES, NUM_CATEGORIES, "unknown category")) return false;
            h.chosen = int8_t(c);
          }
          return lit("}") && put(pl.bonus, h);
        }))
      return false;
    int pos;
    if (!lit(",\"pos\":") || !space(pos)) return false;
    pl.pos = int16_t(pos);
    return lit(",\"placedAt\":") && num(pl.placedAt) && lit(",\"resting\":") &&
           boolean(pl.resting) && lit(",\"vp\":") && num(pl.vp) && lit(",\"castleTile\":") &&
           optNum(pl.castleTile) && lit(",\"castleOrder\":") && optNum(pl.castleOrder) &&
           lit(",\"hunted\":") && num(pl.hunted) && lit(",\"parasolTurnUsed\":") &&
           boolean(pl.parasolTurnUsed) && lit("}");
  }

  bool turn(TurnState& t, int n) {
    int step;
    if (!lit("{\"player\":") || !num(t.player, 0, n - 1) || !lit(",\"step\":") ||
        !named(step, STEP_NAMES, 9, "unknown step"))
      return false;
    t.step = int8_t(step);
    if (!lit(",\"stage\":") || !num(t.stage) || !lit(",\"bonusSpeed\":") || !num(t.bonusSpeed) ||
        !lit(",\"speed\":") || !num(t.speed) || !lit(",\"speedLeft\":") || !num(t.speedLeft) ||
        !lit(",\"moved\":") || !boolean(t.moved) || !lit(",\"spaceUsed\":") ||
        !boolean(t.spaceUsed) || !lit(",\"hunts\":") || !num(t.hunts) ||
        !lit(",\"extraHunts\":") || !num(t.extraHunts) || !lit(",\"col1Hunts\":") ||
        !num(t.col1Hunts) || !lit(",\"col1Used\":") || !num(t.col1Used) ||
        !lit(",\"huntedHumans\":"))
      return false;
    t.huntedHumans.clear();
    if (!array([&] {
          int c, r;
          if (!lit("{\"category\":") || !named(c, CATEGORY_NAMES, NUM_CATEGORIES, "unknown category") ||
              !lit(",\"region\":") || !named(r, REGION_NAMES, 5, "unknown region") || !lit("}"))
            return false;
          return put(t.huntedHumans, HuntedHuman{int8_t(c), int8_t(r)});
        }))
      return false;
    if (!lit(",\"trackHunts\":")) return false;
    t.trackHunts.clear();
    if (!array([&] {
          TrackHunt h{};
          int r;
          if (!lit("{\"col\":") || !num(h.col) || !lit(",\"region\":") ||
              !named(r, REGION_NAMES, 5, "unknown region") || !lit(",\"human\":") ||
              !boolean(h.human) || !lit("}"))
            return false;
          h.region = int8_t(r);
          return put(t.trackHunts, h);
        }))
      return false;
    if (!lit(",\"touched\":") || !boolean(t.touched) || !lit(",\"nannyQueue\":") ||
        !seats(t.nannyQueue, n) || !lit(",\"pushQueue\":") || !seats(t.pushQueue, n) ||
        !lit(",\"readyQueue\":") || !cards(t.readyQueue) || !lit(",\"missionPick\":"))
      return false;
    t.pickSource = -1;
    t.pickOffered.clear();
    t.pickKeep = 0;
    if (peekLit("null")) {
      p += 4;
      t.hasPick = false;
    } else {
      t.hasPick = true;
      if (!lit("{\"source\":")) return false;
      if (peekLit("null")) {
        p += 4;
      } else {
        int sp;
        if (!space(sp)) return false;
        t.pickSource = int16_t(sp);
      }
      if (!lit(",\"offered\":") || !missions(t.pickOffered) || !lit(",\"keep\":") ||
          !num(t.pickKeep) || !lit("}"))
        return false;
    }
    if (!lit(",\"pendingInspire\":") || !num(t.pendingInspire) || !lit(",\"pendingDigest\":") ||
        !num(t.pendingDigest) || !lit(",\"digestCategory\":"))
      return false;
    if (peekLit("null")) {
      p += 4;
      t.digestCategory = -1;
    } else {
      int c;
      if (!named(c, CATEGORY_NAMES, NUM_CATEGORIES, "unknown category")) return false;
      t.digestCategory = int8_t(c);
    }
    return lit(",\"confused\":") && boolean(t.confused) && lit(",\"extraTurn\":") &&
           boolean(t.extraTurn) && lit("}");
  }

  bool result(Result& r, int n) {
    int k = 0;
    if (!lit("{\"scores\":") || !array([&] {
          if (k >= n) return fail("more scores than players");
          return num(r.scores[k++]);
        }))
      return false;
    if (k != n) return fail("scores length != players");
    if (!lit(",\"winner\":") || !optNum(r.winner) || !lit(",\"winners\":") ||
        !seats(r.winners, n) || !lit(",\"placements\":"))
      return false;
    if (r.winner >= n) return fail("winner out of range");
    k = 0;
    if (!array([&] {
          if (k >= n) return fail("more placements than players");
          return num(r.placements[k++]);
        }))
      return false;
    if (k != n) return fail("placements length != players");
    if (!lit(",\"breakdown\":")) return false;
    k = 0;
    if (!array([&] {
          if (k >= n) return fail("more breakdowns than players");
          SeatBreakdown& b = r.breakdown[k++];
          int fate;
          if (!lit("{\"duringPlay\":") || !num(b.duringPlay) || !lit(",\"cardBonuses\":") ||
              !num(b.cardBonuses) || !lit(",\"publicMissions\":") || !num(b.publicMissions) ||
              !lit(",\"personalMissions\":") || !num(b.personalMissions) ||
              !lit(",\"sunrise\":") || !num(b.sunrise) || !lit(",\"fate\":") ||
              !named(fate, FATE_NAMES, 4, "unknown fate") || !lit(",\"total\":") ||
              !num(b.total) || !lit(",\"missions\":"))
            return false;
          b.fate = int8_t(fate);
          b.missions.clear();
          if (!array([&] {
                MissionLine m{};
                int id;
                if (!lit("{\"id\":") || !mission(id) || !lit(",\"vp\":") || !num(m.vp) ||
                    !lit(",\"public\":") || !boolean(m.isPublic) || !lit(",\"used\":") ||
                    !boolean(m.used) || !lit("}"))
                  return false;
                m.id = uint8_t(id);
                return put(b.missions, m);
              }))
            return false;
          if (!lit(",\"cards\":")) return false;
          b.cards.clear();
          if (!array([&] {
                CardLine c{};
                int id;
                if (!lit("{\"card\":") || !card(id) || !lit(",\"vp\":") || !num(c.vp) || !lit("}"))
                  return false;
                c.card = Card(id);
                return put(b.cards, c);
              }))
            return false;
          return lit("}");
        }))
      return false;
    if (k != n) return fail("breakdown length != players");
    return lit("}");
  }

  /** `{"<id>":` keys of chests/crypts: exactly the board's slots, code-unit sorted. */
  bool slotKeys(int count, const uint8_t* slots, int* order) {
    for (int i = 0; i < count; i++) order[i] = i;
    std::sort(order, order + count,
              [&](int x, int y) { return b->cuRank[slots[x]] < b->cuRank[slots[y]]; });
    return true;
  }

  bool state(GameState& s) {
    int mode, board;
    if (!lit("{\"options\":{\"mode\":")) return false;
    {
      std::string_view m;
      if (!str(m)) return false;
      if (m == "elder")
        mode = MODE_ELDER;
      else if (m == "rookie")
        mode = MODE_ROOKIE;
      else
        return fail("unknown mode");
    }
    if (!lit(",\"board\":") || !named(board, BOARD_NAMES, 3, "unknown board")) return false;
    s.mode = int8_t(mode);
    s.board = int8_t(board);
    b = &BOARD_DATA[board];
    if (!lit(",\"beginnerSafeMountains\":") || !boolean(s.beginnerSafeMountains) ||
        !lit("},\"setupOffers\":"))
      return false;
    int offers = 0;
    if (!array([&] {
          if (offers >= MAX_PLAYERS) return fail("more setup offers than seats");
          return missions(s.setupOffers[offers++]);
        }))
      return false;
    int phase;
    if (!lit(",\"rng\":") || !num(s.rng) || !lit(",\"turn\":") || !num(s.turn) ||
        !lit(",\"phase\":") || !named(phase, PHASE_NAMES, 3, "unknown phase") ||
        !lit(",\"players\":"))
      return false;
    s.phase = int8_t(phase);
    int n = 0;
    if (!array([&] {
          if (n >= MAX_PLAYERS) return fail("more than MAX_PLAYERS players");
          int i = n++;
          return player(s.players[i], i);
        }))
      return false;
    if (n < 2) return fail("fewer than 2 players");
    if (offers != n) return fail("setupOffers length != players");
    s.nPlayers = int8_t(n);
    if (!lit(",\"order\":") || !seats(s.order, n) || !lit(",\"current\":")) return false;
    if (peekLit("null")) {
      p += 4;
      s.hasCurrent = false;
    } else {
      s.hasCurrent = true;
      if (!turn(s.current, n)) return false;
    }
    if (!lit(",\"track\":")) return false;
    int rows = 0;
    if (!array([&] {
          if (rows >= MAX_ROWS) return fail("more track rows than MAX_ROWS");
          int r = rows++;
          if (!lit("[")) return false;
          for (int c = 0; c < 3; c++) {
            if (c && !lit(",")) return false;
            if (!cards(s.track[r][c])) return false;
          }
          return lit("]");
        }))
      return false;
    s.nRows = int8_t(rows);
    if (!lit(",\"huntDeck\":") || !cards(s.huntDeck) || !lit(",\"tavern\":") ||
        !cards(s.tavern) || !lit(",\"roses\":") || !cards(s.roses) || !lit(",\"chests\":{"))
      return false;
    int order[MAX_CHESTS > MAX_CRYPTS ? MAX_CHESTS : MAX_CRYPTS];
    slotKeys(b->nChests, b->chests, order);
    for (int i = 0; i < MAX_CHESTS; i++) s.chests[i] = -1;
    for (int i = 0; i < b->nChests; i++) {
      int sp;
      if (i && !lit(",")) return false;
      if (!space(sp)) return false;
      if (sp != b->chests[order[i]]) return fail("chest keys are not the board's chest spaces");
      if (!lit(":")) return false;
      if (peekLit("null")) {
        p += 4;
      } else {
        std::string_view id;
        if (!str(id)) return false;
        int t = bonusIndex(id);
        if (t < 0) return fail("unknown Bonus token id");
        s.chests[order[i]] = int8_t(t);
      }
    }
    if (!lit("},\"crypts\":{")) return false;
    slotKeys(b->nCrypts, b->crypts, order);
    for (int i = 0; i < b->nCrypts; i++) {
      int sp;
      if (i && !lit(",")) return false;
      if (!space(sp)) return false;
      if (sp != b->crypts[order[i]]) return fail("crypt keys are not the board's crypt spaces");
      if (!lit(":") || !missions(s.crypts[order[i]])) return false;
    }
    if (!lit("},\"publicMissions\":") || !missions(s.publicMissions) ||
        !lit(",\"castleTiles\":"))
      return false;
    s.castleTiles.clear();
    if (!array([&] {
          int8_t x;
          return num(x) && put(s.castleTiles, x);
        }))
      return false;
    if (!lit(",\"castleArrivals\":") || !num(s.castleArrivals) || !lit(",\"placeCounter\":") ||
        !num(s.placeCounter) || !lit(",\"result\":"))
      return false;
    if (peekLit("null")) {
      p += 4;
      s.hasResult = false;
    } else {
      s.hasResult = true;
      if (!result(s.result, n)) return false;
    }
    if (!lit("}")) return false;
    if (p != end) return fail("trailing bytes after the state");
    return true;
  }
};

}  // namespace

bool tryParseCanonicalState(const char* text, size_t len, GameState& out, std::string* err) {
  // Zero every byte (padding and unused Vec slots included) so equal texts
  // give byte-equal states — search results never depend on stale memory.
  std::memset(static_cast<void*>(&out), 0, sizeof(GameState));
  Parser ps{text, text, text + len, err};
  return ps.state(out);
}

GameState parseCanonicalState(const std::string& text) {
  GameState s;
  std::string err;
  if (!tryParseCanonicalState(text.data(), text.size(), s, &err)) fail(err.c_str());
  return s;
}

}  // namespace hg
