#include "tinytest.hpp"

TEST_CASE("smoke: framework runs") {
  CHECK(1 + 1 == 2);
  CHECK_EQ(2 * 3, 6);
}
