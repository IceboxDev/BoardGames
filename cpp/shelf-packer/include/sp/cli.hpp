// Command line → Config. Every flag, its value and every box name it
// mentions is checked here; anything wrong is an InputError (exit 2), never
// a silently ignored flag.
#pragma once
#include <string>
#include <vector>

#include "sp/problem.hpp"
#include "sp/tuning.hpp"

namespace sp {

struct RunOptions {
  int solutions = 8;
  uint64_t seed = tuning::kSearchSeed;  // same seed, same flags → same result
  std::string outDir = "out";
  std::vector<std::string> warmDirs;
  std::string libraryPath;
  std::string verifyDir;  // set: check DIR/packings.txt instead of searching
  bool pilesOnly = false; // debug: stop after building the candidates
};

struct Config {
  bool help = false;
  std::string boxesPath;
  Problem problem;
  RunOptions run;
};

Config parseCommandLine(const std::vector<std::string>& args);
std::string usage();

}  // namespace sp
