// Small problems for the unit tests.
#pragma once
#include <string>
#include <vector>

#include "sp/boxes.hpp"
#include "sp/problem.hpp"
#include "sp/rules.hpp"

namespace sp::test {

// A 300 × 100 front rectangle (reserve 10 / 10 / 15), one shelf 200 deep.
inline Problem smallProblem(const std::string& csv) {
  Problem p;
  p.boxes = parseBoxesCsv(csv, "test.csv");
  p.geo.widthBase = 300;
  p.geo.heightBase = 100;
  p.geo.overLeft = 10;
  p.geo.overRight = 10;
  p.geo.overTop = 15;
  p.shelfDepths = {200};
  return p;
}

inline const char* kBoxes =
    "alpha,150,180,50\n"
    "beta,150,180,50\n"
    "gamma,150,180,48\n"
    "small-a,100,120,25\n"
    "small-b,100,120,25\n"
    "tall,60,150,95\n";

inline Group group(const Problem& p, std::vector<std::string> names, Contact c, Presence pr) {
  Group g;
  g.origin = "test";
  for (const std::string& n : names) g.members.add(boxIndex(p.boxes, n));
  g.contact = c;
  g.presence = pr;
  return g;
}

inline Rect rect(int box, int x0, int y0, int fw, int fh) { return {box, x0, y0, fw, fh, 100, false}; }

}  // namespace sp::test
