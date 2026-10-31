#include <string>
#include <vector>

#include "fixtures.hpp"
#include "sp/candidates.hpp"
#include "sp/pile_text.hpp"
#include "tinytest.hpp"

using namespace sp;

namespace {

Orient orient(const Problem& p, const std::string& name, int fw, int fh, int d, bool vert = false) {
  return {boxIndex(p.boxes, name), fw, fh, d, vert};
}

template <class F>
std::string errorOf(F&& fn) {
  try {
    fn();
  } catch (const InputError& e) {
    return e.what();
  }
  return "";
}

}  // namespace

TEST_CASE("makeCell: units side by side, columns centered on their support") {
  Problem p = test::smallProblem(test::kBoxes);
  UnitStack column = {orient(p, "alpha", 150, 50, 180), orient(p, "small-a", 100, 25, 120)};
  UnitStack single = {orient(p, "tall", 60, 95, 150)};
  std::vector<UnitStack> units = {column, single};
  Cell c = makeCell(units, p.boxes);
  CHECK_EQ(c.width, 210);
  CHECK_EQ(c.height, 95);
  CHECK_EQ(c.units, 2);
  CHECK_EQ(c.boxes[1].xOff, 25);  // (150 - 100) / 2
  CHECK_EQ(c.boxes[1].yOff, 50);
  CHECK_EQ(c.boxes[2].xOff, 150);
  CHECK_EQ(unitHeight(c, 0), 75);
  CHECK(hasColumn(c));
  CHECK_EQ(unitsOf(c).size(), 2u);
  CHECK(unitsOf(c)[0] == column);
}

TEST_CASE("composePile: holes = rectangle up to the nominal height minus faces") {
  Problem p = test::smallProblem(test::kBoxes);
  std::vector<Cell> cells;
  UnitStack a = {orient(p, "alpha", 150, 50, 180)};
  UnitStack g = {orient(p, "gamma", 150, 48, 180)};
  cells.push_back(makeCell({&a, 1}, p.boxes));
  cells.push_back(makeCell({&g, 1}, p.boxes));
  Pile pile = composePile(cells, {0, 1}, p.geo.heightBase);
  CHECK_EQ(pile.width, 150);
  CHECK_EQ(pile.height, 98);
  CHECK_EQ(pile.holes, 150LL * 2);  // 2 mm short of nominal
  CHECK_EQ(pile.layers(), 2);
}

TEST_CASE("pile text: round trip and precise errors") {
  Problem p = test::smallProblem(test::kBoxes);
  UnitStack column = {orient(p, "alpha", 150, 50, 180), orient(p, "small-a", 100, 25, 120)};
  UnitStack single = {orient(p, "tall", 60, 95, 150)};
  std::vector<UnitStack> units = {column, single};
  std::vector<Cell> cells = {makeCell(units, p.boxes)};
  Pile pile = composePile(cells, {0}, p.geo.heightBase);
  std::string text = formatPile(pile, cells, p.boxes);
  CHECK_EQ(text, std::string("[alpha 150x50 d180 + small-a 100x25 d120 | tall 60x95 d150]"));
  PileSpec spec = parsePile(text);
  REQUIRE(spec.size() == 1);
  REQUIRE(spec[0].size() == 2);
  CHECK_EQ(spec[0][0][1].name, std::string("small-a"));
  CHECK_EQ(spec[0][1][0].fh, 95);
  CHECK(errorOf([] { parsePile("[alpha 150x50 d180"); }).find("expected ']'") != std::string::npos);
  CHECK(errorOf([] { parsePile("[alpha 150x d180]"); }).find("positive number") != std::string::npos);
  CHECK(errorOf([] { parsePile("[alpha 150x50 180]"); }).find("'d'") != std::string::npos);
  CHECK(!errorOf([] { parsePile(""); }).empty());
}

TEST_CASE("checkPile names each fault") {
  Problem p = test::smallProblem(test::kBoxes);
  auto pileOf = [&](std::vector<std::vector<UnitStack>> cellUnits, std::vector<Cell>& cells) {
    std::vector<int> idx;
    for (auto& units : cellUnits) {
      idx.push_back((int)cells.size());
      cells.push_back(makeCell(units, p.boxes));
    }
    return composePile(cells, idx, p.geo.heightBase);
  };
  std::vector<Cell> cells;
  Orient alpha = orient(p, "alpha", 150, 50, 180), beta = orient(p, "beta", 150, 50, 180);
  CHECK(checkPile(p, cells, pileOf({{{alpha}}, {{beta}}}, cells)) == PileFault::None);
  // Short of the nominal height.
  CHECK(checkPile(p, cells, pileOf({{{alpha}}}, cells)) == PileFault::PileHeight);
  // A wide box on a narrow one.
  Orient smallA = orient(p, "small-a", 100, 25, 120);
  CHECK(checkPile(p, cells, pileOf({{{smallA, alpha}}, {{beta}}}, cells)) == PileFault::Support);
  // A cell much narrower than the pile.
  Orient tall = orient(p, "tall", 60, 95, 150);
  CHECK(checkPile(p, cells, pileOf({{{alpha}}, {{tall}}}, cells)) == PileFault::PileWidth);
  // Side-by-side units of different heights.
  CHECK(checkPile(p, cells, pileOf({{{alpha}, {tall}}}, cells)) == PileFault::CellHeights);
  // --vert-inside: a standing box above the nominal height.
  Problem vi = p;
  vi.vertInside = true;
  vi.geo.overTop = 60;
  std::vector<Cell> c2;
  Orient standing100 = orient(p, "small-a", 25, 100, 120, true);  // top exactly on the line
  CHECK(checkPile(vi, c2, pileOf({{{standing100}}}, c2)) == PileFault::None);
  Orient standing120 = orient(p, "small-a", 25, 120, 100, true);
  CHECK(checkPile(vi, c2, pileOf({{{standing120}}}, c2)) == PileFault::StandingTop);
  Problem roomy = vi;
  roomy.vertInside = false;  // the rule is opt-in
  CHECK(checkPile(roomy, c2, pileOf({{{standing120}}}, c2)) == PileFault::None);
}

TEST_CASE("checkPile: group rules only drop piles no packing could use") {
  Problem p = test::smallProblem(test::kBoxes);
  Orient alpha = orient(p, "alpha", 150, 50, 180), beta = orient(p, "beta", 150, 50, 180);
  std::vector<Cell> cells;
  std::vector<int> idx;
  for (const Orient& o : {alpha, beta}) {
    UnitStack s{o};
    idx.push_back((int)cells.size());
    cells.push_back(makeCell({&s, 1}, p.boxes));
  }
  Pile tower = composePile(cells, idx, p.geo.heightBase);
  Pile alone = composePile(cells, {idx[0], idx[1]}, p.geo.heightBase);
  p.groups.push_back(test::group(p, {"alpha", "beta"}, Contact::StrictRun, Presence::AllOrNone));
  CHECK(checkPile(p, cells, tower) == PileFault::None);
  // Half a stack group, lying flat: it can never become a tower or a row.
  p.groups.back().members.add(boxIndex(p.boxes, "gamma"));
  CHECK(checkPile(p, cells, alone) == PileFault::Group);
}

TEST_CASE("external piles: legal ones in, stale or illegal ones out, duplicates merged") {
  Problem p = test::smallProblem(test::kBoxes);
  ShelfCandidates shelf;
  shelf.depth = 200;
  shelf.orients = buildOrients(p, 0);
  ExternalPiles admit(p, shelf);
  std::string why;
  int first = admit.admit(parsePile("[alpha 150x50 d180] [beta 150x50 d180]"), why);
  CHECK(first >= 0);
  CHECK_EQ(admit.admit(parsePile("[beta 150x50 d180] [alpha 150x50 d180]"), why), first);
  CHECK_EQ(admit.admit(parsePile("[alpha 149x50 d180] [beta 150x50 d180]"), why), -1);
  CHECK(why.find("not a legal orientation") != std::string::npos);
  CHECK_EQ(admit.admit(parsePile("[nosuch 150x50 d180]"), why), -1);
  CHECK(why.find("unknown box") != std::string::npos);
  CHECK_EQ(admit.admit(parsePile("[alpha 150x50 d180] [alpha 150x50 d180]"), why), -1);
  CHECK(why.find("twice") != std::string::npos);
  CHECK_EQ(admit.admit(parsePile("[alpha 150x50 d180]"), why), -1);  // too short
  // --flat: a standing column no longer exists as an orientation.
  Problem flat = p;
  flat.flatOnly = true;
  ShelfCandidates flatShelf;
  flatShelf.orients = buildOrients(flat, 0);
  ExternalPiles admitFlat(flat, flatShelf);
  CHECK(admit.admit(parsePile("[small-a 25x100 d120]"), why) >= 0);
  CHECK_EQ(admitFlat.admit(parsePile("[small-a 25x100 d120]"), why), -1);
}
