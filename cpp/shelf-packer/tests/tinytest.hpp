// Minimal, offline, header-only test framework (doctest substitute — no download
// needed). Provides TEST_CASE / CHECK / CHECK_EQ / REQUIRE and a run_all() driver.
#pragma once
#include <cstdio>
#include <sstream>
#include <string>
#include <vector>

namespace tinytest {

using Fn = void (*)();
struct TestCase {
  const char* name;
  Fn fn;
};

inline std::vector<TestCase>& registry() {
  static std::vector<TestCase> r;
  return r;
}
inline int& failures() {
  static int f = 0;
  return f;
}
inline int& checks() {
  static int c = 0;
  return c;
}
inline const char*& current() {
  static const char* c = "";
  return c;
}

struct Registrar {
  Registrar(const char* n, Fn fn) { registry().push_back({n, fn}); }
};

inline void report_fail(const char* file, int line, const std::string& msg) {
  failures()++;
  std::fprintf(stderr, "  FAIL [%s] %s:%d: %s\n", current(), file, line, msg.c_str());
}

inline int run_all(const char* filter = nullptr) {
  int passed = 0, ran = 0;
  for (auto& tc : registry()) {
    if (filter && std::string(tc.name).find(filter) == std::string::npos) continue;
    ran++;
    current() = tc.name;
    int before = failures();
    tc.fn();
    if (failures() == before)
      passed++;
    else
      std::fprintf(stderr, "TEST FAILED: %s\n", tc.name);
  }
  std::fprintf(stderr, "\n%d tests run, %d passed, %d checks, %d failures\n", ran, passed,
              checks(), failures());
  return failures() == 0 ? 0 : 1;
}

}  // namespace tinytest

#define TT_CONCAT_(a, b) a##b
#define TT_CONCAT(a, b) TT_CONCAT_(a, b)

#define TEST_CASE(name)                                                       \
  static void TT_CONCAT(tt_fn_, __LINE__)();                                  \
  static ::tinytest::Registrar TT_CONCAT(tt_reg_, __LINE__)(name,             \
                                                            TT_CONCAT(tt_fn_, __LINE__)); \
  static void TT_CONCAT(tt_fn_, __LINE__)()

#define CHECK(expr)                                                        \
  do {                                                                     \
    ::tinytest::checks()++;                                                \
    if (!(expr)) ::tinytest::report_fail(__FILE__, __LINE__, "CHECK(" #expr ")"); \
  } while (0)

#define CHECK_EQ(a, b)                                                              \
  do {                                                                              \
    ::tinytest::checks()++;                                                         \
    auto _va = (a);                                                                 \
    auto _vb = (b);                                                                 \
    if (!(_va == _vb)) {                                                            \
      std::ostringstream _os;                                                       \
      _os << "CHECK_EQ(" #a ", " #b ") got " << _va << " vs " << _vb;               \
      ::tinytest::report_fail(__FILE__, __LINE__, _os.str());                       \
    }                                                                               \
  } while (0)

#define REQUIRE(expr)                                                          \
  do {                                                                         \
    ::tinytest::checks()++;                                                    \
    if (!(expr)) {                                                             \
      ::tinytest::report_fail(__FILE__, __LINE__, "REQUIRE(" #expr ")");       \
      return;                                                                  \
    }                                                                          \
  } while (0)
