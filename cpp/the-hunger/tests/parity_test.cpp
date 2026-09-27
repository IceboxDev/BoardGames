// Cross-engine parity: replays the committed TS fixtures (tests/fixtures,
// written by scripts/dump-hunger-parity.ts) and requires ZERO divergence —
// legal sets, state hashes, Nosferatu picks, determinized worlds and final
// results — plus >= 99% agreement with Strigoi's recorded decisions.
#include <cmath>
#include <cstdio>
#include <filesystem>

#include "hg/ai.hpp"
#include "hg/parity.hpp"
#include "tinytest.hpp"

using namespace hg;

TEST_CASE("fnv1a64 reference vectors (same as canon.test.ts)") {
  CHECK_EQ(hex64(fnv1a64("")), std::string("cbf29ce484222325"));
  CHECK_EQ(hex64(fnv1a64("a")), std::string("af63dc4c8601ec8c"));
  CHECK_EQ(hex64(fnv1a64("foobar")), std::string("85944171f73967e8"));
}

TEST_CASE("jsExp matches exp to within an ulp on the utility's domain") {
  for (int d = -200; d <= 200; d++) {
    double x = -double(d) / 8;
    double a = jsExp(x), b = std::exp(x);
    CHECK(std::fabs(a - b) <= std::fabs(b) * 4e-16);
  }
  CHECK_EQ(jsExp(0.0), 1.0);
  CHECK_EQ(jsExp(1.0), 2.718281828459045);
}

TEST_CASE("parity: C++ engine + AI == TS (committed fixtures)") {
  const char* dir = "tests/fixtures";
  if (!std::filesystem::exists(dir)) {
    std::fprintf(stderr, "  [skipped: run `pnpm dump-hunger-parity` first]\n");
    return;
  }
  ParityReport r = runParity(dir);
  printReport(r);
  REQUIRE(r.games > 0);
  CHECK_EQ(r.initMismatch, 0L);
  CHECK_EQ(r.seatMismatch, 0L);
  CHECK_EQ(r.legalMismatch, 0L);
  CHECK_EQ(r.hashMismatch, 0L);
  CHECK_EQ(r.heuristicMismatch, 0L);
  CHECK_EQ(r.detMismatch, 0L);
  CHECK_EQ(r.resultMismatch, 0L);
  CHECK_EQ(r.abortedGames, 0L);
  CHECK(r.strigoiAgree * 100 >= r.strigoiChecks * 99);
}
