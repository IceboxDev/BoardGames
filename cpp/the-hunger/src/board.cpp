// Movement over the board graph — a port of board.ts.
#include <algorithm>
#include <cstring>

#include "hg/engine.hpp"

namespace hg {

const char* const CATEGORY_NAMES[NUM_CATEGORIES] = {"villager", "religious", "military", "noble"};
const char* const REGION_NAMES[5] = {"castle", "cemetery", "mountains", "plains", "forest"};

static Graph buildGraph(int board) {
  Graph g;
  const BoardData& b = BOARD_DATA[board];
  g.b = &b;
  g.wells = 0;
  for (int i = 0; i < b.n; i++)
    if (b.spaces[i].effect == E_WELL || b.spaces[i].effect == E_CASTLE) g.wells |= uint64_t(1) << i;
  std::memset(g.dist, 0xff, sizeof g.dist);
  for (int s = 0; s < b.n; s++) {
    int queue[MAX_SPACES];
    int qn = 0;
    queue[qn++] = s;
    g.dist[s][s] = 0;
    for (int i = 0; i < qn; i++) {
      int at = queue[i];
      for (int k = b.adjStart[at]; k < b.adjStart[at + 1]; k++) {
        int nx = b.adj[k];
        if (g.dist[s][nx] != 0xff) continue;
        g.dist[s][nx] = uint8_t(g.dist[s][at] + 1);
        queue[qn++] = nx;
      }
    }
  }
  return g;
}

const Graph& graphOf(int board) {
  static const Graph graphs[3] = {buildGraph(0), buildGraph(1), buildGraph(2)};
  return graphs[board];
}

// ---- walkDestinations: a DFS over simple paths ------------------------------

namespace {
struct Walk {
  const Graph* g;
  int from, speed;
  bool bat;
  uint64_t occupied;
  uint64_t visited;
  int8_t best[MAX_SPACES];
  void dfs(int at, int spent) {
    const BoardData& b = *g->b;
    if (at == b.castle && at != from) return;
    for (int k = b.adjStart[at]; k < b.adjStart[at + 1]; k++) {
      int next = b.adj[k];
      if ((visited >> next) & 1) continue;
      int endCost = spent + 1;
      if (endCost > speed) continue;
      if (best[next] < 0 || endCost < best[next]) best[next] = int8_t(endCost);
      visited |= uint64_t(1) << next;
      bool skip = bat && (isWell(*g, next) || ((occupied >> next) & 1));
      dfs(next, skip ? spent : endCost);
      visited &= ~(uint64_t(1) << next);
    }
  }
};
}  // namespace

int walkDestinations(const Graph& g, int from, int speed, bool bat, uint64_t occupied, Dest* out) {
  Walk w;
  w.g = &g;
  w.from = from;
  w.speed = speed;
  w.bat = bat;
  w.occupied = occupied;
  w.visited = uint64_t(1) << from;
  std::memset(w.best, -1, sizeof w.best);
  w.dfs(from, 0);
  const BoardData& b = *g.b;
  int n = 0;
  for (int i = 0; i < b.n; i++)
    if (w.best[i] >= 0) out[n++] = Dest{int16_t(i), w.best[i]};
  std::sort(out, out + n,
            [&](const Dest& x, const Dest& y) { return b.localeRank[x.to] < b.localeRank[y.to]; });
  return n;
}

int mistDestinations(const Graph& g, int from, int16_t* out) {
  const BoardData& b = *g.b;
  uint64_t seen = uint64_t(1) << from;
  int queue[MAX_SPACES];
  int qn = 0, n = 0;
  queue[qn++] = from;
  for (int i = 0; i < qn; i++) {
    int at = queue[i];
    for (int k = b.adjStart[at]; k < b.adjStart[at + 1]; k++) {
      int next = b.adj[k];
      if ((seen >> next) & 1) continue;
      seen |= uint64_t(1) << next;
      if (isWell(g, next))
        out[n++] = int16_t(next);
      else
        queue[qn++] = next;
    }
  }
  std::sort(out, out + n, [&](int16_t x, int16_t y) { return b.cuRank[x] < b.cuRank[y]; });
  return n;
}

int spicyDestinations(const Graph& g, int from, int speed, Dest* out) {
  const BoardData& b = *g.b;
  if (isWell(g, from) || speed <= 0) return 0;
  int nearest = 1 << 30;
  for (int w = 0; w < b.n; w++)
    if (isWell(g, w) && g.dist[from][w] != 0xff) nearest = std::min(nearest, int(g.dist[from][w]));
  if (nearest == 1 << 30) return 0;
  int n = 0;
  if (nearest <= speed) {
    for (int w = 0; w < b.n; w++)
      if (isWell(g, w) && g.dist[from][w] == nearest) out[n++] = Dest{int16_t(w), int8_t(nearest)};
    std::sort(out, out + n,
              [&](const Dest& x, const Dest& y) { return b.cuRank[x.to] < b.cuRank[y.to]; });
    return n;
  }
  for (int id = 0; id < b.n; id++) {
    if (g.dist[from][id] == 0xff || g.dist[from][id] != speed) continue;
    int toWell = 1 << 30;
    for (int w = 0; w < b.n; w++)
      if (isWell(g, w) && g.dist[w][id] != 0xff) toWell = std::min(toWell, int(g.dist[w][id]));
    if (toWell == nearest - speed) out[n++] = Dest{int16_t(id), int8_t(speed)};
  }
  std::sort(out, out + n,
            [&](const Dest& x, const Dest& y) { return b.localeRank[x.to] < b.localeRank[y.to]; });
  return n;
}

int confuseDestination(const Graph& g, int from, int steps) {
  const BoardData& b = *g.b;
  int at = from;
  for (int i = 0; i < steps; i++) {
    int d = b.labyrinthDist[at];
    if (d == 0) break;
    int next = -1;
    for (int k = b.adjStart[at]; k < b.adjStart[at + 1]; k++) {
      if (b.labyrinthDist[b.adj[k]] == d - 1) {
        next = b.adj[k];
        break;
      }
    }
    if (next < 0) break;
    at = next;
  }
  return at;
}

int pushDestinations(const Graph& g, int from, int16_t* out) {
  const BoardData& b = *g.b;
  int n = 0;
  for (int k = b.adjStart[from]; k < b.adjStart[from + 1]; k++)
    if (b.adj[k] != b.castle) out[n++] = int16_t(b.adj[k]);
  return n;
}

}  // namespace hg
