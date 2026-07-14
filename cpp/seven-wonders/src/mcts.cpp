#include "sw/mcts.hpp"

#include <cmath>
#include <unordered_map>
#include <vector>

#include "sw/determinize.hpp"
#include "sw/engine.hpp"
#include "sw/heuristic.hpp"
#include "sw/rng.hpp"
#include "sw/rules.hpp"
#include "sw/scoring.hpp"

namespace sw {

namespace {

// Per-seat rank reward in [0,1]: fraction of opponents you finish above (ties = 0.5).
void rewardOf(const GameState& st, double out[N]) {
  GameResult r = scoreFinal(st);
  for (int i = 0; i < N; i++) {
    double beats = 0;
    for (int j = 0; j < N; j++) {
      if (j == i) continue;
      if (r.totals[i] > r.totals[j])
        beats += 1.0;
      else if (r.totals[i] == r.totals[j])
        beats += 0.5;
    }
    out[i] = beats / (N - 1);
  }
}

// One playout step. `heuristic` = use the balanced archetype as the rollout
// policy (much stronger value estimates than uniform random, per iteration).
Move playoutMove(const GameState& st, int seat, bool heuristic, Rng& rng) {
  if (heuristic) return heuristicMove(st, seat, Style::Balanced, rng);
  MoveBuffer b;
  legalActions(st, seat, b);
  return b.moves[rng.below(b.count)];
}

void playoutStep(GameState& st, Rng& rng, bool heuristic) {
  if (st.phase == Phase::Selecting) {
    for (int i = 0; i < N; i++)
      if (!st.hasSelection[i]) applySelection(st, i, playoutMove(st, i, heuristic, rng));
    if (st.phase == Phase::Revealing) applyReveal(st);
  } else if (st.phase == Phase::Revealing) {
    applyReveal(st);
  } else {
    int ap = activePlayer(st);
    applyPendingAction(st, ap, playoutMove(st, ap, heuristic, rng));
  }
}

void rollout(GameState st, Rng& rng, bool heuristic, double out[N]) {
  while (!isGameOver(st)) playoutStep(st, rng, heuristic);
  rewardOf(st, out);
}

struct Node {
  GameState st;
  bool terminal = false;
  bool expanded = false;
  double termReward[N] = {};
  int numActive = 0;
  int active[N] = {};
  std::vector<Move> mv[N];
  std::vector<int> nv[N];
  std::vector<double> wv[N];
  std::vector<float> pr[N];  // PUCT priors per move (net mode)
  int nodeVisits = 0;
  std::unordered_map<uint64_t, int> children;
};

struct Tree {
  std::vector<Node> pool;
  Rng rng;
  double c;
  bool heurRoll;
  const Net* net;
  std::vector<float> feat;  // scratch
  std::vector<float> pol;   // scratch

  Tree(uint32_t seed, double c_, bool heur, const Net* net_)
      : rng(seed), c(c_), heurRoll(heur), net(net_), feat(FEAT_DIM), pol(POLICY_DIM) {}

  int newNode(const GameState& st) {
    pool.emplace_back();
    Node& n = pool.back();
    n.st = st;
    n.terminal = isGameOver(st);
    if (n.terminal) rewardOf(st, n.termReward);
    return int(pool.size()) - 1;
  }

  void expand(int idx) {
    Node& n = pool[idx];
    n.expanded = true;
    if (n.terminal) return;
    bool selecting = n.st.phase == Phase::Selecting;
    if (selecting) {
      for (int i = 0; i < N; i++)
        if (!n.st.hasSelection[i]) n.active[n.numActive++] = i;
    } else {
      n.active[n.numActive++] = activePlayer(n.st);
    }
    for (int a = 0; a < n.numActive; a++) {
      int seat = n.active[a];
      MoveBuffer b;
      legalActions(n.st, seat, b);
      n.mv[seat].assign(b.moves, b.moves + b.count);
      n.nv[seat].assign(b.count, 0);
      n.wv[seat].assign(b.count, 0.0);
      // PUCT priors from the net (selecting nodes only; pending -> uniform).
      if (net && selecting) {
        encodeFeatures(n.st, seat, feat.data());
        float val[VALUE_DIM];
        net->eval(feat.data(), pol.data(), val);
        std::vector<float>& P = n.pr[seat];
        P.resize(b.count);
        float maxL = -1e30f;
        for (int i = 0; i < b.count; i++) maxL = std::max(maxL, pol[policyIndex(n.st, seat, b.moves[i])]);
        float sum = 0;
        for (int i = 0; i < b.count; i++) {
          float e = std::exp(pol[policyIndex(n.st, seat, b.moves[i])] - maxL);
          P[i] = e;
          sum += e;
        }
        for (int i = 0; i < b.count; i++) P[i] /= sum;
      } else if (net) {
        n.pr[seat].assign(b.count, 1.0f / b.count);
      }
    }
  }

  int selectSeatMove(const Node& n, int seat) {
    const auto& nv = n.nv[seat];
    const auto& wv = n.wv[seat];
    if (net) {
      const auto& P = n.pr[seat];
      double sqrtN = std::sqrt(double(n.nodeVisits + 1));
      int best = 0;
      double bestVal = -1e18;
      for (size_t i = 0; i < nv.size(); i++) {
        double q = nv[i] > 0 ? wv[i] / nv[i] : 0.5;  // FPU neutral
        double u = c * P[i] * sqrtN / (1.0 + nv[i]);
        if (q + u > bestVal) {
          bestVal = q + u;
          best = int(i);
        }
      }
      return best;
    }
    // M0: decoupled UCB, unvisited first.
    double logN = std::log(double(n.nodeVisits + 1));
    int best = 0;
    double bestVal = -1e18;
    for (size_t i = 0; i < nv.size(); i++) {
      double val = nv[i] == 0 ? 1e17 + double(i) : wv[i] / nv[i] + c * std::sqrt(logN / nv[i]);
      if (val > bestVal) {
        bestVal = val;
        best = int(i);
      }
    }
    return best;
  }

  GameState applyJoint(const Node& n, const int* pick) {
    GameState st = n.st;
    if (st.phase == Phase::Selecting) {
      for (int a = 0; a < n.numActive; a++)
        applySelection(st, n.active[a], n.mv[n.active[a]][pick[n.active[a]]]);
      if (st.phase == Phase::Revealing) applyReveal(st);
    } else {
      int seat = n.active[0];
      applyPendingAction(st, seat, n.mv[seat][pick[seat]]);
    }
    return st;
  }

  // Value of a freshly-created leaf: true reward if terminal, else net value
  // (perspective 0 => value[k] is seat k's estimate) or a random rollout.
  void leafValue(int leaf, double out[N]) {
    Node& n = pool[leaf];
    if (n.terminal) {
      for (int i = 0; i < N; i++) out[i] = n.termReward[i];
    } else if (net) {
      encodeFeatures(n.st, 0, feat.data());
      float val[VALUE_DIM];
      net->eval(feat.data(), pol.data(), val);
      for (int i = 0; i < N; i++) out[i] = val[i];
    } else {
      rollout(n.st, rng, heurRoll, out);
    }
  }

  void iterate(int root) {
    struct Step {
      int node;
      int pick[N];
    };
    std::vector<Step> path;
    int cur = root;
    double reward[N];

    while (true) {
      if (pool[cur].terminal) {
        for (int i = 0; i < N; i++) reward[i] = pool[cur].termReward[i];
        break;
      }
      if (!pool[cur].expanded) expand(cur);

      Node& n = pool[cur];
      Step s;
      s.node = cur;
      for (int i = 0; i < N; i++) s.pick[i] = 0;
      uint64_t key = 0;
      for (int a = 0; a < n.numActive; a++) {
        int seat = n.active[a];
        int idx = selectSeatMove(n, seat);
        s.pick[seat] = idx;
        key = key * 4096u + uint64_t(idx + 1);
      }
      path.push_back(s);

      auto it = n.children.find(key);
      if (it != n.children.end()) {
        cur = it->second;
        continue;
      }
      GameState childState = applyJoint(n, s.pick);
      int child = newNode(childState);
      pool[s.node].children[key] = child;
      leafValue(child, reward);
      break;
    }

    for (const Step& s : path) {
      Node& n = pool[s.node];
      n.nodeVisits++;
      for (int a = 0; a < n.numActive; a++) {
        int seat = n.active[a];
        int idx = s.pick[seat];
        n.nv[seat][idx]++;
        n.wv[seat][idx] += reward[seat];
      }
    }
  }
};

}  // namespace

RootStats mctsSearch(const GameState& st, const MctsConfig& cfg, const Net* net) {
  Tree tree(cfg.seed, cfg.c, cfg.heuristicRollout, net);
  tree.pool.reserve(cfg.iterations + 16);
  int root = tree.newNode(st);
  for (int i = 0; i < cfg.iterations; i++) tree.iterate(root);

  Node& r = tree.pool[root];
  if (!r.expanded) tree.expand(root);
  RootStats out;
  out.numActive = r.numActive;
  for (int a = 0; a < r.numActive; a++) {
    int seat = r.active[a];
    out.active[a] = seat;
    out.moves[seat] = r.mv[seat];
    out.visits[seat] = r.nv[seat];
  }
  return out;
}

Move mctsChooseMove(const GameState& st, int me, const MctsConfig& cfg, const Net* net) {
  RootStats r = mctsSearch(st, cfg, net);
  const auto& nv = r.visits[me];
  const auto& mv = r.moves[me];
  if (cfg.temperature > 0 && nv.size() > 1) {
    // Sample ~ visits^(1/T).
    Rng rng(cfg.seed ^ 0xB5297A4Du);
    double total = 0;
    std::vector<double> w(nv.size());
    for (size_t i = 0; i < nv.size(); i++) {
      w[i] = std::pow(double(nv[i]) + 1e-9, 1.0 / cfg.temperature);
      total += w[i];
    }
    double pick = rng.next() * total, acc = 0;
    for (size_t i = 0; i < nv.size(); i++) {
      acc += w[i];
      if (pick <= acc) return mv[i];
    }
  }
  int best = 0, bestN = -1;
  for (size_t i = 0; i < nv.size(); i++)
    if (nv[i] > bestN) {
      bestN = nv[i];
      best = int(i);
    }
  return mv[best];
}

Move ismctsChooseMove(const GameState& st, int me, const MctsConfig& cfg, const Net* net, int dets) {
  // Phase gate: perfect information (or no ensemble) => plain search.
  if (dets <= 1 || numUnknownHands(st, me) == 0) return mctsChooseMove(st, me, cfg, net);

  Rng rng(cfg.seed ^ 0xD37E1A11u);
  std::vector<double> agg;
  std::vector<Move> moves;
  // me's legal set is determinization-invariant (depends on me's hand + public
  // tableaus, not hidden hands), so root visit vectors align by index.
  for (int k = 0; k < dets; k++) {
    GameState d = determinize(st, me, rng);
    MctsConfig c2 = cfg;
    c2.seed = cfg.seed + uint32_t(k) * 2654435761u + 1u;
    RootStats r = mctsSearch(d, c2, net);
    if (k == 0) {
      moves = r.moves[me];
      agg.assign(r.visits[me].size(), 0.0);
    }
    for (size_t i = 0; i < agg.size() && i < r.visits[me].size(); i++) agg[i] += r.visits[me][i];
  }
  int best = 0;
  double bestv = -1;
  for (size_t i = 0; i < agg.size(); i++)
    if (agg[i] > bestv) {
      bestv = agg[i];
      best = int(i);
    }
  return moves[best];
}

}  // namespace sw
