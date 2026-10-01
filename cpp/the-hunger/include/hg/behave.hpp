#pragma once
// Behaviour report: what a seat DID over a game — Roses, Tavern, Chests,
// digesting, where Missions came from, which cards it hunted and when, where it
// spent the night. Collected by diffing the state around every action, so any
// strategy can be measured without instrumenting it. `hg behave` prints it; the
// same definitions are computed from prod replay logs by scripts/hunger-replay.ts.
#include <string>
#include <vector>

#include "hg/engine.hpp"

namespace hg {

enum Phase3 { EARLY, MID, LATE };  // turns 1–5, 6–10, 11–15 (+ Parasol)

struct SeatStats {
  double games = 0, wins = 0, survived = 0, score = 0;
  double roses = 0, roseTurn = 0;       // Rose taken; sum of the turn it was taken
  double labyrinth = 0, tavernVisits = 0;  // games that reached the space at least once
  double tavernHunts = 0, tavernCards = 0;
  double chests = 0, digests = 0;
  double missionDraws[5] = {};  // by Crypt region (R_* index)
  double hunts = 0, humans = 0, familiars = 0, powers = 0, confuse = 0;
  double earlyFamPow = 0, earlyConfuse = 0;  // hunted in turns 1–5
  double turnRegion[3][5] = {};              // turn starts per phase × region
  double maxCastleDist = 0;                  // furthest from the Castle (sum over games)
  double parasolTurns = 0;
  void add(const SeatStats& o);
};

/** Accumulates one game's per-seat stats; call observe() around every apply(). */
class BehaviourGame {
 public:
  explicit BehaviourGame(int players) : seats(players) {}
  void observe(const GameState& before, int actor, const Action& a, const GameState& after);
  /** Call once the game is over (fills result fields). */
  void finish(const GameState& end);
  std::vector<SeatStats> seats;

 private:
  std::vector<bool> sawLabyrinth_ = std::vector<bool>(6), sawTavern_ = std::vector<bool>(6);
  std::vector<int> maxDist_ = std::vector<int>(6);
};

/** A printed table: one column per label, one row per metric (per game). */
std::string behaviourTable(const std::vector<std::string>& labels,
                           const std::vector<SeatStats>& stats);

}  // namespace hg
