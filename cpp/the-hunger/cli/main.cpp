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
#include <iterator>
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
#include "hg/behave.hpp"
#include "hg/samples.hpp"
#include "hg/lilith.hpp"
#include "hg/rollpol.hpp"
#include "hg/canon_parse.hpp"
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

enum Strategy { S_RANDOM, S_HEURISTIC, S_STRIGOI, S_DRACULA, S_CARMILLA, S_LILITH, S_POLICY, S_RUNNER, S_EXEC };

static Strategy parseStrategy(const std::string& s) {
  if (s == "random" || s == "fledgling") return S_RANDOM;
  if (s == "heuristic" || s == "heuristic-v1" || s == "nosferatu") return S_HEURISTIC;
  if (s == "strigoi") return S_STRIGOI;
  if (s == "dracula") return S_DRACULA;
  if (s == "carmilla") return S_CARMILLA;
  if (s == "lilith") return S_LILITH;
  if (s == "policy") return S_POLICY;
  if (s == "runner") return S_RUNNER;
  if (s == "exec") return S_EXEC;
  std::fprintf(stderr, "unknown strategy %s\n", s.c_str());
  std::exit(2);
}

static int pick(Strategy st, const GameState& s, int seat, const Actions& legal, Mulberry32& rng,
                const StrigoiConfig& cfg, const DraculaConfig& dcfg = {},
                const CarmillaConfig& ccfg = {}) {
  if (legal.size() == 1) return 0;
  switch (st) {
    case S_RANDOM: return int(rng() * double(legal.size()));
    case S_HEURISTIC: return heuristicPick(s, seat, legal);
    case S_STRIGOI: return strigoiPick(s, seat, legal, cfg);
    case S_DRACULA: return draculaPick(s, seat, legal, dcfg);
    case S_CARMILLA: return carmillaPick(s, seat, legal, ccfg);
    case S_LILITH:
    case S_POLICY:
    case S_RUNNER:
    case S_EXEC: return 0;  // need extra config: pickSpec
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
  CarmillaConfig ccfg;
  LilithConfig lcfg;
  int net = 0;
  int polId = 0;
  RunnerConfig rcfg;
  int execId = 0;
  std::string name;
};

// Networks for Lilith seats: --net <file> is net 0, --net1..--net3 the others (spec key net=N).
static Net g_nets[4];
// Playout policies: --pol <file> is policy 0, --pol1..--pol3 (spec key pol=N: Dracula's playouts,
// or the `policy` strategy playing it directly).
static RollPolicy g_pols[4];
// Executor parameter files: --exec <file> is 0, --exec1..--exec3 (spec: `exec:e=N`, or `exec=N` on Dracula).
static ExecParams g_execs[4];

static int pickSpec(const SeatSpec& sp, const GameState& s, int seat, const Actions& legal,
                    Mulberry32& rng, std::vector<float>* rootQ = nullptr) {
  if (sp.st == S_LILITH) {
    if (!g_nets[sp.net].loaded) {
      std::fprintf(stderr, "lilith: net %d not loaded (--net%s <file>)\n", sp.net,
                   sp.net ? std::to_string(sp.net).c_str() : "");
      std::exit(2);
    }
    double u = rng();
    return lilithPick(s, seat, legal, g_nets[sp.net], sp.lcfg, rootQ, u);
  }
  if (sp.st == S_RUNNER) return runnerPick(s, seat, legal, sp.rcfg);
  if (sp.st == S_EXEC) return execPick(s, seat, legal, g_execs[sp.execId]);
  if (sp.st == S_POLICY) {
    int spite = spiteRule(s, seat, legal);
    return spite >= 0 ? spite : policyPick(s, seat, legal, g_pols[sp.polId]);
  }
  return pick(sp.st, s, seat, legal, rng, sp.cfg, sp.dcfg, sp.ccfg);
}

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
    else if (k == "net") out.net = v;
    else if (k == "pol") {
      out.polId = v;
      if (!g_pols[v].loaded) {
        std::fprintf(stderr, "pol=%d: no policy loaded (--pol%s <file>)\n", v, v ? std::to_string(v).c_str() : "");
        std::exit(2);
      }
      out.dcfg.pol = &g_pols[v];
    }
    else if (k == "worlds") out.lcfg.worlds = v;
    else if (k == "horizon") out.lcfg.horizon = v;
    else if (k == "vmode") out.lcfg.vmode = v;
    else if (k == "rootBranch") out.lcfg.rootBranch = v;
    else if (k == "branch") out.lcfg.branch = v;
    else if (k == "maxLeaves") out.lcfg.maxLeaves = v;
    else if (k == "placeW") out.lcfg.placeW = v / 100.0;  // percent
    else if (k == "temp") out.lcfg.temp = v / 100.0;      // percent
    else if (k == "pace") out.ccfg.pace = v;
    else if (k == "rose") out.ccfg.rose = v != 0;
    else if (k == "roseBonus") out.ccfg.roseBonus = v;
    else if (k == "tavern") out.ccfg.tavern = v;
    else if (k == "deck") out.ccfg.deck = v;
    else if (k == "confuse") out.ccfg.confuse = v;
    else if (k == "digest") out.ccfg.digest = v;
    else if (k == "goal") out.ccfg.goal = v;
    else if (k == "e") out.execId = v;
    else if (k == "exec") {
      if (!g_execs[v].loaded) {
        std::fprintf(stderr, "exec=%d: no executor loaded\n", v);
        std::exit(2);
      }
      out.dcfg.exec = &g_execs[v];
    }
    else if (k == "rpace") out.rcfg.pace = v;
    else if (k == "lastOut") out.rcfg.lastOutTurn = v;
    else if (k == "margin") out.rcfg.margin = v;
    else if (k == "chest") out.rcfg.chest = v;
    else if (k == "rtavern") out.rcfg.tavern = v;
    else if (k == "rtarget") out.rcfg.target = v;
    else if (k == "goals") out.dcfg.goals = v;
    else if (k == "goalArms") out.dcfg.goalArms = v != 0;
    else if (k == "execBias") out.dcfg.execBias = v;
    else if (k == "follow") out.dcfg.followPlan = v != 0;
    else if (k == "selfPolicy") out.dcfg.selfPolicy = v;
    else if (k == "rivals") out.dcfg.rivals = v != 0;
    else if (k == "survival") out.dcfg.survival = v / 100.0;  // percent
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
    int idx = pickSpec(*seats[seat], s, seat, legal, rng);
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


// ---------------------------------------------------------------------------
// burns: 1vN games; for every game the candidate burns in, its last turns —
// where it stood, how far the Castle / nearest Cemetery were, and what it did.
//   hg burns <cand> <base> <players> <deals> [--offset K] [--turns T]
// ---------------------------------------------------------------------------
static std::vector<int> cemeteryDist(const BoardData& b) {
  std::vector<int> d(b.n, 99);
  std::vector<int> q;
  for (int i = 0; i < b.n; i++)
    if (b.spaces[i].region == R_CEMETERY || b.spaces[i].region == R_CASTLE) d[i] = 0, q.push_back(i);
  for (size_t h = 0; h < q.size(); h++)
    for (int k = b.adjStart[q[h]]; k < b.adjStart[q[h] + 1]; k++)
      if (d[b.adj[k]] == 99) d[b.adj[k]] = d[q[h]] + 1, q.push_back(b.adj[k]);
  return d;
}

static int cmdBurns(int argc, char** argv) {
  if (argc < 6) {
    std::fprintf(stderr, "usage: hg burns <cand> <base> <players> <deals> [--offset K] [--turns T]\n");
    return 2;
  }
  SeatSpec cand = parseSpec(argv[2]);
  SeatSpec base = parseSpec(argv[3]);
  int players = std::atoi(argv[4]);
  int deals = std::atoi(argv[5]);
  int offset = std::atoi(flagValue(argc, argv, "--offset", "0"));
  int lastTurns = std::atoi(flagValue(argc, argv, "--turns", "5"));
  int threads = std::max(1u, std::thread::hardware_concurrency());
  std::vector<std::string> out(deals);
  std::atomic<int> next{0}, burnt{0};
  auto worker = [&] {
    while (true) {
      int d = next++;
      if (d >= deals) return;
      int chair = d % players;
      uint32_t seed = seedForGame(uint32_t(d + offset));
      std::vector<const SeatSpec*> seats(players, &base);
      seats[chair] = &cand;
      GameState s = createInitialState(players, seed, MODE_ELDER);
      const BoardData& b = boardOf(s);
      std::vector<int> safe = cemeteryDist(b);
      Mulberry32 rng(seed ^ 0x5bd1e995u);
      Actions legal;
      std::string trace;
      int traceTurn = -1;
      for (int steps = 0; s.phase != PH_OVER && steps < 20000; steps++) {
        int seat = activePlayer(s);
        legalActions(s, seat, legal);
        int idx = pickSpec(*seats[seat], s, seat, legal, rng);
        Action a = legal[idx];
        if (seat == chair && s.turn > TURNS - lastTurns) {
          const PlayerState& p = s.players[chair];
          char buf[160];
          if (traceTurn != s.turn) {
            traceTurn = s.turn;
            std::snprintf(buf, sizeof buf, "\n    t%d @%s castle %d safe %d speed %d:", s.turn,
                          b.spaces[p.pos].id, b.castleDist[p.pos], safe[p.pos],
                          s.hasCurrent ? s.current.speedLeft : -1);
            trace += buf;
          }
          trace += " " + canonicalAction(s, a);
        }
        apply(s, seat, a);
      }
      if (s.result.breakdown[chair].fate == F_ASHES) {
        burnt++;
        const PlayerState& p = s.players[chair];
        char head[200];
        std::snprintf(head, sizeof head, "deal %d chair %d: ended @%s (castle %d, safe %d) score %d place %d, burnt rivals %d",
                      d + offset, chair, b.spaces[p.pos].id, b.castleDist[p.pos], safe[p.pos],
                      s.result.scores[chair], s.result.placements[chair],
                      [&] { int k = 0; for (int i = 0; i < players; i++) k += i != chair && s.result.breakdown[i].fate == F_ASHES; return k; }());
        out[d] = std::string(head) + trace + "\n";
      }
    }
  };
  std::vector<std::thread> pool;
  for (int i = 0; i < threads; i++) pool.emplace_back(worker);
  for (auto& t : pool) t.join();
  for (auto& o : out) std::fputs(o.c_str(), stdout);
  std::printf("burnt %d / %d\n", burnt.load(), deals);
  return 0;
}


// explain: replay one 1vN deal and print Dracula's arm table at the chair's
// decisions from turn T on.   hg explain <cand> <base> <players> <deal> <turn> [chair]
static int cmdExplain(int argc, char** argv) {
  if (argc < 7) return 2;
  SeatSpec cand = parseSpec(argv[2]);
  SeatSpec base = parseSpec(argv[3]);
  int players = std::atoi(argv[4]);
  int deal = std::atoi(argv[5]);
  int fromTurn = std::atoi(argv[6]);
  int chair = argc > 7 ? std::atoi(argv[7]) : deal % players;
  uint32_t seed = seedForGame(uint32_t(deal));
  std::vector<const SeatSpec*> seats(players, &base);
  seats[chair] = &cand;
  GameState s = createInitialState(players, seed, MODE_ELDER);
  const BoardData& b = boardOf(s);
  Mulberry32 rng(seed ^ 0x5bd1e995u);
  Actions legal;
  for (int steps = 0; s.phase != PH_OVER && steps < 20000; steps++) {
    int seat = activePlayer(s);
    legalActions(s, seat, legal);
    bool watch = seat == chair && s.turn >= fromTurn;
    if (watch)
      std::fprintf(stderr, "t%d chair @%s speedLeft %d, %d legal\n", s.turn,
                   b.spaces[s.players[chair].pos].id, s.hasCurrent ? s.current.speedLeft : -1,
                   int(legal.size()));
    g_draculaDebug = watch;
    int idx = pickSpec(*seats[seat], s, seat, legal, rng);
    g_draculaDebug = false;
    if (watch) std::fprintf(stderr, "  => %s\n", canonicalAction(s, legal[idx]).c_str());
    if (s.turn >= fromTurn && seat != chair)
      std::fprintf(stderr, "  (seat %d @%s) %s\n", seat, b.spaces[s.players[seat].pos].id,
                   canonicalAction(s, legal[idx]).c_str());
    Action a = legal[idx];
    apply(s, seat, a);
  }
  std::fprintf(stderr, "fate %d\n", int(s.result.breakdown[chair].fate));
  return 0;
}


// probe: Dracula's arm table on a position dumped as canonical text (TS
// canonicalState).   hg probe <file> <spec>
static int cmdProbe(int argc, char** argv) {
  if (argc < 4) return 2;
  std::ifstream in(argv[2]);
  std::string text((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
  GameState s = parseCanonicalState(text);
  SeatSpec spec = parseSpec(argv[3]);
  int seat = activePlayer(s);
  Actions legal;
  legalActions(s, seat, legal);
  const BoardData& b = boardOf(s);
  std::fprintf(stderr, "turn %d seat %d @%s speedLeft %d, %d legal\n", s.turn, seat,
               b.spaces[s.players[seat].pos].id, s.hasCurrent ? s.current.speedLeft : -1, int(legal.size()));
  for (int i = 0; i < s.nPlayers; i++)
    std::fprintf(stderr, "  seat %d @%s vp %d\n", i, b.spaces[s.players[i].pos].id, s.players[i].vp);
  g_draculaDebug = true;
  Mulberry32 rng(1);
  int idx = pickSpec(spec, s, seat, legal, rng);
  std::fprintf(stderr, "=> %s\n", canonicalAction(s, legal[idx]).c_str());
  return 0;
}


// behave: 1vN games; the behaviour report of the candidate vs the baseline seats.
//   hg behave <cand> <base> <players> <deals> [--offset K] [--mode elder|rookie]
static int cmdBehave(int argc, char** argv) {
  if (argc < 6) {
    std::fprintf(stderr, "usage: hg behave <cand> <base> <players> <deals> [--offset K] [--mode elder|rookie]\n");
    return 2;
  }
  SeatSpec cand = parseSpec(argv[2]);
  SeatSpec base = parseSpec(argv[3]);
  int players = std::atoi(argv[4]);
  int deals = std::atoi(argv[5]);
  int offset = std::atoi(flagValue(argc, argv, "--offset", "0"));
  Mode mode = std::string(flagValue(argc, argv, "--mode", "elder")) == "rookie" ? MODE_ROOKIE : MODE_ELDER;
  int threads = std::atoi(flagValue(argc, argv, "--threads", "0"));
  if (threads <= 0) threads = std::max(1u, std::thread::hardware_concurrency());
  std::vector<SeatStats> candStats(deals), baseStats(deals);
  std::atomic<int> next{0};
  auto worker = [&] {
    while (true) {
      int d = next++;
      if (d >= deals) return;
      int chair = d % players;
      uint32_t seed = seedForGame(uint32_t(d + offset));
      std::vector<const SeatSpec*> seats(players, &base);
      seats[chair] = &cand;
      GameState s = createInitialState(players, seed, mode);
      Mulberry32 rng(seed ^ 0x5bd1e995u);
      Actions legal;
      BehaviourGame bg(players);
      for (int steps = 0; s.phase != PH_OVER && steps < 20000; steps++) {
        int seat = activePlayer(s);
        legalActions(s, seat, legal);
        int idx = pickSpec(*seats[seat], s, seat, legal, rng);
        Action a = legal[idx];
        GameState before = s;
        apply(s, seat, a);
        bg.observe(before, seat, legal[idx], s);
      }
      bg.finish(s);
      candStats[d] = bg.seats[chair];
      for (int i = 0; i < players; i++)
        if (i != chair) baseStats[d].add(bg.seats[i]);
    }
  };
  std::vector<std::thread> pool;
  for (int i = 0; i < threads; i++) pool.emplace_back(worker);
  for (auto& t : pool) t.join();
  SeatStats c, bs;
  for (int d = 0; d < deals; d++) c.add(candStats[d]), bs.add(baseStats[d]);
  std::printf("%dp behave  %s vs %s (%s, %d deals, offset %d)\n", players, cand.name.c_str(),
              base.name.c_str(), mode == MODE_ROOKIE ? "rookie" : "elder", deals, offset);
  std::fputs(behaviourTable({cand.name, base.name}, {c, bs}).c_str(), stdout);
  return 0;
}


// gen: self-play data for the network. Each game: 2–6 seats (uniform), Elder
// (Rookie with --rookie p), every seat a spec drawn from --mix (';'-separated).
// Records decisions with >1 legal action (each with probability --sample),
// the move played as a one-hot policy target (moves chosen by --eps
// exploration are played but not recorded), and every seat's final result.
//   hg gen <outdir> --games N [--mix "heuristic;carmilla"] [--offset K] [--eps 0.03]
//          [--rookie 0.2] [--sample 0.5] [--shard 50000] [--threads T]
static int cmdGen(int argc, char** argv) {
  if (argc < 3) {
    std::fprintf(stderr, "usage: hg gen <outdir> --games N [--mix a;b] [--offset K] [--eps E] [--rookie R] [--sample S]\n");
    return 2;
  }
  std::string outdir = argv[2];
  std::filesystem::create_directories(outdir);
  int games = std::atoi(flagValue(argc, argv, "--games", "1000"));
  int offset = std::atoi(flagValue(argc, argv, "--offset", "0"));
  double eps = std::atof(flagValue(argc, argv, "--eps", "0.03"));
  double rookie = std::atof(flagValue(argc, argv, "--rookie", "0.2"));
  double sample = std::atof(flagValue(argc, argv, "--sample", "0.5"));
  size_t shardSize = std::strtoul(flagValue(argc, argv, "--shard", "50000"), nullptr, 10);
  int threads = std::atoi(flagValue(argc, argv, "--threads", "0"));
  if (threads <= 0) threads = std::max(1u, std::thread::hardware_concurrency());
  std::vector<SeatSpec> mix;
  {
    std::string m = flagValue(argc, argv, "--mix", "heuristic;carmilla");
    size_t pos = 0;
    while (pos <= m.size()) {
      size_t semi = m.find(';', pos);
      std::string one = m.substr(pos, semi == std::string::npos ? std::string::npos : semi - pos);
      if (!one.empty()) mix.push_back(parseSpec(one));
      if (semi == std::string::npos) break;
      pos = semi + 1;
    }
  }
  std::atomic<int> next{0};
  std::atomic<long> recorded{0};
  auto t0 = std::chrono::steady_clock::now();
  auto worker = [&](int tid) {
    SampleShard shard;
    int part = 0;
    auto flush = [&] {
      if (shard.size() == 0) return;
      char name[256];
      std::snprintf(name, sizeof name, "%s/o%d-t%02d-%03d.bin", outdir.c_str(), offset, tid, part++);
      if (!shard.write(name)) std::fprintf(stderr, "gen: cannot write %s\n", name);
      shard.clear();
    };
    while (true) {
      int gi = next++;
      if (gi >= games) break;
      uint32_t seed = seedForGame(uint32_t(gi + offset));
      Mulberry32 rng(seed ^ 0x2545f491u);
      int n = 2 + int(rng() * 5);
      Mode mode = rng() < rookie ? MODE_ROOKIE : MODE_ELDER;
      std::vector<const SeatSpec*> seats(n);
      for (int i = 0; i < n; i++) seats[i] = &mix[size_t(rng() * double(mix.size())) % mix.size()];
      GameState s = createInitialState(n, seed, mode);
      Actions legal;
      size_t first = shard.size();
      std::vector<int> observers;
      std::vector<float> target, rootQ;
      for (int steps = 0; s.phase != PH_OVER && steps < 20000; steps++) {
        int seat = activePlayer(s);
        legalActions(s, seat, legal);
        int idx;
        bool explore = legal.size() > 1 && rng() < eps;
        if (explore) idx = int(rng() * double(legal.size())) % int(legal.size());
        else idx = pickSpec(*seats[seat], s, seat, legal, rng, &rootQ);
        if (!explore && legal.size() > 1 && rng() < sample) {
          target.assign(legal.size(), 0.f);
          if (seats[seat]->st == S_LILITH) {
            // Search target: softmax of each move's value (pruned moves get 0).
            double mx = *std::max_element(rootQ.begin(), rootQ.end()), sum = 0;
            for (size_t i = 0; i < legal.size(); i++)
              if (rootQ[i] >= 0) sum += target[i] = float(std::exp((rootQ[i] - mx) / 0.05));
            for (float& t : target) t = float(t / sum);
          } else {
            target[idx] = 1.f;
          }
          shard.addDecision(s, seat, legal, target);
          observers.push_back(seat);
        }
        Action a = legal[idx];
        apply(s, seat, a);
      }
      if (s.phase != PH_OVER) {  // drop an unfinished game's samples
        shard.truncate(first);
        continue;
      }
      shard.finishGame(s, first, observers);
      recorded += long(observers.size());
      if (shard.size() >= shardSize) flush();
      if (gi % 500 == 0) {
        double sec = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
        std::fprintf(stderr, "gen: game %d, %ld samples, %.0fs\n", gi, recorded.load(), sec);
      }
    }
    flush();
  };
  std::vector<std::thread> pool;
  for (int i = 0; i < threads; i++) pool.emplace_back(worker, i);
  for (auto& t : pool) t.join();
  std::printf("gen: %d games, %ld samples -> %s\n", games, recorded.load(), outdir.c_str());
  return 0;
}


// netcheck: the C++ forward pass on stored samples (compare with `lilith.py check`).
static int cmdNetcheck(int argc, char** argv) {
  if (argc < 4) return 2;
  Net net;
  if (!net.load(argv[2])) return 1;
  SampleShard sh;
  if (!sh.read(argv[3])) return 1;
  int k = argc > 4 ? std::atoi(argv[4]) : 3;
  for (int i = 0; i < k && i < int(sh.size()); i++) {
    SparseFeatures x;
    for (uint32_t j = sh.featOff[i]; j < sh.featOff[i + 1]; j++) x.add(sh.featIdx[j], fromHalf(sh.featVal[j]));
    NetOutput o;
    net.forward(x, o);
    std::printf("sample %d value", i);
    for (int j = 0; j < 8; j++) std::printf(" %.5f", o.value[j]);
    std::printf(" logits");
    for (uint32_t a = sh.actOff[i]; a < sh.actOff[i + 1] && a < sh.actOff[i] + 4; a++) {
      ActionFeatures af;
      for (uint32_t j = sh.actFeatOff[a]; j < sh.actFeatOff[a + 1]; j++) af.add(sh.actIdx[j], fromHalf(sh.actVal[j]));
      std::printf(" %.5f", net.actionLogit(o, af));
    }
    std::printf("\n");
  }
  return 0;
}


// polgen: imitation data for the playout policy. Games with seats drawn from
// --mix; every decision (>1 legal move) of a seat whose strategy is Dracula is
// recorded: each legal move's policy features and the move Dracula chose.
// One file per thread: u32 'PLG1', u32 n, u32 rows, u32 F; i32 L[n]; i32 chosen[n]; f32 feats[rows*F].
//   hg polgen <outdir> --games N [--mix "dracula;dracula;heuristic"] [--offset K] [--threads T]
static int cmdPolgen(int argc, char** argv) {
  if (argc < 3) return 2;
  std::string outdir = argv[2];
  std::filesystem::create_directories(outdir);
  int games = std::atoi(flagValue(argc, argv, "--games", "1000"));
  int offset = std::atoi(flagValue(argc, argv, "--offset", "0"));
  int threads = std::atoi(flagValue(argc, argv, "--threads", "0"));
  if (threads <= 0) threads = std::max(1u, std::thread::hardware_concurrency());
  std::vector<SeatSpec> mix;
  {
    std::string m = flagValue(argc, argv, "--mix", "dracula");
    size_t pos = 0;
    while (pos <= m.size()) {
      size_t semi = m.find(';', pos);
      std::string one = m.substr(pos, semi == std::string::npos ? std::string::npos : semi - pos);
      if (!one.empty()) mix.push_back(parseSpec(one));
      if (semi == std::string::npos) break;
      pos = semi + 1;
    }
  }
  std::atomic<int> next{0};
  std::atomic<long> recorded{0};
  auto t0 = std::chrono::steady_clock::now();
  auto worker = [&](int tid) {
    std::vector<int32_t> Ls, chosen;
    std::vector<float> feats;
    float f[POL_FEATURES];
    while (true) {
      int gi = next++;
      if (gi >= games) break;
      uint32_t seed = seedForGame(uint32_t(gi + offset));
      Mulberry32 rng(seed ^ 0x7f4a7c15u);
      int n = 2 + int(rng() * 5);
      std::vector<const SeatSpec*> seats(n);
      for (int i = 0; i < n; i++) seats[i] = &mix[size_t(rng() * double(mix.size())) % mix.size()];
      GameState s = createInitialState(n, seed, MODE_ELDER);
      Actions legal;
      for (int steps = 0; s.phase != PH_OVER && steps < 20000; steps++) {
        int seat = activePlayer(s);
        legalActions(s, seat, legal);
        int idx = pickSpec(*seats[seat], s, seat, legal, rng);
        if (seats[seat]->st == S_DRACULA && legal.size() > 1) {
          int nos = heuristicPick(s, seat, legal);
          for (size_t i = 0; i < legal.size(); i++) {
            policyFeatures(s, seat, legal[i], int(i) == nos, f);
            feats.insert(feats.end(), f, f + POL_FEATURES);
          }
          Ls.push_back(int32_t(legal.size()));
          chosen.push_back(idx);
          recorded++;
        }
        Action a = legal[idx];
        apply(s, seat, a);
      }
      if (gi % 100 == 0) {
        double sec = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
        std::fprintf(stderr, "polgen: game %d, %ld decisions, %.0fs\n", gi, recorded.load(), sec);
      }
    }
    char name[256];
    std::snprintf(name, sizeof name, "%s/o%d-t%02d.pol", outdir.c_str(), offset, tid);
    std::FILE* fp = std::fopen(name, "wb");
    if (!fp) return;
    uint32_t hdr[4] = {0x31474c50u, uint32_t(Ls.size()), uint32_t(feats.size() / POL_FEATURES), uint32_t(POL_FEATURES)};
    std::fwrite(hdr, 4, 4, fp);
    std::fwrite(Ls.data(), 4, Ls.size(), fp);
    std::fwrite(chosen.data(), 4, chosen.size(), fp);
    std::fwrite(feats.data(), 4, feats.size(), fp);
    std::fclose(fp);
  };
  std::vector<std::thread> pool;
  for (int i = 0; i < threads; i++) pool.emplace_back(worker, i);
  for (auto& t : pool) t.join();
  std::printf("polgen: %d games, %ld decisions -> %s\n", games, recorded.load(), outdir.c_str());
  return 0;
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
  for (int k = 0; k < 4; k++) {
    std::string flag = k == 0 ? "--exec" : "--exec" + std::to_string(k);
    const char* path = flagValue(argc, argv, flag.c_str(), "");
    if (*path && !g_execs[k].load(path)) {
      std::fprintf(stderr, "cannot load %s %s\n", flag.c_str(), path);
      return 2;
    }
  }
  for (int k = 0; k < 4; k++) {
    std::string flag = k == 0 ? "--pol" : "--pol" + std::to_string(k);
    const char* path = flagValue(argc, argv, flag.c_str(), "");
    if (*path && !g_pols[k].load(path)) {
      std::fprintf(stderr, "cannot load %s %s\n", flag.c_str(), path);
      return 2;
    }
  }
  for (int k = 0; k < 4; k++) {
    std::string flag = k == 0 ? "--net" : "--net" + std::to_string(k);
    const char* path = flagValue(argc, argv, flag.c_str(), "");
    if (*path && !g_nets[k].load(path)) {
      std::fprintf(stderr, "cannot load %s %s\n", flag.c_str(), path);
      return 2;
    }
  }
  if (cmd == "parity") return cmdParity(argc, argv);
  if (cmd == "bench") return cmdBench(argc, argv);
  if (cmd == "arena") return cmdArena(argc, argv);
  if (cmd == "duel") return cmdDuel(argc, argv);
  if (cmd == "burns") return cmdBurns(argc, argv);
  if (cmd == "explain") return cmdExplain(argc, argv);
  if (cmd == "probe") return cmdProbe(argc, argv);
  if (cmd == "behave") return cmdBehave(argc, argv);
  if (cmd == "gen") return cmdGen(argc, argv);
  if (cmd == "polgen") return cmdPolgen(argc, argv);
  if (cmd == "netcheck") return cmdNetcheck(argc, argv);
  if (cmd == "play") return cmdPlay(argc, argv);
  if (cmd == "expcheck") return cmdExpCheck(argc, argv);
  std::fprintf(stderr, "unknown command %s\n", cmd.c_str());
  return 2;
}
