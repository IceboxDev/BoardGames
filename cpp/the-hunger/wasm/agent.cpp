// WebAssembly bridge: the TS server hands a state to the C++ AI as canonical
// text (search/canon.ts) and gets back an index into ITS legal list — the two
// engines enumerate legal actions in the same order, and hg_legal_count lets
// the caller check that the C++ side saw the same number of them.
//
// Built as a WASI reactor (`make wasm`); the TS side is
// packages/core/src/games/the-hunger/search/wasm-agent.ts. Call `_initialize`
// once, then:
//
//   p = hg_alloc(len); <write the UTF-8 text at p>
//   c = hg_alloc(8 * k); <write k doubles at c>
//   idx = hg_pick(p, len, seat, strategy, c, k)   // >= 0, or an HG_E_* code
//   hg_legal_count()                              // legal moves the C++ side saw
//   hg_error_ptr() / hg_error_len()               // message after a negative idx
//   hg_free(p); hg_free(c)
//
// Strategy 0 = Nosferatu (heuristicPick), 1 = Strigoi, 2 = Dracula (Lilith is Dracula
// with `goals` set). The config
// array is read positionally; a missing / NaN entry keeps the C++ default:
//   Strigoi  [rollouts, minPerArm]
//   Dracula  [rollouts, minPerArm, timeMs, tierMargin, turnPlans, maxPlans, survival, rivals, goals, followPlan]
// A new DraculaConfig field is one more entry in draculaConfig() below (and
// in the TS layout, wasm-agent.ts DRACULA_CONFIG_FIELDS) — append, never reorder.
#include <cmath>
#include <cstdlib>
#include <string>

#include "hg/ai.hpp"
#include "hg/canon_parse.hpp"

using namespace hg;

#define HG_EXPORT(name) extern "C" __attribute__((export_name(#name)))

namespace {

enum : int {
  HG_E_PARSE = -1,     // the text is not a canonical state
  HG_E_SEAT = -2,      // seat out of range
  HG_E_NO_LEGAL = -3,  // the seat has no legal action
  HG_E_STRATEGY = -4,  // unknown strategy code
  HG_E_BAD_PICK = -5,  // the AI returned an out-of-range index (a bug)
};

std::string g_error;
int g_legalCount = -1;
GameState g_state;  // ~7 KB: kept off the wasm stack
Actions g_legal;

bool has(const double* cfg, int n, int i) { return cfg && i < n && !std::isnan(cfg[i]); }
void set(int& f, const double* cfg, int n, int i) {
  if (has(cfg, n, i)) f = int(cfg[i]);
}
void set(double& f, const double* cfg, int n, int i) {
  if (has(cfg, n, i)) f = cfg[i];
}
void set(bool& f, const double* cfg, int n, int i) {
  if (has(cfg, n, i)) f = cfg[i] != 0;
}

StrigoiConfig strigoiConfig(const double* cfg, int n) {
  StrigoiConfig c;
  set(c.rollouts, cfg, n, 0);
  set(c.minPerArm, cfg, n, 1);
  return c;
}

DraculaConfig draculaConfig(const double* cfg, int n) {
  DraculaConfig c;
  set(c.rollouts, cfg, n, 0);
  set(c.minPerArm, cfg, n, 1);
  set(c.timeMs, cfg, n, 2);
  set(c.tierMargin, cfg, n, 3);
  set(c.turnPlans, cfg, n, 4);
  set(c.maxPlans, cfg, n, 5);
  set(c.survival, cfg, n, 6);
  set(c.rivals, cfg, n, 7);
  set(c.goals, cfg, n, 8);
  set(c.followPlan, cfg, n, 9);
  return c;
}

int error(int code, std::string msg) {
  g_error = std::move(msg);
  return code;
}

}  // namespace

HG_EXPORT(hg_alloc) void* hg_alloc(size_t n) { return std::malloc(n ? n : 1); }
HG_EXPORT(hg_free) void hg_free(void* p) { std::free(p); }

/** Bumped whenever an export's meaning changes (the TS side checks it). */
HG_EXPORT(hg_abi_version) int hg_abi_version() { return 2; }

HG_EXPORT(hg_legal_count) int hg_legal_count() { return g_legalCount; }
HG_EXPORT(hg_error_ptr) const char* hg_error_ptr() { return g_error.data(); }
HG_EXPORT(hg_error_len) int hg_error_len() { return int(g_error.size()); }

HG_EXPORT(hg_pick)
int hg_pick(const char* text, int len, int seat, int strategy, const double* cfg, int cfgLen) {
  g_error.clear();
  g_legalCount = -1;
  if (!tryParseCanonicalState(text, size_t(len), g_state, &g_error)) return HG_E_PARSE;
  if (seat < 0 || seat >= g_state.nPlayers)
    return error(HG_E_SEAT, "seat " + std::to_string(seat) + " out of range");
  legalActions(g_state, seat, g_legal);
  g_legalCount = int(g_legal.size());
  if (g_legal.empty()) return error(HG_E_NO_LEGAL, "no legal action for seat " + std::to_string(seat));
  int idx;
  switch (strategy) {
    case 0: idx = heuristicPick(g_state, seat, g_legal); break;
    case 1: idx = strigoiPick(g_state, seat, g_legal, strigoiConfig(cfg, cfgLen)); break;
    case 2: idx = draculaPick(g_state, seat, g_legal, draculaConfig(cfg, cfgLen)); break;
    default: return error(HG_E_STRATEGY, "unknown strategy " + std::to_string(strategy));
  }
  if (idx < 0 || idx >= g_legalCount) return error(HG_E_BAD_PICK, "AI index out of range");
  return idx;
}

/**
 * Round trip for tests: parse `text`, re-serialize it into an internal buffer
 * (read it at hg_error_ptr / hg_error_len). Returns the length, or HG_E_PARSE.
 */
HG_EXPORT(hg_canon)
int hg_canon(const char* text, int len) {
  if (!tryParseCanonicalState(text, size_t(len), g_state, &g_error)) return HG_E_PARSE;
  g_error = canonicalState(g_state);
  return int(g_error.size());
}

/**
 * Benchmarks: `n` Nosferatu playouts from the state to sunrise. Returns the
 * sum of the final scores (so the work is observable), or HG_E_PARSE.
 */
HG_EXPORT(hg_playouts)
int hg_playouts(const char* text, int len, int n) {
  if (!tryParseCanonicalState(text, size_t(len), g_state, &g_error)) return HG_E_PARSE;
  int sum = 0;
  for (int i = 0; i < n; i++) {
    GameState g = g_state;
    playout(g);
    for (int k = 0; k < g.nPlayers; k++) sum += g.result.scores[k];
  }
  return sum;
}
