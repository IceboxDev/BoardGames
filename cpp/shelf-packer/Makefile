CXX ?= g++
CXXFLAGS ?= -O2 -std=c++17 -Wall -Wextra

shelf-packer: main.cpp
	$(CXX) $(CXXFLAGS) -o $@ $<

run: shelf-packer
	./shelf-packer boxes.csv --out out

clean:
	rm -rf shelf-packer out

.PHONY: run clean
