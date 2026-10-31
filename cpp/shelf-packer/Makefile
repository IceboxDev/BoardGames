# shelf-packer — plain Makefile (no CMake), same layout as cpp/the-hunger.
#   make            build/shelf-packer
#   make test       unit tests (ASan + UBSan) and the CLI scenarios
#   make run | fill | ultimate   the canonical runs, each verified afterwards
#   make clean
# On the laptop g++ lives in the `cxx` toolbox: toolbox run -c cxx make test

CXX      ?= g++
CXXSTD   ?= -std=c++20
OPT      ?= -O2
WARN     ?= -Wall -Wextra -Wpedantic -Wshadow -Werror
CXXFLAGS  = $(CXXSTD) $(OPT) $(WARN) -Iinclude -MMD -MP
# Tests run under ASan + UBSan wherever their runtime is installed (in the
# toolbox: sudo dnf install libasan libubsan); elsewhere without, saying so.
SANITIZE_FLAGS = -fsanitize=address,undefined -fno-omit-frame-pointer -fno-sanitize-recover=all
SANITIZE ?= $(shell echo 'int main(){}' | $(CXX) -x c++ $(SANITIZE_FLAGS) - -o /dev/null \
  2>/dev/null && echo '$(SANITIZE_FLAGS)')

BUILD     = build
SRC       = $(wildcard src/*.cpp)
OBJ       = $(SRC:src/%.cpp=$(BUILD)/obj/%.o)
TEST_SRC  = $(wildcard tests/*.cpp)
BIN       = $(BUILD)/shelf-packer
TEST_BIN  = $(BUILD)/sp_tests

# The canonical runs (README "Usage").
COMMON    = boxes.csv --require 'exit-*' --together publish,campus \
  --exclude buttons-bugs --stack medical-nyc,medical-miami --vert-inside
RUN_FLAGS = $(COMMON)
FILL_FLAGS = $(COMMON) --fill-all --shelf 325 --shelf 470 --pin-a 'exit-*'
ULTIMATE_FLAGS = $(COMMON) --fill-all --shelf 325 --shelf 470 --width-slack 4 \
  --height-slack 15 --pin-a 'exit-*'

.PHONY: all test unit scenarios run fill ultimate clean
all: $(BIN)

$(BUILD)/obj/%.o: src/%.cpp
	@mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD)/obj/cli/main.o: cli/main.cpp
	@mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(BIN): $(OBJ) $(BUILD)/obj/cli/main.o
	$(CXX) $(CXXFLAGS) $^ -o $@

# Tests compile everything again with sanitizers: separate objects, same sources.
$(TEST_BIN): $(SRC) $(TEST_SRC) $(wildcard include/sp/*.hpp) tests/tinytest.hpp
	@mkdir -p $(BUILD)
	@$(if $(SANITIZE),,echo "note: sanitizer runtime not found; unit tests build without ASan/UBSan")
	$(CXX) $(CXXSTD) -O1 -g $(WARN) -Iinclude -Itests $(SANITIZE) $(SRC) $(TEST_SRC) -o $@

test: unit scenarios

unit: $(TEST_BIN)
	./$(TEST_BIN)

scenarios: $(BIN)
	tests/scenarios.sh ./$(BIN)

run: $(BIN)
	./$(BIN) $(RUN_FLAGS) --out out
	./$(BIN) $(RUN_FLAGS) --verify out

fill: $(BIN)
	./$(BIN) $(FILL_FLAGS) --out out-fill
	./$(BIN) $(FILL_FLAGS) --verify out-fill

ultimate: $(BIN)
	./$(BIN) $(ULTIMATE_FLAGS) --out out-ultimate
	./$(BIN) $(ULTIMATE_FLAGS) --verify out-ultimate

clean:
	rm -rf $(BUILD)

-include $(OBJ:.o=.d) $(BUILD)/obj/cli/main.d
