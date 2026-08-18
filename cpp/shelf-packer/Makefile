CXX ?= g++
CXXFLAGS ?= -O2 -std=c++17 -Wall -Wextra

shelf-packer: main.cpp
	$(CXX) $(CXXFLAGS) -o $@ $<

run: shelf-packer
	./shelf-packer boxes.csv --out out --require 'exit-*' --together publish,campus

clean:
	rm -rf shelf-packer out

.PHONY: run clean

fill: shelf-packer
	./shelf-packer boxes.csv --out out-fill --fill-all --shelf 325 --shelf 470 --require 'exit-*' --together publish,campus

ultimate: shelf-packer
	./shelf-packer boxes.csv --out out-ultimate-ws --fill-all --vert-inside --width-slack 4 --height-slack 15 --require 'exit-*' --together publish,campus --pin-a 'exit-*'
