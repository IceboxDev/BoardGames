// The one text form of a pile, shared by the human report, packings.txt and
// the column library:
//
//   pile := cell (' ' cell)*            cells bottom to top as stored
//   cell := '[' unit (' | ' unit)* ']'  units left to right
//   unit := box (' + ' box)*            bottom box first
//   box  := NAME ' ' FW 'x' FH ' d' DEPTH
//
// Parsing yields only what the text says; candidates.cpp decides whether
// that still describes a legal pile for the current boxes and rules.
#pragma once
#include <string>
#include <string_view>
#include <vector>

#include "sp/boxes.hpp"
#include "sp/model.hpp"

namespace sp {

struct BoxSpec {
  std::string name;
  int fw = 0, fh = 0, d = 0;
};
using UnitSpec = std::vector<BoxSpec>;  // bottom box first
using CellSpec = std::vector<UnitSpec>;
using PileSpec = std::vector<CellSpec>;

std::string formatCell(const Cell& cell, const std::vector<Box>& boxes);
std::string formatPile(const Pile& pile, const std::vector<Cell>& cells,
                       const std::vector<Box>& boxes);

// Throws InputError (message without location; callers add file:line).
PileSpec parsePile(std::string_view text);

}  // namespace sp
