#!/bin/bash
# Boot script for a farm fleet instance (Amazon Linux 2023): build the pinned
# Stockfish for this CPU and install Node. The worker itself arrives from ws21
# (`aws-attach.sh`), which also writes /home/ec2-user/farm/farm.env.
set -eux
dnf -y -q install gcc-c++ make git
dnf -y -q install nodejs22 || dnf -y -q install nodejs20 || dnf -y -q install nodejs
command -v node || ln -sf "$(ls /usr/bin/node-* | head -1)" /usr/bin/node
sudo -u ec2-user bash -c '
  set -eux
  mkdir -p ~/farm/bin
  cd ~ && git clone -q https://github.com/official-stockfish/Stockfish sf
  cd sf && git checkout -q 5c4cef0b && cd src
  make -j2 profile-build ARCH=x86-64-avx512icl >/tmp/sf-build.log 2>&1
  cp stockfish ~/farm/bin/stockfish-5c4cef0b
'
touch /home/ec2-user/farm/.ready
