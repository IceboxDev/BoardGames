# 7 Wonders C++ engine — plain Makefile (no CMake dependency).
# Targets: `make test` (build+run unit/parity tests), `make cli` (sw7 binary),
# `make bench` (optimized cli + run bench), `make clean`.

CXX      ?= g++
CXXSTD   ?= -std=c++20
OPT      ?= -O2
WARN     ?= -Wall -Wextra
INCLUDES  = -Iinclude -Itests
CXXFLAGS  = $(CXXSTD) $(OPT) $(WARN) $(INCLUDES)

BUILD     = build
SRC       = $(wildcard src/*.cpp)
TEST_SRC  = $(wildcard tests/*.cpp)
CLI_SRC   = cli/main.cpp

TEST_BIN  = $(BUILD)/sw_tests
CLI_BIN   = $(BUILD)/sw7

.PHONY: all test cli agent bench clean
all: test cli

$(BUILD):
	mkdir -p $(BUILD)

test: $(TEST_BIN)
	./$(TEST_BIN)

$(TEST_BIN): $(SRC) $(TEST_SRC) | $(BUILD)
	$(CXX) $(CXXFLAGS) $(SRC) $(TEST_SRC) -o $@

cli: $(CLI_BIN)

$(CLI_BIN): $(SRC) $(CLI_SRC) | $(BUILD)
	$(CXX) $(CXXFLAGS) $(SRC) $(CLI_SRC) -o $@

# Optimized deploy binary (the v1 AI the server auto-loads at build/sw7).
agent: | $(BUILD)
	$(CXX) $(CXXSTD) -O3 -march=native -DNDEBUG $(INCLUDES) $(SRC) $(CLI_SRC) -o $(CLI_BIN)

# Optimized build for throughput numbers.
bench: agent
	./$(CLI_BIN) bench

clean:
	rm -rf $(BUILD)
