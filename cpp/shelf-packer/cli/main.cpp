// shelf-packer — packs board game boxes into flush front rectangles.
// See README.md; `shelf-packer --help` lists every flag.
#include <exception>
#include <iostream>
#include <string>
#include <vector>

#include "sp/cli.hpp"
#include "sp/driver.hpp"

int main(int argc, char** argv) {
  std::vector<std::string> args(argv + 1, argv + argc);
  try {
    sp::Config cfg = sp::parseCommandLine(args);
    if (cfg.help) {
      std::cout << sp::usage();
      return 0;
    }
    return sp::runPacker(cfg);
  } catch (const sp::InputError& e) {
    std::cerr << "shelf-packer: " << e.what() << "\n(shelf-packer --help lists every flag)\n";
    return 2;
  } catch (const std::exception& e) {
    std::cerr << "shelf-packer: internal error: " << e.what() << "\n";
    return 3;
  }
}
