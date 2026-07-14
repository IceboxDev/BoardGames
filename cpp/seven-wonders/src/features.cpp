#include <cassert>

#include "sw/board.hpp"
#include "sw/net.hpp"
#include "sw/wonders.hpp"

namespace sw {

static void scienceCounts(const PlayerState& p, int sci[3], int& wild) {
  sci[0] = sci[1] = sci[2] = 0;
  wild = 0;
  auto scan = [&](const Effect& e) {
    if (e.kind == EffectKind::Science) sci[e.science]++;
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

void encodeFeatures(const GameState& st, int perspective, float* out) {
  int idx = 0;

  // Per-seat blocks, in seat-relative order (self, +1, +2, ...).
  for (int k = 0; k < N; k++) {
    const PlayerState& p = st.players[(perspective + k) % N];
    int sci[3], wild, milSum = 0;
    scienceCounts(p, sci, wild);
    for (int m = 0; m < p.numTokens; m++) milSum += p.militaryTokens[m];

    out[idx++] = p.coins / 20.0f;
    out[idx++] = p.stagesBuilt / 4.0f;
    out[idx++] = countShields(p) / 10.0f;
    out[idx++] = sci[0] / 5.0f;
    out[idx++] = sci[1] / 5.0f;
    out[idx++] = sci[2] / 5.0f;
    out[idx++] = wild / 3.0f;
    for (int c = 0; c < NUM_COLORS; c++) out[idx++] = countColor(p, c) / 10.0f;
    out[idx++] = milSum / 15.0f;
    out[idx++] = p.numTableau / 20.0f;
    out[idx++] = p.bonusShields / 5.0f;
    out[idx++] = p.numVictory / 8.0f;
    out[idx++] = p.numDebt / 8.0f;
  }

  // Perspective seat's hand as a card-type presence vector.
  int handStart = idx;
  for (int i = 0; i < NUM_CARD_TYPES; i++) out[idx++] = 0.0f;
  for (int h = 0; h < st.handCount[perspective]; h++)
    out[handStart + st.hands[perspective][h]] = 1.0f;

  // Age one-hot (1..3), turn one-hot (1..6).
  for (int a = 1; a <= 3; a++) out[idx++] = st.age == a ? 1.0f : 0.0f;
  for (int t = 1; t <= 6; t++) out[idx++] = st.turn == t ? 1.0f : 0.0f;

  // Misc: discard size, edifice present, current-age edifice status one-hot.
  out[idx++] = st.discardCount / 60.0f;
  out[idx++] = st.edificeCount > 0 ? 1.0f : 0.0f;
  EdStatus es = st.edificeCount > 0 ? st.edifices[st.age - 1].status : EdStatus::Project;
  out[idx++] = (st.edificeCount > 0 && es == EdStatus::Project) ? 1.0f : 0.0f;
  out[idx++] = (st.edificeCount > 0 && es == EdStatus::Built) ? 1.0f : 0.0f;
  out[idx++] = (st.edificeCount > 0 && es == EdStatus::Failed) ? 1.0f : 0.0f;

  assert(idx == FEAT_DIM);
  (void)idx;
}

}  // namespace sw
