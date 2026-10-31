#include <vector>

#include "fixtures.hpp"
#include "sp/candidates.hpp"
#include "sp/search.hpp"
#include "tinytest.hpp"

using namespace sp;

namespace {

std::vector<Packing> solve(const Problem& p) {
  std::vector<ShelfCandidates> shelves;
  CandidateStats stats;
  for (int sh = 0; sh < p.shelves(); sh++) shelves.push_back(buildShelf(p, sh, stats));
  Search search(p, shelves);
  search.run(1);
  return search.ranked();
}

// One 300-wide shelf: the big box alone, or the two small ones together.
// The big box holds 13.5 L against their 5.4 L — more than any fixed
// "required" bonus the old scoring gave a box.
Problem bigOrSmall() {
  Problem p = test::smallProblem("big,300,450,100\nreq,150,180,100\nfill,150,180,100\n");
  p.shelfDepths = {500};
  return p;
}

}  // namespace

TEST_CASE("search: without rules the bigger volume wins") {
  std::vector<Packing> ranked = solve(bigOrSmall());
  REQUIRE(!ranked.empty());
  CHECK(ranked[0].placed().has(0));
}

TEST_CASE("search: a mandatory box is never traded for volume") {
  Problem p = bigOrSmall();
  Group g;
  g.origin = "--require req";
  g.members = BoxSet::single(1);
  g.presence = Presence::Mandatory;
  p.groups.push_back(g);
  std::vector<Packing> ranked = solve(p);
  REQUIRE(!ranked.empty());
  for (const Packing& pk : ranked) CHECK(pk.placed().has(1));
}

TEST_CASE("search: fill-all packs both shelves completely") {
  Problem p = test::smallProblem(
      "a,150,180,50\nb,150,180,50\nc,150,180,50\nd,150,180,50\n"
      "e,150,180,50\nf,150,180,50\ng,150,180,50\nh,150,180,50\n");
  p.objective = Objective::FillAll;
  p.shelfDepths = {200, 200};
  std::vector<Packing> ranked = solve(p);
  REQUIRE(!ranked.empty());
  CHECK_EQ(ranked[0].placed().count(), 8);
  CHECK_EQ(ranked[0].holes, 0LL);
}
