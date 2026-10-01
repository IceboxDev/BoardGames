#include "hg/lilith.hpp"

#include <algorithm>
#include <cmath>
#include <numeric>
#include <string>

#include <cstdio>

#include "hg/ai.hpp"

namespace hg {

double lilithValue(const GameState& s, int seat, const Net& net, double placeW, int vmode) {
  const int n = s.nPlayers;
  if (s.phase == PH_OVER && s.hasResult) {
    const Result& r = s.result;
    double win = 0;
    for (int w = 0; w < r.winners.size(); w++)
      if (r.winners[w] == seat) win = 1.0 / r.winners.size();
    double place = n > 1 ? double(n - r.placements[seat]) / double(n - 1) : 1;
    return win + placeW * place;
  }
  thread_local SparseFeatures x;
  NetOutput o;
  encodeState(s, seat, x);
  net.forward(x, o);
  if (vmode == 1) {
    // Score race: survivors outrank the burnt, then the higher final score wins.
    // Pairwise P(I finish ahead of j) from the survival and final-score heads,
    // with score noise that shrinks toward sunrise; P(win) ≈ their product.
    auto surv = [&](int rel) { return 1.0 / (1.0 + std::exp(-double(o.value[rel * V_PER_SEAT + 1]))); };
    auto score = [&](int rel) { return 100.0 * o.value[rel * V_PER_SEAT + 2]; };
    double left = std::max(0, TURNS - int(s.turn)) / double(TURNS);
    double sigma = 4.0 + 14.0 * left;
    double pm = surv(0), win = 1, ahead = 0;
    for (int j = 1; j < n; j++) {
      double pj = surv(j);
      double edge = 0.5 * std::erfc(-(score(0) - score(j)) / (sigma * std::sqrt(2.0)));
      double beat = pm * (1 - pj) + (pm * pj + (1 - pm) * (1 - pj)) * edge;
      win *= beat;
      ahead += beat;
    }
    return win + placeW * (n > 1 ? ahead / (n - 1) : 1);
  }
  float p[MAX_PLAYERS];
  net.winProbs(o, n, p);
  return p[0] + placeW * o.value[3];
}

namespace {

/**
 * Play on by the policy head's argmax (every seat) to a common evaluation point:
 * horizon 0 — the end of `seat`'s current turn (the next seat is about to act);
 * horizon 1 — `seat`'s next decision on a later turn (rivals have replied).
 * Values are only comparable between positions at the same kind of point.
 */
void advance(GameState& g, int seat, int rootTurn, int rootPlayer, int horizon, const Net& net) {
  thread_local Actions legal;
  thread_local SparseFeatures x;
  thread_local ActionFeatures af;
  for (int steps = 0; g.phase != PH_OVER && steps < 400; steps++) {
    int who = activePlayer(g);
    if (horizon == 0 && !(g.hasCurrent && g.current.player == rootPlayer && g.turn == rootTurn)) return;
    if (horizon >= 1 && who == seat && g.turn != rootTurn) return;
    legalActions(g, who, legal);
    int best = 0;
    if (legal.size() > 1) {
      NetOutput o;
      encodeState(g, who, x);
      net.forward(x, o);
      float bl = -1e30f;
      for (size_t i = 0; i < legal.size(); i++) {
        encodeAction(g, legal[i], af);
        float l = net.actionLogit(o, af);
        if (l > bl) bl = l, best = int(i);
      }
    }
    Action a = legal[best];
    apply(g, who, a);
  }
}

struct Leaf {
  std::vector<Action> path;
  bool reveal;
  double sum = 0;
  int n = 0;
};

uint32_t lilithSeed(const GameState& s, int seat) {
  uint32_t x = uint32_t(int32_t(s.turn) * 7919 + seat * 131 + s.placeCounter * 17);
  return (x * 0x9e3779b1u) ^ 0x4c494cu;
}

}  // namespace

int lilithPick(const GameState& state, int seat, const Actions& legal, const Net& net,
               const LilithConfig& cfg, std::vector<float>* rootQ, double u01) {
  const int L = int(legal.size());
  if (rootQ) rootQ->assign(L, -1.f);
  if (L == 1) {
    if (rootQ) (*rootQ)[0] = 1;
    return 0;
  }
  Mulberry32 rand(lilithSeed(state, seat));
  GameState world0 = determinize(state, seat, rand);

  // ---- enumerate plans, policy-ordered and pruned
  std::vector<Leaf> leaves;
  std::vector<std::string> seen;
  std::vector<Action> path;
  auto dfs = [&](auto&& self, const GameState& s, int depth) -> void {
    if (int(leaves.size()) >= cfg.maxLeaves) return;
    if (!stillMine(s, world0, seat) || depth >= 16) {
      std::string key = canonicalState(s);
      if (std::find(seen.begin(), seen.end(), key) != seen.end()) return;
      seen.push_back(std::move(key));
      leaves.push_back(Leaf{path, false});
      return;
    }
    Actions here;
    legalActions(s, seat, here);
    std::vector<int> order(here.size());
    std::iota(order.begin(), order.end(), 0);
    int keep = depth == 0 ? cfg.rootBranch : cfg.branch;
    if (int(here.size()) > 1) {
      thread_local SparseFeatures x;
      thread_local ActionFeatures af;
      NetOutput o;
      encodeState(s, seat, x);
      net.forward(x, o);
      std::vector<float> logit(here.size());
      for (size_t i = 0; i < here.size(); i++) {
        encodeAction(s, here[i], af);
        logit[i] = net.actionLogit(o, af);
      }
      std::stable_sort(order.begin(), order.end(), [&](int a, int b) { return logit[a] > logit[b]; });
    }
    if (int(order.size()) > keep) order.resize(keep);
    for (int i : order) {
      GameState next = s;
      Action a = here[i];
      apply(next, seat, a);
      path.push_back(here[i]);
      if (revealed(s, next, seat)) {
        if (int(leaves.size()) < cfg.maxLeaves) leaves.push_back(Leaf{path, true});
      } else {
        self(self, next, depth + 1);
      }
      path.pop_back();
      if (int(leaves.size()) >= cfg.maxLeaves) return;
    }
  };
  dfs(dfs, world0, 0);
  if (leaves.empty()) return 0;

  // ---- evaluate: one world if nothing was revealed, `worlds` otherwise
  auto play = [&](GameState& g, const Leaf& leaf) {
    for (const Action& a : leaf.path) {
      Action copy = a;
      apply(g, seat, copy);
    }
  };
  // Every leaf is played on to the same kind of point (see advance), in `worlds`
  // sampled worlds shared by all leaves (common random numbers).
  const int rootPlayer = state.hasCurrent ? state.current.player : seat;
  for (int w = 0; w < cfg.worlds; w++) {
    GameState world = w == 0 ? world0 : determinize(state, seat, rand);
    for (Leaf& leaf : leaves) {
      GameState g = world;
      play(g, leaf);
      advance(g, seat, state.turn, rootPlayer, cfg.horizon, net);
      leaf.sum += lilithValue(g, seat, net, cfg.placeW, cfg.vmode);
      leaf.n++;
    }
  }

  // ---- back up to the root moves
  std::vector<double> q(L, -1);
  for (const Leaf& leaf : leaves) {
    double v = leaf.sum / std::max(1, leaf.n);
    for (int i = 0; i < L; i++)
      if (sameAction(legal[i], leaf.path[0])) {
        q[i] = std::max(q[i], v);
        break;
      }
  }
  if (g_draculaDebug) {
    std::fprintf(stderr, "  lilith seat %d turn %d: %d leaves\n", seat, state.turn, int(leaves.size()));
    for (const Leaf& leaf : leaves) {
      std::string text;
      for (const Action& a : leaf.path) text += canonicalAction(state, a) + " ; ";
      std::fprintf(stderr, "    v %.3f n %d %s%s\n", leaf.sum / std::max(1, leaf.n), leaf.n,
                   leaf.reveal ? "[reveal] " : "", text.c_str());
    }
  }
  if (rootQ)
    for (int i = 0; i < L; i++) (*rootQ)[i] = float(q[i]);
  int best = int(std::max_element(q.begin(), q.end()) - q.begin());
  if (cfg.temp > 0) {
    double mx = q[best], sum = 0;
    std::vector<double> w(L, 0);
    for (int i = 0; i < L; i++)
      if (q[i] >= 0) sum += w[i] = std::exp((q[i] - mx) / cfg.temp);
    double r = u01 * sum;
    for (int i = 0; i < L; i++) {
      r -= w[i];
      if (w[i] > 0 && r <= 0) return i;
    }
  }
  return best;
}

}  // namespace hg
