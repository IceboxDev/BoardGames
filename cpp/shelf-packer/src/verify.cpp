#include "sp/verify.hpp"

#include <algorithm>
#include <filesystem>
#include <ostream>
#include <set>

#include "sp/candidates.hpp"
#include "sp/packings_file.hpp"
#include "sp/pile_text.hpp"
#include "sp/rules.hpp"

namespace sp {

namespace {

int xOverlap(const Rect& a, const Rect& b) { return std::min(a.x1(), b.x1()) - std::max(a.x0, b.x0); }
int yOverlap(const Rect& a, const Rect& b) { return std::min(a.y1(), b.y1()) - std::max(a.y0, b.y0); }

}  // namespace

int verifyPackings(const Problem& p, const std::string& dir, std::ostream& out) {
  const Geometry& g = p.geo;
  const std::string path = (std::filesystem::path(dir) / kPackingsFile).string();
  std::vector<PackingRecord> records = readPackingsFile(path);
  std::vector<std::vector<Orient>> orients;
  for (int sh = 0; sh < p.shelves(); sh++) orients.push_back(buildOrients(p, sh));

  int problems = 0;
  for (const PackingRecord& rec : records) {
    auto report = [&](int line, const std::string& msg) {
      out << path << ":" << line << ": packing " << rec.rank << ": " << msg << "\n";
      problems++;
    };
    if ((int)rec.shelves.size() != p.shelves()) {
      report(rec.line, std::to_string(rec.shelves.size()) + " shelves, expected " +
                           std::to_string(p.shelves()));
      continue;
    }
    std::array<BoxSet, kMaxShelves> masks{};
    BoxSet seen;
    for (int sh = 0; sh < p.shelves(); sh++) {
      const ShelfRecord& sr = rec.shelves[sh];
      const std::string shelf = std::string("shelf ") + shelfLetter(sh) + ": ";
      if (sr.depth != p.shelfDepths[sh])
        report(sr.line, shelf + "depth " + std::to_string(sr.depth) + ", expected " +
                            std::to_string(p.shelfDepths[sh]));

      std::vector<std::set<std::string>> pileNames;
      for (const std::string& text : sr.piles) {
        std::set<std::string> names;
        for (const CellSpec& c : parsePile(text))
          for (const UnitSpec& u : c)
            for (const BoxSpec& b : u) names.insert(b.name);
        pileNames.push_back(std::move(names));
      }

      // Every place: a known box, once, in a legal orientation, in its pile.
      std::vector<Rect> rects;
      std::vector<int> rectPile, rectLine;
      std::vector<std::set<std::string>> placedNames(sr.piles.size());
      for (const PlaceRecord& pr : sr.places) {
        int box = boxIndex(p.boxes, pr.name);
        if (box < 0) {
          report(pr.line, shelf + "unknown box '" + pr.name + "'");
          continue;
        }
        if (seen.has(box)) report(pr.line, shelf + pr.name + " is placed twice");
        seen.add(box);
        auto o = std::find_if(orients[sh].begin(), orients[sh].end(), [&](const Orient& x) {
          return x.box == box && x.fw == pr.fw && x.fh == pr.fh && x.d == pr.d;
        });
        if (o == orients[sh].end()) {
          report(pr.line, shelf + pr.name + " " + std::to_string(pr.fw) + "x" +
                              std::to_string(pr.fh) + " d" + std::to_string(pr.d) +
                              " is not a legal orientation of that box here");
          continue;
        }
        if (pr.pile < 1 || pr.pile > (int)sr.piles.size()) {
          report(pr.line, shelf + "pile " + std::to_string(pr.pile) + " does not exist");
          continue;
        }
        if (!pileNames[pr.pile - 1].count(pr.name))
          report(pr.line, shelf + pr.name + " is not in pile " + std::to_string(pr.pile) + "'s text");
        placedNames[pr.pile - 1].insert(pr.name);
        rects.push_back({box, pr.x0, pr.y0, pr.fw, pr.fh, pr.d, o->vert});
        rectPile.push_back(pr.pile - 1);
        rectLine.push_back(pr.line);
        masks[sh].add(box);
      }
      for (size_t k = 0; k < sr.piles.size(); k++)
        if (placedNames[k] != pileNames[k])
          report(sr.pileLines[k], shelf + "pile " + std::to_string(k + 1) +
                                      "'s boxes and its place records differ");

      // The shelf rectangle and its reserve.
      if (sr.width > g.maxWidth())
        report(sr.line, shelf + "width " + std::to_string(sr.width) + " exceeds the reserve");
      if (sr.window < 0 || sr.window > g.overLeft || sr.width - sr.window - g.widthBase > g.overRight)
        report(sr.line, shelf + "window at " + std::to_string(sr.window) +
                            " leaves more overhang than the reserve allows");

      // Order bottom-up to derive support chains (= layers, for tolerances).
      std::vector<int> order(rects.size());
      for (size_t i = 0; i < order.size(); i++) order[i] = (int)i;
      std::stable_sort(order.begin(), order.end(),
                       [&](int a, int b) { return rects[a].y0 < rects[b].y0; });
      std::vector<int> layers(rects.size(), 1);
      for (int i : order) {
        const Rect& r = rects[i];
        if (r.x0 < 0 || r.x1() > sr.width)
          report(rectLine[i], shelf + p.boxes[r.box].name + " lies outside the shelf width");
        int rest = 0;
        for (int j : order) {
          const Rect& o = rects[j];
          if (j == i || xOverlap(r, o) <= 0 || o.y1() > r.y0) continue;
          rest = std::max(rest, o.y1());
        }
        for (int j : order)
          if (j != i && xOverlap(rects[j], r) > 0 && rects[j].y1() == r.y0 && r.y0 > 0)
            layers[i] = std::max(layers[i], layers[j] + 1);
        if (r.y0 != rest)
          report(rectLine[i], shelf + p.boxes[r.box].name + " floats " +
                                  std::to_string(r.y0 - rest) + " mm above its support");
        if (r.y1() - layers[i] * g.tolPerBox > g.maxHeight())
          report(rectLine[i], shelf + p.boxes[r.box].name + " passes the top reserve");
        if (p.vertInside && r.vert && r.y1() > g.heightBase)
          report(rectLine[i], shelf + p.boxes[r.box].name +
                                  " stands above the nominal height (--vert-inside)");
      }
      for (size_t i = 0; i < rects.size(); i++)
        for (size_t j = i + 1; j < rects.size(); j++)
          if (xOverlap(rects[i], rects[j]) > 0 && yOverlap(rects[i], rects[j]) > 0)
            report(rectLine[j], shelf + p.boxes[rects[i].box].name + " and " +
                                    p.boxes[rects[j].box].name + " overlap");

      if (p.objective == Objective::FillAll) {
        int piles = (int)sr.piles.size();
        if (sr.width + piles * g.tolPerBox < g.widthBase)
          report(sr.line, shelf + "width " + std::to_string(sr.width) +
                              " does not fill the nominal width");
        for (int k = 0; k < piles; k++) {
          int top = 0, chain = 0;
          for (size_t i = 0; i < rects.size(); i++)
            if (rectPile[i] == k) {
              top = std::max(top, rects[i].y1());
              chain = std::max(chain, layers[i]);
            }
          if (top + chain * g.tolPerBox < g.heightBase - g.heightSlack)
            report(sr.pileLines[k], shelf + "pile " + std::to_string(k + 1) +
                                        " stops short of the nominal height");
        }
      }

      for (const Group& grp : p.groups)
        if (masks[sh].contains(grp.members) && !contactHolds(grp, rects, p.longEdge))
          report(sr.line, shelf + grp.origin + ": contact rule broken");
    }
    std::string why;
    if (!membershipHolds(p, std::span<const BoxSet>(masks.data(), (size_t)p.shelves()), &why))
      report(rec.line, why);
  }
  out << path << ": " << records.size() << " packings verified, " << problems << " problems\n";
  return problems;
}

}  // namespace sp
