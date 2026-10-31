// The input: one physical box per line of boxes.csv, and the name patterns
// every flag uses to point at boxes.
#pragma once
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

#include "sp/box_set.hpp"

namespace sp {

// A problem with what the user gave us (a flag, a CSV line, a file). The
// CLI prints the message and exits with status 2; nothing else catches it.
class InputError : public std::runtime_error {
 public:
  using std::runtime_error::runtime_error;
};

struct Box {
  std::string name;
  int w = 0, l = 0, h = 0;  // mm
  long long vol = 0;        // mm³
};

// `name,width_mm,length_mm,height_mm` per line; blank lines and `#`
// comments are skipped, CRLF is accepted. Names must be unique and use only
// [A-Za-z0-9._-] (they are written into the text formats unquoted).
std::vector<Box> parseBoxesCsv(std::string_view text, std::string_view source);
std::vector<Box> loadBoxesCsv(const std::string& path);

bool isValidBoxName(std::string_view name);

// A pattern is an exact box name, or `PREFIX*` for every name starting with
// PREFIX. Used by every flag that names boxes.
bool nameMatches(std::string_view pattern, std::string_view name);
BoxSet matchBoxes(const std::vector<Box>& boxes, std::string_view pattern);

int boxIndex(const std::vector<Box>& boxes, std::string_view name);  // -1 if unknown

// Strict decimal integer: the whole string, optional leading '-', nothing else.
bool parseInt(std::string_view text, int& out);

std::string readTextFile(const std::string& path);  // throws InputError

}  // namespace sp
