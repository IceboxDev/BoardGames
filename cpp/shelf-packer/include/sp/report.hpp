// What a person reads: the text report (stdout and solutions.txt) and one
// SVG front view per shelf.
#pragma once
#include <iosfwd>
#include <string>
#include <vector>

#include "sp/packings_file.hpp"

namespace sp {

void writeReport(std::ostream& os, const Problem& p, const std::vector<ShelfCandidates>& shelves,
                 const Emitted& e);

// Front view: boxes numbered and labelled, nominal window, reserve bounds,
// floor, and a legend with every box's placed face and raw dimensions.
std::string renderSvg(const Problem& p, const ShelfLayout& layout, const std::string& title);

}  // namespace sp
