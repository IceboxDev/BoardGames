// Test driver: `hg_tests [filter]`.
#include "tinytest.hpp"

int main(int argc, char** argv) { return tinytest::run_all(argc > 1 ? argv[1] : nullptr); }
