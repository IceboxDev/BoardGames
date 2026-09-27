// Canonical text -> GameState: the exact inverse of canonicalState()
// (src/canon.cpp, search/canon.ts). The TS server hands a live state to the
// C++ search through this text (wasm/agent.cpp), so the parser accepts ONLY
// the writer's bytes — fixed key order, no whitespace, no escapes — and
// rejects anything else with a message naming the offset.
#pragma once
#include <string>

#include "hg/state.hpp"

namespace hg {

/**
 * Parse without aborting: false (and `*err`, when given, says why and where)
 * on malformed text, an unknown id, a count past a capacity or a structure the
 * writer cannot produce. `out` is fully overwritten on success.
 */
bool tryParseCanonicalState(const char* text, size_t len, GameState& out, std::string* err);

/** Parse, aborting (hg::fail) on malformed input. */
GameState parseCanonicalState(const std::string& text);

}  // namespace hg
