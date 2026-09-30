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
#include "hg/rollpol.hpp"

namespace hg {

double tierUtility(const GameState& s, int seat, double survival) {
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
  double u = 0.5 * win + 0.2 * place + 0.2 * margin + 0.1 * survived;
  return survival > 0 ? (1 - survival) * u + survival * survived : u;
}

bool sameAction(const Action& a, const Action& b) {
  return a.type == b.type && a.card == b.card && a.other == b.other && a.token == b.token &&
         a.space == b.space && a.mission == b.mission && a.row == b.row && a.col == b.col &&
         a.spent == b.spent && a.keep == b.keep;
}

/** Still the root's turn, and `seat` decides. */
bool stillMine(const GameState& s, const GameState& root, int seat) {
  return s.phase != PH_OVER && s.turn == root.turn && s.hasCurrent && root.hasCurrent &&
         s.current.player == root.current.player && activePlayer(s) == seat;
}

/** Did applying a move reveal (or reshuffle) anything hidden? */
bool revealed(const GameState& a, const GameState& b, int seat) {
  if (a.rng != b.rng) return true;
  if (a.huntDeck.size() != b.huntDeck.size() || a.tavern.size() != b.tavern.size()) return true;
  if (a.players[seat].deck.size() != b.players[seat].deck.size()) return true;
  for (int i = 0; i < MAX_CHESTS; i++)
    if (a.chests[i] != b.chests[i]) return true;
  for (int i = 0; i < MAX_CRYPTS; i++)
    if (a.crypts[i].size() != b.crypts[i].size()) return true;
  return false;
}


// ---------------------------------------------------------------------------
// Rival model for Dracula's playouts: Nosferatu, plus the two late-night
// threats Nosferatu never makes — a Vampire who cannot reach safety on the
// last turn walks onto a rival to push them (survivors outrank the burnt, so
// dragging one down is its best move), and every late push aims the victim
// away from the nearest safe space, the Cemetery included. Without it the
// search sat next to a doomed rival believing the run home was certain.
// ---------------------------------------------------------------------------
bool safeSpace(const GameState& s, int sp) {
  int8_t r = boardOf(s).spaces[sp].region;
  if (r == R_CASTLE || r == R_CEMETERY) return true;
  return r == R_MOUNTAINS && (s.mode == MODE_ROOKIE || s.beginnerSafeMountains);
}

/** Spaces from `sp` to the nearest safe space (BFS, cached per board and rule set). */
int safeDistance(const GameState& s, int sp) {
  thread_local std::vector<int> cache[8];
  int key = s.board * 2 + (s.mode == MODE_ROOKIE || s.beginnerSafeMountains ? 1 : 0);
  std::vector<int>& d = cache[key];
  if (d.empty()) {
    const BoardData& b = boardOf(s);
    d.assign(b.n, 99);
    std::vector<int> q;
    for (int i = 0; i < b.n; i++)
      if (safeSpace(s, i)) d[i] = 0, q.push_back(i);
    for (size_t h = 0; h < q.size(); h++)
      for (int k = b.adjStart[q[h]]; k < b.adjStart[q[h] + 1]; k++)
        if (d[b.adj[k]] == 99) d[b.adj[k]] = d[q[h]] + 1, q.push_back(b.adj[k]);
  }
  return d[sp];
}

int spiteRule(const GameState& s, int seat, const Actions& legal) {
  if (s.hasCurrent && s.current.step == ST_MOVE && s.turn >= TURNS) {
    const PlayerState& p = s.players[seat];
    auto dest = [&](const Action& a) {
      return a.type == A_MOVE || a.type == A_MIST ? int(a.space) : a.type == A_STAY ? int(p.pos) : -1;
    };
    bool canSave = false;
    for (const Action& a : legal)
      if (dest(a) >= 0 && safeSpace(s, dest(a))) canSave = true;
    if (!canSave) {
      int best = -1;
      double bestV = 0;
      for (int i = 0; i < int(legal.size()); i++) {
        if (legal[i].type != A_MOVE) continue;
        double v = 0;
        for (int r = 0; r < s.nPlayers; r++)
          if (r != seat && s.players[r].pos == legal[i].space)
            v += 1 + (s.players[r].vp >= p.vp ? 0.5 : 0);
        if (v > bestV) bestV = v, best = i;
      }
      if (best >= 0) return best;
    }
  }
  if (s.hasCurrent && s.current.step == ST_PUSH && s.turn >= TURNS - 4) {
    int best = -1, bestD = -1;
    for (int i = 0; i < int(legal.size()); i++)
      if (legal[i].type == A_PUSH && legal[i].space >= 0 && safeDistance(s, legal[i].space) > bestD)
        bestD = safeDistance(s, legal[i].space), best = i;
    if (best >= 0) return best;
  }
  return -1;
}

static int rivalPick(const GameState& s, int seat, const Actions& legal) {
  int spite = spiteRule(s, seat, legal);
  return spite >= 0 ? spite : heuristicPick(s, seat, legal);
}

/** Playout: rivals by the rival model; `self` (the searcher) by `selfPolicy` (0 = the same, 1 = Carmilla). */
static void rivalPlayout(GameState& s, int self, int selfPolicy) {
  thread_local Actions legal;
  for (int i = 0; s.phase != PH_OVER && i < 5000; i++) {
    int seat = activePlayer(s);
    legalActions(s, seat, legal);
    int idx = legal.size() == 1 ? 0
              : seat == self && selfPolicy == 1 ? carmillaPick(s, seat, legal)
                                                : rivalPick(s, seat, legal);
    Action a = legal[idx];
    apply(s, seat, a);
  }
}

/** Playout where the searcher follows `goal` and rivals play the rival model. */
static void goalPlayout(GameState& s, int self, int goal, bool rivals) {
  thread_local Actions legal;
  for (int i = 0; s.phase != PH_OVER && i < 5000; i++) {
    int seat = activePlayer(s);
    legalActions(s, seat, legal);
    int idx = 0;
    if (legal.size() > 1) {
      idx = rivals ? spiteRule(s, seat, legal) : -1;
      if (idx < 0) idx = seat == self ? goalPick(s, seat, legal, goal) : heuristicPick(s, seat, legal);
    }
    Action a = legal[idx];
    apply(s, seat, a);
  }
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

bool g_draculaDebug = false;

namespace {
/**
 * followPlan: the rest of the whole-turn plan chosen at the last search. A plan
 * never crosses a reveal, so while the position is exactly the one the plan
 * expected, its next step is still the searched choice — play it without
 * searching again (one search per reveal instead of one per click).
 */
struct PlanMemo {
  std::string expect;  // canonical state the next step applies to
  std::vector<Action> rest;
};
thread_local PlanMemo g_memo;

void rememberPlan(const GameState& state, int seat, const std::vector<Action>& plan) {
  g_memo.rest.clear();
  g_memo.expect.clear();
  if (plan.size() < 2) return;
  GameState next = state;
  Action a = plan[0];
  apply(next, seat, a);
  g_memo.expect = canonicalState(next);
  g_memo.rest.assign(plan.begin() + 1, plan.end());
}
}  // namespace

int draculaPick(const GameState& state, int seat, const Actions& legal, const DraculaConfig& cfg) {
  using Clock = std::chrono::steady_clock;
  int L = int(legal.size());
  if (L == 1) return 0;
  if (cfg.followPlan && !g_memo.rest.empty() && canonicalState(state) == g_memo.expect) {
    Action step = g_memo.rest.front();
    for (int i = 0; i < L; i++)
      if (sameAction(legal[i], step)) {
        rememberPlan(state, seat, g_memo.rest);
        return i;
      }
  }
  g_memo.rest.clear();
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
    int alive;
    double goalSum[NUM_GOALS];
    int goalN;
  };
  // Portfolio: the goals the searcher's future self may follow (Nosferatu always).
  std::vector<int> goalList{G_NONE};
  for (int gl = 1; gl < NUM_GOALS; gl++)
    if ((cfg.goals >> gl) & 1) goalList.push_back(gl);
  const bool portfolio = goalList.size() > 1;
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
  for (int i = 0; i < A; i++) arms[i] = Arm{i, 0, 0, 0, {}, 0};
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
        if (portfolio) {
          // Every goal in the same world; the arm's value is its best goal's mean.
          for (int gl : goalList) {
            GameState g = world;
            play(g, arm.idx);
            goalPlayout(g, seat, gl, cfg.rivals);
            arm.goalSum[gl] += tierUtility(g, seat, cfg.survival);
          }
          arm.goalN++;
          double bestMean = -1;
          for (int gl : goalList) bestMean = std::max(bestMean, arm.goalSum[gl] / arm.goalN);
          arm.sum = bestMean * arm.goalN;
          arm.n = arm.goalN;
          continue;
        }
        GameState g = world;
        play(g, arm.idx);
        if (cfg.pol && cfg.pol->loaded) policyPlayout(g, *cfg.pol, cfg.rivals);
        else if (cfg.rivals) rivalPlayout(g, seat, cfg.selfPolicy);
        else playout(g);
        arm.sum += cfg.tierMargin ? tierUtility(g, seat, cfg.survival) : outcomeUtility(g, seat);
        arm.n++;
        arm.alive += g.result.breakdown[seat].fate != F_ASHES;
      }
    }
    std::stable_sort(arms.begin(), arms.end(), [](const Arm& a, const Arm& b) {
      return a.sum / std::max(1, a.n) > b.sum / std::max(1, b.n);
    });
    arms.resize(std::max<size_t>(1, (arms.size() + 1) / 2));
  }
  if (g_draculaDebug) {
    std::fprintf(stderr, "  dracula seat %d turn %d: %d arms (%s)\n", seat, state.turn, A,
                 plans.empty() ? "moves" : "plans");
    for (const Arm& a : arms) {
      std::string text;
      if (plans.empty()) text = canonicalAction(state, legal[a.idx]);
      else
        for (const Action& x : plans[a.idx]) text += canonicalAction(state, x) + " ; ";
      std::fprintf(stderr, "    u %.3f alive %.0f%% n %d  %s\n", a.sum / std::max(1, a.n),
                   100.0 * a.alive / std::max(1, a.n), a.n, text.c_str());
    }
  }
  if (arms[0].n == 0) return heuristicPick(state, seat, legal);
  if (plans.empty()) return arms[0].idx;
  const Action& first = plans[arms[0].idx][0];
  for (int i = 0; i < L; i++)
    if (sameAction(legal[i], first)) {
      if (cfg.followPlan) rememberPlan(state, seat, plans[arms[0].idx]);
      return i;
    }
  return heuristicPick(state, seat, legal);
}

}  // namespace hg
