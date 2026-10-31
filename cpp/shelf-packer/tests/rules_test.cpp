#include <array>
#include <vector>

#include "fixtures.hpp"
#include "sp/rules.hpp"
#include "tinytest.hpp"

using namespace sp;
using sp::test::rect;

TEST_CASE("touches: sides and corners count, gaps do not") {
  CHECK(touches(rect(0, 0, 0, 10, 10), rect(1, 10, 0, 10, 10)));   // side
  CHECK(touches(rect(0, 0, 0, 10, 10), rect(1, 10, 10, 10, 10)));  // corner
  CHECK(!touches(rect(0, 0, 0, 10, 10), rect(1, 11, 0, 10, 10)));
}

TEST_CASE("long edge contact needs a positive overlap on the long edge") {
  Rect flat = rect(0, 0, 0, 100, 40);
  CHECK(longEdgeContact(flat, rect(1, 20, 40, 30, 30)));    // on top
  CHECK(!longEdgeContact(flat, rect(1, 100, 0, 30, 30)));   // beside: short edge
  CHECK(!longEdgeContact(flat, rect(1, 100, 40, 30, 30)));  // corner only
  Rect standing = rect(0, 0, 0, 40, 100);
  CHECK(longEdgeContact(standing, rect(1, 40, 10, 30, 30)));
  CHECK(!longEdgeContact(standing, rect(1, 0, 100, 40, 30)));
  Rect square = rect(0, 0, 0, 50, 50);  // four long edges
  CHECK(longEdgeContact(square, rect(1, 50, 0, 10, 10)));
  CHECK(longEdgeContact(square, rect(1, 0, 50, 10, 10)));
}

TEST_CASE("strict run: towers and standing rows, nothing else") {
  std::vector<Rect> tower = {rect(0, 0, 0, 150, 50), rect(1, 0, 50, 150, 50)};
  CHECK(formsStrictRun(tower));
  std::vector<Rect> gap = {rect(0, 0, 0, 150, 50), rect(1, 0, 52, 150, 50)};
  CHECK(!formsStrictRun(gap));
  std::vector<Rect> shifted = {rect(0, 0, 0, 150, 50), rect(1, 5, 50, 150, 50)};
  CHECK(!formsStrictRun(shifted));
  std::vector<Rect> row = {rect(0, 0, 0, 50, 150), rect(1, 50, 2, 50, 150)};
  CHECK(formsStrictRun(row));
  std::vector<Rect> flatRow = {rect(0, 0, 0, 150, 50), rect(1, 150, 0, 150, 50)};
  CHECK(!formsStrictRun(flatRow));  // flat boxes side by side meet on short edges
}

TEST_CASE("contact rules on a layout") {
  Problem p = test::smallProblem(test::kBoxes);
  Group touch = test::group(p, {"alpha", "beta"}, Contact::Touch, Presence::AllOrNone);
  std::vector<Rect> stacked = {rect(0, 0, 0, 150, 50), rect(1, 0, 50, 150, 50)};
  std::vector<Rect> apart = {rect(0, 0, 0, 150, 50), rect(1, 160, 0, 150, 50)};
  CHECK(contactHolds(touch, stacked, {}));
  CHECK(!contactHolds(touch, apart, {}));
  // A --long-edge box only counts long-edge contacts.
  std::vector<Rect> besideShort = {rect(0, 0, 0, 150, 50), rect(1, 150, 0, 150, 50)};
  CHECK(contactHolds(touch, besideShort, {}));
  CHECK(!contactHolds(touch, besideShort, BoxSet::single(0)));
  Group mutual = test::group(p, {"alpha", "beta"}, Contact::LongEdgeBoth, Presence::Requires);
  CHECK(contactHolds(mutual, stacked, {}));
  CHECK(!contactHolds(mutual, besideShort, {}));
  // A member missing from the layout can never satisfy the rule.
  CHECK(!contactHolds(touch, std::vector<Rect>{rect(0, 0, 0, 150, 50)}, {}));
}

TEST_CASE("presence: mandatory, all-or-none, requires") {
  Problem p = test::smallProblem(test::kBoxes);
  BoxSet a = BoxSet::single(0), b = BoxSet::single(1);
  Group mand = test::group(p, {"alpha", "beta"}, Contact::Touch, Presence::Mandatory);
  CHECK(presenceHolds(mand, a | b));
  CHECK(!presenceHolds(mand, a));
  CHECK(!presenceHolds(mand, {}));
  Group aon = test::group(p, {"alpha", "beta"}, Contact::Touch, Presence::AllOrNone);
  CHECK(presenceHolds(aon, {}));
  CHECK(presenceHolds(aon, a | b));
  CHECK(!presenceHolds(aon, b));
  CHECK(strandedMembers(aon, b) == b);
  CHECK(strandedMembers(aon, a | b).empty());
  Group req = test::group(p, {"alpha", "beta"}, Contact::LongEdgeBoth, Presence::Requires);
  req.dependents = a;
  CHECK(presenceHolds(req, b));    // provider alone
  CHECK(!presenceHolds(req, a));   // dependent alone
  CHECK(presenceHolds(req, a | b));
  CHECK(strandedMembers(req, a) == a);
  CHECK(strandedMembers(req, b).empty());
}

TEST_CASE("membership: split groups and --use-all") {
  Problem p = test::smallProblem(test::kBoxes);
  p.groups.push_back(test::group(p, {"alpha", "beta"}, Contact::Touch, Presence::AllOrNone));
  std::array<BoxSet, 2> same = {BoxSet::single(0) | BoxSet::single(1), BoxSet::single(2)};
  std::array<BoxSet, 2> split = {BoxSet::single(0), BoxSet::single(1)};
  CHECK(membershipHolds(p, same));
  std::string why;
  CHECK(!membershipHolds(p, split, &why));
  CHECK(why.find("different shelves") != std::string::npos);
  p.useAll = true;
  CHECK(!membershipHolds(p, same, &why));
  std::array<BoxSet, 2> all = {p.all(), {}};
  CHECK(membershipHolds(p, all));
}
