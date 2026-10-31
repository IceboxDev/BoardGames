#include "sp/search.hpp"

#include <algorithm>
#include <chrono>
#include <random>
#include <span>
#include <tuple>

#include "sp/rules.hpp"
#include "sp/tuning.hpp"

namespace sp {

struct Search::State {
  std::array<BoxSet, kMaxShelves> mask{};
  std::array<int, kMaxShelves> width{};
  std::array<int, kMaxShelves> pileCount{};
  std::array<long long, kMaxShelves> topOver{};
  long long vol = 0, depthSum = 0, holes = 0;
  std::vector<int> piles;  // pile ids, in the order added
  Score score{};

  BoxSet placed() const {
    BoxSet s;
    for (const BoxSet& m : mask) s |= m;
    return s;
  }
};

namespace {

bool denser(const Pile& a, const Pile& b) { return a.vol * b.width > b.vol * a.width; }
bool larger(const Pile& a, const Pile& b) { return a.vol > b.vol; }
bool cleaner(const Pile& a, const Pile& b) { return a.holes * b.width < b.holes * a.width; }
bool wider(const Pile& a, const Pile& b) { return a.width > b.width; }

class PhaseTimer {
 public:
  PhaseTimer(std::vector<std::pair<std::string, double>>& out, std::string name)
      : out_(out), name_(std::move(name)), start_(std::chrono::steady_clock::now()) {}
  ~PhaseTimer() {
    std::chrono::duration<double> d = std::chrono::steady_clock::now() - start_;
    out_.emplace_back(name_, d.count());
  }

 private:
  std::vector<std::pair<std::string, double>>& out_;
  std::string name_;
  std::chrono::steady_clock::time_point start_;
};

}  // namespace

Search::Search(const Problem& p, const std::vector<ShelfCandidates>& shelves)
    : p_(p), shelves_(shelves), mandatory_(p.mandatory()) {
  for (int sh = 0; sh < (int)shelves.size(); sh++)
    for (int i = 0; i < (int)shelves[sh].piles.size(); i++) {
      shelfOf_.push_back(sh);
      indexOf_.push_back(i);
      pile_.push_back(&shelves[sh].piles[i]);
    }
  for (const Group& g : p.groups) groupBoxes_ |= g.members;
}

std::span<const BoxSet> masksOf(const std::array<BoxSet, kMaxShelves>& m, int shelves) {
  return {m.data(), (size_t)shelves};
}

bool Search::canExtend(const State& s, int id) const {
  const Pile& pile = *pile_[id];
  return !s.placed().intersects(pile.mask) &&
         s.width[shelfOf_[id]] + pile.width <= p_.geo.maxWidth();
}

void Search::extendInto(const State& s, int id, State& t) const {
  const Pile& pile = *pile_[id];
  int sh = shelfOf_[id];
  t = s;
  t.mask[sh] |= pile.mask;
  t.width[sh] += pile.width;
  t.pileCount[sh]++;
  t.topOver[sh] += topOverArea(pile, p_.geo.heightBase);
  t.vol += pile.vol;
  t.depthSum += pile.depthSum;
  t.holes += pile.holes;
  t.piles.push_back(id);
  t.score = scoreState(t);
}

Search::Score Search::scoreState(const State& s) const {
  const Geometry& g = p_.geo;
  BoxSet placed = s.placed();
  long long mandatory = (placed & mandatory_).count();
  long long allPlaced = p_.useAll ? placed.count() : 0;
  BoxSet stranded;
  for (const Group& grp : p_.groups) stranded |= strandedMembers(grp, placed);

  if (p_.objective == Objective::MaxVolume) {
    long long penalty = 0;
    for (int sh = 0; sh < p_.shelves(); sh++) {
      long long spill = (long long)std::max(0, s.width[sh] - g.widthBase) * g.heightBase +
                        s.topOver[sh];
      penalty += spill * p_.shelfDepths[sh] * p_.spillCost / 100;
    }
    long long strandedVol = 0;
    stranded.forEach([&](int b) { strandedVol += p_.boxes[b].vol; });
    return {mandatory, allPlaced, s.vol - strandedVol - penalty, s.depthSum, 0};
  }

  // FillAll: the window area the boxes actually fill.
  long long filled = -s.holes, topOver = 0;
  for (int sh = 0; sh < p_.shelves(); sh++) {
    filled += (long long)std::min(s.width[sh], g.widthBase) * g.heightBase;
    topOver += s.topOver[sh];
  }
  if (stranded.any())
    for (int id : s.piles)
      for (int ci : pile_[id]->cells)
        for (const Placement& pl : shelves_[shelfOf_[id]].cells[ci].boxes)
          if (stranded.has(pl.o.box)) filled -= (long long)pl.o.fw * pl.o.fh;
  return {mandatory, allPlaced, filled, -topOver, s.depthSum};
}

bool Search::complete(const State& s) const {
  if (p_.objective == Objective::MaxVolume) return !s.piles.empty();
  for (int sh = 0; sh < p_.shelves(); sh++)
    if (s.width[sh] + s.pileCount[sh] * p_.geo.tolPerBox < p_.geo.widthBase) return false;
  return true;
}

// A strict total order (score, then masks, then piles), so every selection
// is reproducible whatever algorithm makes it.
bool Search::better(const State& a, const State& b) const {
  return std::tie(a.score, b.mask, b.piles) > std::tie(b.score, a.mask, a.piles);
}

bool Search::betterPacking(const Packing& a, const Packing& b) const {
  if (p_.objective == Objective::MaxVolume)
    return std::tie(a.value, a.depthSum) > std::tie(b.value, b.depthSum);
  if (a.holes != b.holes) return a.holes < b.holes;
  if (a.spill != b.spill) return a.spill < b.spill;
  return a.depthSum > b.depthSum;
}

void Search::collect(const State& s, const std::string& source) {
  const Geometry& g = p_.geo;
  const int n = p_.shelves();
  if (!complete(s)) {
    stats_.incomplete++;
    long long covered = 0;
    for (int sh = 0; sh < n; sh++) covered += std::min(s.width[sh], g.widthBase);
    if (covered > stats_.bestCovered) {
      stats_.bestCovered = covered;
      for (int sh = 0; sh < n; sh++) stats_.bestPileWidths[sh].clear();
      for (int id : s.piles) stats_.bestPileWidths[shelfOf_[id]].push_back(pile_[id]->width);
    }
    return;
  }
  stats_.completed++;
  if (!groupsHold(p_, masksOf(s.mask, n))) {
    stats_.membership++;
    return;
  }
  BoxSet placed = s.placed();
  if (p_.useAll) {
    if (placed.count() > stats_.bestPlaced) {
      stats_.bestPlaced = placed.count();
      stats_.bestPlacedMask = placed;
    }
    if (placed != p_.all()) {
      stats_.membership++;
      return;
    }
  }
  Packing pk;
  pk.masks = s.mask;
  pk.widths = s.width;
  for (int id : s.piles) pk.piles[shelfOf_[id]].push_back(indexOf_[id]);
  pk.vol = s.vol;
  pk.depthSum = s.depthSum;
  pk.holes = s.holes;
  long long penalty = 0;
  for (int sh = 0; sh < n; sh++) {
    long long spill = (long long)std::max(0, s.width[sh] - g.widthBase) * g.heightBase +
                      s.topOver[sh];
    pk.spill += spill;
    penalty += spill * p_.shelfDepths[sh] * p_.spillCost / 100;
  }
  pk.value = s.vol - penalty;
  pk.source = source;
  auto it = pool_.find(pk.masks);
  if (it == pool_.end())
    pool_.emplace(pk.masks, std::move(pk));
  else if (betterPacking(pk, it->second))
    it->second = std::move(pk);
}

void Search::seed(const std::array<std::vector<int>, kMaxShelves>& piles,
                  const std::string& source) {
  State s;
  s.score = scoreState(s);
  int base = 0;
  for (int sh = 0; sh < p_.shelves(); sh++) {
    for (int idx : piles[sh]) {
      int id = base + idx;
      if (!canExtend(s, id)) continue;
      State t;
      extendInto(s, id, t);
      s = std::move(t);
    }
    base += (int)shelves_[sh].piles.size();
  }
  if (!s.piles.empty()) collect(s, source);
}

void Search::beam(const std::vector<int>& order, int width, const std::string& source) {
  std::vector<State> beam(1);
  beam[0].score = scoreState(beam[0]);
  const bool fillAll = p_.objective == Objective::FillAll;
  for (int id : order) {
    const Pile& pile = *pile_[id];
    const bool touchesGroups = pile.mask.intersects(groupBoxes_);
    size_t n = beam.size();
    beam.reserve(2 * n);
    for (size_t i = 0; i < n; i++) {
      if (!canExtend(beam[i], id)) continue;
      State t;
      extendInto(beam[i], id, t);
      if (touchesGroups) {
        bool dead = false;
        for (const Group& g : p_.groups)
          if (g.members.intersects(pile.mask) &&
              splitAcrossShelves(g, masksOf(t.mask, p_.shelves()))) {
            dead = true;
            break;
          }
        if (dead) {
          stats_.dead++;
          continue;
        }
      }
      // A full FillAll state may be pushed out of the beam later; keep it now.
      if (fillAll && complete(t)) collect(t, source);
      beam.push_back(std::move(t));
    }
    if (beam.size() > (size_t)width) {
      auto cmp = [&](const State& a, const State& b) { return better(a, b); };
      std::nth_element(beam.begin(), beam.begin() + width, beam.end(), cmp);
      beam.resize(width);
    }
  }
  for (const State& s : beam)
    if (!fillAll || !complete(s)) collect(s, source);
}

// Randomized greedy restarts. One restart takes, in noisy key order (each
// pile's key times uniform noise in [lo, hi]), every pile that still fits. A pile that stops fitting never fits
// again within a restart, so that equals repeatedly taking the best-keyed
// pile that still fits — which is how it runs, without sorting all piles
// per restart: a scan in noise-free key order that skips piles known not to
// fit and stops once no unseen pile can beat the best found; or, once only
// a few narrow piles could fit any shelf, a direct look at just those.
void Search::greedy(int iterations, uint64_t seed, const std::string& source) {
  const bool fillAll = p_.objective == Objective::FillAll;
  const int n = (int)pile_.size();
  const int shelves = p_.shelves();
  const double x = fillAll ? tuning::kFillAllGreedyNoise : tuning::kMaxVolumeGreedyNoise;
  // FillAll: key = cleanliness × u; MaxVolume: key = (width / volume) / u.
  const double lo = fillAll ? 1 - x : 1 / (1 + x);
  const double hi = fillAll ? 1 + x : 1 / (1 - x);
  std::vector<double> cost(n);
  for (int id = 0; id < n; id++) {
    const Pile& pile = *pile_[id];
    cost[id] = fillAll ? double(pile.holes + tuning::kFillAllGreedyHolesOffset) / pile.width
                       : double(pile.width) / double(std::max(1LL, pile.vol));
    cost[id] /= 1.0 + tuning::kGreedyMandatoryPreference * (pile.mask & mandatory_).count();
  }
  std::vector<int> base(n);  // by noise-free key
  for (int id = 0; id < n; id++) base[id] = id;
  std::stable_sort(base.begin(), base.end(), [&](int a, int b) { return cost[a] < cost[b]; });
  std::array<std::vector<int>, kMaxShelves> byWidth, widths;  // per shelf, narrowest first
  for (int id = 0; id < n; id++) byWidth[shelfOf_[id]].push_back(id);
  for (int sh = 0; sh < shelves; sh++) {
    std::stable_sort(byWidth[sh].begin(), byWidth[sh].end(),
                     [&](int a, int b) { return pile_[a]->width < pile_[b]->width; });
    for (int id : byWidth[sh]) widths[sh].push_back(pile_[id]->width);
  }

  // Per-restart state, reset by bumping `stamp` instead of clearing arrays.
  int stamp = 0;
  std::vector<int> keyStamp(n, -1), deadStamp(n, -1), jumpStamp(n, -1), jump(n, 0);
  std::vector<double> key(n);
  std::mt19937_64 rng(seed);
  std::uniform_real_distribution<double> noise(lo, hi);
  auto noisyKey = [&](int id) {
    if (keyStamp[id] != stamp) {
      keyStamp[id] = stamp;
      key[id] = cost[id] * noise(rng);
    }
    return key[id];
  };
  // First position >= pos in `base` not known to be unfit (path-compressed).
  auto nextAlive = [&](int pos) {
    int j = pos;
    while (j < n && deadStamp[j] == stamp) j = jumpStamp[j] == stamp ? jump[j] : j + 1;
    for (int k = pos; k < j;) {
      int next = jumpStamp[k] == stamp ? jump[k] : k + 1;
      jump[k] = j;
      jumpStamp[k] = stamp;
      k = next;
    }
    return j;
  };
  std::vector<int> designated(p_.groups.size(), 0);
  auto fits = [&](const State& s, int id) {
    if (!canExtend(s, id)) return false;
    for (size_t gi = 0; gi < p_.groups.size(); gi++)
      if (p_.groups[gi].members.intersects(pile_[id]->mask) && designated[gi] != shelfOf_[id])
        return false;
    return true;
  };
  // Checking the narrow piles directly wins once they are this rare.
  constexpr int kNarrowShare = 8;

  for (int it = 0; it < iterations; it++) {
    stamp++;
    if (shelves > 1)
      for (int& d : designated) d = (int)(rng() % (uint64_t)shelves);
    State s;
    while (true) {
      std::array<int, kMaxShelves> narrow{};
      long long candidates = 0;
      for (int sh = 0; sh < shelves; sh++) {
        int room = p_.geo.maxWidth() - s.width[sh];
        narrow[sh] = (int)(std::upper_bound(widths[sh].begin(), widths[sh].end(), room) -
                           widths[sh].begin());
        candidates += narrow[sh];
      }
      if (candidates == 0) break;
      int best = -1;
      double bestKey = 0;
      auto consider = [&](int id) {
        double k = noisyKey(id);
        if (best < 0 || k < bestKey || (k == bestKey && id < best)) {
          best = id;
          bestKey = k;
        }
      };
      if (candidates * kNarrowShare <= n) {
        for (int sh = 0; sh < shelves; sh++)
          for (int j = 0; j < narrow[sh]; j++)
            if (fits(s, byWidth[sh][j])) consider(byWidth[sh][j]);
      } else {
        for (int pos = nextAlive(0); pos < n; pos = nextAlive(pos + 1)) {
          int id = base[pos];
          if (best >= 0 && cost[id] * lo > bestKey) break;  // no later pile can win
          if (!fits(s, id)) {
            deadStamp[pos] = stamp;
            continue;
          }
          consider(id);
        }
      }
      if (best < 0) break;
      State t;
      extendInto(s, best, t);
      s = std::move(t);
    }
    collect(s, source);
  }
}

std::vector<int> Search::order(bool (*less)(const Pile&, const Pile&)) const {
  std::vector<int> ids(pile_.size());
  for (size_t i = 0; i < ids.size(); i++) ids[i] = (int)i;
  std::stable_sort(ids.begin(), ids.end(),
                   [&](int a, int b) { return less(*pile_[a], *pile_[b]); });
  return ids;
}

std::vector<int> Search::pinnedOrder(const std::vector<int>& order, int mandatoryShelf,
                                     int optionalShelf) const {
  std::vector<int> out;
  for (int id : order) {
    bool ok = true;
    for (const Group& g : p_.groups) {
      if (!g.members.intersects(pile_[id]->mask)) continue;
      int want = g.presence == Presence::Mandatory ? mandatoryShelf : optionalShelf;
      if (shelfOf_[id] != want) ok = false;
    }
    if (ok) out.push_back(id);
  }
  return out;
}

void Search::run(uint64_t seed) {
  const bool fillAll = p_.objective == Objective::FillAll;
  auto timed = [&](const std::string& name, auto&& fn) {
    PhaseTimer t(stats_.phaseSeconds, name);
    fn();
  };
  const char* firstName = fillAll ? "beam:cleanest" : "beam:densest";
  const char* secondName = fillAll ? "beam:widest" : "beam:largest";
  std::vector<int> first = order(fillAll ? cleaner : denser);
  std::vector<int> second = order(fillAll ? wider : larger);
  timed(firstName, [&] { beam(first, tuning::kBeamWide, firstName); });
  timed(secondName, [&] { beam(second, tuning::kBeamWide, secondName); });

  std::mt19937_64 rng(seed);
  int shuffled = fillAll ? tuning::kFillAllShuffledBeams : tuning::kMaxVolumeShuffledBeams;
  timed("beam:shuffled", [&] {
    for (int k = 0; k < shuffled; k++) {
      std::vector<int> ids = first;
      std::shuffle(ids.begin(), ids.end(), rng);
      beam(ids, tuning::kBeamNarrow, "beam:shuffled");
    }
  });

  int runs = fillAll ? tuning::kFillAllGreedyRuns : tuning::kMaxVolumeGreedyRuns;
  int iterations = fillAll ? tuning::kFillAllGreedyIterations : tuning::kMaxVolumeGreedyIterations;
  timed("greedy", [&] {
    for (int r = 0; r < runs; r++) greedy(iterations, rng(), "greedy");
  });

  // With several shelves, pin group-carrying piles to chosen shelves so
  // complete states stop dying on groups split across shelves.
  if (p_.shelves() > 1)
    timed("beam:pinned", [&] {
      for (int m = 0; m < p_.shelves(); m++)
        for (int o = 0; o < p_.shelves(); o++) {
          beam(pinnedOrder(first, m, o), tuning::kBeamNarrow, "beam:pinned");
          beam(pinnedOrder(second, m, o), tuning::kBeamNarrow, "beam:pinned");
        }
    });
}

std::vector<Packing> Search::ranked() const {
  std::vector<Packing> out;
  out.reserve(pool_.size());
  for (const auto& [_, pk] : pool_) out.push_back(pk);
  std::stable_sort(out.begin(), out.end(),
                   [&](const Packing& a, const Packing& b) { return betterPacking(a, b); });
  return out;
}

}  // namespace sp
