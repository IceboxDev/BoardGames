// determinize (search/determinize.ts), the rollout policy + playout +
// outcomeUtility (search/rollout.ts) and Strigoi (search/strigoi.ts).
#include <algorithm>
#include <bit>
#include <cmath>
#include <vector>

#include "hg/ai.hpp"

namespace hg {

/** determinize.shuffle: sort (JS order == int order), then Fisher–Yates on `rand`. */
template <class T>
static void shufflePool(T* arr, int n, Mulberry32& rand) {
  std::sort(arr, arr + n);
  for (int i = n - 1; i > 0; i--) {
    int j = int(std::floor(rand() * double(i + 1)));
    std::swap(arr[i], arr[j]);
  }
}

GameState determinize(const GameState& state, int observer, Mulberry32& rand) {
  GameState w = state;
  const BoardData& b = boardOf(w);

  // Hunt deck + Tavern.
  {
    Card pool[CAP_HUNT_DECK + CAP_TAVERN];
    int n = 0;
    for (Card c : w.huntDeck) pool[n++] = c;
    for (Card c : w.tavern) pool[n++] = c;
    shufflePool(pool, n, rand);
    int t = w.tavern.size();
    w.tavern.clear();
    w.huntDeck.clear();
    for (int i = 0; i < n; i++) {
      if (i < t)
        w.tavern.push(pool[i]);
      else
        w.huntDeck.push(pool[i]);
    }
  }

  // Decks and rivals' hands.
  for (int pi = 0; pi < w.nPlayers; pi++) {
    PlayerState& p = w.players[pi];
    if (pi == observer) {
      shufflePool(p.deck.v, p.deck.n, rand);
    } else {
      Card pool[CAP_HAND + CAP_DECK];
      int n = 0;
      for (Card c : p.hand) pool[n++] = c;
      for (Card c : p.deck) pool[n++] = c;
      shufflePool(pool, n, rand);
      int h = p.hand.size();
      p.hand.clear();
      p.deck.clear();
      for (int i = 0; i < n; i++) {
        if (i < h)
          p.hand.push(pool[i]);
        else
          p.deck.push(pool[i]);
      }
    }
  }

  // Face-down Chest tokens.
  int faceDown[MAX_CHESTS];
  int nf = 0;
  for (int i = 0; i < b.nChests; i++)
    if (b.spaces[b.chests[i]].effect == E_CHEST && w.chests[i] >= 0) faceDown[nf++] = i;
  if (nf > 0) {
    bool seen[NUM_BONUS] = {};
    for (int pi = 0; pi < w.nPlayers; pi++)
      for (const BonusHolding& h : w.players[pi].bonus) seen[h.id] = true;
    for (int i = 0; i < b.nChests; i++)
      if (b.spaces[b.chests[i]].effect == E_CHEST_OPEN && w.chests[i] >= 0) seen[w.chests[i]] = true;
    uint8_t pool[NUM_BONUS];
    int n = 0;
    for (int i = 0; i < NUM_BONUS; i++)
      if (!seen[BONUS_EXPAND[i]]) pool[n++] = BONUS_EXPAND[i];
    shufflePool(pool, n, rand);
    for (int k = 0; k < nf; k++) w.chests[faceDown[k]] = int8_t(n > 0 ? pool[--n] : -1);
  }

  // Mission tiles.
  {
    const PlayerState& me = w.players[observer];
    bool seen[NUM_MISSIONS] = {};
    for (uint8_t m : w.publicMissions) seen[m] = true;
    for (uint8_t m : me.missions) seen[m] = true;
    for (int pi = 0; pi < w.nPlayers; pi++)
      for (uint8_t m : w.players[pi].usedMissions) seen[m] = true;
    for (uint8_t m : w.setupOffers[observer]) seen[m] = true;
    if (w.hasCurrent && w.current.player == observer && w.current.hasPick)
      for (uint8_t m : w.current.pickOffered) seen[m] = true;
    Vec<uint8_t, NUM_MISSIONS> pool;
    for (int i = 0; i < NUM_MISSIONS; i++) {
      int m = MISSION_ORDER[i];
      if ((w.nPlayers >= 5 || !MISSION_DEFS[m].fivePlus) && !seen[m]) pool.push(uint8_t(m));
    }
    shufflePool(pool.v, pool.n, rand);
    for (int pi = 0; pi < w.nPlayers; pi++) {
      if (pi == observer) continue;
      PlayerState& p = w.players[pi];
      pool.spliceFront(p.missions.size(), p.missions);
    }
    for (int pi = 0; pi < w.nPlayers; pi++) {
      if (pi == observer) continue;
      pool.spliceFront(w.setupOffers[pi].size(), w.setupOffers[pi]);
    }
    for (int i = 0; i < b.nCrypts; i++) pool.spliceFront(w.crypts[i].size(), w.crypts[i]);
    if (w.hasCurrent && w.current.player != observer && w.current.hasPick)
      pool.spliceFront(w.current.pickOffered.size(), w.current.pickOffered);
  }

  w.rng = int32_t(uint32_t(std::floor(rand() * 4294967296.0)));
  return w;
}

void playout(GameState& s, int maxSteps) {
  thread_local Actions legal;
  for (int i = 0; s.phase != PH_OVER && i < maxSteps; i++) {
    int seat = activePlayer(s);
    legalActions(s, seat, legal);
    if (legal.empty()) fail("playout: no legal action");
    int idx = legal.size() == 1 ? 0 : heuristicPick(s, seat, legal);
    Action a = legal[idx];
    apply(s, seat, a);
  }
}

double outcomeUtility(const GameState& s, int seat) {
  if (!s.hasResult) return 0;
  const Result& r = s.result;
  int n = s.nPlayers;
  double win = r.winners.contains(int8_t(seat)) ? 1.0 / r.winners.size() : 0;
  double place = n > 1 ? double(n - r.placements[seat]) / double(n - 1) : 1;
  double best = -INFINITY;
  for (int i = 0; i < n; i++)
    if (i != seat && r.scores[i] > best) best = r.scores[i];
  double margin = 1 / (1 + jsExp(-(r.scores[seat] - best) / 8));
  double survived = r.breakdown[seat].fate == F_ASHES ? 0 : 1;
  return 0.5 * win + 0.2 * place + 0.2 * margin + 0.1 * survived;
}

static uint32_t seedOf(const GameState& s, int seat) {
  uint32_t x = uint32_t(int32_t(s.turn) * 131 + seat * 17 + s.placeCounter);
  return (x * 0x9e3779b1u) ^ 0x5717u;
}

int strigoiPick(const GameState& state, int seat, const Actions& legal, const StrigoiConfig& cfg) {
  int L = int(legal.size());
  if (L == 1) return 0;
  Mulberry32 rand(seedOf(state, seat));
  struct Arm {
    int idx;
    double sum;
    int n;
  };
  std::vector<Arm> arms(L);
  for (int i = 0; i < L; i++) arms[i] = Arm{i, 0, 0};
  // Math.ceil(Math.log2(k)) for integer k ≥ 1.
  int rounds = std::max(1, int(std::bit_width(unsigned(L - 1))));
  int perRound = std::max(L, cfg.rollouts / rounds);
  for (int round = 0; round < rounds && arms.size() > 1; round++) {
    int each = std::max(cfg.minPerArm, perRound / int(arms.size()));
    for (int k = 0; k < each; k++) {
      GameState world = determinize(state, seat, rand);
      for (Arm& arm : arms) {
        GameState g = world;
        apply(g, seat, legal[arm.idx]);
        playout(g);
        arm.sum += outcomeUtility(g, seat);
        arm.n++;
      }
    }
    bool none = true;
    for (const Arm& a : arms)
      if (a.n != 0) none = false;
    if (none) break;
    std::stable_sort(arms.begin(), arms.end(), [](const Arm& a, const Arm& b) {
      return a.sum / std::max(1, a.n) > b.sum / std::max(1, b.n);
    });
    arms.resize(std::max<size_t>(1, (arms.size() + 1) / 2));
  }
  if (arms[0].n == 0) return heuristicPick(state, seat, legal);
  return arms[0].idx;
}

}  // namespace hg
