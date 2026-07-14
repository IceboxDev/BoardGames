// sw7 — demo/benchmark harness for the 7 Wonders engine.
//   sw7 deal <seed> [edifice]     print the dealt game
//   sw7 moves <seed> [player]     list legal moves at the opening position
//   sw7 playout <seed> [edifice]  random self-play to game-over, print scores
//   sw7 bench [games]             throughput: full random playouts/sec + moves/sec
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <vector>

#include "sw/edifice.hpp"
#include "sw/engine.hpp"
#include "sw/heuristic.hpp"
#include "sw/mcts.hpp"
#include "sw/rng.hpp"
#include "sw/rules.hpp"
#include "sw/scoring.hpp"
#include "sw/setup.hpp"
#include "sw/wonders.hpp"

using namespace sw;

static const char* cardName(int typeId) { return nameOf(cardType(typeId).nameId); }

static void printMove(const Move& m, const GameState& st, int player) {
  const char* c = m.kind == MoveKind::PickDiscard  ? cardName(st.discard[m.card])
                  : m.kind == MoveKind::SkipPending ? "-"
                                                    : cardName(st.hands[player][m.card]);
  const char* s = m.seventh ? "[7th] " : "";
  switch (m.kind) {
    case MoveKind::Discard: std::printf("  %sdiscard %s\n", s, c); break;
    case MoveKind::PlayCard:
      if (m.pay == PayKind::Resources)
        std::printf("  %splay %s (pay L%d R%d)\n", s, c, m.payLeft, m.payRight);
      else if (m.pay == PayKind::Chain)
        std::printf("  %splay %s (chain)\n", s, c);
      else
        std::printf("  %splay %s (free)\n", s, c);
      break;
    case MoveKind::BuildWonder:
      std::printf("  %sbuild-wonder w/ %s (pay L%d R%d)%s\n", s, c, m.payLeft, m.payRight,
                  m.participate ? " +edifice" : "");
      break;
    case MoveKind::PickDiscard: std::printf("  pick-discard %s\n", c); break;
    case MoveKind::SkipPending: std::printf("  skip\n"); break;
  }
}

static void printState(const GameState& st) {
  std::printf("Age %d, Turn %d\n", st.age, st.turn);
  for (int i = 0; i < N; i++) {
    const PlayerState& p = st.players[i];
    std::printf("  P%d %-32s [%c]  coins=%d stages=%d\n", i, WONDER_NAMES[p.wonderId],
                p.side ? 'B' : 'A', p.coins, p.stagesBuilt);
    std::printf("     hand:");
    for (int k = 0; k < st.handCount[i]; k++) std::printf(" %s,", cardName(st.hands[i][k]));
    std::printf("\n");
  }
}

static Move randomLegal(const GameState& st, int player, Rng& rng) {
  MoveBuffer b;
  legalActions(st, player, b);
  return b.moves[rng.below(b.count)];
}

static GameResult playout(uint32_t seed, bool edifice, uint64_t& moves) {
  GameState st = createInitialState(seed, SideMode::Random, edifice);
  Rng rng(seed ^ 0x811c9dc5u);
  while (!isGameOver(st)) {
    if (st.phase == Phase::Selecting) {
      for (int i = 0; i < N; i++)
        if (!st.hasSelection[i]) {
          applySelection(st, i, randomLegal(st, i, rng));
          moves++;
        }
      if (st.phase == Phase::Revealing) applyReveal(st);
    } else if (st.phase == Phase::Revealing) {
      applyReveal(st);
    } else {
      int ap = activePlayer(st);
      applyPendingAction(st, ap, randomLegal(st, ap, rng));
      moves++;
    }
  }
  return scoreFinal(st);
}

static int cmdDeal(uint32_t seed, bool edifice) {
  GameState st = createInitialState(seed, SideMode::Random, edifice);
  printState(st);
  return 0;
}

static int cmdMoves(uint32_t seed, int player) {
  GameState st = createInitialState(seed, SideMode::Random, false);
  MoveBuffer b;
  legalActions(st, player, b);
  std::printf("P%d legal moves at opening (%d):\n", player, b.count);
  for (int i = 0; i < b.count; i++) printMove(b.moves[i], st, player);
  return 0;
}

static int cmdPlayout(uint32_t seed, bool edifice) {
  uint64_t moves = 0;
  GameResult r = playout(seed, edifice, moves);
  std::printf("Final scores (seed %u%s):\n", seed, edifice ? ", edifice" : "");
  for (int i = 0; i < N; i++) {
    const ScoreBreakdown& s = r.breakdowns[i];
    std::printf("  P%d total=%3d  [mil %d, coin %d, won %d, civ %d, com %d, gld %d, sci %d, ed %d]%s\n",
                i, s.total, s.military, s.coins, s.wonder, s.civilian, s.commercial, s.guilds,
                s.science, s.edifice, i == r.winner ? "  <- winner" : "");
  }
  return 0;
}

static int cmdBench(int games) {
  using clock = std::chrono::steady_clock;
  uint64_t moves = 0;
  volatile int sink = 0;
  auto t0 = clock::now();
  for (int g = 0; g < games; g++) {
    GameResult r = playout(uint32_t(g) * 2654435761u + 1u, g & 1, moves);
    sink += r.totals[r.winner];
  }
  auto t1 = clock::now();
  double sec = std::chrono::duration<double>(t1 - t0).count();
  std::printf("bench: %d full games in %.3f s\n", games, sec);
  std::printf("  %.0f games/sec\n", games / sec);
  std::printf("  %.2f M moves/sec  (%llu moves total)\n", moves / sec / 1e6,
              (unsigned long long)moves);
  (void)sink;
  return 0;
}

// Per-seat rank reward in [0,1] (matches the search's reward signal).
static void rankRewards(const GameState& st, double out[N]) {
  GameResult r = scoreFinal(st);
  for (int i = 0; i < N; i++) {
    double b = 0;
    for (int j = 0; j < N; j++) {
      if (j == i) continue;
      if (r.totals[i] > r.totals[j]) b += 1;
      else if (r.totals[i] == r.totals[j]) b += 0.5;
    }
    out[i] = b / (N - 1);
  }
}

// Seat 0 = MCTS (net if given), seats 1..4 = uniform random. dets>1 => the seat-0
// agent is imperfect-information (ensemble over `dets` determinizations).
static int cmdEvalAgent(int games, int iters, const Net* net, const char* label, int dets) {
  int rankHist[N] = {};
  int wins = 0;
  double rankSum = 0;
  Rng rng(0xEEEE01u);
  MctsConfig cfg;
  cfg.iterations = iters;
  auto seat0Move = [&](const GameState& st) {
    return dets > 1 ? ismctsChooseMove(st, 0, cfg, net, dets) : mctsChooseMove(st, 0, cfg, net);
  };
  for (int g = 0; g < games; g++) {
    GameState st = createInitialState(uint32_t(g) * 2654435761u + 1u, SideMode::Random, false);
    while (!isGameOver(st)) {
      if (st.phase == Phase::Selecting) {
        for (int i = 0; i < N; i++)
          if (!st.hasSelection[i]) {
            Move m;
            if (i == 0) {
              cfg.seed = 0x1234u + uint32_t(g) * 131u + st.turn * 17u + st.age;
              m = seat0Move(st);
            } else {
              MoveBuffer b;
              legalActions(st, i, b);
              m = b.moves[rng.below(b.count)];
            }
            applySelection(st, i, m);
          }
        if (st.phase == Phase::Revealing) applyReveal(st);
      } else if (st.phase == Phase::Revealing) {
        applyReveal(st);
      } else {
        int ap = activePlayer(st);
        Move m;
        if (ap == 0) {
          cfg.seed = 0x99u + uint32_t(g) * 7u + st.turn;
          m = seat0Move(st);
        } else {
          MoveBuffer b;
          legalActions(st, ap, b);
          m = b.moves[rng.below(b.count)];
        }
        applyPendingAction(st, ap, m);
      }
    }
    GameResult r = scoreFinal(st);
    int better = 0;
    for (int j = 1; j < N; j++)
      if (r.totals[j] > r.totals[0]) better++;
    rankHist[better]++;
    rankSum += better + 1;
    if (r.winner == 0) wins++;
  }
  std::printf("%s(seat 0, %d iters%s) vs 4 random  —  %d games\n", label, iters,
              dets > 1 ? ", imperfect-info" : "", games);
  std::printf("  win rate: %.1f%%   (random baseline 20.0%%)\n", 100.0 * wins / games);
  std::printf("  avg rank: %.2f     (1=best..5=worst; random baseline 3.00)\n", rankSum / games);
  std::printf("  finishes: ");
  for (int k = 0; k < N; k++) std::printf("%d%s=%d ", k + 1, k == 0 ? "st" : "th", rankHist[k]);
  std::printf("\n");
  return 0;
}

// Seat 0 = search agent (net if given, dets>1 = imperfect-info); seats 1..4 =
// diverse heuristic archetypes (the held-out population). onlyStyle>=0 makes seat
// 0 itself that heuristic (baseline reference), ignoring the search.
static int cmdEvalPop(int games, int iters, const Net* net, int dets, int seat0Style,
                      const char* label) {
  int rankHist[N] = {};
  int wins = 0;
  double rankSum = 0;
  Rng rng(0x9911u);
  MctsConfig cfg;
  cfg.iterations = iters;
  auto seat0Move = [&](const GameState& st) {
    if (seat0Style >= 0) return heuristicMove(st, 0, Style(seat0Style), rng);
    return dets > 1 ? ismctsChooseMove(st, 0, cfg, net, dets) : mctsChooseMove(st, 0, cfg, net);
  };
  for (int g = 0; g < games; g++) {
    GameState st = createInitialState(uint32_t(g) * 2654435761u + 1u, SideMode::Random, false);
    Style sty[N];
    for (int j = 1; j < N; j++) sty[j] = Style((g + j) % NUM_STYLES);
    while (!isGameOver(st)) {
      if (st.phase == Phase::Selecting) {
        for (int i = 0; i < N; i++)
          if (!st.hasSelection[i]) {
            Move m;
            if (i == 0) {
              cfg.seed = 0x1234u + uint32_t(g) * 131u + st.turn * 17u + st.age;
              m = seat0Move(st);
            } else {
              m = heuristicMove(st, i, sty[i], rng);
            }
            applySelection(st, i, m);
          }
        if (st.phase == Phase::Revealing) applyReveal(st);
      } else if (st.phase == Phase::Revealing) {
        applyReveal(st);
      } else {
        int ap = activePlayer(st);
        Move m;
        if (ap == 0) {
          cfg.seed = 0x99u + uint32_t(g) * 7u + st.turn;
          m = seat0Move(st);
        } else {
          m = heuristicMove(st, ap, sty[ap], rng);
        }
        applyPendingAction(st, ap, m);
      }
    }
    GameResult r = scoreFinal(st);
    int better = 0;
    for (int j = 1; j < N; j++)
      if (r.totals[j] > r.totals[0]) better++;
    rankHist[better]++;
    rankSum += better + 1;
    if (r.winner == 0) wins++;
  }
  std::printf("%s(seat 0) vs 4 heuristic archetypes  —  %d games\n", label, games);
  std::printf("  win rate: %.1f%%   (even share = 20.0%%)\n", 100.0 * wins / games);
  std::printf("  avg rank: %.2f     (1=best..5=worst)\n", rankSum / games);
  std::printf("  finishes: ");
  for (int k = 0; k < N; k++) std::printf("%d%s=%d ", k + 1, k == 0 ? "st" : "th", rankHist[k]);
  std::printf("\n");
  return 0;
}

// Generate AlphaZero-style self-play samples (features, MCTS policy target,
// per-seat outcome) to a binary file. Rollout mode if no weights, else PUCT.
static int cmdSelfPlay(int games, int iters, const char* out, const char* weights, uint32_t seed) {
  Net net;
  const Net* netP = (weights && net.load(weights)) ? &net : nullptr;
  std::fprintf(stderr, "selfplay: %s mode, %d games x %d iters\n",
               netP ? "PUCT(net)" : "rollout(M0)", games, iters);
  MctsConfig cfg;
  cfg.iterations = iters;
  Rng rng(seed);
  std::vector<float> F, P, V;  // struct-of-arrays for the sample file
  int nSamples = 0;

  for (int g = 0; g < games; g++) {
    bool edifice = (g % 2) == 0;
    GameState st = createInitialState(rng.s ^ (uint32_t(g) * 2654435761u + 1u), SideMode::Random, edifice);
    struct Smp { std::vector<float> f, p; int seat; };
    std::vector<Smp> gs;

    while (!isGameOver(st)) {
      if (st.phase == Phase::Selecting) {
        cfg.seed = rng.s ^ (uint32_t(g) * 7919u + st.age * 131u + st.turn * 17u);
        cfg.temperature = st.turn <= 2 ? 1.0 : 0.5;
        RootStats r = mctsSearch(st, cfg, netP);
        int chosen[N] = {};
        for (int a = 0; a < r.numActive; a++) {
          int seat = r.active[a];
          const auto& mv = r.moves[seat];
          const auto& nv = r.visits[seat];
          int total = 0;
          for (int v : nv) total += v;
          Smp s;
          s.seat = seat;
          s.f.resize(FEAT_DIM);
          encodeFeatures(st, seat, s.f.data());
          s.p.assign(POLICY_DIM, 0.0f);
          for (size_t i = 0; i < mv.size(); i++) s.p[policyIndex(st, seat, mv[i])] += nv[i];
          if (total > 0)
            for (float& x : s.p) x /= total;
          gs.push_back(std::move(s));
          // sample this seat's move ~ visits^(1/T)
          double T = cfg.temperature > 0 ? cfg.temperature : 1e-3;
          double tot = 0;
          std::vector<double> w(nv.size());
          for (size_t i = 0; i < nv.size(); i++) {
            w[i] = std::pow(double(nv[i]) + 1e-9, 1.0 / T);
            tot += w[i];
          }
          double pick = rng.next() * tot, acc = 0;
          int ci = int(nv.size()) - 1;
          for (size_t i = 0; i < nv.size(); i++) {
            acc += w[i];
            if (pick <= acc) { ci = int(i); break; }
          }
          chosen[seat] = ci;
        }
        for (int a = 0; a < r.numActive; a++) {
          int seat = r.active[a];
          applySelection(st, seat, r.moves[seat][chosen[seat]]);
        }
        if (st.phase == Phase::Revealing) applyReveal(st);
      } else if (st.phase == Phase::Revealing) {
        applyReveal(st);
      } else {
        int ap = activePlayer(st);
        cfg.seed = rng.s ^ (uint32_t(g) * 331u + st.turn);
        cfg.temperature = 0.0;
        applyPendingAction(st, ap, mctsChooseMove(st, ap, cfg, netP));
      }
    }

    double rew[N];
    rankRewards(st, rew);
    for (auto& s : gs) {
      for (float x : s.f) F.push_back(x);
      for (float x : s.p) P.push_back(x);
      for (int k = 0; k < N; k++) V.push_back(float(rew[(s.seat + k) % N]));
      nSamples++;
    }
    if ((g + 1) % 10 == 0)
      std::fprintf(stderr, "  game %d/%d, %d samples\n", g + 1, games, nSamples);
  }

  std::FILE* f = std::fopen(out, "wb");
  if (!f) {
    std::fprintf(stderr, "cannot open %s\n", out);
    return 1;
  }
  uint32_t magic = 0x53575350u;  // "SWSP"
  int32_t hdr[4] = {nSamples, FEAT_DIM, POLICY_DIM, VALUE_DIM};
  std::fwrite(&magic, 4, 1, f);
  std::fwrite(hdr, 4, 4, f);
  std::fwrite(F.data(), 4, F.size(), f);
  std::fwrite(P.data(), 4, P.size(), f);
  std::fwrite(V.data(), 4, V.size(), f);
  std::fclose(f);
  std::printf("wrote %d samples -> %s\n", nSamples, out);
  return 0;
}

// Population self-play: seat 0 = learner (search, samples collected); seats 1..4
// = heuristic archetypes. Shifts the training distribution onto realistic
// opponents so the net learns a robust best-response (PSRO-lite).
static int cmdSelfPlayPop(int games, int iters, const char* out, const char* weights,
                          uint32_t seed) {
  Net net;
  const Net* netP = (weights && net.load(weights)) ? &net : nullptr;
  std::fprintf(stderr, "selfplay-pop: %s learner vs heuristic archetypes, %d games x %d iters\n",
               netP ? "PUCT(net)" : "rollout(M0)", games, iters);
  MctsConfig cfg;
  cfg.iterations = iters;
  Rng rng(seed);
  std::vector<float> F, P, V;
  int nSamples = 0;

  for (int g = 0; g < games; g++) {
    bool edifice = (g % 2) == 0;
    GameState st = createInitialState(rng.s ^ (uint32_t(g) * 2654435761u + 1u), SideMode::Random, edifice);
    Style sty[N];
    for (int j = 1; j < N; j++) sty[j] = Style((g + j) % NUM_STYLES);
    struct Smp { std::vector<float> f, p; };
    std::vector<Smp> gs;

    while (!isGameOver(st)) {
      if (st.phase == Phase::Selecting) {
        cfg.seed = rng.s ^ (uint32_t(g) * 7919u + st.age * 131u + st.turn * 17u);
        cfg.temperature = st.turn <= 2 ? 1.0 : 0.5;
        RootStats r = mctsSearch(st, cfg, netP);  // learner = seat 0
        const auto& mv = r.moves[0];
        const auto& nv = r.visits[0];
        int total = 0;
        for (int v : nv) total += v;
        Smp s;
        s.f.resize(FEAT_DIM);
        encodeFeatures(st, 0, s.f.data());
        s.p.assign(POLICY_DIM, 0.0f);
        for (size_t i = 0; i < mv.size(); i++) s.p[policyIndex(st, 0, mv[i])] += nv[i];
        if (total > 0)
          for (float& x : s.p) x /= total;
        gs.push_back(std::move(s));
        // seat 0 plays a sampled move; opponents play their archetype.
        double T = cfg.temperature, tot = 0;
        std::vector<double> w(nv.size());
        for (size_t i = 0; i < nv.size(); i++) {
          w[i] = std::pow(double(nv[i]) + 1e-9, 1.0 / T);
          tot += w[i];
        }
        double pick = rng.next() * tot, acc = 0;
        int ci = int(nv.size()) - 1;
        for (size_t i = 0; i < nv.size(); i++) {
          acc += w[i];
          if (pick <= acc) { ci = int(i); break; }
        }
        for (int i = 0; i < N; i++)
          if (!st.hasSelection[i])
            applySelection(st, i, i == 0 ? mv[ci] : heuristicMove(st, i, sty[i], rng));
        if (st.phase == Phase::Revealing) applyReveal(st);
      } else if (st.phase == Phase::Revealing) {
        applyReveal(st);
      } else {
        int ap = activePlayer(st);
        Move m;
        if (ap == 0) {
          cfg.seed = rng.s ^ (uint32_t(g) * 331u + st.turn);
          cfg.temperature = 0.0;
          m = mctsChooseMove(st, 0, cfg, netP);
        } else {
          m = heuristicMove(st, ap, sty[ap], rng);
        }
        applyPendingAction(st, ap, m);
      }
    }

    double rew[N];
    rankRewards(st, rew);
    for (auto& s : gs) {
      for (float x : s.f) F.push_back(x);
      for (float x : s.p) P.push_back(x);
      for (int k = 0; k < N; k++) V.push_back(float(rew[k % N]));  // seat 0 relative
      nSamples++;
    }
    if ((g + 1) % 20 == 0)
      std::fprintf(stderr, "  game %d/%d, %d samples\n", g + 1, games, nSamples);
  }

  std::FILE* f = std::fopen(out, "wb");
  if (!f) return 1;
  uint32_t magic = 0x53575350u;
  int32_t hdr[4] = {nSamples, FEAT_DIM, POLICY_DIM, VALUE_DIM};
  std::fwrite(&magic, 4, 1, f);
  std::fwrite(hdr, 4, 4, f);
  std::fwrite(F.data(), 4, F.size(), f);
  std::fwrite(P.data(), 4, P.size(), f);
  std::fwrite(V.data(), 4, V.size(), f);
  std::fclose(f);
  std::printf("wrote %d samples -> %s\n", nSamples, out);
  return 0;
}

// ── Deployment bridge: read a position (integers) from stdin, return the chosen
// move as a canonical tuple. Mirrors the TS serializer in ai/cpp-bridge.ts. ──

// The move's engine-neutral canonical tuple [code, cardType, left, right, part].
static void canonOf(const Move& m, const GameState& st, int seat, int out[5]) {
  int off = m.seventh ? 10 : 0;
  int card = m.kind == MoveKind::PickDiscard  ? st.discard[m.card]
             : m.kind == MoveKind::SkipPending ? 0
                                                : st.hands[seat][m.card];
  out[0] = out[1] = out[2] = out[3] = out[4] = 0;
  switch (m.kind) {
    case MoveKind::Discard: out[0] = 0 + off, out[1] = card; break;
    case MoveKind::PlayCard:
      out[1] = card;
      if (m.pay == PayKind::Resources) out[0] = 1 + off, out[2] = m.payLeft, out[3] = m.payRight;
      else if (m.pay == PayKind::Chain) out[0] = 2 + off;
      else out[0] = 3 + off;
      break;
    case MoveKind::BuildWonder:
      out[0] = 4 + off, out[1] = card, out[2] = m.payLeft, out[3] = m.payRight, out[4] = m.participate;
      break;
    case MoveKind::PickDiscard: out[0] = 5, out[1] = card; break;
    case MoveKind::SkipPending: out[0] = 6; break;
  }
}

// Parse the integer position; counts/ids are clamped so a malformed payload
// yields a harmless state (matchCanon then misses -> server falls back to
// random) rather than a buffer overflow. Returns false on stream failure.
static bool readPosition(std::istream& in, GameState& st, int& seat) {
  auto count = [&](int cap) {
    int n;
    in >> n;
    return n < 0 ? 0 : (n > cap ? cap : n);
  };
  auto cardId = [&] {
    int id;
    in >> id;
    return uint8_t(id < 0 || id >= NUM_CARD_TYPES ? 0 : id);
  };
  int age, turn, phase, edifice;
  in >> seat >> age >> turn >> phase >> edifice;
  if (seat < 0 || seat >= N) seat = 0;
  st.age = uint8_t(age < 1 || age > 3 ? 1 : age);
  st.turn = uint8_t(turn < 1 || turn > 7 ? 1 : turn);
  st.phase = phase == 1 ? Phase::Pending : Phase::Selecting;
  for (int p = 0; p < N; p++) {
    PlayerState& pl = st.players[p];
    int w, side, stages, coins, freeBuild;
    in >> w >> side >> stages >> coins >> freeBuild;
    pl.wonderId = uint8_t(w < 0 || w >= NUM_WONDERS ? 0 : w);
    pl.side = uint8_t(side ? 1 : 0);
    pl.stagesBuilt = uint8_t(stages < 0 || stages > MAX_STAGES ? 0 : stages);
    pl.coins = int16_t(coins);
    pl.freeBuildUsedThisAge = freeBuild != 0;
    int n = count(MAX_TABLEAU);
    pl.numTableau = uint8_t(n);
    for (int i = 0; i < n; i++) {
      pl.tableau[i] = cardId();
      setName(pl, cardType(pl.tableau[i]).nameId);
    }
    n = count(MAX_TOKENS);
    pl.numTokens = uint8_t(n);
    for (int i = 0; i < n; i++) {
      int t;
      in >> t;
      pl.militaryTokens[i] = int8_t(t);
    }
    int bs;
    in >> bs;
    pl.bonusShields = uint8_t(bs < 0 ? 0 : bs);
    n = count(MAX_ED_TOKENS);
    pl.numVictory = uint8_t(n);
    for (int i = 0; i < n; i++) {
      int v;
      in >> v;
      pl.victoryTokens[i] = int8_t(v);
    }
    n = count(MAX_ED_TOKENS);
    pl.numDebt = uint8_t(n);
    for (int i = 0; i < n; i++) {
      int v;
      in >> v;
      pl.debtTokens[i] = int8_t(v);
    }
    n = count(MAX_BONUS_PROD);
    pl.numBonusProd = uint8_t(n);
    for (int i = 0; i < n; i++) {
      int mmask;
      in >> mmask;
      pl.bonusProd[i] = uint8_t(mmask & 0x7F);
    }
    n = count(MAX_HAND);
    st.handCount[p] = uint8_t(n);
    for (int i = 0; i < n; i++) st.hands[p][i] = cardId();
  }
  int dc = count(MAX_DISCARD);
  st.discardCount = uint16_t(dc);
  for (int i = 0; i < dc; i++) st.discard[i] = cardId();
  int ec = count(3);
  st.edificeCount = uint8_t(ec);
  for (int e = 0; e < ec; e++) {
    EdSlot& s = st.edifices[e];
    int a, idx, pt, pl2, status, np;
    in >> a >> idx >> pt >> pl2 >> status;
    np = count(N);
    s.age = uint8_t(a < 1 || a > 3 ? 1 : a);
    s.edificeId = uint8_t(idx < 0 || idx >= NUM_EDIFICES ? 0 : idx);
    s.pawnsTotal = uint8_t(pt);
    s.pawnsLeft = uint8_t(pl2);
    s.status = EdStatus(status < 0 || status > 2 ? 0 : status);
    s.numParticipants = uint8_t(np);
    for (int i = 0; i < np; i++) {
      int part;
      in >> part;
      s.participants[i] = uint8_t(part < 0 || part >= N ? 0 : part);
    }
  }
  int pc = count(2 * N);
  st.pendingCount = uint8_t(pc);
  for (int i = 0; i < pc; i++) {
    int kind, player;
    in >> kind >> player;
    st.pendingQueue[i] = {kind == 1 ? PendingKind::Halikarnassos : PendingKind::BabylonSeventh,
                          uint8_t(player < 0 || player >= N ? 0 : player)};
  }
  int d2 = count(MAX_DECK);
  st.deck2Count = uint8_t(d2);
  for (int i = 0; i < d2; i++) st.deck2[i] = cardId();
  int d3 = count(MAX_DECK);
  st.deck3Count = uint8_t(d3);
  for (int i = 0; i < d3; i++) st.deck3[i] = cardId();
  (void)edifice;
  return !in.fail();
}

static int cmdMove(const char* weights, int iters, int dets) {
  GameState st;
  int seat = 0;
  if (!readPosition(std::cin, st, seat)) {
    std::printf("6 0 0 0 0\n");  // sentinel -> unmatched -> server falls back to random
    return 0;
  }
  Net net;
  const Net* netP = (weights && net.load(weights)) ? &net : nullptr;
  MctsConfig cfg;
  cfg.iterations = iters;
  cfg.seed = 0xC0FFEEu + uint32_t(st.age) * 131u + st.turn * 17u + seat;
  Move m = st.phase == Phase::Pending ? mctsChooseMove(st, seat, cfg, netP)
                                      : ismctsChooseMove(st, seat, cfg, netP, dets);
  int c[5];
  canonOf(m, st, seat, c);
  std::printf("%d %d %d %d %d\n", c[0], c[1], c[2], c[3], c[4]);
  return 0;
}

int main(int argc, char** argv) {
  const char* cmd = argc > 1 ? argv[1] : "help";
  auto u32 = [&](int i, uint32_t def) { return uint32_t(i < argc ? strtoul(argv[i], nullptr, 10) : def); };

  if (std::strcmp(cmd, "deal") == 0) return cmdDeal(u32(2, 1), argc > 3 && argv[3][0] == '1');
  if (std::strcmp(cmd, "moves") == 0) return cmdMoves(u32(2, 1), int(u32(3, 0)));
  if (std::strcmp(cmd, "playout") == 0) return cmdPlayout(u32(2, 1), argc > 3 && argv[3][0] == '1');
  if (std::strcmp(cmd, "bench") == 0) return cmdBench(int(u32(2, 5000)));
  if (std::strcmp(cmd, "eval") == 0)
    return cmdEvalAgent(int(u32(2, 100)), int(u32(3, 800)), nullptr, "MCTS", 1);
  if (std::strcmp(cmd, "evalnet") == 0) {
    if (argc < 3) {
      std::printf("usage: sw7 evalnet <weights.bin> [games] [iters]\n");
      return 1;
    }
    Net net;
    if (!net.load(argv[2])) {
      std::printf("failed to load weights: %s\n", argv[2]);
      return 1;
    }
    return cmdEvalAgent(int(u32(3, 100)), int(u32(4, 400)), &net, "PUCT-net", 1);
  }
  if (std::strcmp(cmd, "evalii") == 0) {
    if (argc < 3) {
      std::printf("usage: sw7 evalii <weights.bin|-> [games] [iters] [dets]\n");
      return 1;
    }
    Net net;
    bool useNet = std::strcmp(argv[2], "-") != 0 && net.load(argv[2]);
    return cmdEvalAgent(int(u32(3, 60)), int(u32(4, 300)), useNet ? &net : nullptr,
                        useNet ? "PUCT-net-II" : "MCTS-II", int(u32(5, 8)));
  }
  if (std::strcmp(cmd, "selfplay") == 0) {
    if (argc < 5) {
      std::printf("usage: sw7 selfplay <games> <iters> <out.bin> [weights.bin] [seed]\n");
      return 1;
    }
    const char* weights = argc > 5 ? argv[5] : nullptr;
    return cmdSelfPlay(int(u32(2, 50)), int(u32(3, 200)), argv[4], weights, u32(6, 1));
  }
  if (std::strcmp(cmd, "selfplay-pop") == 0) {
    if (argc < 5) {
      std::printf("usage: sw7 selfplay-pop <games> <iters> <out.bin> [weights.bin] [seed]\n");
      return 1;
    }
    return cmdSelfPlayPop(int(u32(2, 50)), int(u32(3, 200)), argv[4], argc > 5 ? argv[5] : nullptr,
                          u32(6, 1));
  }
  if (std::strcmp(cmd, "move") == 0) {
    // sw7 move [weights|-] [iters] [dets]   (position on stdin -> canonical move on stdout)
    const char* w = (argc > 2 && std::strcmp(argv[2], "-") != 0) ? argv[2] : nullptr;
    return cmdMove(w, int(u32(3, 400)), int(u32(4, 6)));
  }
  if (std::strcmp(cmd, "evalpop") == 0) {
    if (argc < 3) {
      std::printf("usage: sw7 evalpop <weights.bin|-|heN> [games] [iters] [dets]\n");
      return 1;
    }
    int seat0Style = -1;
    Net net;
    bool useNet = false;
    if (std::strncmp(argv[2], "he", 2) == 0)
      seat0Style = atoi(argv[2] + 2);
    else if (std::strcmp(argv[2], "-") != 0)
      useNet = net.load(argv[2]);
    const char* lbl = seat0Style >= 0 ? "heuristic" : (useNet ? "PUCT-net" : "MCTS");
    return cmdEvalPop(int(u32(3, 60)), int(u32(4, 300)), useNet ? &net : nullptr, int(u32(5, 1)),
                      seat0Style, lbl);
  }

  std::printf("sw7 — 7 Wonders engine (5 players)\n");
  std::printf("usage:\n");
  std::printf("  sw7 deal <seed> [edifice]     print the dealt game\n");
  std::printf("  sw7 moves <seed> [player]     legal moves at the opening\n");
  std::printf("  sw7 playout <seed> [edifice]  random self-play + final scores\n");
  std::printf("  sw7 bench [games]             throughput benchmark\n");
  std::printf("  sw7 eval [games] [iters]      MCTS(seat0) vs 4 random win-rate\n");
  std::printf("  sw7 evalnet <w.bin> [g] [it]  PUCT-net(seat0) vs 4 random win-rate\n");
  std::printf("  sw7 selfplay <g> <it> <out.bin> [w.bin] [seed]   generate training data\n");
  std::printf("  sw7 evalii <w.bin|-> [g] [it] [dets]   imperfect-info (determinized) eval\n");
  std::printf("  sw7 evalpop <w.bin|-|heN> [g] [it] [dets]   vs heuristic population\n");
  std::printf("  sw7 move [w.bin|-] [iters] [dets]      position (stdin ints) -> move (deploy)\n");
  return 0;
}
