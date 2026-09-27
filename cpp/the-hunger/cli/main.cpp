// hg — The Hunger C++ engine CLI.
//
//   hg parity <fixtures-dir> [--no-strigoi] [-v]   replay TS fixtures, report divergence
//   hg bench [games]                               apply / legal / heuristic / playout throughput
//   hg arena <candidate> <baseline> <players> <deals> [--rollouts N] [--mode elder|rookie]
//            [--offset K] [--threads T] [-v]       1 candidate vs baselines, win rates
//   hg play <players> <seed> [elder|rookie]        one Nosferatu self-play game, final scores
//   hg expcheck <file>                             lines "<x bits hex> <Math.exp(x) bits hex>"
//
// Strategies: strigoi | heuristic (= heuristic-v1, nosferatu) | random.
#include <atomic>
#include <filesystem>
#include <map>
#include <cmath>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "hg/ai.hpp"
#include "hg/parity.hpp"

using namespace hg;
using Clock = std::chrono::steady_clock;

static double since(Clock::time_point t0) {
  return std::chrono::duration<double>(Clock::now() - t0).count();
}

/** tournament-runner.ts seedForGame. */
static uint32_t seedForGame(uint32_t gameIndex) {
  return ((gameIndex + 1u) * 0x9e3779b1u) ^ 0x4a11u;
}

static const char* flagValue(int argc, char** argv, const char* name, const char* dflt) {
  for (int i = 1; i + 1 < argc; i++)
    if (std::strcmp(argv[i], name) == 0) return argv[i + 1];
  return dflt;
}
static bool hasFlag(int argc, char** argv, const char* name) {
  for (int i = 1; i < argc; i++)
    if (std::strcmp(argv[i], name) == 0) return true;
  return false;
}

// ---------------------------------------------------------------------------

static int cmdParity(int argc, char** argv) {
  if (argc < 3) {
    std::fprintf(stderr, "usage: hg parity <fixtures-dir> [--no-strigoi] [-v]\n");
    return 2;
  }
  ParityOptions opt;
  opt.strigoi = !hasFlag(argc, argv, "--no-strigoi");
  opt.verbose = hasFlag(argc, argv, "-v");
  auto t0 = Clock::now();
  ParityReport r = runParity(argv[2], opt);
  printReport(r);
  std::printf("  (%.1fs)\n", since(t0));
  return r.ok() ? 0 : 1;
}

// ---------------------------------------------------------------------------

enum Strategy { S_RANDOM, S_HEURISTIC, S_STRIGOI, S_DRACULA };

static Strategy parseStrategy(const std::string& s) {
  if (s == "random" || s == "fledgling") return S_RANDOM;
  if (s == "heuristic" || s == "heuristic-v1" || s == "nosferatu") return S_HEURISTIC;
  if (s == "strigoi") return S_STRIGOI;
  if (s == "dracula") return S_DRACULA;
  std::fprintf(stderr, "unknown strategy %s\n", s.c_str());
  std::exit(2);
}

static int pick(Strategy st, const GameState& s, int seat, const Actions& legal, Mulberry32& rng,
                const StrigoiConfig& cfg, const DraculaConfig& dcfg = {}) {
  if (legal.size() == 1) return 0;
  switch (st) {
    case S_RANDOM: return int(rng() * double(legal.size()));
    case S_HEURISTIC: return heuristicPick(s, seat, legal);
    case S_STRIGOI: return strigoiPick(s, seat, legal, cfg);
    case S_DRACULA: return draculaPick(s, seat, legal, dcfg);
  }
  return 0;
}

static GameState playGame(const std::vector<Strategy>& seats, uint32_t seed, Mode mode,
                          const StrigoiConfig& cfg) {
  GameState s = createInitialState(int(seats.size()), seed, mode);
  Mulberry32 rng(seed ^ 0x5bd1e995u);
  Actions legal;
  for (int steps = 0; s.phase != PH_OVER && steps < 20000; steps++) {
    int seat = activePlayer(s);
    legalActions(s, seat, legal);
    int idx = pick(seats[seat], s, seat, legal, rng, cfg);
    Action a = legal[idx];
    apply(s, seat, a);
  }
  return s;
}

static int cmdArena(int argc, char** argv) {
  if (argc < 6) {
    std::fprintf(stderr,
                 "usage: hg arena <candidate> <baseline> <players> <deals> [--rollouts N] "
                 "[--mode elder|rookie] [--offset K] [--threads T] [-v]\n");
    return 2;
  }
  Strategy cand = parseStrategy(argv[2]);
  Strategy base = parseStrategy(argv[3]);
  int players = std::atoi(argv[4]);
  int deals = std::atoi(argv[5]);
  StrigoiConfig cfg;
  cfg.rollouts = std::atoi(flagValue(argc, argv, "--rollouts", "96"));
  Mode mode = std::string(flagValue(argc, argv, "--mode", "elder")) == "rookie" ? MODE_ROOKIE
                                                                               : MODE_ELDER;
  int offset = std::atoi(flagValue(argc, argv, "--offset", "0"));
  int threads = std::atoi(flagValue(argc, argv, "--threads", "0"));
  bool verbose = hasFlag(argc, argv, "-v");
  if (threads <= 0) threads = std::max(1u, std::thread::hardware_concurrency());

  std::atomic<int> next{0};
  std::mutex mu;
  double wins = 0, baseWins = 0;
  long outright = 0, candScore = 0, baseScore = 0, baseSeats = 0, survived = 0;
  auto t0 = Clock::now();
  auto worker = [&] {
    while (true) {
      int d = next++;
      if (d >= deals) return;
      int chair = d % players;
      std::vector<Strategy> seats(players, base);
      seats[chair] = cand;
      GameState s = playGame(seats, seedForGame(uint32_t(d + offset)), mode, cfg);
      std::lock_guard<std::mutex> lock(mu);
      const Result& r = s.result;
      if (verbose) {
        std::printf("deal %d chair %d scores", d + offset, chair);
        for (int i = 0; i < players; i++) std::printf(" %d", r.scores[i]);
        std::printf(" winner %d\n", r.winner);
      }
      for (int i = 0; i < r.winners.size(); i++) {
        double share = 1.0 / r.winners.size();
        if (r.winners[i] == chair)
          wins += share;
        else
          baseWins += share;
      }
      if (r.winner == chair) outright++;
      candScore += r.scores[chair];
      if (r.breakdown[chair].fate != F_ASHES) survived++;
      for (int i = 0; i < players; i++)
        if (i != chair) {
          baseScore += r.scores[i];
          baseSeats++;
        }
    }
  };
  std::vector<std::thread> pool;
  for (int i = 0; i < threads; i++) pool.emplace_back(worker);
  for (auto& t : pool) t.join();
  double secs = since(t0);
  std::printf("arena: %s vs %s, %dp %s, %d deals (offset %d), rollouts %d, %d threads\n", argv[2],
              argv[3], players, mode == MODE_ROOKIE ? "rookie" : "elder", deals, offset,
              cfg.rollouts, threads);
  std::printf("  candidate win rate : %.1f%% (outright %.1f%%; fair share %.1f%%)\n",
              100.0 * wins / deals, 100.0 * double(outright) / deals, 100.0 / players);
  std::printf("  candidate survived : %.1f%%\n", 100.0 * double(survived) / deals);
  std::printf("  mean score         : candidate %.2f, baseline seats %.2f\n",
              double(candScore) / deals, baseSeats ? double(baseScore) / baseSeats : 0.0);
  std::printf("  %.1fs (%.2fs per deal)\n", secs, secs / deals);
  return 0;
}

// ---------------------------------------------------------------------------

static int cmdBench(int argc, char** argv) {
  int games = argc > 2 ? std::atoi(argv[2]) : 200;
  // 1. Record realistic (state, action) pairs from Nosferatu self-play (4p elder).
  std::vector<GameState> states;
  std::vector<Action> actions;
  std::vector<int> seats;
  states.reserve(size_t(games) * 250);
  Actions legal;
  for (int g = 0; g < games; g++) {
    GameState s = createInitialState(4, seedForGame(uint32_t(g)), MODE_ELDER);
    while (s.phase != PH_OVER) {
      int seat = activePlayer(s);
      legalActions(s, seat, legal);
      int idx = legal.size() == 1 ? 0 : heuristicPick(s, seat, legal);
      states.push_back(s);
      actions.push_back(legal[idx]);
      seats.push_back(seat);
      Action a = legal[idx];
      apply(s, seat, a);
    }
  }
  size_t n = states.size();
  std::printf("bench: %d 4p elder Nosferatu games, %zu decisions, sizeof(GameState)=%zu B\n", games,
              n, sizeof(GameState));

  // 2. copy + apply (the TS applyUnchecked: clone + applyInPlace).
  auto t0 = Clock::now();
  long sink = 0;
  for (int rep = 0; rep < 3; rep++)
    for (size_t i = 0; i < n; i++) {
      GameState c = states[i];
      apply(c, seats[i], actions[i]);
      sink += c.placeCounter;
    }
  double applyUs = since(t0) * 1e6 / double(3 * n);

  // 3. legal-action enumeration.
  t0 = Clock::now();
  for (int rep = 0; rep < 3; rep++)
    for (size_t i = 0; i < n; i++) {
      legalActions(states[i], seats[i], legal);
      sink += long(legal.size());
    }
  double legalUs = since(t0) * 1e6 / double(3 * n);

  // 4. heuristic pick.
  std::vector<Actions> legals(n);
  for (size_t i = 0; i < n; i++) legalActions(states[i], seats[i], legals[i]);
  t0 = Clock::now();
  for (size_t i = 0; i < n; i++) sink += heuristicPick(states[i], seats[i], legals[i]);
  double heurUs = since(t0) * 1e6 / double(n);

  // 5. canonical hash.
  t0 = Clock::now();
  size_t hn = std::min<size_t>(n, 20000);
  for (size_t i = 0; i < hn; i++) sink += long(fnv1a64(canonicalState(states[i])) & 1);
  double hashUs = since(t0) * 1e6 / double(hn);

  // 6. 4p Nosferatu playout from the first play-phase state of each game.
  std::vector<GameState> starts;
  for (size_t i = 0; i < n; i++)
    if (states[i].phase == PH_PLAY && (i == 0 || states[i - 1].phase != PH_PLAY))
      starts.push_back(states[i]);
  t0 = Clock::now();
  for (const GameState& st : starts) {
    GameState g = st;
    playout(g);
    sink += g.result.scores[0];
  }
  double playoutMs = since(t0) * 1e3 / double(starts.size());

  // 7. Strigoi decision at 96 rollouts on sampled decisions with >1 legal action.
  t0 = Clock::now();
  int decisions = 0;
  for (size_t i = 0; i < n && decisions < 20; i += 97)
    if (legals[i].size() > 1) {
      sink += strigoiPick(states[i], seats[i], legals[i]);
      decisions++;
    }
  double strigoiMs = decisions ? since(t0) * 1e3 / decisions : 0;

  std::printf("  copy+apply        : %8.3f us   (TS applyUnchecked ~6-12 us)\n", applyUs);
  std::printf("  legalActions      : %8.3f us\n", legalUs);
  std::printf("  heuristicPick     : %8.3f us\n", heurUs);
  std::printf("  canonical hash    : %8.3f us\n", hashUs);
  std::printf("  4p playout        : %8.3f ms   (TS ~6.5 ms)  [%zu playouts]\n", playoutMs,
              starts.size());
  std::printf("  strigoi (96 roll) : %8.1f ms per decision [%d decisions]\n", strigoiMs, decisions);
  std::printf("  (checksum %ld)\n", sink);
  return 0;
}

// ---------------------------------------------------------------------------

static int cmdPlay(int argc, char** argv) {
  if (argc < 4) {
    std::fprintf(stderr, "usage: hg play <players> <seed> [elder|rookie]\n");
    return 2;
  }
  int n = std::atoi(argv[2]);
  uint32_t seed = uint32_t(std::strtoul(argv[3], nullptr, 10));
  Mode mode = argc > 4 && std::string(argv[4]) == "rookie" ? MODE_ROOKIE : MODE_ELDER;
  GameState s = playGame(std::vector<Strategy>(n, S_HEURISTIC), seed, mode, StrigoiConfig{});
  for (int i = 0; i < n; i++)
    std::printf("seat %d: %d (place %d)\n", i, s.result.scores[i], s.result.placements[i]);
  std::printf("hash %s\n", stateHash(s).c_str());
  return 0;
}

static int cmdExpCheck(int argc, char** argv) {
  if (argc < 3) return 2;
  std::ifstream in(argv[2]);
  unsigned long long xb, yb;
  long n = 0, bad = 0;
  while (in >> std::hex >> xb >> yb) {
    double x, y;
    std::memcpy(&x, &xb, 8);
    double z = jsExp(x);
    unsigned long long zb;
    std::memcpy(&zb, &z, 8);
    (void)y;
    n++;
    if (zb != yb) {
      if (bad++ < 10) std::printf("x=%.17g: jsExp %llx, V8 %llx\n", x, zb, yb);
    }
  }
  std::printf("expcheck: %ld / %ld bit-identical\n", n - bad, n);
  return bad == 0 ? 0 : 1;
}


// ---------------------------------------------------------------------------
// duel: paired 1-vs-field / field-vs-1 benches with per-side specs.
//   hg duel <cand> <base> <players> <deals> [--layout 1vN|Nv1] [--offset K]
//           [--mode elder|rookie] [--threads T]
// Specs: random | heuristic | strigoi[:rollouts=N[,minPerArm=M]]
// Each deal is also played with the baseline in every seat; the report pairs
// the focus chair (deal % players) across the two games, like bench.ts.

struct SeatSpec {
  Strategy st = S_HEURISTIC;
  StrigoiConfig cfg;
  DraculaConfig dcfg;
  std::string name;
};

static SeatSpec parseSpec(const std::string& spec) {
  SeatSpec out;
  out.name = spec;
  auto colon = spec.find(':');
  out.st = parseStrategy(spec.substr(0, colon));
  if (colon == std::string::npos) return out;
  std::string rest = spec.substr(colon + 1);
  size_t pos = 0;
  while (pos < rest.size()) {
    size_t comma = rest.find(',', pos);
    std::string kv = rest.substr(pos, comma == std::string::npos ? std::string::npos : comma - pos);
    auto eq = kv.find('=');
    std::string k = kv.substr(0, eq);
    int v = std::atoi(kv.substr(eq + 1).c_str());
    if (k == "rollouts") out.cfg.rollouts = out.dcfg.rollouts = v;
    else if (k == "minPerArm") out.cfg.minPerArm = out.dcfg.minPerArm = v;
    else if (k == "timeMs") out.dcfg.timeMs = v;
    else if (k == "tierMargin") out.dcfg.tierMargin = v != 0;
    else if (k == "turnPlans") out.dcfg.turnPlans = v != 0;
    else if (k == "maxPlans") out.dcfg.maxPlans = v;
    else {
      std::fprintf(stderr, "unknown option %s\n", k.c_str());
      std::exit(2);
    }
    if (comma == std::string::npos) break;
    pos = comma + 1;
  }
  return out;
}

static GameState playSpecs(const std::vector<const SeatSpec*>& seats, uint32_t seed, Mode mode) {
  GameState s = createInitialState(int(seats.size()), seed, mode);
  Mulberry32 rng(seed ^ 0x5bd1e995u);
  Actions legal;
  for (int steps = 0; s.phase != PH_OVER && steps < 20000; steps++) {
    int seat = activePlayer(s);
    legalActions(s, seat, legal);
    int idx = pick(seats[seat]->st, s, seat, legal, rng, seats[seat]->cfg, seats[seat]->dcfg);
    Action a = legal[idx];
    apply(s, seat, a);
  }
  return s;
}

static double winShare(const Result& r, int seat) {
  for (int i = 0; i < r.winners.size(); i++)
    if (r.winners[i] == seat) return 1.0 / r.winners.size();
  return 0.0;
}

static int cmdDuel(int argc, char** argv) {
  if (argc < 6) {
    std::fprintf(stderr, "usage: hg duel <cand> <base> <players> <deals> [--layout 1vN|Nv1] "
                         "[--offset K] [--mode elder|rookie] [--threads T]\n");
    return 2;
  }
  SeatSpec cand = parseSpec(argv[2]);
  SeatSpec base = parseSpec(argv[3]);
  int players = std::atoi(argv[4]);
  int deals = std::atoi(argv[5]);
  bool nv1 = std::string(flagValue(argc, argv, "--layout", "1vN")) == "Nv1";
  int offset = std::atoi(flagValue(argc, argv, "--offset", "0"));
  Mode mode = std::string(flagValue(argc, argv, "--mode", "elder")) == "rookie" ? MODE_ROOKIE
                                                                               : MODE_ELDER;
  int threads = std::atoi(flagValue(argc, argv, "--threads", "0"));
  if (threads <= 0) threads = std::max(1u, std::thread::hardware_concurrency());

  // All-baseline games are deterministic: cache them per (baseline, table, mode).
  // Line format: "<deal> <winShare per seat>... | <score per seat>... | <burnt per seat>...".
  struct BaseGame {
    double win[MAX_PLAYERS];
    int score[MAX_PLAYERS];
    int burnt[MAX_PLAYERS];
  };
  std::string cacheDir = flagValue(argc, argv, "--cache", "../../scratch/bench/hunger/cpp-cache");
  std::filesystem::create_directories(cacheDir);
  std::string cachePath = cacheDir + "/" + base.name + "_" + std::to_string(players) + "p_" +
                          (mode == MODE_ROOKIE ? "rookie" : "elder") + ".txt";
  std::map<int, BaseGame> cache;
  {
    std::ifstream in(cachePath);
    int deal;
    while (in >> deal) {
      BaseGame b{};
      for (int i = 0; i < players; i++) in >> b.win[i];
      for (int i = 0; i < players; i++) in >> b.score[i];
      for (int i = 0; i < players; i++) in >> b.burnt[i];
      cache[deal] = b;
    }
  }
  std::mutex cacheMu;

  std::vector<double> focus(deals), same(deals), dScore(deals);
  std::vector<int> surv(deals), baseSurv(deals);
  std::atomic<int> next{0};
  auto t0 = Clock::now();
  auto worker = [&] {
    while (true) {
      int d = next++;
      if (d >= deals) return;
      int chair = d % players;
      uint32_t seed = seedForGame(uint32_t(d + offset));
      std::vector<const SeatSpec*> mixed(players, nv1 ? &cand : &base);
      mixed[chair] = nv1 ? &base : &cand;
      GameState g = playSpecs(mixed, seed, mode);
      BaseGame bg{};
      bool hit;
      {
        std::lock_guard<std::mutex> lock(cacheMu);
        auto it = cache.find(d + offset);
        hit = it != cache.end();
        if (hit) bg = it->second;
      }
      if (!hit) {
        std::vector<const SeatSpec*> allBase(players, &base);
        GameState b = playSpecs(allBase, seed, mode);
        for (int i = 0; i < players; i++) {
          bg.win[i] = winShare(b.result, i);
          bg.score[i] = b.result.scores[i];
          bg.burnt[i] = b.result.breakdown[i].fate == F_ASHES;
        }
        std::lock_guard<std::mutex> lock(cacheMu);
        cache[d + offset] = bg;
        std::ofstream out(cachePath, std::ios::app);
        out << (d + offset);
        for (int i = 0; i < players; i++) out << ' ' << bg.win[i];
        for (int i = 0; i < players; i++) out << ' ' << bg.score[i];
        for (int i = 0; i < players; i++) out << ' ' << bg.burnt[i];
        out << '\n';
      }
      focus[d] = winShare(g.result, chair);
      same[d] = bg.win[chair];
      dScore[d] = g.result.scores[chair] - bg.score[chair];
      surv[d] = g.result.breakdown[chair].fate != F_ASHES;
      baseSurv[d] = !bg.burnt[chair];
    }
  };
  std::vector<std::thread> pool;
  for (int i = 0; i < threads; i++) pool.emplace_back(worker);
  for (auto& t : pool) t.join();

  auto mean = [](const std::vector<double>& v) {
    double s = 0;
    for (double x : v) s += x;
    return v.empty() ? 0.0 : s / v.size();
  };
  auto se = [&](const std::vector<double>& v) {
    if (v.size() < 2) return 0.0;
    double m = mean(v), acc = 0;
    for (double x : v) acc += (x - m) * (x - m);
    return std::sqrt(acc / (v.size() - 1) / v.size());
  };
  std::vector<double> d(deals);
  for (int i = 0; i < deals; i++) d[i] = focus[i] - same[i];
  double sv = 0, bsv = 0;
  for (int i = 0; i < deals; i++) {
    sv += surv[i];
    bsv += baseSurv[i];
  }
  std::printf("%dp %s  %s vs %s (%s, %d deals, offset %d)\n", players, nv1 ? "Nv1" : "1vN",
              cand.name.c_str(), base.name.c_str(), mode == MODE_ROOKIE ? "rookie" : "elder", deals,
              offset);
  std::printf("  %s wins %.1f%%  same chair all-baseline %.1f%%  (fair %.1f%%)\n",
              nv1 ? "lone baseline" : "candidate", 100 * mean(focus), 100 * mean(same),
              100.0 / players);
  std::printf("  paired dwin %+.1f%% +- %.1f%%   dscore %+.2f +- %.2f\n", 100 * mean(d), 100 * se(d),
              mean(dScore), se(dScore));
  std::printf("  survival %.1f%% (all-baseline %.1f%%)   %.0fs\n", 100 * sv / deals, 100 * bsv / deals,
              since(t0));
  return 0;
}

int main(int argc, char** argv) {
  if (argc < 2) {
    std::fprintf(stderr, "usage: hg parity|bench|arena|play|expcheck ...\n");
    return 2;
  }
  std::string cmd = argv[1];
  if (cmd == "parity") return cmdParity(argc, argv);
  if (cmd == "bench") return cmdBench(argc, argv);
  if (cmd == "arena") return cmdArena(argc, argv);
  if (cmd == "duel") return cmdDuel(argc, argv);
  if (cmd == "play") return cmdPlay(argc, argv);
  if (cmd == "expcheck") return cmdExpCheck(argc, argv);
  std::fprintf(stderr, "unknown command %s\n", cmd.c_str());
  return 2;
}
