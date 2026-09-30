#include "hg/behave.hpp"

#include <algorithm>
#include <cstdio>

namespace hg {

void SeatStats::add(const SeatStats& o) {
  games += o.games, wins += o.wins, survived += o.survived, score += o.score;
  roses += o.roses, roseTurn += o.roseTurn, labyrinth += o.labyrinth;
  tavernVisits += o.tavernVisits, tavernHunts += o.tavernHunts, tavernCards += o.tavernCards;
  chests += o.chests, digests += o.digests;
  for (int r = 0; r < 5; r++) missionDraws[r] += o.missionDraws[r];
  hunts += o.hunts, humans += o.humans, familiars += o.familiars, powers += o.powers;
  confuse += o.confuse, earlyFamPow += o.earlyFamPow, earlyConfuse += o.earlyConfuse;
  for (int p = 0; p < 3; p++)
    for (int r = 0; r < 5; r++) turnRegion[p][r] += o.turnRegion[p][r];
  maxCastleDist += o.maxCastleDist, parasolTurns += o.parasolTurns;
}

static int phaseOf(int turn) { return turn <= 5 ? EARLY : turn <= 10 ? MID : LATE; }

void BehaviourGame::observe(const GameState& before, int actor, const Action& a,
                            const GameState& after) {
  const BoardData& b = boardOf(after);
  SeatStats& st = seats[actor];
  // A seat's turn starts: where is it?
  for (int i = 0; i < after.nPlayers; i++) {
    bool started = after.hasCurrent && after.current.player == i &&
                   (!before.hasCurrent || before.current.player != i || before.turn != after.turn);
    if (started)
      seats[i].turnRegion[phaseOf(std::min<int>(after.turn, TURNS))][b.spaces[after.players[i].pos].region]++;
    int pos = after.players[i].pos;
    if (pos == b.labyrinth) sawLabyrinth_[i] = true;
    if (pos == b.tavern) sawTavern_[i] = true;
    maxDist_[i] = std::max(maxDist_[i], int(b.castleDist[pos]));
  }
  if (a.type == A_HUNT_ROSE) st.roses++, st.roseTurn += before.turn;
  if (a.type == A_HUNT_TAVERN) st.tavernHunts++, st.tavernCards += before.tavern.size();
  for (int i = 0; i < b.nChests; i++)
    if (before.chests[i] >= 0 && after.chests[i] < 0) st.chests++;
  st.digests += int(after.players[actor].digested.size()) - int(before.players[actor].digested.size());
  if (a.type == A_KEEP_MISSIONS && before.hasCurrent && before.current.pickSource >= 0)
    st.missionDraws[b.spaces[before.current.pickSource].region]++;
  if (a.type == A_HUNT) {
    st.hunts++;
    bool early = before.turn <= 5;
    for (Card c : before.track[a.row][a.col]) {
      const CardDef& d = cardDef(c);
      if (d.type == CT_HUMAN) st.humans++;
      if (d.type == CT_FAMILIAR) st.familiars++, st.earlyFamPow += early;
      if (d.type == CT_POWER) st.powers++, st.earlyFamPow += early;
      if (d.kw & KW_CONFUSE) st.confuse++, st.earlyConfuse += early;
    }
  }
  if (a.type == A_END_TURN && before.hasCurrent && before.current.extraTurn) st.parasolTurns++;
}

void BehaviourGame::finish(const GameState& end) {
  const Result& r = end.result;
  for (int i = 0; i < end.nPlayers; i++) {
    SeatStats& st = seats[i];
    st.games = 1;
    for (int k = 0; k < r.winners.size(); k++)
      if (r.winners[k] == i) st.wins += 1.0 / r.winners.size();
    st.survived = r.breakdown[i].fate != F_ASHES;
    st.score = r.scores[i];
    st.labyrinth = sawLabyrinth_[i];
    st.tavernVisits = sawTavern_[i];
    st.maxCastleDist = maxDist_[i];
  }
}

std::string behaviourTable(const std::vector<std::string>& labels,
                           const std::vector<SeatStats>& stats) {
  std::string out;
  char buf[256];
  auto row = [&](const char* name, auto f, const char* fmt) {
    std::snprintf(buf, sizeof buf, "  %-30s", name);
    out += buf;
    for (const SeatStats& s : stats) {
      double g = std::max(1.0, s.games);
      std::snprintf(buf, sizeof buf, fmt, f(s, g));
      out += buf;
    }
    out += '\n';
  };
  std::snprintf(buf, sizeof buf, "  %-30s", "(per game)");
  out += buf;
  for (const auto& l : labels) {
    std::snprintf(buf, sizeof buf, "%14.14s", l.c_str());
    out += buf;
  }
  out += '\n';
  const char* pct = "%13.1f%%";
  const char* num = "%14.2f";
  row("games", [](const SeatStats& s, double) { return s.games; }, "%14.0f");
  row("win share", [](const SeatStats& s, double g) { return 100 * s.wins / g; }, pct);
  row("survived", [](const SeatStats& s, double g) { return 100 * s.survived / g; }, pct);
  row("score", [](const SeatStats& s, double g) { return s.score / g; }, num);
  row("Rose taken", [](const SeatStats& s, double g) { return 100 * s.roses / g; }, pct);
  row("  mean turn of Rose", [](const SeatStats& s, double) { return s.roses ? s.roseTurn / s.roses : 0; }, num);
  row("reached Labyrinth", [](const SeatStats& s, double g) { return 100 * s.labyrinth / g; }, pct);
  row("reached Tavern", [](const SeatStats& s, double g) { return 100 * s.tavernVisits / g; }, pct);
  row("Tavern hunts", [](const SeatStats& s, double g) { return s.tavernHunts / g; }, num);
  row("Tavern cards", [](const SeatStats& s, double g) { return s.tavernCards / g; }, num);
  row("Chests opened", [](const SeatStats& s, double g) { return s.chests / g; }, num);
  row("cards digested", [](const SeatStats& s, double g) { return s.digests / g; }, num);
  row("Mission draws: Mountains", [](const SeatStats& s, double g) { return s.missionDraws[R_MOUNTAINS] / g; }, num);
  row("Mission draws: Plains", [](const SeatStats& s, double g) { return s.missionDraws[R_PLAINS] / g; }, num);
  row("Mission draws: Forest", [](const SeatStats& s, double g) { return s.missionDraws[R_FOREST] / g; }, num);
  row("hunts (track)", [](const SeatStats& s, double g) { return s.hunts / g; }, num);
  row("  Humans taken", [](const SeatStats& s, double g) { return s.humans / g; }, num);
  row("  Familiars taken", [](const SeatStats& s, double g) { return s.familiars / g; }, num);
  row("  Powers taken", [](const SeatStats& s, double g) { return s.powers / g; }, num);
  row("  Familiar+Power, turns 1-5", [](const SeatStats& s, double g) { return s.earlyFamPow / g; }, num);
  row("  Confuse Humans", [](const SeatStats& s, double g) { return s.confuse / g; }, num);
  row("  Confuse Humans, turns 1-5", [](const SeatStats& s, double g) { return s.earlyConfuse / g; }, num);
  row("furthest from Castle", [](const SeatStats& s, double g) { return s.maxCastleDist / g; }, num);
  row("Parasol turns", [](const SeatStats& s, double g) { return s.parasolTurns / g; }, num);
  const char* phases[3] = {"turns 1-5", "turns 6-10", "turns 11-15"};
  const char* regions[5] = {"Castle", "Cemetery", "Mountains", "Plains", "Forest"};
  for (int p = 0; p < 3; p++)
    for (int r = 1; r < 5; r++) {
      std::snprintf(buf, sizeof buf, "%s in %s", phases[p], regions[r]);
      std::string name = buf;
      row(name.c_str(), [p, r](const SeatStats& s, double) {
        double tot = 0;
        for (int k = 0; k < 5; k++) tot += s.turnRegion[p][k];
        return tot ? 100 * s.turnRegion[p][r] / tot : 0;
      }, pct);
    }
  return out;
}

}  // namespace hg
