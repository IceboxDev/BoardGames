#include "tinytest.hpp"

// Single entry point; all TEST_CASE registrations across the tests/ TU set run here.
// Optional substring filter: ./sw_tests <filter>
int main(int argc, char** argv) {
  return ::tinytest::run_all(argc > 1 ? argv[1] : nullptr);
}
