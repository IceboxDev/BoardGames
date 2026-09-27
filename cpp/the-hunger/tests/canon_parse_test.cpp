// parseCanonicalState is the exact inverse of canonicalState: TS self-play
// texts (tests/canon/states.txt, written by `scripts/gen-hunger-wasm.ts
// --dump-states`) round-trip byte for byte, a parsed state plays like the
// original, and malformed text is rejected. HG_CANON_STATES=<file> adds a big
// sweep from /tmp.
#include <cstdlib>
#include <fstream>

#include "hg/ai.hpp"
#include "hg/canon_parse.hpp"
#include "tinytest.hpp"

using namespace hg;

namespace {

struct RoundTrip {
  long states = 0, parseFail = 0, mismatch = 0;
  std::string firstError;
};

RoundTrip roundTripFile(const char* path) {
  RoundTrip r;
  std::ifstream in(path);
  std::string line, err;
  GameState s;
  while (std::getline(in, line)) {
    if (line.empty()) continue;
    r.states++;
    if (!tryParseCanonicalState(line.data(), line.size(), s, &err)) {
      if (r.firstError.empty()) r.firstError = err;
      r.parseFail++;
      continue;
    }
    if (canonicalState(s) != line) r.mismatch++;
  }
  return r;
}

bool parses(const std::string& text) {
  GameState s;
  return tryParseCanonicalState(text.data(), text.size(), s, nullptr);
}

}  // namespace

TEST_CASE("canon parse: TS states round-trip byte for byte (tests/canon)") {
  RoundTrip r = roundTripFile("tests/canon/states.txt");
  std::fprintf(stderr, "  %ld states, %ld parse failures, %ld mismatches %s\n", r.states,
               r.parseFail, r.mismatch, r.firstError.c_str());
  REQUIRE(r.states > 100);
  CHECK_EQ(r.parseFail, 0L);
  CHECK_EQ(r.mismatch, 0L);
}

TEST_CASE("canon parse: big sweep from HG_CANON_STATES") {
  const char* path = std::getenv("HG_CANON_STATES");
  if (!path) {
    std::fprintf(stderr, "  [skipped: set HG_CANON_STATES=<file>]\n");
    return;
  }
  RoundTrip r = roundTripFile(path);
  std::fprintf(stderr, "  %s: %ld states, %ld parse failures, %ld mismatches %s\n", path,
               r.states, r.parseFail, r.mismatch, r.firstError.c_str());
  REQUIRE(r.states > 0);
  CHECK_EQ(r.parseFail, 0L);
  CHECK_EQ(r.mismatch, 0L);
}

TEST_CASE("canon parse: a parsed state plays exactly like the original") {
  Actions a, b;
  long checked = 0;
  for (int n = 2; n <= 6; n++) {
    for (int mode = 0; mode < 2; mode++) {
      GameState s = createInitialState(n, 1000u + n * 13 + mode, Mode(mode));
      int step = 0;
      while (s.phase != PH_OVER && step++ < 20000) {
        int seat = activePlayer(s);
        legalActions(s, seat, a);
        if (step % 9 == 0) {
          GameState t = parseCanonicalState(canonicalState(s));
          CHECK_EQ(activePlayer(t), seat);
          legalActions(t, seat, b);
          REQUIRE(a.size() == b.size());
          for (size_t i = 0; i < a.size(); i++)
            CHECK_EQ(canonicalAction(s, a[i]), canonicalAction(t, b[i]));
          CHECK_EQ(heuristicPick(s, seat, a), heuristicPick(t, seat, b));
          // Same future: apply the heuristic move and one playout on both.
          int h = heuristicPick(s, seat, a);
          GameState s2 = s, t2 = t;
          apply(s2, seat, a[h]);
          apply(t2, seat, b[h]);
          playout(s2);
          playout(t2);
          CHECK(canonicalState(s2) == canonicalState(t2));
          checked++;
        }
        apply(s, seat, a[heuristicPick(s, seat, a)]);
      }
      std::string text = canonicalState(s);  // with the result
      CHECK(canonicalState(parseCanonicalState(text)) == text);
    }
  }
  REQUIRE(checked > 100);
}

TEST_CASE("canon parse: malformed text is rejected with a message") {
  GameState s0 = createInitialState(3, 42, MODE_ELDER);
  std::string ok = canonicalState(s0);
  CHECK(parses(ok));
  auto replaced = [&](const std::string& from, const std::string& to) {
    std::string t = ok;
    size_t at = t.find(from);
    CHECK(at != std::string::npos);
    if (at == std::string::npos) return std::string();
    t.replace(at, from.size(), to);
    return t;
  };
  CHECK(!parses(""));
  CHECK(!parses("{}"));
  CHECK(!parses(ok.substr(0, ok.size() - 1)));    // truncated
  CHECK(!parses(ok + " "));                       // trailing bytes
  CHECK(!parses(" " + ok));                       // whitespace
  CHECK(!parses(replaced("\"elder\"", "\"elderly\"")));
  CHECK(!parses(replaced("\"board\":\"", "\"board\":\"Z")));
  CHECK(!parses(replaced("\"turn\":", "\"turn\" :")));
  CHECK(!parses(replaced("\"rng\":", "\"rng\":0")));  // leading zero
  CHECK(!parses(replaced("\"turn\":1", "\"turn\":-0")));
  CHECK(!parses(replaced("\"turn\":1", "\"turn\":1000")));  // int8 overflow
  CHECK(!parses(replaced("\"index\":1", "\"index\":2")));
  CHECK(!parses(replaced("\"pos\":\"", "\"pos\":\"nowhere-")));
  // an unknown card id
  size_t deck = ok.find("\"deck\":[\"") + 9;
  std::string t = ok;
  t.insert(deck, "no-such-card");
  CHECK(!parses(t));
  // the error names the offset
  std::string err;
  GameState s;
  CHECK(!tryParseCanonicalState(t.data(), t.size(), s, &err));
  CHECK(err.find("unknown card id") != std::string::npos);
  CHECK(err.find("offset") != std::string::npos);
}
