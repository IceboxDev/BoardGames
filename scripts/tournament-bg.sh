#!/usr/bin/env bash
# Run AI tournaments in the background as a systemd user service, one step
# after another — safe from the terminal (or a Claude session) closing, and
# from memory pressure killing a shell's children.
#
#   scripts/tournament-bg.sh "the-hunger --games 50 --players 2" "chess --games 16" ...
#   scripts/tournament-bg.sh --status        # what's running, and the log's tail
#   scripts/tournament-bg.sh --stop          # stop it (the journal keeps every finished game)
#
# Each step is the tournament CLI's arguments. A step that fails or is killed
# (OOM, a crash) is restarted after 2 min and resumes from its journal
# (scratch/tournaments/<slug>.jsonl); finished steps are not played again,
# even by a relaunch of the same queue after systemd gave up.
# Low priority, and when memory runs out the kernel kills one of its workers
# (before the desktop) — that costs the game it held, which the restart
# replays; the run itself carries on (OOMPolicy=continue).
# KATAGO_BIN / KATAGO_MODEL / KATAGO_HUMAN_MODEL are passed through when set.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$REPO/scratch/tournaments"
# TOURNAMENT_UNIT names the queue (unit, log, stamps), so two queues can run side by side.
UNIT="${TOURNAMENT_UNIT:-tournaments}"
LOG="$DIR/$UNIT.log"

# A finished step's mark, keyed by its words: a relaunch of the same queue skips it.
stamp_for() { echo "$DIR/$UNIT.$(printf '%s' "$1" | sha1sum | cut -c1-12).done"; }

case "${1:-}" in
  --status)
    if systemctl --user is-active --quiet "$UNIT.service"; then
      echo "running since $(systemctl --user show "$UNIT.service" -p ActiveEnterTimestamp --value)," \
        "$(systemctl --user show "$UNIT.service" -p NRestarts --value) restarts"
    else
      echo "not running"
    fi
    [[ -f "$LOG" ]] && tr '\r' '\n' <"$LOG" | grep -a . | tail -15
    exit 0
    ;;
  --stop)
    systemctl --user stop "$UNIT.service"
    exit 0
    ;;
  "" | -h | --help)
    sed -n '2,16p' "$0"
    exit 0
    ;;
  --run)
    # Inside the service: play each step not yet stamped done.
    shift
    cd "$REPO"
    i=0
    for step in "$@"; do
      i=$((i + 1))
      stamp="$(stamp_for "$step")"
      [[ -f "$stamp" ]] && continue
      echo "=== step $i/$#: $step  ($(date '+%F %T'))"
      # shellcheck disable=SC2086 # the step is CLI words
      pnpm --filter @boardgames/core tournament $step
      touch "$stamp"
    done
    rm -f "$DIR/$UNIT".*.done
    echo "=== all $# steps done ($(date '+%F %T'))"
    exit 0
    ;;
esac

if systemctl --user is-active --quiet "$UNIT.service"; then
  echo "A tournament run is already going — scripts/tournament-bg.sh --status" >&2
  exit 1
fi
mkdir -p "$DIR"
systemctl --user reset-failed "$UNIT.service" 2>/dev/null || true

env_args=(--setenv=PATH="$PATH" --setenv=HOME="$HOME")
for v in KATAGO_BIN KATAGO_MODEL KATAGO_HUMAN_MODEL; do
  [[ -n "${!v:-}" ]] && env_args+=("--setenv=$v=${!v}")
done

systemd-run --user --unit="$UNIT" --collect \
  --working-directory="$REPO" \
  "${env_args[@]}" \
  -p Nice=10 -p OOMScoreAdjust=200 -p OOMPolicy=continue \
  -p Restart=on-failure -p RestartSec=120 \
  -p StartLimitIntervalSec=12h -p StartLimitBurst=30 \
  -p StandardOutput="append:$LOG" -p StandardError="append:$LOG" \
  "$REPO/scripts/tournament-bg.sh" --run "$@"
echo "Started. Log: $LOG   Status: scripts/tournament-bg.sh --status"
