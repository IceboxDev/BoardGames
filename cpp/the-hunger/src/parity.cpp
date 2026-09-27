// Replays TS-recorded games (scripts/dump-hunger-parity.ts) through the C++
// engine and AI, checking every recorded fact: legal sets (count + hash, and
// the full list when present), the state hash after every action, Nosferatu's
// pick, determinized worlds, final results, and Strigoi's decisions.
#include "hg/parity.hpp"

#include <algorithm>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <vector>

#include "hg/ai.hpp"

namespace hg {

namespace {

std::vector<std::string> split(const std::string& s, char sep) {
  std::vector<std::string> out;
  std::string cur;
  for (char c : s) {
    if (c == sep) {
      out.push_back(cur);
      cur.clear();
    } else {
      cur += c;
    }
  }
  out.push_back(cur);
  return out;
}

std::string joinInts(const int* v, int n) {
  std::string out;
  for (int i = 0; i < n; i++) {
    if (i) out += ",";
    out += std::to_string(v[i]);
  }
  return out;
}

struct Replayer {
  const ParityOptions& opt;
  ParityReport& rep;
  int errors = 0;
  std::string where;

  void err(const std::string& msg) {
    if (errors++ < opt.maxErrors) std::fprintf(stderr, "  MISMATCH %s: %s\n", where.c_str(), msg.c_str());
  }

  void runFile(const std::string& path) {
    std::ifstream in(path);
    std::string line;
    GameState s{};
    bool live = false;  // false once a game diverged (skip to its end)
    long gameId = -1;
    int step = 0;
    std::vector<std::string> fullLegal;
    bool haveFull = false;
    long detK = -1;
    std::string detHash;
    int strigoiIdx = -1, strigoiRollouts = 0;
    Actions legal;
    while (std::getline(in, line)) {
      if (line.empty()) continue;
      char tag = line[0];
      std::string rest = line.size() > 2 ? line.substr(2) : "";
      if (tag == 'G') {
        std::istringstream ss(rest);
        int n, safe;
        char mode;
        unsigned long seed;
        std::string policies;
        ss >> gameId >> n >> mode >> safe >> seed >> policies;
        s = createInitialState(n, uint32_t(seed), mode == 'r' ? MODE_ROOKIE : MODE_ELDER, safe != 0);
        live = true;
        step = 0;
        rep.games++;
        where = "game " + std::to_string(gameId) + " setup";
      } else if (tag == 'I') {
        if (stateHash(s) != rest) {
          rep.initMismatch++;
          err("initial state hash " + stateHash(s) + " != " + rest);
          live = false;
          rep.abortedGames++;
        }
      } else if (tag == 'L') {
        fullLegal = split(rest, '|');
        haveFull = true;
      } else if (tag == 'D') {
        std::istringstream ss(rest);
        ss >> detK >> detHash;
      } else if (tag == 'T') {
        std::istringstream ss(rest);
        ss >> strigoiIdx >> strigoiRollouts;
      } else if (tag == 'S') {
        step++;
        where = "game " + std::to_string(gameId) + " step " + std::to_string(step);
        std::istringstream ss(rest);
        int seat, nLegal, chosen, heur;
        std::string legalHash, after;
        ss >> seat >> nLegal >> legalHash >> chosen >> heur >> after;
        if (live) {
          replayStep(s, legal, seat, nLegal, legalHash, chosen, heur, after, haveFull, fullLegal,
                     detK, detHash, strigoiIdx, strigoiRollouts);
          if (stopped) live = stopped = false;
        }
        haveFull = false;
        detK = -1;
        strigoiIdx = -1;
      } else if (tag == 'R') {
        if (!live) continue;
        auto parts = split(rest, ' ');
        int n = s.nPlayers;
        int scores[MAX_PLAYERS], placements[MAX_PLAYERS], winners[MAX_PLAYERS];
        for (int i = 0; i < n; i++) {
          scores[i] = s.result.scores[i];
          placements[i] = s.result.placements[i];
        }
        for (int i = 0; i < s.result.winners.size(); i++) winners[i] = s.result.winners[i];
        std::string mine = joinInts(scores, n) + " " + joinInts(winners, s.result.winners.size()) +
                           " " + joinInts(placements, n);
        if (s.phase != PH_OVER || mine != rest) {
          rep.resultMismatch++;
          err("result [" + mine + "] != [" + rest + "]");
        }
      } else if (tag == 'E') {
        live = false;
      }
    }
  }

  void replayStep(GameState& s, Actions& legal, int seat, int nLegal, const std::string& legalHash,
                  int chosen, int heur, const std::string& after, bool haveFull,
                  const std::vector<std::string>& fullLegal, long detK, const std::string& detHash,
                  int strigoiIdx, int strigoiRollouts) {
    rep.steps++;
    int active = activePlayer(s);
    if (active != seat) {
      rep.seatMismatch++;
      err("active seat " + std::to_string(active) + " != " + std::to_string(seat));
      abort();
      return;
    }
    legalActions(s, seat, legal);
    std::string joined;
    std::vector<std::string> canon;
    canon.reserve(legal.size());
    for (size_t i = 0; i < legal.size(); i++) {
      canon.push_back(canonicalAction(s, legal[i]));
      if (i) joined += "\n";
      joined += canon.back();
    }
    bool legalOk = int(legal.size()) == nLegal && hex64(fnv1a64(joined)) == legalHash;
    if (haveFull) {
      rep.fullLegalChecks++;
      if (canon != fullLegal) legalOk = false;
    }
    if (!legalOk) {
      rep.legalMismatch++;
      std::string msg = "legal set differs (" + std::to_string(legal.size()) + " vs " +
                        std::to_string(nLegal) + ")";
      if (haveFull) {
        for (size_t i = 0; i < std::max(canon.size(), fullLegal.size()); i++) {
          std::string a = i < canon.size() ? canon[i] : "<none>";
          std::string b = i < fullLegal.size() ? fullLegal[i] : "<none>";
          if (a != b) {
            msg += "\n    first diff at " + std::to_string(i) + ": C++ '" + a + "' TS '" + b + "'";
            break;
          }
        }
      } else if (!canon.empty()) {
        msg += "\n    C++ list: " + joined.substr(0, 400);
      }
      err(msg);
      abort();
      return;
    }
    if (detK >= 0) {
      rep.detChecks++;
      Mulberry32 r{uint32_t(detK)};
      GameState w = determinize(s, seat, r);
      if (stateHash(w) != detHash) {
        rep.detMismatch++;
        err("determinize(K=" + std::to_string(detK) + ") hash " + stateHash(w) + " != " + detHash);
      }
    }
    if (heur >= 0) {
      rep.heuristicChecks++;
      int h = heuristicPick(s, seat, legal);
      if (h != heur) {
        rep.heuristicMismatch++;
        err("heuristic pick " + std::to_string(h) + " '" + canon[h] + "' != " +
            std::to_string(heur) + " '" + canon[heur] + "'");
      }
    }
    if (strigoiIdx >= 0 && opt.strigoi) {
      rep.strigoiChecks++;
      StrigoiConfig cfg;
      cfg.rollouts = strigoiRollouts;
      cfg.minPerArm = 4;
      int pick = strigoiPick(s, seat, legal, cfg);
      if (pick == strigoiIdx)
        rep.strigoiAgree++;
      else if (opt.verbose)
        std::fprintf(stderr, "  strigoi disagrees %s: %d vs %d\n", where.c_str(), pick, strigoiIdx);
    }
    if (chosen < 0 || chosen >= int(legal.size())) {
      err("chosen index out of range");
      abort();
      return;
    }
    Action a = legal[chosen];
    apply(s, seat, a);
    std::string h = stateHash(s);
    if (h != after) {
      rep.hashMismatch++;
      err("state hash after '" + canon[chosen] + "': " + h + " != " + after);
      if (opt.verbose) std::fprintf(stderr, "    C++ state: %s\n", canonicalState(s).c_str());
      abort();
    }
  }

  bool stopped = false;
  void abort() {
    rep.abortedGames++;
    stopped = true;
  }
};

}  // namespace

ParityReport runParity(const std::string& dir, const ParityOptions& opt) {
  ParityReport rep;
  std::vector<std::string> files;
  for (const auto& e : std::filesystem::directory_iterator(dir))
    if (e.path().extension() == ".txt") {
      std::string name = e.path().filename().string();
      if (name.rfind("games-", 0) == 0 || name.rfind("strigoi-", 0) == 0)
        files.push_back(e.path().string());
    }
  std::sort(files.begin(), files.end());
  Replayer r{opt, rep, 0, "", false};
  for (const std::string& f : files) {
    rep.files++;
    r.runFile(f);
  }
  return rep;
}

void printReport(const ParityReport& r) {
  std::printf("parity: %ld files, %ld games, %ld decisions\n", r.files, r.games, r.steps);
  std::printf("  initial hash mismatches : %ld\n", r.initMismatch);
  std::printf("  active seat mismatches  : %ld\n", r.seatMismatch);
  std::printf("  legal set mismatches    : %ld (%ld full-list checks)\n", r.legalMismatch,
              r.fullLegalChecks);
  std::printf("  state hash mismatches   : %ld\n", r.hashMismatch);
  std::printf("  heuristic pick mismatch : %ld / %ld\n", r.heuristicMismatch, r.heuristicChecks);
  std::printf("  determinize mismatches  : %ld / %ld\n", r.detMismatch, r.detChecks);
  std::printf("  final result mismatches : %ld\n", r.resultMismatch);
  std::printf("  games aborted           : %ld\n", r.abortedGames);
  if (r.strigoiChecks > 0)
    std::printf("  strigoi agreement       : %ld / %ld (%.2f%%)\n", r.strigoiAgree, r.strigoiChecks,
                100.0 * double(r.strigoiAgree) / double(r.strigoiChecks));
  std::printf("  => %s\n", r.ok() ? "ZERO DIVERGENCE" : "DIVERGED");
}

}  // namespace hg
