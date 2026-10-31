// One run, start to finish: candidates → (warm / library piles) → search →
// arrangement → output files. Returns the process exit status.
#pragma once
#include "sp/cli.hpp"

namespace sp {

int runPacker(const Config& cfg);

}  // namespace sp
