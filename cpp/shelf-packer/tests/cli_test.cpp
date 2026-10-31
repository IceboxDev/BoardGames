#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

#include "fixtures.hpp"
#include "sp/cli.hpp"
#include "tinytest.hpp"

using namespace sp;

namespace {

std::string csvPath() {
  static const std::string path = [] {
    auto p = std::filesystem::temp_directory_path() / "sp_cli_test_boxes.csv";
    std::ofstream(p) << test::kBoxes;
    return p.string();
  }();
  return path;
}

Config parse(std::vector<std::string> args) {
  args.insert(args.begin(), csvPath());
  return parseCommandLine(args);
}

std::string errorOf(std::vector<std::string> args, bool withCsv = true) {
  try {
    if (withCsv)
      parse(std::move(args));
    else
      parseCommandLine(args);
  } catch (const InputError& e) {
    return e.what();
  }
  return "";
}

bool has(const std::string& s, const std::string& part) { return s.find(part) != std::string::npos; }

}  // namespace

TEST_CASE("cli: a flag missing its value is an error, not a crash") {
  CHECK(has(errorOf({"--out"}), "--out needs a value"));
  CHECK(has(errorOf({"--width"}), "--width needs a value"));
}

TEST_CASE("cli: unknown flags and stray arguments are errors") {
  CHECK(has(errorOf({"--flatt"}), "unknown flag --flatt"));
  CHECK(has(errorOf({"--flatt", csvPath()}, false), "unknown flag --flatt"));
  CHECK(has(errorOf({"extra.csv"}), "expected one BOXES.csv"));
  CHECK(has(errorOf({}, false), "missing BOXES.csv"));
}

TEST_CASE("cli: numbers must be whole and in range") {
  CHECK(has(errorOf({"--width", "85cm"}), "not a whole number"));
  CHECK(has(errorOf({"--width", "abc"}), "not a whole number"));
  CHECK(has(errorOf({"--width", "0"}), "below the minimum"));
  CHECK(has(errorOf({"--tol", "-1"}), "below the minimum"));
  CHECK(parse({"--width", "900"}).problem.geo.widthBase == 900);
}

TEST_CASE("cli: shelves") {
  CHECK(has(errorOf({"--fill-all"}), "--fill-all needs its shelves"));
  CHECK(has(errorOf({"--depth-max", "300", "--shelf", "300"}), "use one"));
  CHECK(has(errorOf({"--pin-a", "alpha"}), "at least two shelves"));
  CHECK(has(errorOf({"--shelf", "1", "--shelf", "1", "--shelf", "1", "--shelf", "1", "--shelf", "1"}),
            "at most"));
  Config c = parse({"--fill-all", "--shelf", "325", "--shelf", "470"});
  CHECK(c.problem.objective == Objective::FillAll);
  CHECK((c.problem.shelfDepths == std::vector<int>{325, 470}));
  CHECK((parse({}).problem.shelfDepths == std::vector<int>{kDefaultShelfDepth}));
}

TEST_CASE("cli: every box pattern must match") {
  CHECK(has(errorOf({"--require", "nosuch"}), "--require nosuch: matches no box"));
  CHECK(has(errorOf({"--together", "alpha,nosuch"}), "matches no box"));
  CHECK(has(errorOf({"--exclude", "nosuch"}), "matches no box"));
  CHECK(has(errorOf({"--long-edge", "nosuch"}), "matches no box"));
  // An excluded box is gone for every later flag.
  CHECK(has(errorOf({"--exclude", "alpha", "--pair", "alpha,beta"}), "matches no box"));
}

TEST_CASE("cli: groups resolve to the right rules") {
  Config c = parse({"--require", "small-*", "--pair", "alpha,beta", "--together", "gamma,tall",
                    "--stack", "alpha,gamma", "--requires", "small-a,tall"});
  const auto& g = c.problem.groups;
  REQUIRE(g.size() == 5);
  CHECK(g[0].presence == Presence::Mandatory && g[0].contact == Contact::Touch);
  CHECK_EQ(g[0].members.count(), 2);
  CHECK(g[1].presence == Presence::Mandatory);
  CHECK(g[2].presence == Presence::AllOrNone && g[2].contact == Contact::Touch);
  CHECK(g[3].contact == Contact::StrictRun);
  CHECK(g[4].presence == Presence::Requires && g[4].contact == Contact::LongEdgeBoth);
  CHECK_EQ(g[4].dependents.count(), 1);
  CHECK(has(errorOf({"--pair", "alpha"}), "at least two boxes"));
  CHECK(has(errorOf({"--requires", "alpha"}), "expected DEP,PROV"));
  CHECK(has(errorOf({"--requires", "alpha,alpha"}), "cannot require itself"));
}

TEST_CASE("cli: --verify excludes search inputs; --help short-circuits") {
  CHECK(has(errorOf({"--verify", "out", "--library", "x.lib"}), "--verify checks an existing run"));
  CHECK(parse({"--help"}).help);
  CHECK(has(usage(), "--stack A,B[,"));
}
