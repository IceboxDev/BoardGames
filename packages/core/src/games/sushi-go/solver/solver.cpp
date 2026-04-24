// solver.cpp — C++ Nash equilibrium solver for 2-player Sushi Go
//
// Ports backward induction + LP from nash.ts for exhaustive precomputation
// of turn-2 opening book values. Given a board pair (turn-1 plays) and both
// players' 9-card hands, computes the Nash equilibrium game value from turn 2
// to round end.
//
// Build: g++ -O3 -std=c++20 -o solver solver.cpp
// Usage: ./solver [-n NUM] [-b TYPE0 TYPE1] [--verify]

#include <algorithm>
#include <array>
#include <cassert>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <numeric>
#include <optional>
#include <random>
#include <unordered_map>
#include <vector>

// ═══════════════════════════════════════════════════════════════════════
// Section 1: Constants and Types
// ═══════════════════════════════════════════════════════════════════════

static constexpr int NUM_TYPES = 12;
static constexpr int HAND_SIZE = 10; // 2-player starting hand

// Type indices (matches ai/types.ts)
static constexpr int T_TEMPURA    = 0;
static constexpr int T_SASHIMI    = 1;
static constexpr int T_DUMPLING   = 2;
static constexpr int T_MAKI1      = 3;
static constexpr int T_MAKI2      = 4;
static constexpr int T_MAKI3      = 5;
static constexpr int T_EGG        = 6;
static constexpr int T_SALMON     = 7;
static constexpr int T_SQUID      = 8;
static constexpr int T_WASABI     = 9;
static constexpr int T_PUDDING    = 10;
static constexpr int T_CHOPSTICKS = 11;

static constexpr int NIGIRI_VALUES[3] = {1, 2, 3}; // egg, salmon, squid
static constexpr int MAKI_COUNTS[3]   = {1, 2, 3};
static constexpr int DUMPLING_SCORES[6] = {0, 1, 3, 6, 10, 15};

// Deck composition indexed by type (108 cards total)
static constexpr int FULL_DECK[NUM_TYPES] = {
    14, // tempura
    14, // sashimi
    14, // dumpling
     6, // maki-1
    12, // maki-2
     8, // maki-3
     5, // egg-nigiri
    10, // salmon-nigiri
     5, // squid-nigiri
     6, // wasabi
    10, // pudding
     4, // chopsticks
};

static const char* TYPE_NAMES[NUM_TYPES] = {
    "tempura", "sashimi", "dumpling", "maki-1", "maki-2", "maki-3",
    "egg", "salmon", "squid", "wasabi", "pudding", "chopsticks",
};

// Nash solver thresholds
static constexpr int DOUBLE_ORACLE_THRESHOLD = 100;

// Pudding tie-break: prefer more puddings when combined value is tied.
// Small enough to never override score_diff or pudding lead bonus (6).
static constexpr double PUDDING_TIEBREAK = 0.01;

struct PlayerState {
    uint8_t hand[NUM_TYPES];
    uint8_t tableau[NUM_TYPES];
    uint8_t boostedNigiri[3]; // [0]=egg, [1]=salmon, [2]=squid
    uint8_t unusedWasabi;
    uint8_t puddings; // from prior rounds
};

struct GameState {
    PlayerState players[2];
    int turn;
};

struct Action {
    uint8_t type;   // 0 = single pick, 1 = chopsticks (pick two)
    uint8_t card;   // type index of first card
    uint8_t second; // type index of second card (only when type=1)
};

static constexpr int MAX_ACTIONS = 100; // safe upper bound per player

struct ActionList {
    Action actions[MAX_ACTIONS];
    int count = 0;
    void push(Action a) { actions[count++] = a; }
};

// ═══════════════════════════════════════════════════════════════════════
// Section 2: State Hashing (Zobrist)
// ═══════════════════════════════════════════════════════════════════════

// 59 state positions × 16 possible values each.
// Positions: turn(1) + per-player(hand[12]+tableau[12]+boosted[3]+wasabi+puddings = 29) × 2
static constexpr int ZOBRIST_POSITIONS = 59;
static uint64_t ZOBRIST_TABLE[ZOBRIST_POSITIONS][16];

static void initZobrist() {
    std::mt19937_64 rng(0xDEADBEEF42ULL); // fixed seed for reproducibility
    for (int p = 0; p < ZOBRIST_POSITIONS; p++) {
        for (int v = 0; v < 16; v++) {
            ZOBRIST_TABLE[p][v] = rng();
        }
    }
}

static uint64_t hashState(const GameState& s) {
    uint64_t h = 0;
    int pos = 0;
    h ^= ZOBRIST_TABLE[pos++][s.turn & 15];
    for (int p = 0; p < 2; p++) {
        const PlayerState& pl = s.players[p];
        for (int i = 0; i < NUM_TYPES; i++) h ^= ZOBRIST_TABLE[pos++][pl.hand[i]];
        for (int i = 0; i < NUM_TYPES; i++) h ^= ZOBRIST_TABLE[pos++][pl.tableau[i]];
        for (int i = 0; i < 3; i++) h ^= ZOBRIST_TABLE[pos++][pl.boostedNigiri[i]];
        h ^= ZOBRIST_TABLE[pos++][pl.unusedWasabi];
        h ^= ZOBRIST_TABLE[pos++][pl.puddings];
    }
    return h;
}

// Open-addressing hash table with linear probing. 64 MB fixed allocation,
// cleared between solves. Much faster than std::unordered_map for this workload
// (eliminates per-node heap allocation and pointer chasing).
class TransTable {
    static constexpr size_t CAPACITY = 1 << 22; // 4M entries, ~64 MB
    static constexpr size_t MASK = CAPACITY - 1;
    static constexpr uint64_t EMPTY = 0;

    struct Entry { uint64_t key; double value; };
    Entry* table_;
    size_t count_;

public:
    TransTable() : count_(0) {
        table_ = new Entry[CAPACITY]();
    }
    ~TransTable() { delete[] table_; }
    TransTable(const TransTable&) = delete;
    TransTable& operator=(const TransTable&) = delete;

    void reserve(size_t) {} // no-op (fixed capacity)

    const double* find(uint64_t key) const {
        if (key == EMPTY) key = 1; // avoid sentinel
        size_t idx = key & MASK;
        while (true) {
            if (table_[idx].key == key) return &table_[idx].value;
            if (table_[idx].key == EMPTY) return nullptr;
            idx = (idx + 1) & MASK;
        }
    }

    void insert(uint64_t key, double value) {
        if (key == EMPTY) key = 1;
        size_t idx = key & MASK;
        while (table_[idx].key != EMPTY && table_[idx].key != key) {
            idx = (idx + 1) & MASK;
        }
        if (table_[idx].key == EMPTY) count_++;
        table_[idx] = {key, value};
    }

    size_t size() const { return count_; }

    void clear() {
        std::memset(table_, 0, CAPACITY * sizeof(Entry));
        count_ = 0;
    }
};

// ═══════════════════════════════════════════════════════════════════════
// Section 3: Game Logic
// ═══════════════════════════════════════════════════════════════════════

static inline void addToTableau(PlayerState& p, int card) {
    p.tableau[card]++;
    if (card == T_WASABI) {
        p.unusedWasabi++;
    } else if (card >= T_EGG && card <= T_SQUID && p.unusedWasabi > 0) {
        p.unusedWasabi--;
        p.boostedNigiri[card - T_EGG]++;
    }
}

static inline void undoAddToTableau(PlayerState& p, int card) {
    p.tableau[card]--;
    if (card == T_WASABI) {
        p.unusedWasabi--;
    } else if (card >= T_EGG && card <= T_SQUID && p.boostedNigiri[card - T_EGG] > 0) {
        p.boostedNigiri[card - T_EGG]--;
        p.unusedWasabi++;
    }
}

static inline void applyPick(PlayerState& p, const Action& a) {
    if (a.type == 0) {
        p.hand[a.card]--;
        addToTableau(p, a.card);
    } else {
        p.hand[a.card]--;
        addToTableau(p, a.card);
        p.hand[a.second]--;
        addToTableau(p, a.second);
        // Return chopsticks from tableau to hand
        p.tableau[T_CHOPSTICKS]--;
        p.hand[T_CHOPSTICKS]++;
    }
}

static inline void undoPick(PlayerState& p, const Action& a) {
    if (a.type == 0) {
        undoAddToTableau(p, a.card);
        p.hand[a.card]++;
    } else {
        p.hand[T_CHOPSTICKS]--;
        p.tableau[T_CHOPSTICKS]++;
        undoAddToTableau(p, a.second);
        p.hand[a.second]++;
        undoAddToTableau(p, a.card);
        p.hand[a.card]++;
    }
}

static inline void swapHands(GameState& s) {
    uint8_t tmp[NUM_TYPES];
    std::memcpy(tmp, s.players[0].hand, NUM_TYPES);
    std::memcpy(s.players[0].hand, s.players[1].hand, NUM_TYPES);
    std::memcpy(s.players[1].hand, tmp, NUM_TYPES);
}

static inline int handSize(const PlayerState& p) {
    int sz = 0;
    for (int i = 0; i < NUM_TYPES; i++) sz += p.hand[i];
    return sz;
}

static ActionList getLegalActions(const PlayerState& p) {
    ActionList list;
    int uniqueTypes[NUM_TYPES];
    int numUnique = 0;

    for (int t = 0; t < NUM_TYPES; t++) {
        if (p.hand[t] > 0) {
            list.push({0, static_cast<uint8_t>(t), 0});
            uniqueTypes[numUnique++] = t;
        }
    }

    if (p.tableau[T_CHOPSTICKS] > 0 && handSize(p) >= 2) {
        for (int i = 0; i < numUnique; i++) {
            for (int j = i; j < numUnique; j++) {
                if (i == j && p.hand[uniqueTypes[i]] < 2) continue;
                list.push({1, static_cast<uint8_t>(uniqueTypes[i]),
                           static_cast<uint8_t>(uniqueTypes[j])});
            }
        }
    }

    return list;
}

// ═══════════════════════════════════════════════════════════════════════
// Section 4: Terminal Evaluation
// ═══════════════════════════════════════════════════════════════════════

// Returns combined value: score_diff + 6*sign(pudding_diff) + ε*pudding_diff
// This is the round-independent evaluation used for precomputation.

static double evaluateRound(const GameState& state) {
    // Score each player's tableau
    int maki[2] = {0, 0};
    int makiTotal[2] = {0, 0};
    int total[2] = {0, 0};

    for (int pi = 0; pi < 2; pi++) {
        const PlayerState& p = state.players[pi];

        // Maki total
        for (int t = T_MAKI1; t <= T_MAKI3; t++) {
            makiTotal[pi] += p.tableau[t] * MAKI_COUNTS[t - T_MAKI1];
        }

        // Tempura: 5 per pair
        total[pi] += (p.tableau[T_TEMPURA] / 2) * 5;

        // Sashimi: 10 per triple
        total[pi] += (p.tableau[T_SASHIMI] / 3) * 10;

        // Dumpling
        int dc = std::min(static_cast<int>(p.tableau[T_DUMPLING]), 5);
        total[pi] += DUMPLING_SCORES[dc];

        // Nigiri with wasabi boost
        for (int i = 0; i < 3; i++) {
            int count = p.tableau[T_EGG + i];
            int boosted = p.boostedNigiri[i];
            int unboosted = count - boosted;
            int value = NIGIRI_VALUES[i];
            total[pi] += boosted * value * 3 + unboosted * value;
        }
    }

    // 2-player maki scoring
    if (makiTotal[0] != 0 || makiTotal[1] != 0) {
        if (makiTotal[0] > makiTotal[1]) {
            maki[0] = 6;
            if (makiTotal[1] > 0) maki[1] = 3;
        } else if (makiTotal[1] > makiTotal[0]) {
            maki[1] = 6;
            if (makiTotal[0] > 0) maki[0] = 3;
        } else {
            maki[0] = 3;
            maki[1] = 3;
        }
    }

    total[0] += maki[0];
    total[1] += maki[1];

    double diff = total[0] - total[1];

    // Pudding: +6 for having more (2-player: no penalty for fewest)
    int p0Pud = state.players[0].puddings + state.players[0].tableau[T_PUDDING];
    int p1Pud = state.players[1].puddings + state.players[1].tableau[T_PUDDING];
    int pudDiff = p0Pud - p1Pud;

    if (pudDiff > 0) diff += 6.0;
    else if (pudDiff < 0) diff -= 6.0;

    // Tie-break: prefer accumulating more puddings
    diff += pudDiff * PUDDING_TIEBREAK;

    return diff;
}

// ═══════════════════════════════════════════════════════════════════════
// Section 5: LP Solver
// ═══════════════════════════════════════════════════════════════════════

struct NashSolution {
    std::vector<double> p1Strategy;
    std::vector<double> p2Strategy;
    double gameValue;
};

// ── Trivial cases ──────────────────────────────────────────────────────

static NashSolution singleRow(const std::vector<std::vector<double>>& A, int n) {
    double minVal = A[0][0];
    int minJ = 0;
    for (int j = 1; j < n; j++) {
        if (A[0][j] < minVal) { minVal = A[0][j]; minJ = j; }
    }
    std::vector<double> q(n, 0.0);
    q[minJ] = 1.0;
    return {{1.0}, std::move(q), minVal};
}

static NashSolution singleCol(const std::vector<std::vector<double>>& A, int m) {
    double maxVal = A[0][0];
    int maxI = 0;
    for (int i = 1; i < m; i++) {
        if (A[i][0] > maxVal) { maxVal = A[i][0]; maxI = i; }
    }
    std::vector<double> p(m, 0.0);
    p[maxI] = 1.0;
    return {std::move(p), {1.0}, maxVal};
}

// ── Pure strategy (saddle point) check ─────────────────────────────────

static std::optional<NashSolution> checkPureStrategies(
    const std::vector<std::vector<double>>& A, int m, int n)
{
    double maximinVal = -1e300;
    int maximinRow = 0;
    for (int i = 0; i < m; i++) {
        double rowMin = 1e300;
        for (int j = 0; j < n; j++) {
            if (A[i][j] < rowMin) rowMin = A[i][j];
        }
        if (rowMin > maximinVal) { maximinVal = rowMin; maximinRow = i; }
    }

    double minimaxVal = 1e300;
    int minimaxCol = 0;
    for (int j = 0; j < n; j++) {
        double colMax = -1e300;
        for (int i = 0; i < m; i++) {
            if (A[i][j] > colMax) colMax = A[i][j];
        }
        if (colMax < minimaxVal) { minimaxVal = colMax; minimaxCol = j; }
    }

    if (std::abs(maximinVal - minimaxVal) < 1e-9) {
        std::vector<double> p(m, 0.0), q(n, 0.0);
        p[maximinRow] = 1.0;
        q[minimaxCol] = 1.0;
        return NashSolution{std::move(p), std::move(q), maximinVal};
    }
    return std::nullopt;
}

// ── 2×2 closed-form ───────────────────────────────────────────────────

static NashSolution solve2x2(const std::vector<std::vector<double>>& A) {
    double a = A[0][0], b = A[0][1], c = A[1][0], d = A[1][1];
    double denom = a - b - c + d;

    if (std::abs(denom) < 1e-12) {
        double value = (a + b + c + d) / 4.0;
        return {{0.5, 0.5}, {0.5, 0.5}, value};
    }

    double p1 = (d - c) / denom;
    double q1 = (d - b) / denom;

    if (p1 <= 0 || p1 >= 1 || q1 <= 0 || q1 >= 1) {
        double maximin0 = std::min(a, b);
        double maximin1 = std::min(c, d);
        if (maximin0 >= maximin1) {
            int j = (b < a) ? 1 : 0;
            std::vector<double> q(2, 0.0); q[j] = 1.0;
            return {{1.0, 0.0}, std::move(q), A[0][j]};
        }
        int j = (d < c) ? 1 : 0;
        std::vector<double> q(2, 0.0); q[j] = 1.0;
        return {{0.0, 1.0}, std::move(q), A[1][j]};
    }

    double gameValue = (a * d - b * c) / denom;
    return {{p1, 1.0 - p1}, {q1, 1.0 - q1}, gameValue};
}

// ── Simplex LP ─────────────────────────────────────────────────────────
// Solve: maximize Σ x_i  subject to  C^T · x ≤ 1,  x ≥ 0
// Returns the x vector (length = rows).

static std::vector<double> solveMaxSumLP(
    const std::vector<std::vector<double>>& C, int rows, int cols)
{
    int totalVars = rows + cols;

    // Tableau: cols constraint rows + 1 objective row, each (totalVars + 1) wide
    std::vector<std::vector<double>> tab(cols + 1, std::vector<double>(totalVars + 1, 0.0));

    // Constraint j: Σ_i C[i][j] · x_i + s_j = 1
    for (int j = 0; j < cols; j++) {
        for (int i = 0; i < rows; i++) {
            tab[j][i] = C[i][j];
        }
        tab[j][rows + j] = 1.0; // slack
        tab[j][totalVars] = 1.0; // RHS
    }

    // Objective: maximize Σ x_i → coefficients -1
    for (int i = 0; i < rows; i++) {
        tab[cols][i] = -1.0;
    }

    std::vector<int> basis(cols);
    for (int j = 0; j < cols; j++) basis[j] = rows + j;

    for (int iter = 0; iter < 200; iter++) {
        auto& zRow = tab[cols];

        // Entering column (Bland's rule: first negative)
        int enterCol = -1;
        for (int c = 0; c < totalVars; c++) {
            if (zRow[c] < -1e-10) { enterCol = c; break; }
        }
        if (enterCol == -1) break;

        // Leaving row (min ratio, Bland's tie-break)
        double minRatio = 1e300;
        int leaveRow = -1;
        for (int r = 0; r < cols; r++) {
            if (tab[r][enterCol] > 1e-10) {
                double ratio = tab[r][totalVars] / tab[r][enterCol];
                if (ratio < minRatio - 1e-12 ||
                    (std::abs(ratio - minRatio) < 1e-12 &&
                     (leaveRow == -1 || basis[r] < basis[leaveRow]))) {
                    minRatio = ratio;
                    leaveRow = r;
                }
            }
        }
        if (leaveRow == -1) break;

        // Pivot
        double pivotVal = tab[leaveRow][enterCol];
        for (int c = 0; c <= totalVars; c++) {
            tab[leaveRow][c] /= pivotVal;
        }
        for (int r = 0; r <= cols; r++) {
            if (r == leaveRow) continue;
            double factor = tab[r][enterCol];
            if (std::abs(factor) < 1e-15) continue;
            for (int c = 0; c <= totalVars; c++) {
                tab[r][c] -= factor * tab[leaveRow][c];
            }
        }

        basis[leaveRow] = enterCol;
    }

    std::vector<double> x(rows, 0.0);
    for (int r = 0; r < cols; r++) {
        if (basis[r] < rows) {
            x[basis[r]] = std::max(0.0, tab[r][totalVars]);
        }
    }
    return x;
}

// ── Iterated strict dominance elimination ──────────────────────────────

static std::optional<NashSolution> iteratedDominanceElimination(
    const std::vector<std::vector<double>>& A, int m, int n)
{
    std::vector<int> rows(m), cols(n);
    std::iota(rows.begin(), rows.end(), 0);
    std::iota(cols.begin(), cols.end(), 0);

    bool changed = true;
    while (changed) {
        changed = false;

        // Remove strictly dominated rows (P1 strategies)
        for (int ri = static_cast<int>(rows.size()) - 1; ri >= 0; ri--) {
            if (rows.size() <= 1) break;
            int r = rows[ri];
            for (int rk = 0; rk < static_cast<int>(rows.size()); rk++) {
                if (rk == ri) continue;
                int rOther = rows[rk];
                bool dominated = true;
                for (int c : cols) {
                    if (A[r][c] >= A[rOther][c]) { dominated = false; break; }
                }
                if (dominated) {
                    rows.erase(rows.begin() + ri);
                    changed = true;
                    break;
                }
            }
        }

        // Remove strictly dominated cols (P2 minimizes → col c dominated if
        // A[r][c] > A[r][cOther] for all surviving r)
        for (int ci = static_cast<int>(cols.size()) - 1; ci >= 0; ci--) {
            if (cols.size() <= 1) break;
            int c = cols[ci];
            for (int ck = 0; ck < static_cast<int>(cols.size()); ck++) {
                if (ck == ci) continue;
                int cOther = cols[ck];
                bool dominated = true;
                for (int r : rows) {
                    if (A[r][c] <= A[r][cOther]) { dominated = false; break; }
                }
                if (dominated) {
                    cols.erase(cols.begin() + ci);
                    changed = true;
                    break;
                }
            }
        }
    }

    if (static_cast<int>(rows.size()) >= m && static_cast<int>(cols.size()) >= n) {
        return std::nullopt; // no reduction
    }

    int rm = rows.size(), rn = cols.size();

    // Build sub-matrix
    std::vector<std::vector<double>> subA(rm, std::vector<double>(rn));
    for (int i = 0; i < rm; i++)
        for (int j = 0; j < rn; j++)
            subA[i][j] = A[rows[i]][cols[j]];

    // Solve sub-game
    NashSolution subSol;
    if (rm == 1) subSol = singleRow(subA, rn);
    else if (rn == 1) subSol = singleCol(subA, rm);
    else if (rm == 2 && rn == 2) subSol = solve2x2(subA);
    else {
        auto pureSol = checkPureStrategies(subA, rm, rn);
        if (pureSol) subSol = std::move(*pureSol);
        else {
            // LP on sub-game
            double minEntry = 1e300;
            for (auto& row : subA)
                for (double v : row)
                    if (v < minEntry) minEntry = v;
            double shift = (minEntry <= 0) ? -minEntry + 1.0 : 0.0;

            std::vector<std::vector<double>> B(rm, std::vector<double>(rn));
            for (int i = 0; i < rm; i++)
                for (int j = 0; j < rn; j++)
                    B[i][j] = subA[i][j] + shift;

            auto p1Raw = solveMaxSumLP(B, rm, rn);

            // Transpose B for P2
            std::vector<std::vector<double>> Bt(rn, std::vector<double>(rm));
            for (int i = 0; i < rm; i++)
                for (int j = 0; j < rn; j++)
                    Bt[j][i] = B[i][j];
            auto p2Raw = solveMaxSumLP(Bt, rn, rm);

            double sumP1 = 0, sumP2 = 0;
            for (double v : p1Raw) sumP1 += v;
            for (double v : p2Raw) sumP2 += v;

            std::vector<double> p1s(rm), p2s(rn);
            if (sumP1 > 1e-12) for (int i = 0; i < rm; i++) p1s[i] = p1Raw[i] / sumP1;
            else for (int i = 0; i < rm; i++) p1s[i] = 1.0 / rm;
            if (sumP2 > 1e-12) for (int j = 0; j < rn; j++) p2s[j] = p2Raw[j] / sumP2;
            else for (int j = 0; j < rn; j++) p2s[j] = 1.0 / rn;

            double gv = (sumP1 > 1e-12) ? (1.0 / sumP1 - shift) : 0.0;
            subSol = {std::move(p1s), std::move(p2s), gv};
        }
    }

    // Map back to original indices
    std::vector<double> p(m, 0.0), q(n, 0.0);
    for (int i = 0; i < rm; i++) p[rows[i]] = subSol.p1Strategy[i];
    for (int j = 0; j < rn; j++) q[cols[j]] = subSol.p2Strategy[j];

    return NashSolution{std::move(p), std::move(q), subSol.gameValue};
}

// ── Full LP-based solver ───────────────────────────────────────────────

static NashSolution solveLPSimplex(
    const std::vector<std::vector<double>>& A, int m, int n)
{
    double minEntry = 1e300;
    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++)
            if (A[i][j] < minEntry) minEntry = A[i][j];
    double shift = (minEntry <= 0) ? -minEntry + 1.0 : 0.0;

    std::vector<std::vector<double>> B(m, std::vector<double>(n));
    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++)
            B[i][j] = A[i][j] + shift;

    auto p1Raw = solveMaxSumLP(B, m, n);

    std::vector<std::vector<double>> Bt(n, std::vector<double>(m));
    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++)
            Bt[j][i] = B[i][j];
    auto p2Raw = solveMaxSumLP(Bt, n, m);

    double sumP1 = 0, sumP2 = 0;
    for (double v : p1Raw) sumP1 += v;
    for (double v : p2Raw) sumP2 += v;

    std::vector<double> p1(m), p2(n);
    if (sumP1 > 1e-12) for (int i = 0; i < m; i++) p1[i] = p1Raw[i] / sumP1;
    else for (int i = 0; i < m; i++) p1[i] = 1.0 / m;
    if (sumP2 > 1e-12) for (int j = 0; j < n; j++) p2[j] = p2Raw[j] / sumP2;
    else for (int j = 0; j < n; j++) p2[j] = 1.0 / n;

    double gv = (sumP1 > 1e-12) ? (1.0 / sumP1 - shift) : 0.0;
    return {std::move(p1), std::move(p2), gv};
}

// ── Main entry: solve zero-sum game ────────────────────────────────────

static NashSolution solveZeroSum(const std::vector<std::vector<double>>& A) {
    int m = A.size();
    int n = A[0].size();

    if (m == 1) return singleRow(A, n);
    if (n == 1) return singleCol(A, m);

    auto pureSol = checkPureStrategies(A, m, n);
    if (pureSol) return std::move(*pureSol);

    if (m == 2 && n == 2) return solve2x2(A);

    auto reduced = iteratedDominanceElimination(A, m, n);
    if (reduced) return std::move(*reduced);

    return solveLPSimplex(A, m, n);
}

// ═══════════════════════════════════════════════════════════════════════
// Section 6: Nash Backward Induction
// ═══════════════════════════════════════════════════════════════════════

// Pre-allocated flat matrix buffers per turn depth (avoids repeated allocation)
static double MATRIX_POOL[11][100]; // only used for matrices ≤ threshold

// Instrumentation counters
static uint64_t g_nashCalls = 0;
static uint64_t g_cacheHits = 0;
static uint64_t g_terminals = 0;
static uint64_t g_pureStrats = 0;
static uint64_t g_lpSolves = 0;
static uint64_t g_doSolves = 0;

static void resetCounters() {
    g_nashCalls = g_cacheHits = g_terminals = g_pureStrats = g_lpSolves = g_doSolves = 0;
}

// Forward declarations
static double nashValue(GameState& state, TransTable& cache);

// ── Heuristic scoring for double oracle seeding ────────────────────────

static double cardHeuristicValue(int card, const PlayerState& p) {
    // Nigiri with wasabi — highest value
    if (card >= T_EGG && card <= T_SQUID && p.unusedWasabi > 0) {
        return NIGIRI_VALUES[card - T_EGG] * 3;
    }
    switch (card) {
        case T_TEMPURA:  return (p.tableau[T_TEMPURA] % 2 == 1) ? 5.0 : 2.5;
        case T_SASHIMI:  return (p.tableau[T_SASHIMI] % 3 == 2) ? 10.0 : 3.3;
        case T_DUMPLING:  return std::min(1 + static_cast<int>(p.tableau[T_DUMPLING]), 5) * 1.0;
        case T_MAKI3:    return 2.4;
        case T_MAKI2:    return 1.6;
        case T_MAKI1:    return 0.8;
        case T_EGG:      return 1.0;
        case T_SALMON:   return 2.0;
        case T_SQUID:    return 3.0;
        case T_WASABI:   return 4.0;
        case T_PUDDING:  return 2.6;
        case T_CHOPSTICKS: return 1.5;
        default:         return 0.0;
    }
}

static double actionHeuristicValue(const Action& a, const PlayerState& p) {
    if (a.type == 0) return cardHeuristicValue(a.card, p);
    return cardHeuristicValue(a.card, p) + cardHeuristicValue(a.second, p) + 0.5;
}

static int bestHeuristicAction(const ActionList& actions, const PlayerState& p) {
    int bestIdx = 0;
    double bestVal = -1e300;
    for (int i = 0; i < actions.count; i++) {
        double v = actionHeuristicValue(actions.actions[i], p);
        if (v > bestVal) { bestVal = v; bestIdx = i; }
    }
    return bestIdx;
}

// ── Full matrix solve (non-double-oracle path) ────────────────────────

static double nashValueFull(
    GameState& state, const ActionList& p1Acts, const ActionList& p2Acts,
    TransTable& cache)
{
    int m = p1Acts.count;
    int n = p2Acts.count;
    PlayerState& p0 = state.players[0];
    PlayerState& p1 = state.players[1];

    // 1×1: single outcome
    if (m == 1 && n == 1) {
        applyPick(p0, p1Acts.actions[0]);
        applyPick(p1, p2Acts.actions[0]);
        swapHands(state);
        state.turn++;
        double v = nashValue(state, cache);
        state.turn--;
        swapHands(state);
        undoPick(p1, p2Acts.actions[0]);
        undoPick(p0, p1Acts.actions[0]);
        return v;
    }

    // 1×N: P0 has no choice, value = min over P1's responses
    if (m == 1) {
        double minV = 1e300;
        applyPick(p0, p1Acts.actions[0]);
        for (int j = 0; j < n; j++) {
            applyPick(p1, p2Acts.actions[j]);
            swapHands(state);
            state.turn++;
            double v = nashValue(state, cache);
            if (v < minV) minV = v;
            state.turn--;
            swapHands(state);
            undoPick(p1, p2Acts.actions[j]);
        }
        undoPick(p0, p1Acts.actions[0]);
        return minV;
    }

    // M×1: P1 has no choice, value = max over P0's options
    if (n == 1) {
        double maxV = -1e300;
        for (int i = 0; i < m; i++) {
            applyPick(p0, p1Acts.actions[i]);
            applyPick(p1, p2Acts.actions[0]);
            swapHands(state);
            state.turn++;
            double v = nashValue(state, cache);
            if (v > maxV) maxV = v;
            state.turn--;
            swapHands(state);
            undoPick(p1, p2Acts.actions[0]);
            undoPick(p0, p1Acts.actions[i]);
        }
        return maxV;
    }

    // General case: fill flat payoff matrix
    double* flat = MATRIX_POOL[state.turn];
    for (int i = 0; i < m; i++) {
        applyPick(p0, p1Acts.actions[i]);
        int rowOff = i * n;
        for (int j = 0; j < n; j++) {
            applyPick(p1, p2Acts.actions[j]);
            swapHands(state);
            state.turn++;
            flat[rowOff + j] = nashValue(state, cache);
            state.turn--;
            swapHands(state);
            undoPick(p1, p2Acts.actions[j]);
        }
        undoPick(p0, p1Acts.actions[i]);
    }

    // 2×2 closed-form
    if (m == 2 && n == 2) {
        double a = flat[0], b = flat[1], c = flat[n], d = flat[n + 1];
        double denom = a - b - c + d;
        if (std::abs(denom) > 1e-12) {
            double p = (d - c) / denom;
            if (p >= -1e-9 && p <= 1.0 + 1e-9) {
                return (a * d - b * c) / denom;
            }
        }
        return std::max(std::min(a, b), std::min(c, d));
    }

    // Saddle point check on flat buffer
    double maximin = -1e300;
    for (int i = 0; i < m; i++) {
        double rowMin = 1e300;
        int off = i * n;
        for (int j = 0; j < n; j++) {
            if (flat[off + j] < rowMin) rowMin = flat[off + j];
        }
        if (rowMin > maximin) maximin = rowMin;
    }
    double minimax = 1e300;
    for (int j = 0; j < n; j++) {
        double colMax = -1e300;
        for (int i = 0; i < m; i++) {
            if (flat[i * n + j] > colMax) colMax = flat[i * n + j];
        }
        if (colMax < minimax) minimax = colMax;
    }
    if (std::abs(maximin - minimax) < 1e-10) { g_pureStrats++; return maximin; }

    g_lpSolves++;
    // Convert flat to 2D for LP solver
    std::vector<std::vector<double>> A(m, std::vector<double>(n));
    for (int i = 0; i < m; i++) {
        int off = i * n;
        for (int j = 0; j < n; j++) A[i][j] = flat[off + j];
    }
    return solveZeroSum(A).gameValue;
}

// ── Double oracle ──────────────────────────────────────────────────────

static double nashValueDoubleOracle(
    GameState& state, const ActionList& allP1, const ActionList& allP2,
    TransTable& cache)
{
    PlayerState& p0 = state.players[0];
    PlayerState& p1 = state.players[1];
    int totalP1 = allP1.count;
    int totalP2 = allP2.count;

    // Sparse payoff cache: NaN = not yet evaluated
    std::vector<double> payoffCache(totalP1 * totalP2, NAN);

    auto evalCell = [&](int i, int j) -> double {
        int idx = i * totalP2 + j;
        if (!std::isnan(payoffCache[idx])) return payoffCache[idx];

        applyPick(p0, allP1.actions[i]);
        applyPick(p1, allP2.actions[j]);
        swapHands(state);
        state.turn++;
        double v = nashValue(state, cache);
        payoffCache[idx] = v;
        state.turn--;
        swapHands(state);
        undoPick(p1, allP2.actions[j]);
        undoPick(p0, allP1.actions[i]);
        return v;
    };

    // Seed with heuristic-best action per player
    std::vector<int> s1 = {bestHeuristicAction(allP1, state.players[0])};
    std::vector<int> s2 = {bestHeuristicAction(allP2, state.players[1])};
    std::vector<uint8_t> inS1(totalP1, 0), inS2(totalP2, 0);
    inS1[s1[0]] = 1;
    inS2[s2[0]] = 1;

    evalCell(s1[0], s2[0]);

    int maxIter = totalP1 + totalP2;
    for (int iter = 0; iter < maxIter; iter++) {
        int subM = s1.size();
        int subN = s2.size();

        // Build subgame matrix
        std::vector<std::vector<double>> subA(subM, std::vector<double>(subN));
        for (int si = 0; si < subM; si++) {
            int i = s1[si];
            for (int sj = 0; sj < subN; sj++) {
                subA[si][sj] = evalCell(i, s2[sj]);
            }
        }

        auto subNash = solveZeroSum(subA);

        // P1 best response: max expected value against P2's mixed strategy
        double bestP1Val = -1e300;
        int bestP1Idx = -1;
        for (int i = 0; i < totalP1; i++) {
            double ev = 0;
            for (int sj = 0; sj < subN; sj++) {
                ev += subNash.p2Strategy[sj] * evalCell(i, s2[sj]);
            }
            if (ev > bestP1Val) { bestP1Val = ev; bestP1Idx = i; }
        }

        // P2 best response: min expected value against P1's mixed strategy
        double bestP2Val = 1e300;
        int bestP2Idx = -1;
        for (int j = 0; j < totalP2; j++) {
            double ev = 0;
            for (int si = 0; si < subM; si++) {
                ev += subNash.p1Strategy[si] * evalCell(s1[si], j);
            }
            if (ev < bestP2Val) { bestP2Val = ev; bestP2Idx = j; }
        }

        // Check convergence
        double subGameValue = subNash.gameValue;
        bool p1Improves = bestP1Val > subGameValue + 1e-9 && !inS1[bestP1Idx];
        bool p2Improves = bestP2Val < subGameValue - 1e-9 && !inS2[bestP2Idx];

        if (!p1Improves && !p2Improves) return subGameValue;

        if (p1Improves) { s1.push_back(bestP1Idx); inS1[bestP1Idx] = 1; }
        if (p2Improves) { s2.push_back(bestP2Idx); inS2[bestP2Idx] = 1; }
    }

    // Fallback: solve full matrix (shouldn't normally reach here)
    return nashValueFull(state, allP1, allP2, cache);
}

// ── Core backward induction ────────────────────────────────────────────

static double nashValue(GameState& state, TransTable& cache) {
    g_nashCalls++;

    // Terminal: round over
    if (state.turn > HAND_SIZE) {
        g_terminals++;
        return evaluateRound(state);
    }

    uint64_t key = hashState(state);
    const double* cached = cache.find(key);
    if (cached) { g_cacheHits++; return *cached; }

    ActionList p1Acts = getLegalActions(state.players[0]);
    ActionList p2Acts = getLegalActions(state.players[1]);

    int m = p1Acts.count;
    int n = p2Acts.count;

    double value;
    if (m * n > DOUBLE_ORACLE_THRESHOLD) {
        g_doSolves++;
        value = nashValueDoubleOracle(state, p1Acts, p2Acts, cache);
    } else {
        value = nashValueFull(state, p1Acts, p2Acts, cache);
    }

    cache.insert(key, value);
    return value;
}

// ═══════════════════════════════════════════════════════════════════════
// Section 7: State Construction & Hand Generation
// ═══════════════════════════════════════════════════════════════════════

// Construct turn-2 state from board pair and dealt hands.
// boardP0/P1: type indices of cards played on turn 1.
// handP0/P1: 9-card count vectors (the hands after turn-1 swap).
static GameState makeState(int boardP0, int boardP1,
                           const uint8_t handP0[NUM_TYPES],
                           const uint8_t handP1[NUM_TYPES])
{
    GameState s{};
    s.turn = 2;

    std::memcpy(s.players[0].hand, handP0, NUM_TYPES);
    std::memcpy(s.players[1].hand, handP1, NUM_TYPES);

    // Turn-1 cards are in tableaux. Apply wasabi/nigiri logic.
    addToTableau(s.players[0], boardP0);
    addToTableau(s.players[1], boardP1);

    return s;
}

// Generate a random (P0_hand, P1_hand) pair valid for the given board pair.
// Deals 18 cards from the remaining deck and splits into two 9-card hands.
static void generateRandomHands(int boardP0, int boardP1,
                                uint8_t handP0[NUM_TYPES],
                                uint8_t handP1[NUM_TYPES],
                                std::mt19937& rng)
{
    // Remaining deck after board cards
    int remaining[NUM_TYPES];
    std::memcpy(remaining, FULL_DECK, sizeof(FULL_DECK));
    remaining[boardP0]--;
    remaining[boardP1]--;

    // Flatten into card list
    std::vector<int> cards;
    cards.reserve(106);
    for (int t = 0; t < NUM_TYPES; t++) {
        for (int c = 0; c < remaining[t]; c++) {
            cards.push_back(t);
        }
    }

    std::shuffle(cards.begin(), cards.end(), rng);

    std::memset(handP0, 0, NUM_TYPES);
    std::memset(handP1, 0, NUM_TYPES);
    for (int i = 0; i < 9; i++) handP0[cards[i]]++;
    for (int i = 9; i < 18; i++) handP1[cards[i]]++;
}

// ═══════════════════════════════════════════════════════════════════════
// Section 8: Main
// ═══════════════════════════════════════════════════════════════════════

static void printHand(const char* label, const uint8_t hand[NUM_TYPES]) {
    std::cout << label << ": ";
    bool first = true;
    for (int t = 0; t < NUM_TYPES; t++) {
        for (int c = 0; c < hand[t]; c++) {
            if (!first) std::cout << ", ";
            std::cout << TYPE_NAMES[t];
            first = false;
        }
    }
    std::cout << "\n";
}

int main(int argc, char* argv[]) {
    int numSolves = 1000;
    int boardP0 = T_WASABI;
    int boardP1 = T_WASABI;
    bool verify = false;
    uint32_t seed = 42;

    // Parse args
    for (int i = 1; i < argc; i++) {
        if (std::string(argv[i]) == "-n" && i + 1 < argc) {
            numSolves = std::atoi(argv[++i]);
        } else if (std::string(argv[i]) == "-b" && i + 2 < argc) {
            boardP0 = std::atoi(argv[++i]);
            boardP1 = std::atoi(argv[++i]);
        } else if (std::string(argv[i]) == "--verify") {
            verify = true;
        } else if (std::string(argv[i]) == "-s" && i + 1 < argc) {
            seed = std::atoi(argv[++i]);
        } else if (std::string(argv[i]) == "--help") {
            std::cout << "Usage: solver [-n NUM] [-b TYPE0 TYPE1] [-s SEED] [--verify]\n"
                      << "  -n NUM        Number of pairs to solve (default: 1000)\n"
                      << "  -b T0 T1      Board pair type indices (default: 9 9 = wasabi-wasabi)\n"
                      << "  -s SEED       RNG seed (default: 42)\n"
                      << "  --verify      Run 5 solves with detailed output\n"
                      << "\nType indices: ";
            for (int t = 0; t < NUM_TYPES; t++) {
                std::cout << t << "=" << TYPE_NAMES[t];
                if (t < NUM_TYPES - 1) std::cout << ", ";
            }
            std::cout << "\n";
            return 0;
        }
    }

    initZobrist();
    std::mt19937 rng(seed);

    std::cout << "Board pair: " << TYPE_NAMES[boardP0] << " vs " << TYPE_NAMES[boardP1] << "\n";

    // Allocate hash table once, reuse between solves
    TransTable cache;

    if (verify) {
        // Detailed output for a few solves
        numSolves = std::min(numSolves, 5);
        for (int i = 0; i < numSolves; i++) {
            uint8_t h0[NUM_TYPES], h1[NUM_TYPES];
            generateRandomHands(boardP0, boardP1, h0, h1, rng);

            printHand("P0 hand", h0);
            printHand("P1 hand", h1);

            GameState state = makeState(boardP0, boardP1, h0, h1);
            cache.clear();
            resetCounters();

            auto t0 = std::chrono::high_resolution_clock::now();
            double value = nashValue(state, cache);
            auto t1 = std::chrono::high_resolution_clock::now();

            double ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
            std::cout << "Nash value: " << value
                      << "  (cache: " << cache.size()
                      << ", time: " << ms << " ms)\n"
                      << "  calls=" << g_nashCalls
                      << " hits=" << g_cacheHits
                      << " terminals=" << g_terminals
                      << " pure=" << g_pureStrats
                      << " LP=" << g_lpSolves
                      << " DO=" << g_doSolves << "\n\n";
        }
        return 0;
    }

    // Benchmark mode
    std::vector<double> times;
    std::vector<double> values;
    std::vector<size_t> cacheSizes;
    times.reserve(numSolves);
    values.reserve(numSolves);
    cacheSizes.reserve(numSolves);

    auto totalStart = std::chrono::high_resolution_clock::now();

    int numChopsticks = 0;
    for (int i = 0; i < numSolves; i++) {
        uint8_t h0[NUM_TYPES], h1[NUM_TYPES];
        generateRandomHands(boardP0, boardP1, h0, h1, rng);

        int chops = h0[T_CHOPSTICKS] + h1[T_CHOPSTICKS];
        if (chops > 0) numChopsticks++;

        GameState state = makeState(boardP0, boardP1, h0, h1);
        cache.clear();

        auto t0 = std::chrono::high_resolution_clock::now();
        double value = nashValue(state, cache);
        auto t1 = std::chrono::high_resolution_clock::now();

        double ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
        times.push_back(ms);
        values.push_back(value);
        cacheSizes.push_back(cache.size());

        if ((i + 1) % 10 == 0 || i + 1 == numSolves) {
            auto elapsed = std::chrono::duration<double>(
                std::chrono::high_resolution_clock::now() - totalStart).count();
            std::cout << "  " << (i + 1) << "/" << numSolves
                      << "  (" << elapsed << "s elapsed)\n" << std::flush;
        }
    }
    std::cout << "\n";

    // Statistics
    std::sort(times.begin(), times.end());
    double totalTime = std::accumulate(times.begin(), times.end(), 0.0);
    double meanTime = totalTime / numSolves;
    double medianTime = times[numSolves / 2];
    double p95Time = times[static_cast<int>(numSolves * 0.95)];
    double p99Time = times[static_cast<int>(numSolves * 0.99)];
    double minTime = times.front();
    double maxTime = times.back();

    double meanCache = std::accumulate(cacheSizes.begin(), cacheSizes.end(), 0.0) / numSolves;
    double meanValue = std::accumulate(values.begin(), values.end(), 0.0) / numSolves;

    std::cout << "=== Benchmark Results ===\n"
              << "Solves:        " << numSolves << "\n"
              << "Total time:    " << totalTime / 1000.0 << " s\n"
              << "Mean time:     " << meanTime << " ms\n"
              << "Median time:   " << medianTime << " ms\n"
              << "P95 time:      " << p95Time << " ms\n"
              << "P99 time:      " << p99Time << " ms\n"
              << "Min/Max time:  " << minTime << " / " << maxTime << " ms\n"
              << "Mean cache:    " << static_cast<int>(meanCache) << " entries\n"
              << "Mean value:    " << meanValue << "\n"
              << "With chops:    " << numChopsticks << "/" << numSolves
              << " (" << (100.0 * numChopsticks / numSolves) << "%)\n";

    // Extrapolation for full cell
    // Wasabi-wasabi: ~164,423 ME hands × ~130,000 OPP hands = ~21 billion pairs
    double estPerPair = meanTime / 1000.0; // seconds
    double estFullCell = estPerPair * 164423.0 * 130000.0;
    double estCoreDays = estFullCell / 86400.0;
    std::cout << "\n=== Extrapolation (wasabi-wasabi cell) ===\n"
              << "~164K × ~130K = ~21.4B pairs\n"
              << "Est. per pair: " << estPerPair * 1000.0 << " ms\n"
              << "Est. single-core: " << estCoreDays << " days\n"
              << "Est. 16-core:  " << estCoreDays / 16.0 << " days\n";

    return 0;
}
