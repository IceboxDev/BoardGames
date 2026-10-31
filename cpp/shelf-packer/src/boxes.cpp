#include "sp/boxes.hpp"

#include <charconv>
#include <fstream>
#include <set>
#include <sstream>

namespace sp {

namespace {

std::string_view trim(std::string_view s) {
  while (!s.empty() && (s.front() == ' ' || s.front() == '\t')) s.remove_prefix(1);
  while (!s.empty() && (s.back() == ' ' || s.back() == '\t' || s.back() == '\r'))
    s.remove_suffix(1);
  return s;
}

std::vector<std::string_view> splitFields(std::string_view line) {
  std::vector<std::string_view> out;
  size_t start = 0;
  while (true) {
    size_t comma = line.find(',', start);
    out.push_back(trim(line.substr(start, comma == std::string_view::npos ? line.npos
                                                                          : comma - start)));
    if (comma == std::string_view::npos) return out;
    start = comma + 1;
  }
}

}  // namespace

bool parseInt(std::string_view text, int& out) {
  if (text.empty()) return false;
  const char* end = text.data() + text.size();
  auto [ptr, ec] = std::from_chars(text.data(), end, out);
  return ec == std::errc() && ptr == end;
}

bool isValidBoxName(std::string_view name) {
  if (name.empty()) return false;
  for (char c : name) {
    bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
              c == '.' || c == '_' || c == '-';
    if (!ok) return false;
  }
  return true;
}

std::vector<Box> parseBoxesCsv(std::string_view text, std::string_view source) {
  std::vector<Box> boxes;
  std::set<std::string, std::less<>> seen;
  int lineNo = 0;
  size_t pos = 0;
  while (pos <= text.size()) {
    size_t nl = text.find('\n', pos);
    std::string_view line =
        trim(text.substr(pos, nl == std::string_view::npos ? text.npos : nl - pos));
    pos = nl == std::string_view::npos ? text.size() + 1 : nl + 1;
    lineNo++;
    if (line.empty() || line.front() == '#') continue;

    auto where = [&] {
      std::ostringstream os;
      os << source << ":" << lineNo << ": ";
      return os.str();
    };
    std::vector<std::string_view> f = splitFields(line);
    if (f.size() != 4)
      throw InputError(where() + "expected name,width_mm,length_mm,height_mm (got " +
                       std::to_string(f.size()) + " fields)");
    Box box;
    box.name = std::string(f[0]);
    if (!isValidBoxName(box.name))
      throw InputError(where() + "box name '" + box.name +
                       "' must be non-empty and use only letters, digits, '.', '_' or '-'");
    int* dims[3] = {&box.w, &box.l, &box.h};
    const char* labels[3] = {"width_mm", "length_mm", "height_mm"};
    for (int k = 0; k < 3; k++)
      if (!parseInt(f[k + 1], *dims[k]) || *dims[k] <= 0)
        throw InputError(where() + labels[k] + " '" + std::string(f[k + 1]) +
                         "' is not a positive whole number");
    if (!seen.insert(box.name).second)
      throw InputError(where() + "duplicate box name '" + box.name + "'");
    box.vol = 1LL * box.w * box.l * box.h;
    boxes.push_back(std::move(box));
  }
  if (boxes.empty()) throw InputError(std::string(source) + ": no boxes");
  if ((int)boxes.size() > kMaxBoxes)
    throw InputError(std::string(source) + ": " + std::to_string(boxes.size()) +
                     " boxes; at most " + std::to_string(kMaxBoxes) + " are supported");
  return boxes;
}

std::string readTextFile(const std::string& path) {
  std::ifstream in(path, std::ios::binary);
  if (!in) throw InputError("cannot open " + path);
  std::ostringstream os;
  os << in.rdbuf();
  return os.str();
}

std::vector<Box> loadBoxesCsv(const std::string& path) {
  return parseBoxesCsv(readTextFile(path), path);
}

bool nameMatches(std::string_view pattern, std::string_view name) {
  if (!pattern.empty() && pattern.back() == '*')
    return name.substr(0, pattern.size() - 1) == pattern.substr(0, pattern.size() - 1);
  return name == pattern;
}

BoxSet matchBoxes(const std::vector<Box>& boxes, std::string_view pattern) {
  BoxSet s;
  for (int i = 0; i < (int)boxes.size(); i++)
    if (nameMatches(pattern, boxes[i].name)) s.add(i);
  return s;
}

int boxIndex(const std::vector<Box>& boxes, std::string_view name) {
  for (int i = 0; i < (int)boxes.size(); i++)
    if (boxes[i].name == name) return i;
  return -1;
}

}  // namespace sp
