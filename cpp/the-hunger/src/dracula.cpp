// Dracula — the top tier's search (C++ only; the TS side reaches it through
// the WebAssembly bridge). It starts as Strigoi's algorithm — determinized
// sequential halving with Nosferatu rollouts — at the budget the C++ engine
// affords (~50x the TS rollouts in the same time), and grows through
// DraculaConfig flags, each benched (`hg duel`) before it becomes a default.
#include <algorithm>
#include <bit>
#include <chrono>
#include <cmath>
#include <string>
#include <vector>

#include "hg/ai.hpp"

namespace hg {

double tierUtility(const GameState& s, int seat) {
  if (!s.hasResult) return 0;
  const Result& r = s.result;
  int n = s.nPlayers;
  auto burnt = [&](int i) { return r.breakdown[i].fate == F_ASHES; };
  double win = r.winners.contains(int8_t(seat)) ? 1.0 / r.winners.size() : 0;
  double place = n > 1 ? double(n - r.placements[seat]) / double(n - 1) : 1;
  double best = -INFINITY;
  bool beaten = false;
  for (int i = 0; i < n; i++) {
    if (i == seat) continue;
    if (burnt(seat) && !burnt(i)) beaten = true;
    else if (burnt(i) == burnt(seat) && r.scores[i] > best) best = r.scores[i];
  }
  double margin = beaten ? 0 : best == -INFINITY ? 1 : 1 / (1 + std::exp(-(r.scores[seat] - best) / 8));
  double survived = burnt(seat) ? 0 : 1;
  return 0.5 * win + 0.2 * place + 0.2 * margin + 0.1 * survived;
}

static bool sameAction(const Action& a, const Action& b) {
  return a.type == b.type && a.card == b.card && a.other == b.other && a.token == b.token &&
         a.space == b.space && a.mission == b.mission && a.row == b.row && a.col == b.col &&
         a.spent == b.spent && a.keep == b.keep;
}

/** Still the root's turn, and `seat` decides. */
static bool stillMine(const GameState& s, const GameState& root, int seat) {
  return s.phase != PH_OVER && s.turn == root.turn && s.hasCurrent && root.hasCurrent &&
         s.current.player == root.current.player && activePlayer(s) == seat;
}

/** Did applying a move reveal (or reshuffle) anything hidden? */
static bool revealed(const GameState& a, const GameState& b, int seat) {
  if (a.rng != b.rng) return true;
  if (a.huntDeck.size() != b.huntDeck.size() || a.tavern.size() != b.tavern.size()) return true;
  if (a.players[seat].deck.size() != b.players[seat].deck.size()) return true;
  for (int i = 0; i < MAX_CHESTS; i++)
    if (a.chests[i] != b.chests[i]) return true;
  for (int i = 0; i < MAX_CRYPTS; i++)
    if (a.crypts[i].size() != b.crypts[i].size()) return true;
  return false;
}

using Plan = std::vector<Action>;

/**
 * Every distinct sequence of `seat`'s decisions for the rest of this turn in
 * `world`, cut after the first move that reveals hidden information (its
 * outcome differs between worlds, so nothing after it can be planned). Leaves
 * are deduplicated by their canonical state (token-order transpositions).
 */
static void enumeratePlans(const GameState& world, const GameState& root, int seat, int maxPlans,
                           std::vector<Plan>& out) {
  std::vector<std::string> seen;
  Plan path;
  Actions legal;
  auto dfs = [&](auto&& self, const GameState& s, int depth) -> void {
    if (int(out.size()) >= maxPlans) return;
    if (!stillMine(s, root, seat) || depth >= 16) {
      std::string key = canonicalState(s);
      if (std::find(seen.begin(), seen.end(), key) == seen.end()) {
        seen.push_back(std::move(key));
        out.push_back(path);
      }
      return;
    }
    legalActions(s, seat, legal);
    Actions here = legal;
    // Nosferatu's move first, so its line is always among the plans.
    int nos = here.size() == 1 ? 0 : heuristicPick(s, seat, here);
    std::swap(here[0], here[nos]);
    for (const Action& a : here) {
      GameState next = s;
      Action copy = a;
      apply(next, seat, copy);
      path.push_back(a);
      if (revealed(s, next, seat)) {
        if (int(out.size()) < maxPlans) out.push_back(path);
      } else {
        self(self, next, depth + 1);
      }
      path.pop_back();
      if (int(out.size()) >= maxPlans) return;
    }
  };
  dfs(dfs, world, 0);
}

static uint32_t draculaSeed(const GameState& s, int seat) {
  uint32_t x = uint32_t(int32_t(s.turn) * 131 + seat * 17 + s.placeCounter);
  return (x * 0x9e3779b1u) ^ 0xd7acu;
}

int draculaPick(const GameState& state, int seat, const Actions& legal, const DraculaConfig& cfg) {
  using Clock = std::chrono::steady_clock;
  int L = int(legal.size());
  if (L == 1) return 0;
  const bool timed = cfg.timeMs > 0;
  const auto start = Clock::now();
  auto elapsedMs = [&] {
    return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
  };
  Mulberry32 rand(draculaSeed(state, seat));
  struct Arm {
    int idx;
    double sum;
    int n;
  };
  // Arms: single moves, or whole-turn plans (arm i = plans[i]).
  std::vector<Plan> plans;
  if (cfg.turnPlans) {
    Mulberry32 planRand(draculaSeed(state, seat) ^ 0x9e37u);
    GameState world0 = determinize(state, seat, planRand);
    enumeratePlans(world0, state, seat, cfg.maxPlans, plans);
    if (plans.size() <= 1) plans.clear();
  }
  const int A = plans.empty() ? L : int(plans.size());
  std::vector<Arm> arms(A);
  for (int i = 0; i < A; i++) arms[i] = Arm{i, 0, 0};
  auto play = [&](GameState& g, int arm) {
    if (plans.empty()) {
      Action a = legal[arm];
      apply(g, seat, a);
      return;
    }
    for (const Action& a : plans[arm]) {
      Action copy = a;
      apply(g, seat, copy);
    }
  };
  int rounds = std::max(1, int(std::bit_width(unsigned(A - 1))));
  int perRound = std::max(A, cfg.rollouts / rounds);
  for (int round = 0; round < rounds && arms.size() > 1; round++) {
    // Time mode: each round may use its share of the remaining budget.
    double roundEnd = cfg.timeMs * double(round + 1) / double(rounds);
    int each = timed ? 1 << 30 : std::max(cfg.minPerArm, perRound / int(arms.size()));
    for (int k = 0; k < each; k++) {
      if (timed && k >= cfg.minPerArm && elapsedMs() > roundEnd) break;
      GameState world = determinize(state, seat, rand);
      for (Arm& arm : arms) {
        GameState g = world;
        play(g, arm.idx);
        playout(g);
        arm.sum += cfg.tierMargin ? tierUtility(g, seat) : outcomeUtility(g, seat);
        arm.n++;
      }
    }
    std::stable_sort(arms.begin(), arms.end(), [](const Arm& a, const Arm& b) {
      return a.sum / std::max(1, a.n) > b.sum / std::max(1, b.n);
    });
    arms.resize(std::max<size_t>(1, (arms.size() + 1) / 2));
  }
  if (arms[0].n == 0) return heuristicPick(state, seat, legal);
  if (plans.empty()) return arms[0].idx;
  const Action& first = plans[arms[0].idx][0];
  for (int i = 0; i < L; i++)
    if (sameAction(legal[i], first)) return i;
  return heuristicPick(state, seat, legal);
}

}  // namespace hg
