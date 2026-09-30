#pragma once
// A learned playout policy: each legal move is scored by a linear model over
// ~70 cheap features (Nosferatu's own terms taken apart, plus the strategic
// ones it lacks — Labyrinth progress while a Rose is free, Forest, Tavern,
// deck quality, digesting, a real turn-back budget), argmax. Cheap enough to
// replace Nosferatu inside Dracula's thousands of playouts.
//
// Trained by imitating search decisions (train/rollpol.py on `hg polgen` data),
// then improved by expert iteration: Dracula playing out with policy k produces
// the decisions policy k+1 imitates.
#include <string>
#include <vector>

#include "hg/engine.hpp"

namespace hg {

constexpr int POL_FEATURES = 72;
constexpr uint32_t POL_MAGIC = 0x504f4c31;  // "POL1"

struct RollPolicy {
  bool loaded = false;
  float w[POL_FEATURES] = {};
  bool load(const std::string& path);
  bool loadBytes(const uint8_t* data, size_t n);
};

/** Features of `a` for `seat` at `s` (`nosPick` = Nosferatu's choice among `legal`). */
void policyFeatures(const GameState& s, int seat, const Action& a, bool isNos, float* out);

/** The policy's move: argmax of w·φ over `legal`. */
int policyPick(const GameState& s, int seat, const Actions& legal, const RollPolicy& pol);

/** Play `s` to the end with `pol` for every seat (the rival spite rules apply when `rivals`). */
void policyPlayout(GameState& s, const RollPolicy& pol, bool rivals);

}  // namespace hg
