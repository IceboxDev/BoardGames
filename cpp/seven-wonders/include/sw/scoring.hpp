// Final scoring — port of scoring.ts. 7 base categories + edifice, science
// wildcard optimization, copy-guild (Olympia B), and winner/tiebreak.
#pragma once
#include "sw/state.hpp"

namespace sw {

struct ScoreBreakdown {
  int military = 0;
  int coins = 0;
  int wonder = 0;
  int civilian = 0;
  int commercial = 0;
  int guilds = 0;
  int science = 0;
  int edifice = 0;
  int total = 0;
};

struct GameResult {
  ScoreBreakdown breakdowns[N];
  int totals[N];
  int winner;
};

// n^2 per symbol + 7 per complete set of 3; wildcards brute-forced for the max.
int scoreScience(const int counts[3], int wildcards);

GameResult scoreFinal(const GameState& st);

}  // namespace sw
