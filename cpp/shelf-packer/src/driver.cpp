#include "sp/driver.hpp"

#include <algorithm>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <tuple>

#include "sp/arrange.hpp"
#include "sp/candidates.hpp"
#include "sp/library.hpp"
#include "sp/packings_file.hpp"
#include "sp/pile_text.hpp"
#include "sp/report.hpp"
#include "sp/search.hpp"
#include "sp/tuning.hpp"
#include "sp/verify.hpp"

namespace sp {

namespace fs = std::filesystem;

namespace {

// How many boxes would have to move to turn one packing into the other.
// Boxes of identical dimensions are interchangeable: swapping two twins is
// not another packing to a person.
class Difference {
 public:
  explicit Difference(const Problem& p) : p_(p), shapeOf_(p.boxes.size()) {
    std::map<std::array<int, 3>, int> shapes;
    for (size_t b = 0; b < p.boxes.size(); b++) {
      std::array<int, 3> dims = {p.boxes[b].w, p.boxes[b].l, p.boxes[b].h};
      std::sort(dims.begin(), dims.end());
      shapeOf_[b] = shapes.emplace(dims, (int)shapes.size()).first->second;
    }
    shapes_ = (int)shapes.size();
  }

  int boxesMoved(const Packing& a, const Packing& b) const {
    constexpr int kSlots = kMaxShelves + 1;  // every shelf, and "left out"
    std::vector<std::array<int, kSlots>> delta(shapes_, std::array<int, kSlots>{});
    auto count = [&](const Packing& pk, int sign) {
      for (int box = 0; box < (int)p_.boxes.size(); box++) {
        int slot = kMaxShelves;
        for (int sh = 0; sh < p_.shelves(); sh++)
          if (pk.masks[sh].has(box)) slot = sh;
        delta[shapeOf_[box]][slot] += sign;
      }
    };
    count(a, 1);
    count(b, -1);
    int moved = 0;
    for (const auto& d : delta)
      for (int v : d) moved += std::abs(v);
    return moved / 2;
  }

 private:
  const Problem& p_;
  std::vector<int> shapeOf_;
  int shapes_ = 0;
};

std::string svgName(const Problem& p, int rank, int shelf) {
  std::ostringstream os;
  os << "solution_" << std::setw(2) << std::setfill('0') << rank;
  if (p.shelves() > 1) os << "_" << shelfLetter(shelf);
  os << ".svg";
  return os.str();
}

std::string svgTitle(const Problem& p, const Emitted& e, int shelf) {
  std::ostringstream os;
  os << std::fixed << std::setprecision(1) << "Solution " << e.rank << " · shelf "
     << shelfLetter(shelf) << " (depth " << p.shelfDepths[shelf] << " mm) · holes in window "
     << e.layouts[shelf].interiorHoles / 100.0 << " cm2 · volume " << e.packing.vol / 1e6
     << " L · " << e.packing.masks[shelf].count() << " boxes";
  return os.str();
}

void writeFile(const fs::path& path, const std::string& content) {
  std::ofstream out(path, std::ios::binary);
  out << content;
  if (!out) throw InputError("cannot write " + path.string());
}

// Our own numbered outputs from an earlier run would otherwise linger next
// to fewer new ones.
void clearOldOutputs(const fs::path& dir) {
  for (const fs::directory_entry& e : fs::directory_iterator(dir)) {
    std::string name = e.path().filename().string();
    bool ours = name.rfind("solution_", 0) == 0 &&
                (e.path().extension() == ".svg" || e.path().extension() == ".png");
    if (ours && e.is_regular_file()) fs::remove(e.path());
  }
}

void printCandidates(const std::vector<ShelfCandidates>& shelves, const CandidateStats& st) {
  for (const ShelfCandidates& s : shelves)
    std::cerr << "shelf " << shelfLetter(s.shelf) << " (depth " << s.depth
              << "): " << s.orients.size() << " orientations, " << s.cells.size() << " cells, "
              << s.piles.size() << " piles\n";
  std::cerr << "  enumerated " << st.enumerated << ", pruned " << st.pruned << ", towers "
            << st.towers;
  for (size_t f = 1; f < st.rejected.size(); f++)
    if (st.rejected[f]) std::cerr << ", rejected " << st.rejected[f] << " (" << describe(PileFault(f)) << ")";
  std::cerr << "\n";
}

void printSearch(const SearchStats& st) {
  std::cerr << "search:";
  for (const auto& [phase, sec] : st.phaseSeconds)
    std::cerr << " " << phase << " " << std::fixed << std::setprecision(1) << sec << "s";
  std::cerr << "\n  " << st.completed << " complete states (" << st.membership
            << " failed a group or --use-all), " << st.incomplete << " incomplete, " << st.dead
            << " dead extensions\n";
}

void printNothingFound(const Problem& p, const std::vector<ShelfCandidates>& shelves,
                       const SearchStats& st, const ArrangeStats& ast) {
  std::cerr << "no packing found under the given constraints\n";
  // Boxes that must be placed but fit in no legal pile on any shelf.
  BoxSet inSomePile;
  for (const ShelfCandidates& s : shelves)
    for (const Pile& pile : s.piles) inSomePile |= pile.mask;
  BoxSet needed = p.useAll ? p.all() : p.mandatory();
  if (BoxSet stuck = needed.minus(inSomePile); stuck.any()) {
    std::cerr << "  required but in no legal pile (too tall, too deep, or nothing to stack them with):";
    stuck.forEach([&](int b) { std::cerr << " " << p.boxes[b].name; });
    std::cerr << "\n";
  }
  if (p.objective == Objective::FillAll && st.bestCovered >= 0) {
    std::cerr << "  closest: " << st.bestCovered << " of " << (long long)p.geo.widthBase * p.shelves()
              << " mm of nominal width covered; pile widths";
    for (int sh = 0; sh < p.shelves(); sh++) {
      std::cerr << " " << shelfLetter(sh) << ":";
      for (int w : st.bestPileWidths[sh]) std::cerr << " " << w;
    }
    std::cerr << "\n";
  }
  if (p.useAll && st.bestPlaced >= 0) {
    std::cerr << "  --use-all: best attempt placed " << st.bestPlaced << "/" << p.boxes.size()
              << "; still out:";
    p.all().minus(st.bestPlacedMask).forEach([&](int b) { std::cerr << " " << p.boxes[b].name; });
    std::cerr << "\n";
  }
  if (ast.failed) std::cerr << "  " << ast.failed << " shelves could not be arranged\n";
}

void printArrange(const Problem& p, const ArrangeStats& st) {
  if (!st.failed) return;
  std::cerr << "arrangement: " << st.failed << " of " << st.attempts
            << " shelves had no legal layout";
  if (st.standingTop) std::cerr << "; standing-top failures " << st.standingTop;
  for (size_t gi = 0; gi < st.groupFailures.size(); gi++)
    if (st.groupFailures[gi]) std::cerr << "; " << p.groups[gi].origin << " " << st.groupFailures[gi];
  std::cerr << "\n";
}

}  // namespace

int runPacker(const Config& cfg) {
  const Problem& p = cfg.problem;
  const RunOptions& run = cfg.run;
  if (!run.verifyDir.empty()) return verifyPackings(p, run.verifyDir, std::cout) == 0 ? 0 : 1;

  std::vector<ShelfCandidates> shelves;
  CandidateStats cstats;
  for (int sh = 0; sh < p.shelves(); sh++) shelves.push_back(buildShelf(p, sh, cstats));
  printCandidates(shelves, cstats);

  std::vector<WarmPacking> warm;
  if (!run.warmDirs.empty() || !run.libraryPath.empty()) {
    std::vector<ExternalPiles> admit;
    for (ShelfCandidates& s : shelves) admit.emplace_back(p, s);
    for (const std::string& dir : run.warmDirs) {
      if (!fs::exists(fs::path(dir) / kPackingsFile))
        throw InputError("--warm " + dir + ": no " + kPackingsFile +
                         " (runs before this format wrote only solutions.txt)");
      ExternalLoad load;
      for (WarmPacking& wp : loadWarm(dir, p, admit, load)) warm.push_back(std::move(wp));
      load.print(std::cerr, "warm " + dir);
    }
    if (!run.libraryPath.empty()) loadLibrary(run.libraryPath, p, admit).print(std::cerr, "library " + run.libraryPath);
  }
  if (run.pilesOnly) return 0;

  Search search(p, shelves);
  for (const WarmPacking& wp : warm) search.seed(wp.piles, wp.source);
  search.run(run.seed);
  printSearch(search.stats());

  // Arrange in rank order. FillAll re-ranks its best raw candidates on the
  // holes left inside the windows once arranged; MaxVolume keeps its order.
  std::vector<Packing> ranked = search.ranked();
  ArrangeStats astats;
  auto arrange = [&](const Packing& pk, Emitted& e) {
    e.packing = pk;
    e.exactHoles = 0;
    for (int sh = 0; sh < p.shelves(); sh++) {
      auto lay = arrangeShelf(p, shelves[sh], pk.piles[sh], astats);
      if (!lay) return false;
      e.layouts[sh] = std::move(*lay);
      e.exactHoles += e.layouts[sh].interiorHoles;
    }
    return true;
  };
  std::vector<Emitted> arranged, chosen;
  const Difference difference(p);
  auto diverse = [&](const Packing& pk) {
    for (const Emitted& c : chosen)
      if (difference.boxesMoved(pk, c.packing) < tuning::kMinMovedBoxes) return false;
    return true;
  };
  if (p.objective == Objective::FillAll) {
    for (size_t i = 0; i < ranked.size() && (int)i < tuning::kFillAllExactCandidates; i++) {
      Emitted e;
      if (arrange(ranked[i], e)) arranged.push_back(std::move(e));
    }
    std::stable_sort(arranged.begin(), arranged.end(), [](const Emitted& a, const Emitted& b) {
      return std::tie(a.exactHoles, a.packing.spill) < std::tie(b.exactHoles, b.packing.spill);
    });
    for (const Emitted& e : arranged)
      if ((int)chosen.size() < run.solutions && diverse(e.packing)) chosen.push_back(e);
  } else {
    for (const Packing& pk : ranked) {
      if ((int)chosen.size() >= run.solutions) break;
      if (!diverse(pk)) continue;
      Emitted e;
      if (!arrange(pk, e)) continue;
      arranged.push_back(e);
      chosen.push_back(std::move(e));
    }
  }
  printArrange(p, astats);

  fs::path out(run.outDir);
  fs::create_directories(out);
  clearOldOutputs(out);
  std::ostringstream report, packings;
  packings << kPackingsHeader << "\n";
  for (size_t i = 0; i < chosen.size(); i++) {
    Emitted& e = chosen[i];
    e.rank = (int)i + 1;
    writeReport(report, p, shelves, e);
    writePackingRecord(packings, p, shelves, e);
    for (int sh = 0; sh < p.shelves(); sh++)
      writeFile(out / svgName(p, e.rank, sh), renderSvg(p, e.layouts[sh], svgTitle(p, e, sh)));
  }
  std::cout << report.str();
  writeFile(out / "solutions.txt", report.str());
  writeFile(out / kPackingsFile, packings.str());

  if (!run.libraryPath.empty()) {
    std::vector<std::string> keep;
    for (const Emitted& e : arranged)
      for (int sh = 0; sh < p.shelves(); sh++)
        for (int pi : e.packing.piles[sh])
          keep.push_back(formatPile(shelves[sh].piles[pi], shelves[sh].cells, p.boxes));
    saveLibrary(run.libraryPath, p, shelves, keep);
  }

  if (chosen.empty()) {
    printNothingFound(p, shelves, search.stats(), astats);
    return 1;
  }
  std::cerr << "wrote " << chosen.size() << " packings to " << out.string() << "/\n";
  return 0;
}

}  // namespace sp
