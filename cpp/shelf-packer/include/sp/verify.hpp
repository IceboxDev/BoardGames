// `--verify DIR`: re-check a run's packings.txt against boxes.csv and the
// rules, from the written geometry alone — none of the search's state. It
// catches anything between the search and the file: stale library columns,
// wrong offsets, overlaps, floating boxes, broken groups.
#pragma once
#include <iosfwd>
#include <string>

#include "sp/problem.hpp"

namespace sp {

// Prints one line per problem found; returns how many there were.
int verifyPackings(const Problem& p, const std::string& dir, std::ostream& out);

}  // namespace sp
