// Replay of the TS parity fixtures (scripts/dump-hunger-parity.ts).
#pragma once
#include <string>

namespace hg {

struct ParityReport {
  long files = 0, games = 0, steps = 0;
  long initMismatch = 0;
  long seatMismatch = 0;
  long legalMismatch = 0;     // count or hash of the legal list
  long fullLegalChecks = 0;   // steps with the full list recorded (L lines)
  long hashMismatch = 0;      // stateHash after the action
  long heuristicChecks = 0, heuristicMismatch = 0;
  long detChecks = 0, detMismatch = 0;
  long resultMismatch = 0;
  long strigoiChecks = 0, strigoiAgree = 0;
  long abortedGames = 0;  // a game stops at its first state divergence
  bool ok() const {
    return initMismatch + seatMismatch + legalMismatch + hashMismatch + heuristicMismatch +
                   detMismatch + resultMismatch + abortedGames ==
               0 &&
           (strigoiChecks == 0 || strigoiAgree * 100 >= strigoiChecks * 99);
  }
};

struct ParityOptions {
  bool verbose = false;
  bool strigoi = true;  // re-run Strigoi on T lines (slow-ish)
  int maxErrors = 20;   // detailed messages printed
};

/** Replays every *.txt fixture in `dir`. */
ParityReport runParity(const std::string& dir, const ParityOptions& opt = {});
void printReport(const ParityReport& r);

}  // namespace hg
