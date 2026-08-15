// shelf-packer — pack board game boxes into a flush front-facing rectangle.
//
// Model:
//   Every box (w × l × h, mm) presents a FRONT FACE of either w×h or l×h,
//   optionally rotated 90° (so up to 4 orientations); the remaining dimension
//   goes into the shelf as DEPTH and must fit --depth-max.
//   The packing is a row of PILES standing flush on the floor. A pile is a
//   stack of CELLS; a cell is one box, or two boxes side by side whose face
//   heights match (± tolerance). All cells in a pile share the pile width
//   (± tolerance), so every vertical seam is flush.
//   Pile heights must reach the nominal rectangle height and may overshoot by
//   the allowed top overflow; pile widths sum to at most nominal width plus
//   the left+right overflow allowance.
//
// Objective: maximize total packed VOLUME; tie-break on total DEPTH used
// (deeper boxes waste less shelf). Emits the top-N distinct solutions as a
// text report and one PNG each (self-contained encoder, no libpng/zlib).
//
// Build:  make          (or: g++ -O2 -std=c++17 -o shelf-packer main.cpp)
// Run:    ./shelf-packer boxes.csv --out out/
// See README.md for the CSV format and every flag.

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <functional>
#include <iostream>
#include <map>
#include <random>
#include <set>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

// ── Parameters (mm) ────────────────────────────────────────────────────
struct Params {
  int widthBase = 850;    // nominal rectangle width
  int overLeft = 30;      // left side may exceed by this
  int overRight = 30;     // right side may exceed by this
  int heightBase = 250;   // nominal rectangle height (must be reached)
  int overTop = 35;       // piles may overshoot the top by this
  int depthMax = 325;     // max depth into the shelf
  int tolPerBox = 1;      // per-box measurement tolerance (±mm)
  int solutions = 8;      // how many solutions to emit
  std::string out = "out";
  int maxWidth() const { return widthBase + overLeft + overRight; }
  int maxHeight() const { return heightBase + overTop; }
};

// ── Input ──────────────────────────────────────────────────────────────
struct Box {
  std::string name;
  int w, l, h;
  long long vol;
};

static std::vector<Box> loadBoxes(const std::string& path) {
  std::ifstream in(path);
  if (!in) {
    std::cerr << "cannot open " << path << "\n";
    exit(1);
  }
  std::vector<Box> boxes;
  std::string line;
  while (std::getline(in, line)) {
    if (line.empty() || line[0] == '#') continue;
    std::stringstream ss(line);
    std::string name, a, b, c;
    if (!std::getline(ss, name, ',')) continue;
    if (!std::getline(ss, a, ',') || !std::getline(ss, b, ',') || !std::getline(ss, c, ','))
      continue;
    Box box;
    box.name = name;
    box.w = std::stoi(a);
    box.l = std::stoi(b);
    box.h = std::stoi(c);
    box.vol = 1LL * box.w * box.l * box.h;
    boxes.push_back(box);
  }
  if (boxes.size() > 62) {
    std::cerr << "supports at most 62 boxes (bitmask); got " << boxes.size() << "\n";
    exit(1);
  }
  return boxes;
}

// ── Orientations & cells ───────────────────────────────────────────────
struct Orient {
  int box;
  int fw, fh, d;  // face width, face height, depth into shelf
};

struct Placement {
  int box;
  int fw, fh, d;
  int xOff;  // within the cell
};

// A cell: one box, or two side-by-side boxes with matching face heights.
struct Cell {
  uint64_t mask;
  int width, height;  // height = max face height of members
  long long vol;
  int depthSum;
  std::vector<Placement> boxes;
};

// A pile: stacked cells sharing one width.
struct Pile {
  uint64_t mask;
  int width, height;
  long long vol;
  int depthSum;
  std::vector<int> cells;  // indices into the cell list
};

// A full packing.
struct Solution {
  uint64_t mask = 0;
  int width = 0;
  long long vol = 0;
  long long depthSum = 0;
  std::vector<int> piles;  // indices into the pile list
};

static std::vector<Orient> buildOrients(const std::vector<Box>& boxes, const Params& p) {
  std::vector<Orient> out;
  for (int i = 0; i < (int)boxes.size(); i++) {
    const Box& b = boxes[i];
    // (face pair, depth): w×h with depth l; l×h with depth w — each rotatable.
    int cand[4][3] = {{b.w, b.h, b.l}, {b.h, b.w, b.l}, {b.l, b.h, b.w}, {b.h, b.l, b.w}};
    std::set<std::tuple<int, int, int>> seen;
    for (auto& c : cand) {
      int fw = c[0], fh = c[1], d = c[2];
      if (d > p.depthMax) continue;
      if (fh > p.maxHeight() + p.tolPerBox) continue;
      if (fw > p.maxWidth()) continue;
      if (seen.insert({fw, fh, d}).second) out.push_back({i, fw, fh, d});
    }
  }
  return out;
}

static std::vector<Cell> buildCells(const std::vector<Box>& boxes, const std::vector<Orient>& os,
                                    const Params& p) {
  std::vector<Cell> cells;
  // Singles.
  for (const Orient& o : os) {
    Cell c;
    c.mask = 1ULL << o.box;
    c.width = o.fw;
    c.height = o.fh;
    c.vol = boxes[o.box].vol;
    c.depthSum = o.d;
    c.boxes.push_back({o.box, o.fw, o.fh, o.d, 0});
    cells.push_back(std::move(c));
  }
  // Side-by-side pairs with matching heights (each box has ±tol slack).
  int hTol = 2 * p.tolPerBox;
  for (size_t i = 0; i < os.size(); i++) {
    for (size_t j = i + 1; j < os.size(); j++) {
      const Orient &a = os[i], &b = os[j];
      if (a.box == b.box) continue;
      if (std::abs(a.fh - b.fh) > hTol) continue;
      int width = a.fw + b.fw;
      if (width > p.maxWidth()) continue;
      Cell c;
      c.mask = (1ULL << a.box) | (1ULL << b.box);
      c.width = width;
      c.height = std::max(a.fh, b.fh);
      c.vol = boxes[a.box].vol + boxes[b.box].vol;
      c.depthSum = a.d + b.d;
      c.boxes.push_back({a.box, a.fw, a.fh, a.d, 0});
      c.boxes.push_back({b.box, b.fw, b.fh, b.d, a.fw});
      cells.push_back(std::move(c));
    }
  }
  // Triples: a pair plus one more height-matching box. Only worth it for the
  // wide piles nothing else can partner with (Blood on the Clocktower's
  // 366 mm face, Connect 4's 342, King's Crown's 336), so require a minimum
  // combined width to keep the candidate set lean.
  size_t pairEnd = cells.size();
  std::map<std::pair<uint64_t, int>, size_t> tripleBest;
  for (size_t ci = os.size(); ci < pairEnd; ci++) {
    for (const Orient& o : os) {
      const Cell& pc = cells[ci];
      if (pc.mask & (1ULL << o.box)) continue;
      int lo = std::min({pc.boxes[0].fh, pc.boxes[1].fh, o.fh});
      int hi = std::max({pc.boxes[0].fh, pc.boxes[1].fh, o.fh});
      if (hi - lo > hTol) continue;
      int width = pc.width + o.fw;
      if (width > p.maxWidth() || width < 250) continue;
      Cell c;
      c.mask = pc.mask | (1ULL << o.box);
      c.width = width;
      c.height = std::max(pc.height, o.fh);
      c.vol = pc.vol + boxes[o.box].vol;
      c.depthSum = pc.depthSum + o.d;
      c.boxes = pc.boxes;
      c.boxes.push_back({o.box, o.fw, o.fh, o.d, pc.width});
      auto key = std::make_pair(c.mask, c.width);
      auto it = tripleBest.find(key);
      if (it == tripleBest.end()) {
        tripleBest[key] = cells.size();
        cells.push_back(std::move(c));
      } else if (c.depthSum > cells[it->second].depthSum) {
        cells[it->second] = std::move(c);
      }
    }
  }
  return cells;
}

// Enumerate piles: DFS over cells inside a ±width-tolerance window.
static std::vector<Pile> buildPiles(const std::vector<Cell>& cells, const Params& p) {
  std::vector<int> order(cells.size());
  for (size_t i = 0; i < order.size(); i++) order[i] = (int)i;
  std::sort(order.begin(), order.end(),
            [&](int a, int b) { return cells[a].width > cells[b].width; });

  // Dedup piles by box-set; keep the best (volume, depth, narrower width).
  std::unordered_map<uint64_t, Pile> best;
  const int wTol = 2 * p.tolPerBox;
  const size_t PILE_CAP = 400000;

  struct Frame {
    uint64_t mask;
    int height;
    long long vol;
    int depthSum;
    int nLayers;  // stacked cells — height tolerance accrues per LAYER
  };
  std::vector<int> chosen;

  std::function<void(size_t, size_t, Frame)> dfs = [&](size_t anchor, size_t idx, Frame f) {
    if (best.size() > PILE_CAP) return;
    // Record when the pile plausibly reaches the nominal height. Tolerance
    // accrues once per stacked layer (a layer is as tall as its tallest box),
    // so a many-box pile cannot bank per-box slack into extra overshoot.
    if (f.height + f.nLayers * p.tolPerBox >= p.heightBase) {
      int width = cells[order[anchor]].width;
      Pile pile{f.mask, width, f.height, f.vol, f.depthSum, {}};
      pile.cells.reserve(chosen.size());
      for (int ci : chosen) pile.cells.push_back(ci);
      auto it = best.find(f.mask);
      if (it == best.end() || pile.vol > it->second.vol ||
          (pile.vol == it->second.vol &&
           (pile.depthSum > it->second.depthSum ||
            (pile.depthSum == it->second.depthSum && pile.width < it->second.width)))) {
        best[f.mask] = pile;
      }
    }
    if ((int)chosen.size() >= 6) return;
    int anchorW = cells[order[anchor]].width;
    for (size_t k = idx; k < order.size(); k++) {
      const Cell& c = cells[order[k]];
      if (c.width < anchorW - wTol) break;  // sorted desc — window ended
      if (c.mask & f.mask) continue;
      int nl = f.nLayers + 1;
      int h = f.height + c.height;
      if (h - nl * p.tolPerBox > p.maxHeight()) continue;
      chosen.push_back(order[k]);
      dfs(anchor, k + 1, {f.mask | c.mask, h, f.vol + c.vol, f.depthSum + c.depthSum, nl});
      chosen.pop_back();
    }
  };

  for (size_t a = 0; a < order.size(); a++) {
    const Cell& c = cells[order[a]];
    chosen.assign(1, order[a]);
    dfs(a, a + 1, {c.mask, c.height, c.vol, c.depthSum, 1});
  }

  std::vector<Pile> piles;
  piles.reserve(best.size());
  for (auto& [_, pile] : best) piles.push_back(std::move(pile));
  return piles;
}

// ── Global search: beam + randomized greedy over piles ─────────────────
struct State {
  uint64_t mask = 0;
  int width = 0;
  long long vol = 0;
  long long depthSum = 0;
  std::vector<int> piles;
};

static bool betterSolution(const Solution& a, const Solution& b) {
  if (a.vol != b.vol) return a.vol > b.vol;
  return a.depthSum > b.depthSum;
}

static void collect(std::map<uint64_t, Solution>& pool, const State& s,
                    const std::vector<Pile>& piles) {
  Solution sol;
  sol.mask = s.mask;
  sol.width = s.width;
  sol.vol = s.vol;
  sol.depthSum = s.depthSum;
  sol.piles = s.piles;
  auto it = pool.find(s.mask);
  if (it == pool.end() || betterSolution(sol, it->second)) pool[s.mask] = std::move(sol);
  (void)piles;
}

static void beamSearch(const std::vector<Pile>& piles, std::vector<int> order, const Params& p,
                       std::map<uint64_t, Solution>& pool, size_t beamWidth) {
  std::vector<State> beam(1);
  for (int pi : order) {
    const Pile& pile = piles[pi];
    std::vector<State> next = beam;
    for (const State& s : beam) {
      if (s.mask & pile.mask) continue;
      if (s.width + pile.width > p.maxWidth()) continue;
      State t = s;
      t.mask |= pile.mask;
      t.width += pile.width;
      t.vol += pile.vol;
      t.depthSum += pile.depthSum;
      t.piles.push_back(pi);
      next.push_back(std::move(t));
    }
    std::sort(next.begin(), next.end(), [](const State& a, const State& b) {
      if (a.vol != b.vol) return a.vol > b.vol;
      return a.depthSum > b.depthSum;
    });
    if (next.size() > beamWidth) next.resize(beamWidth);
    beam = std::move(next);
  }
  for (const State& s : beam)
    if (s.width > 0) collect(pool, s, piles);
}

static void greedyRestarts(const std::vector<Pile>& piles, const Params& p,
                           std::map<uint64_t, Solution>& pool, int iterations, uint64_t seed) {
  std::mt19937_64 rng(seed);
  std::vector<int> order(piles.size());
  for (size_t i = 0; i < order.size(); i++) order[i] = (int)i;
  for (int it = 0; it < iterations; it++) {
    // Density-biased shuffle: sort by noisy volume/width density.
    std::vector<std::pair<double, int>> keyed(order.size());
    std::uniform_real_distribution<double> noise(0.75, 1.25);
    for (size_t i = 0; i < order.size(); i++) {
      const Pile& pile = piles[i];
      keyed[i] = {-(double)pile.vol / pile.width * noise(rng), (int)i};
    }
    std::sort(keyed.begin(), keyed.end());
    State s;
    for (auto& [_, pi] : keyed) {
      const Pile& pile = piles[pi];
      if (s.mask & pile.mask) continue;
      if (s.width + pile.width > p.maxWidth()) continue;
      s.mask |= pile.mask;
      s.width += pile.width;
      s.vol += pile.vol;
      s.depthSum += pile.depthSum;
      s.piles.push_back(pi);
    }
    if (s.width > 0) collect(pool, s, piles);
  }
}

// ── PNG writer (truecolor, uncompressed deflate — no dependencies) ─────
namespace png {
static uint32_t crcTable[256];
static void initCrc() {
  for (uint32_t n = 0; n < 256; n++) {
    uint32_t c = n;
    for (int k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320u ^ (c >> 1) : c >> 1;
    crcTable[n] = c;
  }
}
static uint32_t crc(const uint8_t* buf, size_t len, uint32_t c = 0xFFFFFFFFu) {
  for (size_t i = 0; i < len; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >> 8);
  return c;
}
static void be32(std::vector<uint8_t>& v, uint32_t x) {
  v.push_back(x >> 24), v.push_back(x >> 16), v.push_back(x >> 8), v.push_back(x);
}
static void chunk(std::vector<uint8_t>& out, const char* type, const std::vector<uint8_t>& data) {
  be32(out, (uint32_t)data.size());
  size_t start = out.size();
  out.insert(out.end(), type, type + 4);
  out.insert(out.end(), data.begin(), data.end());
  uint32_t c = crc(out.data() + start, out.size() - start) ^ 0xFFFFFFFFu;
  be32(out, c);
}
static void write(const std::string& path, int W, int H, const std::vector<uint8_t>& rgb) {
  initCrc();
  std::vector<uint8_t> out = {0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
  std::vector<uint8_t> ihdr;
  be32(ihdr, W), be32(ihdr, H);
  ihdr.push_back(8), ihdr.push_back(2);  // 8-bit, truecolor
  ihdr.push_back(0), ihdr.push_back(0), ihdr.push_back(0);
  chunk(out, "IHDR", ihdr);

  // Raw scanlines with filter byte 0.
  std::vector<uint8_t> raw;
  raw.reserve((size_t)H * (W * 3 + 1));
  for (int y = 0; y < H; y++) {
    raw.push_back(0);
    raw.insert(raw.end(), rgb.begin() + (size_t)y * W * 3, rgb.begin() + (size_t)(y + 1) * W * 3);
  }
  // zlib stream with stored (uncompressed) deflate blocks.
  std::vector<uint8_t> z = {0x78, 0x01};
  size_t pos = 0;
  while (pos < raw.size()) {
    size_t n = std::min<size_t>(65535, raw.size() - pos);
    bool last = pos + n == raw.size();
    z.push_back(last ? 1 : 0);
    z.push_back(n & 0xFF), z.push_back(n >> 8);
    z.push_back(~n & 0xFF), z.push_back((~n >> 8) & 0xFF);
    z.insert(z.end(), raw.begin() + pos, raw.begin() + pos + n);
    pos += n;
  }
  uint32_t a = 1, b = 0;
  for (uint8_t byte : raw) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  be32(z, (b << 16) | a);
  chunk(out, "IDAT", z);
  chunk(out, "IEND", {});
  std::ofstream f(path, std::ios::binary);
  f.write((const char*)out.data(), (std::streamsize)out.size());
}
}  // namespace png

// ── Tiny 5×7 font for labels ───────────────────────────────────────────
static const char* FONT_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-. X";
static const uint8_t FONT[40][7] = {
    {0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11}, {0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E},
    {0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E}, {0x1E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1E},
    {0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F}, {0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10},
    {0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0F}, {0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11},
    {0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E}, {0x01, 0x01, 0x01, 0x01, 0x11, 0x11, 0x0E},
    {0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11}, {0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F},
    {0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11}, {0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11},
    {0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E}, {0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10},
    {0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D}, {0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11},
    {0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E}, {0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04},
    {0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E}, {0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04},
    {0x11, 0x11, 0x11, 0x15, 0x15, 0x1B, 0x11}, {0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11},
    {0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04}, {0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F},
    {0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E}, {0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E},
    {0x0E, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1F}, {0x0E, 0x11, 0x01, 0x06, 0x01, 0x11, 0x0E},
    {0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02}, {0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E},
    {0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E}, {0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08},
    {0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E}, {0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C},
    {0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00}, {0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0C},
    {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}, {0x00, 0x0A, 0x04, 0x0A, 0x00, 0x00, 0x00}};

struct Canvas {
  int W, H;
  std::vector<uint8_t> rgb;
  Canvas(int w, int h) : W(w), H(h), rgb((size_t)w * h * 3, 255) {}
  void px(int x, int y, int r, int g, int b) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    size_t i = ((size_t)y * W + x) * 3;
    rgb[i] = (uint8_t)r, rgb[i + 1] = (uint8_t)g, rgb[i + 2] = (uint8_t)b;
  }
  void fill(int x0, int y0, int x1, int y1, int r, int g, int b) {
    for (int y = y0; y < y1; y++)
      for (int x = x0; x < x1; x++) px(x, y, r, g, b);
  }
  void rect(int x0, int y0, int x1, int y1, int r, int g, int b) {
    for (int x = x0; x < x1; x++) px(x, y0, r, g, b), px(x, y1 - 1, r, g, b);
    for (int y = y0; y < y1; y++) px(x0, y, r, g, b), px(x1 - 1, y, r, g, b);
  }
  void dashedH(int x0, int x1, int y, int r, int g, int b) {
    for (int x = x0; x < x1; x++)
      if ((x / 5) % 2 == 0) px(x, y, r, g, b);
  }
  void dashedV(int x, int y0, int y1, int r, int g, int b) {
    for (int y = y0; y < y1; y++)
      if ((y / 5) % 2 == 0) px(x, y, r, g, b);
  }
  void text(int x, int y, const std::string& s, int r, int g, int b, int scale = 1) {
    int cx = x;
    for (char raw : s) {
      char ch = (char)toupper((unsigned char)raw);
      const char* pos = strchr(FONT_CHARS, ch);
      int gi = pos ? (int)(pos - FONT_CHARS) : 38;  // default: blank
      for (int row = 0; row < 7; row++)
        for (int col = 0; col < 5; col++)
          if (FONT[gi][row] & (1 << (4 - col)))
            for (int sy = 0; sy < scale; sy++)
              for (int sx = 0; sx < scale; sx++)
                px(cx + col * scale + sx, y + row * scale + sy, r, g, b);
      cx += 6 * scale;
    }
  }
};

static void hsv2rgb(double hue, double s, double v, int& r, int& g, int& b) {
  double c = v * s, x = c * (1 - std::abs(std::fmod(hue / 60.0, 2.0) - 1)), m = v - c;
  double rr = 0, gg = 0, bb = 0;
  if (hue < 60) rr = c, gg = x;
  else if (hue < 120) rr = x, gg = c;
  else if (hue < 180) gg = c, bb = x;
  else if (hue < 240) gg = x, bb = c;
  else if (hue < 300) rr = x, bb = c;
  else rr = c, bb = x;
  r = (int)((rr + m) * 255), g = (int)((gg + m) * 255), b = (int)((bb + m) * 255);
}

static void renderSolution(const Solution& sol, const std::vector<Pile>& piles,
                           const std::vector<Cell>& cells, const std::vector<Box>& boxes,
                           const Params& p, const std::string& path, int rank) {
  const int M = 40, TITLE = 26;
  int W = p.maxWidth() + 2 * M, H = p.maxHeight() + 2 * M + TITLE;
  Canvas cv(W, H);
  int baseY = H - M;  // floor line (y grows downward)
  int x0 = M + (p.widthBase - sol.width) / 2;  // center the overhang
  if (x0 < M - p.overLeft) x0 = M - p.overLeft;

  // Stable pile order: widest first reads best.
  std::vector<int> ordered = sol.piles;
  std::sort(ordered.begin(), ordered.end(),
            [&](int a, int b) { return piles[a].width > piles[b].width; });

  int x = x0;
  for (int pi : ordered) {
    const Pile& pile = piles[pi];
    // Tallest (heaviest) cells at the bottom, deeper first on ties —
    // steadier in real life, nicer to read.
    std::vector<int> cs = pile.cells;
    std::sort(cs.begin(), cs.end(), [&](int a, int b) {
      if (cells[a].height != cells[b].height) return cells[a].height > cells[b].height;
      return cells[a].depthSum * (long long)cells[b].boxes.size() >
             cells[b].depthSum * (long long)cells[a].boxes.size();
    });
    int y = baseY;
    for (int ci : cs) {
      const Cell& cell = cells[ci];
      for (const Placement& pl : cell.boxes) {
        int bx = x + pl.xOff, by = y - pl.fh;
        int r, g, b;
        hsv2rgb(std::fmod(47.0 * pl.box, 360.0), 0.35, 0.95, r, g, b);
        cv.fill(bx, by, bx + pl.fw, y, r, g, b);
        cv.rect(bx, by, bx + pl.fw, y, 60, 60, 60);
        std::string name = boxes[pl.box].name;
        if ((int)name.size() * 6 > pl.fw - 6) name = name.substr(0, std::max(1, (pl.fw - 6) / 6));
        char dims[64];
        snprintf(dims, sizeof dims, "%dx%d d%d", pl.fw, pl.fh, pl.d);
        if (pl.fh >= 20 && pl.fw >= 40) {
          cv.text(bx + 4, by + 3, name, 30, 30, 30);
          cv.text(bx + 4, by + 12, dims, 90, 90, 90);
        } else if (pl.fh >= 10 && pl.fw >= 40) {
          cv.text(bx + 4, by + 2, name, 30, 30, 30);
        }
      }
      y -= cell.height;
    }
    x += pile.width;
  }

  // Guides ON TOP of the boxes so they stay visible: shelf edges (solid
  // grey), overflow allowance (dashed red), floor (solid black).
  cv.rect(M, baseY - p.heightBase, M + p.widthBase, baseY + 1, 90, 90, 90);
  cv.dashedH(M - p.overLeft, M + p.widthBase + p.overRight, baseY - p.maxHeight(), 200, 40, 40);
  cv.dashedV(M - p.overLeft, baseY - p.maxHeight(), baseY, 200, 40, 40);
  cv.dashedV(M + p.widthBase + p.overRight, baseY - p.maxHeight(), baseY, 200, 40, 40);
  cv.fill(M - p.overLeft, baseY, M + p.widthBase + p.overRight, baseY + 3, 0, 0, 0);

  char title[160];
  snprintf(title, sizeof title, "SOLUTION %d  VOL %.1f L  WIDTH %d MM  BOXES %d  AVG DEPTH %lld MM",
           rank, (double)sol.vol / 1e6, sol.width,
           (int)__builtin_popcountll(sol.mask),
           sol.depthSum / std::max(1, (int)__builtin_popcountll(sol.mask)));
  cv.text(M, 12, title, 20, 20, 20, 2);
  png::write(path, W, H, cv.rgb);
}

// ── Report ─────────────────────────────────────────────────────────────
static void report(std::ostream& os, const Solution& sol, const std::vector<Pile>& piles,
                   const std::vector<Cell>& cells, const std::vector<Box>& boxes, int rank) {
  os << "── Solution " << rank << ": volume " << (double)sol.vol / 1e6 << " L, width " << sol.width
     << " mm, boxes " << __builtin_popcountll(sol.mask) << ", avg depth "
     << sol.depthSum / std::max(1, (int)__builtin_popcountll(sol.mask)) << " mm\n";
  std::vector<int> ordered = sol.piles;
  std::sort(ordered.begin(), ordered.end(),
            [&](int a, int b) { return piles[a].width > piles[b].width; });
  for (int pi : ordered) {
    const Pile& pile = piles[pi];
    os << "  pile w=" << pile.width << " h=" << pile.height << ":";
    for (int ci : pile.cells) {
      const Cell& cell = cells[ci];
      os << " [";
      for (size_t k = 0; k < cell.boxes.size(); k++) {
        const Placement& pl = cell.boxes[k];
        if (k) os << " | ";
        os << boxes[pl.box].name << " " << pl.fw << "x" << pl.fh << " d" << pl.d;
      }
      os << "]";
    }
    os << "\n";
  }
  os << "  left out:";
  bool any = false;
  for (size_t i = 0; i < boxes.size(); i++)
    if (!(sol.mask & (1ULL << i))) {
      os << " " << boxes[i].name;
      any = true;
    }
  if (!any) os << " (none)";
  os << "\n\n";
}

int main(int argc, char** argv) {
  Params p;
  std::string input;
  for (int i = 1; i < argc; i++) {
    std::string a = argv[i];
    auto next = [&](int& target) { target = std::stoi(argv[++i]); };
    if (a == "--width") next(p.widthBase);
    else if (a == "--height") next(p.heightBase);
    else if (a == "--over-left") next(p.overLeft);
    else if (a == "--over-right") next(p.overRight);
    else if (a == "--over-top") next(p.overTop);
    else if (a == "--depth-max") next(p.depthMax);
    else if (a == "--tol") next(p.tolPerBox);
    else if (a == "--solutions") next(p.solutions);
    else if (a == "--out") p.out = argv[++i];
    else input = a;
  }
  if (input.empty()) {
    std::cerr << "usage: shelf-packer boxes.csv [--out DIR] [--width MM] [--height MM]\n"
              << "       [--over-left MM] [--over-right MM] [--over-top MM]\n"
              << "       [--depth-max MM] [--tol MM] [--solutions N]\n";
    return 1;
  }

  std::vector<Box> boxes = loadBoxes(input);
  std::vector<Orient> orients = buildOrients(boxes, p);
  std::vector<Cell> cells = buildCells(boxes, orients, p);
  std::vector<Pile> piles = buildPiles(cells, p);
  std::cerr << boxes.size() << " boxes, " << orients.size() << " orientations, " << cells.size()
            << " cells, " << piles.size() << " candidate piles\n";
  if (piles.empty()) {
    std::cerr << "no valid piles — nothing reaches the required height\n";
    return 1;
  }

  std::map<uint64_t, Solution> pool;
  // Beam passes with different pile orderings.
  std::vector<int> order(piles.size());
  for (size_t i = 0; i < order.size(); i++) order[i] = (int)i;
  auto byDensity = order;
  std::sort(byDensity.begin(), byDensity.end(), [&](int a, int b) {
    return (double)piles[a].vol / piles[a].width > (double)piles[b].vol / piles[b].width;
  });
  auto byVolume = order;
  std::sort(byVolume.begin(), byVolume.end(),
            [&](int a, int b) { return piles[a].vol > piles[b].vol; });
  beamSearch(piles, byDensity, p, pool, 1500);
  beamSearch(piles, byVolume, p, pool, 1500);
  std::mt19937_64 rng(42);
  for (int pass = 0; pass < 2; pass++) {
    auto shuffled = order;
    std::shuffle(shuffled.begin(), shuffled.end(), rng);
    beamSearch(piles, shuffled, p, pool, 800);
  }
  greedyRestarts(piles, p, pool, 20000, 1234567);

  std::vector<Solution> ranked;
  ranked.reserve(pool.size());
  for (auto& [_, s] : pool) ranked.push_back(std::move(s));
  std::sort(ranked.begin(), ranked.end(), betterSolution);
  // Diversify: skip solutions that differ from an already-picked one by
  // fewer than 6 boxes (pandemic-1 ↔ pandemic-2 swaps are not "another
  // solution" to a human).
  std::vector<Solution> sols;
  for (const Solution& s : ranked) {
    bool similar = false;
    for (const Solution& kept : sols) {
      if (__builtin_popcountll(s.mask ^ kept.mask) < 6) {
        similar = true;
        break;
      }
    }
    if (!similar) sols.push_back(s);
    if ((int)sols.size() >= p.solutions) break;
  }

  std::string mk = "mkdir -p " + p.out;
  if (system(mk.c_str()) != 0) std::cerr << "warning: could not create " << p.out << "\n";
  std::ofstream rep(p.out + "/solutions.txt");
  for (size_t i = 0; i < sols.size(); i++) {
    report(std::cout, sols[i], piles, cells, boxes, (int)i + 1);
    report(rep, sols[i], piles, cells, boxes, (int)i + 1);
    char path[256];
    snprintf(path, sizeof path, "%s/solution_%02d.png", p.out.c_str(), (int)i + 1);
    renderSolution(sols[i], piles, cells, boxes, p, path, (int)i + 1);
  }
  std::cerr << "wrote " << sols.size() << " solutions to " << p.out << "/\n";
  return 0;
}
