#include "sp/packings_file.hpp"

#include <ostream>
#include <sstream>

#include "sp/boxes.hpp"
#include "sp/pile_text.hpp"

namespace sp {

void writePackingRecord(std::ostream& os, const Problem& p,
                        const std::vector<ShelfCandidates>& shelves, const Emitted& e) {
  os << "packing " << e.rank << "\n";
  for (int sh = 0; sh < p.shelves(); sh++) {
    const ShelfLayout& lay = e.layouts[sh];
    const ShelfCandidates& s = shelves[sh];
    os << "shelf " << shelfLetter(sh) << " depth " << s.depth << " width " << lay.width
       << " window " << lay.window << "\n";
    for (int pi : lay.pileOrder) os << "pile " << formatPile(s.piles[pi], s.cells, p.boxes) << "\n";
    for (size_t k = 0; k < lay.rects.size(); k++) {
      const Rect& r = lay.rects[k];
      os << "place " << lay.rectPile[k] + 1 << " " << p.boxes[r.box].name << " " << r.x0 << " "
         << r.y0 << " " << r.fw << " " << r.fh << " " << r.d << "\n";
    }
  }
  os << "end\n";
}

namespace {

class LineReader {
 public:
  LineReader(const std::string& path, std::string text) : path_(path), text_(std::move(text)) {}

  // Next meaningful line split into words; false at end of file.
  bool next(std::vector<std::string>& words, std::string& rest) {
    while (pos_ <= text_.size()) {
      size_t nl = text_.find('\n', pos_);
      std::string line = text_.substr(pos_, nl == std::string::npos ? std::string::npos : nl - pos_);
      pos_ = nl == std::string::npos ? text_.size() + 1 : nl + 1;
      lineNo_++;
      if (!line.empty() && line.back() == '\r') line.pop_back();
      size_t first = line.find_first_not_of(' ');
      if (first == std::string::npos || line[first] == '#') continue;
      words.clear();
      std::istringstream in(line);
      for (std::string w; in >> w;) words.push_back(w);
      size_t afterKeyword = line.find(' ', first);
      rest = afterKeyword == std::string::npos ? "" : line.substr(afterKeyword + 1);
      return true;
    }
    return false;
  }
  int line() const { return lineNo_; }
  [[noreturn]] void fail(const std::string& what) const {
    throw InputError(path_ + ":" + std::to_string(lineNo_) + ": " + what);
  }
  int number(const std::string& word) const {
    int v = 0;
    if (!parseInt(word, v)) fail("'" + word + "' is not a whole number");
    return v;
  }
  // "key value key value…" after the keyword, in exactly this order.
  std::vector<int> fields(const std::vector<std::string>& words,
                          std::initializer_list<const char*> keys, size_t from) const {
    if (words.size() != from + 2 * keys.size()) fail("malformed '" + words[0] + "' line");
    std::vector<int> out;
    size_t k = from;
    for (const char* key : keys) {
      if (words[k] != key) fail(std::string("expected '") + key + "'");
      out.push_back(number(words[k + 1]));
      k += 2;
    }
    return out;
  }

 private:
  std::string path_, text_;
  size_t pos_ = 0;
  int lineNo_ = 0;
};

}  // namespace

std::vector<PackingRecord> readPackingsFile(const std::string& path) {
  LineReader in(path, readTextFile(path));
  std::vector<std::string> words;
  std::string rest;
  if (!in.next(words, rest) || rest.empty() || words[0] + " " + rest != kPackingsHeader)
    in.fail(std::string("expected the header '") + kPackingsHeader + "'");
  std::vector<PackingRecord> out;
  PackingRecord* open = nullptr;
  while (in.next(words, rest)) {
    const std::string& kw = words[0];
    if (kw == "packing") {
      if (open) in.fail("'packing' before the previous one's 'end'");
      if (words.size() != 2) in.fail("expected 'packing <rank>'");
      out.push_back({in.line(), in.number(words[1]), {}});
      open = &out.back();
    } else if (!open) {
      in.fail("'" + kw + "' outside a packing");
    } else if (kw == "shelf") {
      if (words.size() < 2 || words[1].size() != 1 || words[1][0] < 'A' ||
          words[1][0] >= 'A' + kMaxShelves)
        in.fail("expected a shelf letter");
      if (words[1][0] != shelfLetter((int)open->shelves.size()))
        in.fail("shelves must come in order A, B, …");
      std::vector<int> f = in.fields(words, {"depth", "width", "window"}, 2);
      open->shelves.push_back({in.line(), words[1][0], f[0], f[1], f[2], {}, {}, {}});
    } else if (kw == "pile") {
      if (open->shelves.empty()) in.fail("'pile' before any 'shelf'");
      try {
        parsePile(rest);
      } catch (const InputError& e) {
        in.fail(e.what());
      }
      open->shelves.back().piles.push_back(rest);
      open->shelves.back().pileLines.push_back(in.line());
    } else if (kw == "place") {
      if (open->shelves.empty()) in.fail("'place' before any 'shelf'");
      if (words.size() != 8) in.fail("expected 'place <pile#> <name> <x0> <y0> <fw> <fh> <d>'");
      PlaceRecord r;
      r.line = in.line();
      r.pile = in.number(words[1]);
      r.name = words[2];
      r.x0 = in.number(words[3]);
      r.y0 = in.number(words[4]);
      r.fw = in.number(words[5]);
      r.fh = in.number(words[6]);
      r.d = in.number(words[7]);
      open->shelves.back().places.push_back(std::move(r));
    } else if (kw == "end") {
      if (words.size() != 1) in.fail("expected 'end'");
      open = nullptr;
    } else {
      in.fail("unknown record '" + kw + "'");
    }
  }
  if (open) in.fail("missing 'end'");
  return out;
}

}  // namespace sp
