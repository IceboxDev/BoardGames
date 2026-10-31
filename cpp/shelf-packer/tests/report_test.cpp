#include <regex>
#include <string>

#include "fixtures.hpp"
#include "sp/report.hpp"
#include "tinytest.hpp"

using namespace sp;

TEST_CASE("svg: every fill is plain hex, readable in any viewer") {
  Problem p = test::smallProblem(test::kBoxes);
  ShelfLayout lay;
  for (int b = 0; b < (int)p.boxes.size(); b++) lay.rects.push_back(test::rect(b, 50 * b, 0, 40, 60));
  lay.width = 300;
  std::string svg = renderSvg(p, lay, "t");
  CHECK(svg.find("hsl(") == std::string::npos);
  std::regex fill("fill=\"([^\"]*)\"");
  int fills = 0;
  for (auto it = std::sregex_iterator(svg.begin(), svg.end(), fill); it != std::sregex_iterator(); ++it) {
    std::string v = (*it)[1];
    CHECK(v == "none" || std::regex_match(v, std::regex("#[0-9a-f]{6}")));
    fills++;
  }
  CHECK(fills > (int)p.boxes.size());
  // Box fills are light, so the dark labels stay readable.
  std::regex boxFill("<rect x=\"[^\"]*\" y=\"[^\"]*\" width=\"[^\"]*\" height=\"[^\"]*\" fill=\"#(..)(..)(..)\" stroke=\"#3c3c3c\"");
  for (auto it = std::sregex_iterator(svg.begin(), svg.end(), boxFill); it != std::sregex_iterator(); ++it) {
    int r = std::stoi((*it)[1], nullptr, 16), g = std::stoi((*it)[2], nullptr, 16),
        b = std::stoi((*it)[3], nullptr, 16);
    CHECK(0.299 * r + 0.587 * g + 0.114 * b > 170);
  }
}
