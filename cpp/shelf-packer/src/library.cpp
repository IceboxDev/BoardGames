#include "sp/library.hpp"

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <ostream>
#include <set>

#include "sp/arrange.hpp"
#include "sp/packings_file.hpp"
#include "sp/pile_text.hpp"
#include "sp/tuning.hpp"

namespace sp {

void ExternalLoad::print(std::ostream& os, const std::string& what) const {
  os << what << ": " << read << " read";
  for (size_t sh = 0; sh < admitted.size(); sh++)
    if (admitted[sh]) os << ", " << admitted[sh] << " piles on shelf " << shelfLetter((int)sh);
  os << "\n";
  std::vector<std::pair<int, std::string>> reasons;
  for (const auto& [why, count] : rejected) reasons.emplace_back(-count, why);
  std::sort(reasons.begin(), reasons.end());
  constexpr size_t kShown = 10;
  for (size_t i = 0; i < reasons.size() && i < kShown; i++)
    os << "  rejected " << -reasons[i].first << "×: " << reasons[i].second << "\n";
  if (reasons.size() > kShown) os << "  … and " << reasons.size() - kShown << " more reasons\n";
}

ExternalLoad loadLibrary(const std::string& path, const Problem& p,
                         std::vector<ExternalPiles>& admit) {
  ExternalLoad load;
  if (!std::filesystem::exists(path)) return load;
  std::string text = readTextFile(path);
  int lineNo = 0;
  size_t pos = 0;
  while (pos <= text.size()) {
    size_t nl = text.find('\n', pos);
    std::string line = text.substr(pos, nl == std::string::npos ? std::string::npos : nl - pos);
    pos = nl == std::string::npos ? text.size() + 1 : nl + 1;
    lineNo++;
    if (!line.empty() && line.back() == '\r') line.pop_back();
    if (line.empty() || line[0] == '#') continue;
    auto fail = [&](const std::string& what) {
      throw InputError(path + ":" + std::to_string(lineNo) + ": " + what);
    };
    if (line.rfind("L ", 0) != 0) fail("expected 'L <pile text>'");
    std::string body = line.substr(2);
    if (body.rfind("ws=", 0) == 0) {  // legacy tags
      size_t colon = body.find(" : ");
      if (colon == std::string::npos) fail("malformed legacy 'L ws=… hs=… :' line");
      body = body.substr(colon + 3);
    }
    PileSpec spec;
    try {
      spec = parsePile(body);
    } catch (const InputError& e) {
      fail(e.what());
    }
    load.read++;
    for (int sh = 0; sh < p.shelves(); sh++) {
      std::string why;
      if (admit[sh].admit(spec, why) >= 0)
        load.admitted[sh]++;
      else
        load.rejected["shelf " + std::string(1, shelfLetter(sh)) + ": " + why]++;
    }
  }
  return load;
}

void saveLibrary(const std::string& path, const Problem& p,
                 const std::vector<ShelfCandidates>& shelves, const std::vector<std::string>& keep) {
  struct Cand {
    int shelf, pile;
  };
  std::vector<Cand> cands;
  for (int sh = 0; sh < (int)shelves.size(); sh++)
    for (int i = 0; i < (int)shelves[sh].piles.size(); i++) cands.push_back({sh, i});
  std::stable_sort(cands.begin(), cands.end(), [&](const Cand& a, const Cand& b) {
    const Pile& x = shelves[a.shelf].piles[a.pile];
    const Pile& y = shelves[b.shelf].piles[b.pile];
    return x.holes * y.width < y.holes * x.width;
  });
  std::array<int, kMaxBoxes> perBox{};
  std::map<std::pair<int, int>, int> perPair;
  std::set<std::string> lines(keep.begin(), keep.end());
  for (const Cand& c : cands) {
    const ShelfCandidates& s = shelves[c.shelf];
    const Pile& pile = s.piles[c.pile];
    std::vector<Rect> lo = layoutPile(p, s.cells, pile);
    std::vector<std::pair<int, int>> pairs;
    for (size_t i = 0; i < lo.size(); i++)
      for (size_t j = i + 1; j < lo.size(); j++)
        if (touches(lo[i], lo[j])) pairs.push_back(std::minmax(lo[i].box, lo[j].box));
    bool needed = false;
    for (const Rect& r : lo) needed |= perBox[r.box] < tuning::kLibraryPerBox;
    for (const auto& pr : pairs) needed |= perPair[pr] < tuning::kLibraryPerPair;
    if (!needed) continue;
    for (const Rect& r : lo) perBox[r.box]++;
    for (const auto& pr : pairs) perPair[pr]++;
    lines.insert(formatPile(pile, s.cells, p.boxes));
  }
  std::filesystem::path target(path);
  std::filesystem::path tmp = target;
  tmp += ".tmp";
  {
    std::ofstream out(tmp);
    if (!out) throw InputError("cannot write " + tmp.string());
    out << kLibraryHeader << " — auto-curated; do not edit by hand\n";
    for (const std::string& l : lines) out << "L " << l << "\n";
    if (!out) throw InputError("cannot write " + tmp.string());
  }
  std::filesystem::rename(tmp, target);
}

std::vector<WarmPacking> loadWarm(const std::string& dir, const Problem& p,
                                  std::vector<ExternalPiles>& admit, ExternalLoad& load) {
  std::vector<WarmPacking> out;
  std::string path = (std::filesystem::path(dir) / kPackingsFile).string();
  for (const PackingRecord& rec : readPackingsFile(path)) {
    load.read++;
    if ((int)rec.shelves.size() != p.shelves()) {
      load.rejected["packing has " + std::to_string(rec.shelves.size()) + " shelves, this run " +
                    std::to_string(p.shelves())]++;
      continue;
    }
    WarmPacking wp;
    wp.source = "warm:" + dir;
    for (int sh = 0; sh < p.shelves(); sh++)
      for (const std::string& text : rec.shelves[sh].piles) {
        std::string why;
        int idx = admit[sh].admit(parsePile(text), why);
        if (idx >= 0) {
          wp.piles[sh].push_back(idx);
          load.admitted[sh]++;
        } else {
          load.rejected["shelf " + std::string(1, shelfLetter(sh)) + ": " + why]++;
        }
      }
    out.push_back(std::move(wp));
  }
  return out;
}

}  // namespace sp
