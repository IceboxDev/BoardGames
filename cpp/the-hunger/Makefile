# The Hunger C++ engine — plain Makefile (no CMake dependency).
# Targets: `make test` (build + unit tests + parity replay of the committed
# fixtures), `make cli` / `make agent` (optimized build/hg), `make bench`,
# `make clean`. `make parity DIR=/tmp/hunger-parity` replays a big sweep.
# `make wasm` builds build/hunger.wasm (wasi-sdk) for the TS bridge;
# `pnpm build-hunger-wasm` runs it and embeds the bytes in TS.

CXX      ?= g++
CXXSTD   ?= -std=c++20
OPT      ?= -O2
# No FMA contraction / fast-math anywhere: Nosferatu's and Strigoi's float
# arithmetic must round exactly like V8's.
FPFLAGS   = -ffp-contract=off -fno-fast-math
WARN     ?= -Wall -Wextra
INCLUDES  = -Iinclude -Itests
CXXFLAGS  = $(CXXSTD) $(OPT) $(FPFLAGS) $(WARN) $(INCLUDES)
LDFLAGS  ?= -pthread

BUILD     = build
SRC       = $(wildcard src/*.cpp)
HDR       = $(wildcard include/hg/*.hpp)
TEST_SRC  = $(wildcard tests/*.cpp)
CLI_SRC   = cli/main.cpp

TEST_BIN  = $(BUILD)/hg_tests
CLI_BIN   = $(BUILD)/hg
DIR      ?= tests/fixtures

# WebAssembly (the TS server's bridge, search/wasm-agent.ts): a WASI reactor
# with no main, same FP flags, no exceptions/RTTI, SIMD128 (~20% faster
# playouts; IEEE lanes, no FMA, so the same bits). parity.cpp (filesystem
# fixture replay) is left out so the module needs almost no WASI imports.
WASI_SDK ?= $(HOME)/.local/wasi-sdk-34.0-x86_64-linux
WASM_CXX  = $(WASI_SDK)/bin/wasm32-wasip1-clang++
WASM_SRC  = $(filter-out src/parity.cpp,$(SRC)) wasm/agent.cpp
WASM_BIN  = $(BUILD)/hunger.wasm
WASM_FLAGS = $(CXXSTD) -O3 -DNDEBUG $(FPFLAGS) $(WARN) $(INCLUDES) \
  -fno-exceptions -fno-rtti -msimd128 -mexec-model=reactor \
  -Wl,--strip-all -Wl,-z,stack-size=1048576 -Wl,--initial-memory=4194304

.PHONY: all test cli agent bench parity clean wasm
all: test cli

$(BUILD):
	mkdir -p $(BUILD)

test: $(TEST_BIN)
	./$(TEST_BIN)

$(TEST_BIN): $(SRC) $(HDR) $(TEST_SRC) | $(BUILD)
	$(CXX) $(CXXFLAGS) $(SRC) $(TEST_SRC) -o $@ $(LDFLAGS)

cli: $(CLI_BIN)

$(CLI_BIN): $(SRC) $(HDR) $(CLI_SRC) | $(BUILD)
	$(CXX) $(CXXSTD) -O3 -march=native -DNDEBUG $(FPFLAGS) $(WARN) $(INCLUDES) $(SRC) $(CLI_SRC) -o $@ $(LDFLAGS)

# Optimized binary (same as cli; kept for parity with cpp/seven-wonders).
agent: cli

bench: cli
	./$(CLI_BIN) bench

parity: cli
	./$(CLI_BIN) parity $(DIR)

wasm: $(WASM_BIN)

$(WASM_BIN): $(SRC) $(HDR) wasm/agent.cpp | $(BUILD)
	$(WASM_CXX) $(WASM_FLAGS) $(WASM_SRC) -o $@

clean:
	rm -rf $(BUILD)
