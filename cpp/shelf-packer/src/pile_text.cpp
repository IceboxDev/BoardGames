#include "sp/pile_text.hpp"

#include <sstream>

namespace sp {

std::string formatCell(const Cell& cell, const std::vector<Box>& boxes) {
  std::ostringstream os;
  os << "[";
  for (int u = 0; u < cell.units; u++) {
    if (u) os << " | ";
    bool first = true;
    for (const Placement& pl : cell.boxes) {
      if (pl.unit != u) continue;
      if (!first) os << " + ";
      first = false;
      os << boxes[pl.o.box].name << " " << pl.o.fw << "x" << pl.o.fh << " d" << pl.o.d;
    }
  }
  os << "]";
  return os.str();
}

std::string formatPile(const Pile& pile, const std::vector<Cell>& cells,
                       const std::vector<Box>& boxes) {
  std::string out;
  for (int ci : pile.cells) {
    if (!out.empty()) out += ' ';
    out += formatCell(cells[ci], boxes);
  }
  return out;
}

namespace {

class Cursor {
 public:
  explicit Cursor(std::string_view s) : s_(s) {}

  void skipSpaces() {
    while (pos_ < s_.size() && s_[pos_] == ' ') pos_++;
  }
  bool atEnd() {
    skipSpaces();
    return pos_ == s_.size();
  }
  bool accept(char c) {
    skipSpaces();
    if (pos_ < s_.size() && s_[pos_] == c) {
      pos_++;
      return true;
    }
    return false;
  }
  void expect(char c) {
    if (!accept(c)) fail(std::string("expected '") + c + "'");
  }
  std::string name() {
    skipSpaces();
    size_t start = pos_;
    while (pos_ < s_.size() && s_[pos_] != ' ' && s_[pos_] != ']' && s_[pos_] != '[') pos_++;
    std::string n(s_.substr(start, pos_ - start));
    if (!isValidBoxName(n)) fail("expected a box name");
    return n;
  }
  // Digits only, directly at the cursor (no spaces inside "297x80").
  int number() {
    size_t start = pos_;
    while (pos_ < s_.size() && s_[pos_] >= '0' && s_[pos_] <= '9') pos_++;
    int v = 0;
    if (!parseInt(s_.substr(start, pos_ - start), v) || v <= 0) fail("expected a positive number");
    return v;
  }
  void literal(char c) {
    if (pos_ >= s_.size() || s_[pos_] != c) fail(std::string("expected '") + c + "'");
    pos_++;
  }
  [[noreturn]] void fail(const std::string& what) {
    throw InputError("pile text, column " + std::to_string(pos_ + 1) + ": " + what);
  }

 private:
  std::string_view s_;
  size_t pos_ = 0;
};

BoxSpec parseBox(Cursor& c) {
  BoxSpec b;
  b.name = c.name();
  c.skipSpaces();
  b.fw = c.number();
  c.literal('x');
  b.fh = c.number();
  c.skipSpaces();
  c.literal('d');
  b.d = c.number();
  return b;
}

}  // namespace

PileSpec parsePile(std::string_view text) {
  Cursor c(text);
  PileSpec pile;
  while (!c.atEnd()) {
    c.expect('[');
    CellSpec cell(1);
    while (true) {
      cell.back().push_back(parseBox(c));
      if (c.accept('+')) continue;
      if (c.accept('|')) {
        cell.emplace_back();
        continue;
      }
      c.expect(']');
      break;
    }
    pile.push_back(std::move(cell));
  }
  if (pile.empty()) c.fail("empty pile");
  return pile;
}

}  // namespace sp
