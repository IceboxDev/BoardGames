#include "sp/rules.hpp"

#include <algorithm>
#include <cstdlib>
#include <numeric>

namespace sp {

namespace {

// Disjoint-set forest over a handful of members.
struct Dsu {
  std::vector<int> parent;
  explicit Dsu(int n) : parent(n) { std::iota(parent.begin(), parent.end(), 0); }
  int find(int v) {
    while (parent[v] != v) v = parent[v] = parent[parent[v]];
    return v;
  }
  void unite(int a, int b) { parent[find(a)] = find(b); }
  bool connected() {
    for (int i = 1; i < (int)parent.size(); i++)
      if (find(i) != find(0)) return false;
    return true;
  }
};

}  // namespace

bool touches(const Rect& a, const Rect& b) {
  return a.x0 <= b.x1() && b.x0 <= a.x1() && a.y0 <= b.y1() && b.y0 <= a.y1();
}

bool longEdgeContact(const Rect& c, const Rect& o) {
  if (c.fw >= c.fh) {  // horizontal long edges: o directly above or below
    int overlap = std::min(c.x1(), o.x1()) - std::max(c.x0, o.x0);
    if (overlap > 0 && (o.y1() == c.y0 || c.y1() == o.y0)) return true;
  }
  if (c.fh >= c.fw) {  // vertical long edges: o directly left or right
    int overlap = std::min(c.y1(), o.y1()) - std::max(c.y0, o.y0);
    if (overlap > 0 && (o.x1() == c.x0 || c.x1() == o.x0)) return true;
  }
  return false;
}

bool formsStrictRun(std::span<const Rect> members) {
  std::vector<Rect> byY(members.begin(), members.end());
  std::vector<Rect> byX = byY;
  std::sort(byY.begin(), byY.end(), [](const Rect& a, const Rect& b) { return a.y0 < b.y0; });
  std::sort(byX.begin(), byX.end(), [](const Rect& a, const Rect& b) { return a.x0 < b.x0; });
  bool tower = true, row = true;
  for (size_t i = 0; i < byY.size(); i++) {
    if (byY[i].x0 != byY[0].x0 || byY[i].fw != byY[0].fw) tower = false;
    if (i && byY[i].y0 != byY[i - 1].y1()) tower = false;
  }
  for (size_t i = 0; i < byX.size(); i++) {
    if (byX[i].fh < byX[i].fw) row = false;  // rows are of standing boxes
    if (std::abs(byX[i].y0 - byX[0].y0) > kRowSettleToleranceMm || byX[i].fh != byX[0].fh)
      row = false;
    if (i && byX[i].x0 != byX[i - 1].x1()) row = false;
  }
  return tower || row;
}

bool contactHolds(const Group& g, std::span<const Rect> layout, BoxSet longEdge) {
  std::vector<Rect> members;
  for (const Rect& r : layout)
    if (g.members.has(r.box)) members.push_back(r);
  if ((int)members.size() != g.members.count()) return false;  // caller's bug, never legal
  if (g.contact == Contact::StrictRun) return formsStrictRun(members);

  auto counts = [&](const Rect& a, const Rect& b) {
    if (g.contact == Contact::LongEdgeBoth) return longEdgeContact(a, b) && longEdgeContact(b, a);
    bool aLong = longEdge.has(a.box), bLong = longEdge.has(b.box);
    if (aLong && !longEdgeContact(a, b)) return false;
    if (bLong && !longEdgeContact(b, a)) return false;
    return aLong || bLong || touches(a, b);
  };
  Dsu dsu((int)members.size());
  for (size_t i = 0; i < members.size(); i++)
    for (size_t j = i + 1; j < members.size(); j++)
      if (counts(members[i], members[j])) dsu.unite((int)i, (int)j);
  return dsu.connected();
}

bool presenceHolds(const Group& g, BoxSet placed) {
  BoxSet in = placed & g.members;
  switch (g.presence) {
    case Presence::Mandatory:
      return in == g.members;
    case Presence::AllOrNone:
      return in.empty() || in == g.members;
    case Presence::Requires:
      return !placed.intersects(g.dependents) || in == g.members;
  }
  return false;
}

BoxSet strandedMembers(const Group& g, BoxSet placed) {
  BoxSet in = placed & g.members;
  switch (g.presence) {
    case Presence::Mandatory:
      return {};
    case Presence::AllOrNone:
      return in == g.members ? BoxSet{} : in;
    case Presence::Requires:
      return in == g.members ? BoxSet{} : (placed & g.dependents);
  }
  return {};
}

bool splitAcrossShelves(const Group& g, std::span<const BoxSet> shelves) {
  int holding = 0;
  for (const BoxSet& s : shelves)
    if (s.intersects(g.members)) holding++;
  return holding > 1;
}

bool groupsHold(const Problem& p, std::span<const BoxSet> shelves, std::string* why) {
  BoxSet placed;
  for (const BoxSet& s : shelves) placed |= s;
  for (const Group& g : p.groups) {
    if (!presenceHolds(g, placed)) {
      if (why) *why = g.origin + ": members missing";
      return false;
    }
    if (splitAcrossShelves(g, shelves)) {
      if (why) *why = g.origin + ": members on different shelves";
      return false;
    }
  }
  return true;
}

bool membershipHolds(const Problem& p, std::span<const BoxSet> shelves, std::string* why) {
  BoxSet placed;
  for (const BoxSet& s : shelves) placed |= s;
  if (p.useAll && placed != p.all()) {
    if (why) *why = "--use-all: not every box is placed";
    return false;
  }
  return groupsHold(p, shelves, why);
}

}  // namespace sp
