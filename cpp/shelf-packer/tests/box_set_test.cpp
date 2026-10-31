#include <set>
#include <vector>

#include "sp/box_set.hpp"
#include "tinytest.hpp"

using sp::BoxSet;

TEST_CASE("box set: membership and counting across both words") {
  BoxSet s = BoxSet::single(3) | BoxSet::single(64) | BoxSet::single(127);
  CHECK(s.has(3));
  CHECK(s.has(64));
  CHECK(s.has(127));
  CHECK(!s.has(63));
  CHECK_EQ(s.count(), 3);
  CHECK(!s.empty());
  CHECK(BoxSet().empty());
}

TEST_CASE("box set: firstN at word boundaries") {
  CHECK_EQ(BoxSet::firstN(0).count(), 0);
  CHECK_EQ(BoxSet::firstN(63).count(), 63);
  CHECK_EQ(BoxSet::firstN(64).count(), 64);
  CHECK_EQ(BoxSet::firstN(65).count(), 65);
  CHECK_EQ(BoxSet::firstN(128).count(), 128);
  CHECK(BoxSet::firstN(65).has(64));
  CHECK(!BoxSet::firstN(64).has(64));
}

TEST_CASE("box set: algebra") {
  BoxSet a = BoxSet::single(1) | BoxSet::single(70);
  BoxSet b = BoxSet::single(70) | BoxSet::single(2);
  CHECK(a.intersects(b));
  CHECK((a & b) == BoxSet::single(70));
  CHECK(a.minus(b) == BoxSet::single(1));
  CHECK((a ^ b) == (BoxSet::single(1) | BoxSet::single(2)));
  CHECK((a | b).contains(a));
  CHECK(!a.contains(b));
  CHECK(a.contains(BoxSet()));
}

TEST_CASE("box set: numeric order puts the high word first") {
  CHECK(BoxSet::single(63) < BoxSet::single(64));
  CHECK(BoxSet::single(0) < BoxSet::single(1));
  CHECK(BoxSet::single(64) < (BoxSet::single(64) | BoxSet::single(0)));
  std::set<BoxSet> ordered = {BoxSet::single(100), BoxSet::single(5), BoxSet::single(64)};
  CHECK(*ordered.begin() == BoxSet::single(5));
}

TEST_CASE("box set: forEach ascends") {
  BoxSet s = BoxSet::single(90) | BoxSet::single(4) | BoxSet::single(64);
  std::vector<int> seen;
  s.forEach([&](int b) { seen.push_back(b); });
  CHECK((seen == std::vector<int>{4, 64, 90}));
  CHECK_EQ(std::hash<BoxSet>()(s), std::hash<BoxSet>()(BoxSet(s)));
}
