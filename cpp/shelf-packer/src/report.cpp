#include "sp/report.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iomanip>
#include <ostream>
#include <sstream>

#include "sp/pile_text.hpp"

namespace sp {

namespace {

std::string cm2(long long mm2) {
  std::ostringstream os;
  os << std::fixed << std::setprecision(2) << mm2 / 100.0 << " cm2";
  return os.str();
}

std::string litres(long long mm3) {
  std::ostringstream os;
  os << std::fixed << std::setprecision(2) << mm3 / 1e6 << " L";
  return os.str();
}

std::string xmlEscape(std::string_view s) {
  std::string out;
  for (char c : s) {
    switch (c) {
      case '&': out += "&amp;"; break;
      case '<': out += "&lt;"; break;
      case '>': out += "&gt;"; break;
      case '"': out += "&quot;"; break;
      default: out += c;
    }
  }
  return out;
}

// A light pastel per box, spread round the colour wheel. Written as hex:
// SVG viewers that miss newer CSS colour syntax would paint it black.
std::string boxColor(int box) {
  double hue = (47 * box) % 360, s = 0.70, l = 0.82;
  double c = (1 - std::abs(2 * l - 1)) * s;
  double x = c * (1 - std::abs(std::fmod(hue / 60.0, 2.0) - 1));
  double m = l - c / 2, rgb[3] = {0, 0, 0};
  int sector = (int)(hue / 60) % 6;
  const int order[6][3] = {{0, 1, 2}, {1, 0, 2}, {1, 2, 0}, {2, 1, 0}, {2, 0, 1}, {0, 2, 1}};
  // In sector k the channel order[k][0] gets c, order[k][1] gets x, the last 0.
  rgb[order[sector][0]] = c;
  rgb[order[sector][1]] = x;
  char hex[8];
  std::snprintf(hex, sizeof hex, "#%02x%02x%02x", (int)std::lround((rgb[0] + m) * 255),
                (int)std::lround((rgb[1] + m) * 255), (int)std::lround((rgb[2] + m) * 255));
  return hex;
}

}  // namespace

void writeReport(std::ostream& os, const Problem& p, const std::vector<ShelfCandidates>& shelves,
                 const Emitted& e) {
  const Packing& pk = e.packing;
  BoxSet placed = pk.placed();
  int n = std::max(1, placed.count());
  os << "── Solution " << e.rank << ": ";
  if (p.objective == Objective::FillAll)
    os << "holes in windows " << cm2(e.exactHoles) << " (pile slack " << cm2(pk.holes) << "), ";
  else
    os << "value " << litres(pk.value) << ", ";
  os << "volume " << litres(pk.vol) << ", reserve spill " << cm2(pk.spill) << ", boxes "
     << placed.count() << ", avg depth " << pk.depthSum / n << " mm\n";
  for (int sh = 0; sh < p.shelves(); sh++) {
    const ShelfLayout& lay = e.layouts[sh];
    const ShelfCandidates& s = shelves[sh];
    os << "  shelf " << shelfLetter(sh) << " (depth " << s.depth << " mm): width " << lay.width
       << " mm, window at " << lay.window << " mm, holes in window " << cm2(lay.interiorHoles)
       << "\n";
    for (size_t k = 0; k < lay.pileOrder.size(); k++) {
      const Pile& pile = s.piles[lay.pileOrder[k]];
      os << "    pile " << k + 1 << " w=" << pile.width << " h=" << pile.height
         << " slack=" << cm2(pile.holes) << ": " << formatPile(pile, s.cells, p.boxes) << "\n";
    }
  }
  os << "  left out:";
  bool any = false;
  p.all().minus(placed).forEach([&](int b) {
    os << " " << p.boxes[b].name;
    any = true;
  });
  if (!any) os << " (none)";
  os << "\n  found by: " << pk.source << "\n\n";
}

std::string renderSvg(const Problem& p, const ShelfLayout& layout, const std::string& title) {
  const Geometry& g = p.geo;
  constexpr int kMargin = 40, kTitle = 30, kLegendCols = 3, kLegendRow = 14, kFont = 10;
  constexpr double kCharWidth = 0.6 * kFont;  // monospace advance
  const int rows = ((int)layout.rects.size() + kLegendCols - 1) / kLegendCols;
  const int legendH = rows * kLegendRow + 24;
  const int W = std::max(g.maxWidth() + 2 * kMargin, 1020);
  const int H = kTitle + g.maxHeight() + 2 * kMargin + legendH;
  const int floorY = H - kMargin - legendH;  // y grows downward
  const int originX = kMargin - layout.window;  // window's left edge lands at the margin

  std::ostringstream os;
  os << "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" << W << "\" height=\"" << H
     << "\" viewBox=\"0 0 " << W << " " << H << "\" font-family=\"ui-monospace, monospace\" font-size=\""
     << kFont << "\">\n";
  os << "<rect width=\"" << W << "\" height=\"" << H << "\" fill=\"#ffffff\"/>\n";
  os << "<text x=\"" << kMargin << "\" y=\"22\" font-size=\"14\" font-weight=\"bold\" fill=\"#141414\">"
     << xmlEscape(title) << "</text>\n";

  std::vector<std::string> legend;
  for (size_t k = 0; k < layout.rects.size(); k++) {
    const Rect& r = layout.rects[k];
    const Box& b = p.boxes[r.box];
    int num = (int)k + 1;
    int x = originX + r.x0, y = floorY - r.y1();
    std::ostringstream entry;
    entry << num << " " << b.name << " " << r.fw << "x" << r.fh << " d" << r.d << " (box " << b.w
          << "x" << b.l << "x" << b.h << ")";
    legend.push_back(entry.str());
    os << "<g><title>" << xmlEscape(entry.str()) << "</title><rect x=\"" << x << "\" y=\"" << y
       << "\" width=\"" << r.fw << "\" height=\"" << r.fh << "\" fill=\"" << boxColor(r.box)
       << "\" stroke=\"#3c3c3c\"/>";
    std::string label = std::to_string(num) + " " + b.name;
    std::string dims = std::to_string(r.fw) + "x" + std::to_string(r.fh) + " d" + std::to_string(r.d);
    bool nameFits = r.fw >= label.size() * kCharWidth + 8;
    if (nameFits && r.fh >= 26) {
      os << "<text x=\"" << x + 4 << "\" y=\"" << y + 11 << "\" fill=\"#1e1e1e\">" << xmlEscape(label)
         << "</text><text x=\"" << x + 4 << "\" y=\"" << y + 23 << "\" fill=\"#5a5a5a\">" << dims
         << "</text>";
    } else if (nameFits && r.fh >= 13) {
      os << "<text x=\"" << x + 4 << "\" y=\"" << y + 11 << "\" fill=\"#1e1e1e\">" << xmlEscape(label)
         << "</text>";
    } else {
      os << "<text x=\"" << x + r.fw / 2.0 << "\" y=\"" << y + r.fh / 2.0
         << "\" text-anchor=\"middle\" dominant-baseline=\"central\" fill=\"#1e1e1e\">" << num
         << "</text>";
    }
    os << "</g>\n";
  }

  // Guides on top: the nominal window (solid), the reserve (dashed), the floor.
  int left = kMargin, top = floorY - g.heightBase;
  os << "<rect x=\"" << left << "\" y=\"" << top << "\" width=\"" << g.widthBase << "\" height=\""
     << g.heightBase << "\" fill=\"none\" stroke=\"#5a5a5a\"/>\n";
  int rl = kMargin - g.overLeft, rr = kMargin + g.widthBase + g.overRight, rt = floorY - g.maxHeight();
  os << "<path d=\"M" << rl << " " << floorY << "V" << rt << "H" << rr << "V" << floorY
     << "\" fill=\"none\" stroke=\"#c82828\" stroke-dasharray=\"5 5\"/>\n";
  os << "<rect x=\"" << rl << "\" y=\"" << floorY << "\" width=\"" << rr - rl
     << "\" height=\"3\" fill=\"#000000\"/>\n";

  int colW = (W - 2 * kMargin) / kLegendCols;
  for (size_t i = 0; i < legend.size(); i++) {
    int col = (int)i / rows, row = (int)i % rows;
    os << "<text x=\"" << kMargin + col * colW << "\" y=\"" << floorY + 24 + row * kLegendRow
       << "\" fill=\"#282828\">" << xmlEscape(legend[i]) << "</text>\n";
  }
  os << "</svg>\n";
  return os.str();
}

}  // namespace sp
