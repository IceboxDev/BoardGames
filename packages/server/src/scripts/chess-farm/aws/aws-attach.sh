#!/usr/bin/env bash
# Run ON ws21: put the farm worker on fleet instances and tunnel them to ws21's
# farm API. For each IP: wait for the boot build, copy worker.mjs and an env
# (the farm token never leaves ws21 except over this SSH link), run one worker
# per vCPU (`chess-farm@1..N`: every search single-threaded, like ws21's — see
# core's `SEARCH`), then start `farm-tunnel@<ip>`: a reverse SSH tunnel giving the
# instance ws21's farm API (localhost:3001) and Lc0 (localhost:3002).
#
#   ~/chess-farm/aws-attach.sh 13.61.1.2 13.61.3.4 …
set -euo pipefail
cd ~/chess-farm
KEY=~/.ssh/chess_farm_ed25519
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o BatchMode=yes -o LogLevel=ERROR)
token="$(grep '^CHESS_FARM_TOKEN=' farm.env | cut -d= -f2-)"
lc0_label="$(grep '^LC0_LABEL=' farm.env | cut -d= -f2-)"
for ip in "$@"; do
  name="aws-$(echo "$ip" | tr . -)"
  echo "== $ip ($name)"
  for _ in $(seq 1 90); do
    "${SSH[@]}" "ec2-user@$ip" test -f farm/.ready 2>/dev/null && break
    sleep 10
  done
  "${SSH[@]}" "ec2-user@$ip" test -f farm/.ready || { echo "  not ready (boot build still running?)"; continue; }
  scp -q -i "$KEY" -o BatchMode=yes -o LogLevel=ERROR worker.mjs "ec2-user@$ip:farm/"
  lanes="$("${SSH[@]}" "ec2-user@$ip" nproc)"
  "${SSH[@]}" "ec2-user@$ip" "umask 077; cat > farm/farm.env" <<ENV
FARM_URL=http://localhost:3001
CHESS_FARM_TOKEN=$token
FARM_KINDS=user,opp
FARM_ORDER=deep
FARM_IDLE_EXIT_MIN=60
LC0_URL=http://localhost:3002/
LC0_LABEL=$lc0_label
SF_PATH=/home/ec2-user/farm/bin/stockfish-5c4cef0b
SF_LABEL=dev-20261013-5c4cef0b
ENV
  "${SSH[@]}" "ec2-user@$ip" 'sudo tee /etc/systemd/system/chess-farm@.service >/dev/null' <<UNIT
[Unit]
Description=Chess analysis farm worker, lane %i
After=network-online.target

[Service]
User=ec2-user
WorkingDirectory=/home/ec2-user/farm
EnvironmentFile=/home/ec2-user/farm/farm.env
Environment=FARM_WORKER=$name-%i
ExecStart=/usr/bin/node worker.mjs
Restart=on-failure
RestartSec=30
# A worker exits 0 only after an idle hour; the machine stops (not terminates) once
# every lane has. A stop or restart exits 143 and never powers anything off.
ExecStopPost=/bin/sh -c 'if [ "\$SERVICE_RESULT" = success ] && [ "\$EXIT_STATUS" = 0 ] && ! systemctl list-units --state=active --plain --no-legend "chess-farm@*" | grep -q .; then /usr/sbin/shutdown -h now; fi'

[Install]
WantedBy=multi-user.target
UNIT
  units="$(seq -f "chess-farm@%g" 1 "$lanes" | tr '\n' ' ')"
  "${SSH[@]}" "ec2-user@$ip" "sudo systemctl disable --now chess-farm.service 2>/dev/null; sudo rm -f /etc/systemd/system/chess-farm.service; sudo systemctl daemon-reload && sudo systemctl enable $units && sudo systemctl restart $units"
  systemctl --user enable --now "farm-tunnel@$ip.service"
  echo "  attached: $lanes lanes"
done
