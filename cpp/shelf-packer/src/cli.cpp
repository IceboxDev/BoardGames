#include "sp/cli.hpp"

#include <functional>
#include <optional>
#include <sstream>

namespace sp {

namespace {

// Flags as typed, before boxes.csv is read.
struct RawArgs {
  std::vector<std::string> positional;
  Geometry geo;
  std::optional<int> depthMax;
  std::vector<int> shelves;
  int spillCost = 50;
  bool flat = false, fillAll = false, vertInside = false, useAll = false;
  std::vector<std::string> require, together, stack, pair, requires_, exclude, longEdge, pinA;
  RunOptions run;
};

struct Flag {
  const char* name;
  const char* value;  // nullptr: a switch
  const char* help;
  std::function<void(RawArgs&, const std::string&)> apply;
};

int number(const char* flag, const std::string& v, int min) {
  int n = 0;
  if (!parseInt(v, n)) throw InputError(std::string(flag) + ": '" + v + "' is not a whole number");
  if (n < min)
    throw InputError(std::string(flag) + ": " + v + " is below the minimum " + std::to_string(min));
  return n;
}

const std::vector<Flag>& flags() {
  static const std::vector<Flag> table = {
      // Shelf rectangle (mm).
      {"--width", "MM", "nominal width (850)",
       [](RawArgs& r, const std::string& v) { r.geo.widthBase = number("--width", v, 1); }},
      {"--height", "MM", "nominal height every pile reaches (250)",
       [](RawArgs& r, const std::string& v) { r.geo.heightBase = number("--height", v, 1); }},
      {"--over-left", "MM", "reserve left of the window (30)",
       [](RawArgs& r, const std::string& v) { r.geo.overLeft = number("--over-left", v, 0); }},
      {"--over-right", "MM", "reserve right of the window (30)",
       [](RawArgs& r, const std::string& v) { r.geo.overRight = number("--over-right", v, 0); }},
      {"--over-top", "MM", "reserve above the window (35)",
       [](RawArgs& r, const std::string& v) { r.geo.overTop = number("--over-top", v, 0); }},
      {"--depth-max", "MM", "depth of the single shelf (325)",
       [](RawArgs& r, const std::string& v) { r.depthMax = number("--depth-max", v, 1); }},
      {"--shelf", "MM", "add a shelf of this depth (repeat; up to 4)",
       [](RawArgs& r, const std::string& v) { r.shelves.push_back(number("--shelf", v, 1)); }},
      {"--tol", "MM", "measurement tolerance per box (1)",
       [](RawArgs& r, const std::string& v) { r.geo.tolPerBox = number("--tol", v, 0); }},
      {"--width-slack", "MM", "extra width mismatch a pile may absorb as holes (0)",
       [](RawArgs& r, const std::string& v) { r.geo.widthSlack = number("--width-slack", v, 0); }},
      {"--height-slack", "MM", "how far below nominal a pile top may stop (0)",
       [](RawArgs& r, const std::string& v) { r.geo.heightSlack = number("--height-slack", v, 0); }},
      // Objective and placement rules.
      {"--fill-all", nullptr, "fill every shelf completely, fewest holes (needs --shelf)",
       [](RawArgs& r, const std::string&) { r.fillAll = true; }},
      {"--spill-cost", "PCT", "reserve-spill penalty, % of full-depth volume per mm2 (50)",
       [](RawArgs& r, const std::string& v) { r.spillCost = number("--spill-cost", v, 0); }},
      {"--flat", nullptr, "no standing (spine-out) placements",
       [](RawArgs& r, const std::string&) { r.flat = true; }},
      {"--vert-inside", nullptr, "standing boxes keep their tops under the nominal height",
       [](RawArgs& r, const std::string&) { r.vertInside = true; }},
      {"--use-all", nullptr, "every box must be placed",
       [](RawArgs& r, const std::string&) { r.useAll = true; }},
      {"--exclude", "PAT", "leave these boxes out entirely (repeat)",
       [](RawArgs& r, const std::string& v) { r.exclude.push_back(v); }},
      {"--pin-a", "PAT", "these boxes only on shelf A (repeat)",
       [](RawArgs& r, const std::string& v) { r.pinA.push_back(v); }},
      {"--long-edge", "PAT", "group contacts of these boxes count along their long edge only",
       [](RawArgs& r, const std::string& v) { r.longEdge.push_back(v); }},
      // Groups.
      {"--require", "PAT", "must be packed, all touching as one cluster (repeat)",
       [](RawArgs& r, const std::string& v) { r.require.push_back(v); }},
      {"--pair", "A,B[,…]", "must be packed, touching each other (repeat)",
       [](RawArgs& r, const std::string& v) { r.pair.push_back(v); }},
      {"--together", "A,B[,…]", "all or none, touching each other (repeat)",
       [](RawArgs& r, const std::string& v) { r.together.push_back(v); }},
      {"--stack", "A,B[,…]", "all or none, as a tower or a standing row (repeat)",
       [](RawArgs& r, const std::string& v) { r.stack.push_back(v); }},
      {"--requires", "DEP,PROV", "DEP only with PROV, long edges meeting (repeat)",
       [](RawArgs& r, const std::string& v) { r.requires_.push_back(v); }},
      // Run.
      {"--solutions", "N", "packings to emit (8)",
       [](RawArgs& r, const std::string& v) { r.run.solutions = number("--solutions", v, 1); }},
      {"--seed", "N", "search seed: other seeds explore other packings",
       [](RawArgs& r, const std::string& v) { r.run.seed = (uint64_t)number("--seed", v, 0); }},
      {"--out", "DIR", "output directory (out)",
       [](RawArgs& r, const std::string& v) { r.run.outDir = v; }},
      {"--warm", "DIR", "start from DIR/packings.txt of an earlier run (repeat)",
       [](RawArgs& r, const std::string& v) { r.run.warmDirs.push_back(v); }},
      {"--library", "FILE", "persistent column library: read, then re-curated",
       [](RawArgs& r, const std::string& v) { r.run.libraryPath = v; }},
      {"--verify", "DIR", "re-check DIR/packings.txt under these flags instead of searching",
       [](RawArgs& r, const std::string& v) { r.run.verifyDir = v; }},
      {"--piles-only", nullptr, "debug: stop after building the candidates",
       [](RawArgs& r, const std::string&) { r.run.pilesOnly = true; }},
  };
  return table;
}

std::vector<std::string> splitList(const std::string& s) {
  std::vector<std::string> out;
  std::stringstream ss(s);
  for (std::string part; std::getline(ss, part, ',');) out.push_back(part);
  return out;
}

BoxSet resolve(const std::vector<Box>& boxes, const std::string& flag, const std::string& pattern) {
  if (pattern.empty()) throw InputError(flag + ": empty box name");
  BoxSet s = matchBoxes(boxes, pattern);
  if (s.empty()) throw InputError(flag + " " + pattern + ": matches no box");
  return s;
}

Group resolveGroup(const std::vector<Box>& boxes, const char* flag, const std::string& list,
                   Contact contact, Presence presence) {
  Group g;
  g.origin = std::string(flag) + " " + list;
  for (const std::string& part : splitList(list)) g.members |= resolve(boxes, flag, part);
  if (g.members.count() < 2) throw InputError(g.origin + ": needs at least two boxes");
  g.contact = contact;
  g.presence = presence;
  return g;
}

}  // namespace

std::string usage() {
  std::ostringstream os;
  os << "usage: shelf-packer BOXES.csv [flags]\n\n"
        "Packs board game boxes into flush front rectangles. PAT is a box name or\n"
        "PREFIX* ; every PAT must match at least one box. Exit status: 0 done,\n"
        "1 nothing found (or --verify found problems), 2 bad input.\n\n";
  for (const Flag& f : flags()) {
    std::string left = std::string(f.name) + (f.value ? std::string(" ") + f.value : "");
    os << "  " << left << std::string(left.size() < 22 ? 22 - left.size() : 1, ' ') << f.help
       << "\n";
  }
  os << "  --help                show this\n";
  return os.str();
}

Config parseCommandLine(const std::vector<std::string>& args) {
  Config cfg;
  RawArgs raw;
  for (size_t i = 0; i < args.size(); i++) {
    const std::string& a = args[i];
    if (a == "--help" || a == "-h") {
      cfg.help = true;
      return cfg;
    }
    if (a.rfind("-", 0) != 0) {
      raw.positional.push_back(a);
      continue;
    }
    const Flag* flag = nullptr;
    for (const Flag& f : flags())
      if (a == f.name) flag = &f;
    if (!flag) throw InputError("unknown flag " + a);
    std::string value;
    if (flag->value) {
      if (i + 1 >= args.size()) throw InputError(a + " needs a value (" + flag->value + ")");
      value = args[++i];
    }
    flag->apply(raw, value);
  }
  if (raw.positional.size() != 1)
    throw InputError(raw.positional.empty() ? "missing BOXES.csv"
                                            : "expected one BOXES.csv, got " +
                                                  std::to_string(raw.positional.size()) +
                                                  " positional arguments");

  // Shelves and objective.
  if (raw.depthMax && !raw.shelves.empty())
    throw InputError("--depth-max and --shelf both set the depth; use one");
  if ((int)raw.shelves.size() > kMaxShelves)
    throw InputError("at most " + std::to_string(kMaxShelves) + " --shelf flags");
  if (raw.fillAll && raw.shelves.empty())
    throw InputError("--fill-all needs its shelves: --shelf DEPTH once per shelf");
  if (!raw.pinA.empty() && raw.shelves.size() < 2)
    throw InputError("--pin-a needs at least two shelves (--shelf)");
  if (!raw.run.verifyDir.empty() &&
      (!raw.run.warmDirs.empty() || !raw.run.libraryPath.empty() || raw.run.pilesOnly))
    throw InputError("--verify checks an existing run; drop --warm/--library/--piles-only");

  Problem& p = cfg.problem;
  cfg.boxesPath = raw.positional[0];
  p.boxes = loadBoxesCsv(cfg.boxesPath);
  p.geo = raw.geo;
  p.shelfDepths = raw.shelves.empty() ? std::vector<int>{raw.depthMax.value_or(kDefaultShelfDepth)} : raw.shelves;
  p.objective = raw.fillAll ? Objective::FillAll : Objective::MaxVolume;
  p.spillCost = raw.spillCost;
  p.flatOnly = raw.flat;
  p.vertInside = raw.vertInside;
  p.useAll = raw.useAll;

  for (const std::string& pat : raw.exclude) {
    BoxSet gone = resolve(p.boxes, "--exclude", pat);
    std::vector<Box> kept;
    for (int i = 0; i < (int)p.boxes.size(); i++)
      if (!gone.has(i)) kept.push_back(std::move(p.boxes[i]));
    p.boxes = std::move(kept);
    if (p.boxes.empty()) throw InputError("--exclude left no boxes");
  }
  for (const std::string& pat : raw.longEdge) p.longEdge |= resolve(p.boxes, "--long-edge", pat);
  for (const std::string& pat : raw.pinA) p.pinnedFirst |= resolve(p.boxes, "--pin-a", pat);

  if (!raw.require.empty()) {
    Group g;
    g.origin = "--require";
    for (const std::string& pat : raw.require) {
      g.members |= resolve(p.boxes, "--require", pat);
      g.origin += " " + pat;
    }
    g.contact = Contact::Touch;
    g.presence = Presence::Mandatory;
    p.groups.push_back(std::move(g));
  }
  for (const std::string& s : raw.pair)
    p.groups.push_back(resolveGroup(p.boxes, "--pair", s, Contact::Touch, Presence::Mandatory));
  for (const std::string& s : raw.together)
    p.groups.push_back(resolveGroup(p.boxes, "--together", s, Contact::Touch, Presence::AllOrNone));
  for (const std::string& s : raw.stack)
    p.groups.push_back(
        resolveGroup(p.boxes, "--stack", s, Contact::StrictRun, Presence::AllOrNone));
  for (const std::string& s : raw.requires_) {
    std::vector<std::string> parts = splitList(s);
    if (parts.size() != 2) throw InputError("--requires " + s + ": expected DEP,PROV");
    Group g;
    g.origin = "--requires " + s;
    g.dependents = resolve(p.boxes, "--requires", parts[0]);
    BoxSet providers = resolve(p.boxes, "--requires", parts[1]);
    if (g.dependents.intersects(providers))
      throw InputError(g.origin + ": a box cannot require itself");
    g.members = g.dependents | providers;
    g.contact = Contact::LongEdgeBoth;
    g.presence = Presence::Requires;
    p.groups.push_back(std::move(g));
  }
  cfg.run = raw.run;
  return cfg;
}

}  // namespace sp
