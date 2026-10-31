#include <string>

#include "sp/boxes.hpp"
#include "tinytest.hpp"

using namespace sp;

namespace {

// The message of the InputError `fn` throws, or "" if it does not throw.
template <class F>
std::string errorOf(F&& fn) {
  try {
    fn();
  } catch (const InputError& e) {
    return e.what();
  }
  return "";
}

bool contains(const std::string& s, const std::string& part) {
  return s.find(part) != std::string::npos;
}

}  // namespace

TEST_CASE("csv: comments, blank lines, spaces and CRLF") {
  auto boxes = parseBoxesCsv("# header\r\n\r\n a , 10, 20 ,30\r\nb,1,2,3\n", "x.csv");
  REQUIRE(boxes.size() == 2);
  CHECK_EQ(boxes[0].name, std::string("a"));
  CHECK_EQ(boxes[0].vol, 6000LL);
  CHECK_EQ(boxes[1].h, 3);
}

TEST_CASE("csv: every malformed line names its line number") {
  CHECK(contains(errorOf([] { parseBoxesCsv("a,1,2\n", "x.csv"); }), "x.csv:1: expected"));
  CHECK(contains(errorOf([] { parseBoxesCsv("a,1,2,3\nb c,1,2,3\n", "x.csv"); }), "x.csv:2:"));
  CHECK(contains(errorOf([] { parseBoxesCsv("a,1,2cm,3\n", "x.csv"); }), "length_mm '2cm'"));
  CHECK(contains(errorOf([] { parseBoxesCsv("a,1,0,3\n", "x.csv"); }), "positive"));
  CHECK(contains(errorOf([] { parseBoxesCsv("a,1,2,3\na,4,5,6\n", "x.csv"); }), "duplicate"));
  CHECK(contains(errorOf([] { parseBoxesCsv("# nothing\n", "x.csv"); }), "no boxes"));
  CHECK(contains(errorOf([] { parseBoxesCsv("a*,1,2,3\n", "x.csv"); }), "box name"));
}

TEST_CASE("csv: more boxes than a BoxSet holds is an error") {
  std::string csv;
  for (int i = 0; i <= kMaxBoxes; i++) csv += "b" + std::to_string(i) + ",1,1,1\n";
  CHECK(contains(errorOf([&] { parseBoxesCsv(csv, "x.csv"); }), "at most"));
}

TEST_CASE("parseInt is strict") {
  int v = 0;
  CHECK(parseInt("85", v) && v == 85);
  CHECK(parseInt("-3", v) && v == -3);
  CHECK(!parseInt("85cm", v));
  CHECK(!parseInt("", v));
  CHECK(!parseInt(" 8", v));
  CHECK(!parseInt("abc", v));
}

TEST_CASE("name patterns: exact or PREFIX*") {
  CHECK(nameMatches("exit-*", "exit-temple"));
  CHECK(nameMatches("exit-*", "exit-"));
  CHECK(!nameMatches("exit-*", "exi"));
  CHECK(nameMatches("catan", "catan"));
  CHECK(!nameMatches("catan", "catan-2"));
  auto boxes = parseBoxesCsv("exit-a,1,1,1\nexit-b,1,1,1\nother,1,1,1\n", "x.csv");
  CHECK_EQ(matchBoxes(boxes, "exit-*").count(), 2);
  CHECK(matchBoxes(boxes, "nope").empty());
  CHECK_EQ(boxIndex(boxes, "other"), 2);
  CHECK_EQ(boxIndex(boxes, "nope"), -1);
}
