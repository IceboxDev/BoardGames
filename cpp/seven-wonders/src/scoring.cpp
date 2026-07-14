#include "sw/scoring.hpp"

#include <algorithm>

#include "sw/board.hpp"
#include "sw/edifice.hpp"
#include "sw/wonders.hpp"

namespace sw {

int scoreScience(const int counts[3], int wildcards) {
  if (wildcards == 0) {
    int sum = 0, mn = counts[0];
    for (int i = 0; i < 3; i++) {
      sum += counts[i] * counts[i];
      mn = std::min(mn, counts[i]);
    }
    return sum + 7 * mn;
  }
  int best = 0;
  for (int s = 0; s < 3; s++) {
    int c[3] = {counts[0], counts[1], counts[2]};
    c[s]++;
    best = std::max(best, scoreScience(c, wildcards - 1));
  }
  return best;
}

static void scienceProfile(const PlayerState& p, int counts[3], int& wild) {
  counts[0] = counts[1] = counts[2] = 0;
  wild = 0;
  auto scan = [&](const Effect& e) {
    if (e.kind == EffectKind::Science) counts[e.science]++;
    if (e.kind == EffectKind::ScienceWildcard) wild++;
  };
  for (int t = 0; t < p.numTableau; t++) {
    const Card& c = cardType(p.tableau[t]);
    for (int e = 0; e < c.numEffects; e++) scan(c.effects[e]);
  }
  const WonderSide& ws = wonderSide(p.wonderId, p.side);
  for (int s = 0; s < p.stagesBuilt; s++)
    for (int e = 0; e < ws.stages[s].numEffects; e++) scan(ws.stages[s].effects[e]);
}

static int endGamePoints(const Effect& e, const GameState& st, int pi) {
  switch (e.kind) {
    case EffectKind::Points:
      return e.amount;
    case EffectKind::PointsPerCard:
      return e.amount *
             scopedSum(st, pi, e.scopes, [&](const PlayerState& p) { return countColor(p, e.color); });
    case EffectKind::PointsPerStage:
      return e.amount *
             scopedSum(st, pi, e.scopes, [&](const PlayerState& p) { return int(p.stagesBuilt); });
    case EffectKind::PointsPerDefeat:
      return e.amount * scopedSum(st, pi, e.scopes, [&](const PlayerState& p) {
               int n = 0;
               for (int k = 0; k < p.numTokens; k++)
                 if (p.militaryTokens[k] < 0) n++;
               return n;
             });
    default:
      return 0;
  }
}

// A single purple card's end-game value on player pi's board (wildcard = science delta).
static int guildValue(const Card& c, const GameState& st, int pi) {
  int val = 0;
  int counts[3], wild;
  bool profiled = false;
  for (int e = 0; e < c.numEffects; e++) {
    if (c.effects[e].kind == EffectKind::ScienceWildcard) {
      if (!profiled) {
        scienceProfile(st.players[pi], counts, wild);
        profiled = true;
      }
      val += scoreScience(counts, wild + 1) - scoreScience(counts, wild);
    } else {
      val += endGamePoints(c.effects[e], st, pi);
    }
  }
  return val;
}

static int bestGuildValue(const GameState& st, int pi, bool own) {
  int best = 0;
  auto scan = [&](const PlayerState& src) {
    for (int t = 0; t < src.numTableau; t++) {
      const Card& c = cardType(src.tableau[t]);
      if (c.color != Purple) continue;
      best = std::max(best, guildValue(c, st, pi));
    }
  };
  if (own) {
    scan(st.players[pi]);
  } else {
    scan(st.players[leftOf(pi)]);
    scan(st.players[rightOf(pi)]);
  }
  return best;
}

static int distinctColors(const PlayerState& p) {
  uint8_t mask = 0;
  for (int t = 0; t < p.numTableau; t++) mask |= uint8_t(1u << cardType(p.tableau[t]).color);
  return __builtin_popcount(mask);
}

static bool participant(const EdSlot& ed, int pi) {
  for (int i = 0; i < ed.numParticipants; i++)
    if (ed.participants[i] == pi) return true;
  return false;
}

static int scoreEdifice(const GameState& st, int pi) {
  const PlayerState& p = st.players[pi];
  int pts = 0;
  for (int k = 0; k < p.numVictory; k++) pts += p.victoryTokens[k];
  for (int k = 0; k < p.numDebt; k++) pts += p.debtTokens[k];
  for (int e = 0; e < st.edificeCount; e++) {
    const EdSlot& slot = st.edifices[e];
    if (slot.status != EdStatus::Built || !participant(slot, pi)) continue;
    const Edifice& def = EDIFICES[slot.edificeId];
    for (int r = 0; r < def.numRewards; r++) {
      switch (def.rewards[r].kind) {
        case EdRewardKind::PointsPerWonderStage: pts += p.stagesBuilt; break;
        case EdRewardKind::PointsPerBlue: pts += countColor(p, Blue); break;
        case EdRewardKind::PointsPerColor: pts += distinctColors(p); break;
        case EdRewardKind::PointsPerBrownGreySet:
          pts += def.rewards[r].amount * std::min(countColor(p, Brown), countColor(p, Grey));
          break;
        case EdRewardKind::DuplicateGuild: pts += bestGuildValue(st, pi, /*own=*/true); break;
        default: break;  // coins/shield/token/production resolved at construction
      }
    }
  }
  return pts;
}

GameResult scoreFinal(const GameState& st) {
  GameResult res;
  for (int i = 0; i < N; i++) {
    const PlayerState& p = st.players[i];

    int military = 0;
    for (int k = 0; k < p.numTokens; k++) military += p.militaryTokens[k];
    int coins = p.coins / 3;  // coins are always >= 0 (penalties take debt)

    int wonder = 0, civ = 0, com = 0, guilds = 0;
    for (int t = 0; t < p.numTableau; t++) {
      const Card& c = cardType(p.tableau[t]);
      for (int e = 0; e < c.numEffects; e++) {
        int pts = endGamePoints(c.effects[e], st, i);
        if (c.color == Blue)
          civ += pts;
        else if (c.color == Yellow)
          com += pts;
        else if (c.color == Purple)
          guilds += pts;
      }
    }
    const WonderSide& ws = wonderSide(p.wonderId, p.side);
    for (int s = 0; s < p.stagesBuilt; s++)
      for (int e = 0; e < ws.stages[s].numEffects; e++)
        wonder += endGamePoints(ws.stages[s].effects[e], st, i);
    if (hasBuiltStageEffect(p, EffectKind::CopyGuild)) guilds += bestGuildValue(st, i, /*own=*/false);

    int counts[3], wild;
    scienceProfile(p, counts, wild);
    int science = scoreScience(counts, wild);
    int edifice = scoreEdifice(st, i);

    int total = military + coins + wonder + civ + com + guilds + science + edifice;
    res.breakdowns[i] = {military, coins, wonder, civ, com, guilds, science, edifice, total};
    res.totals[i] = total;
  }

  int winner = 0;
  for (int i = 1; i < N; i++) {
    bool better = res.totals[i] > res.totals[winner] ||
                  (res.totals[i] == res.totals[winner] &&
                   st.players[i].coins > st.players[winner].coins);
    if (better) winner = i;
  }
  res.winner = winner;
  return res;
}

}  // namespace sw
