#!/usr/bin/env bash
# ws21 farm upkeep (chess-farm-upkeep.timer, every 15 min; since 2026-11-02).
#
# 1. Keeps the checkout on GitHub's master, which is what production runs: the farm API
#    (boardgames-server) and the refill read production's database and refuse to start
#    once a deploy has migrated it past their build. Fast-forward only, and only on a
#    clean tree (untracked files are fine); otherwise it says why and leaves it alone.
#    Then: pnpm install when the lockfile moved, the API restarted when server or core
#    code moved (rolled back to the old commit if it doesn't come up healthy), and
#    ~/chess-farm/worker.mjs rebuilt when the bundle comes out different — each lane
#    picks the new one up at its next claim, so no search is cut short.
# 2. Wakes lanes the idle exit stopped (FARM_IDLE_EXIT_MIN) when normal work is queued:
#    one per waiting job, as many as memory allows (1.5 GB each, 3 GB kept free).
set -uo pipefail
export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:/usr/bin:/bin"
# LFS files (card photos) are never needed here, and every download spends the GitHub LFS budget.
export GIT_LFS_SKIP_SMUDGE=1
REPO="$HOME/Documents/Projects/Personal/BoardGames"
FARM="$HOME/chess-farm"
LANES=22
log() { echo "upkeep: $*"; }
healthy() {
  for _ in $(seq 1 40); do
    sleep 3
    curl -sf localhost:3001/api/health | grep -q '"ok":true' && return 0
  done
  return 1
}

update_checkout() {
  cd "$REPO" || return 1
  git fetch -q origin master || { log "fetch failed"; return 1; }
  local old new
  old=$(git rev-parse HEAD)
  new=$(git rev-parse origin/master)
  [ "$old" = "$new" ] && return 0
  if [ -n "$(git status --porcelain -uno)" ]; then
    log "checkout has local changes — not updating to ${new:0:9}:"
    git status --porcelain -uno | head -10
    return 1
  fi
  if ! git merge-base --is-ancestor "$old" "$new"; then
    log "HEAD ${old:0:9} isn't behind origin/master — not updating"
    return 1
  fi
  git merge -q --ff-only "$new" || { log "fast-forward failed"; return 1; }
  log "checkout ${old:0:9} → ${new:0:9}"
  local changed
  changed=$(git diff --name-only "$old" "$new")
  if grep -q '^pnpm-lock.yaml$' <<<"$changed"; then
    pnpm install --frozen-lockfile >/dev/null 2>&1 || log "pnpm install failed"
  fi
  if grep -qE '^(packages/(server|core)/|pnpm-lock.yaml$)' <<<"$changed"; then
    systemctl --user restart boardgames-server
    if healthy; then
      log "farm API restarted on ${new:0:9}"
    else
      log "farm API unhealthy on ${new:0:9} — back to ${old:0:9}"
      git reset -q --hard "$old"
      grep -q '^pnpm-lock.yaml$' <<<"$changed" && pnpm install --frozen-lockfile >/dev/null 2>&1
      systemctl --user restart boardgames-server
      healthy || log "farm API still unhealthy on ${old:0:9}"
      return 1
    fi
  fi
  rebuild_worker
}

rebuild_worker() {
  cd "$REPO/packages/server" || return 1
  local esbuild out
  esbuild=$(ls -d ../../node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild 2>/dev/null | tail -1)
  [ -n "$esbuild" ] || { log "no esbuild"; return 1; }
  out=$(mktemp -d)
  if ! "$esbuild" src/scripts/chess-farm/worker.ts --bundle --platform=node --format=esm \
    --target=node22 --outfile="$out/worker.mjs" --log-level=error; then
    log "worker bundle failed to build — kept the old one"
    rm -rf "$out"
    return 1
  fi
  if cmp -s "$out/worker.mjs" "$FARM/worker.mjs"; then
    rm -rf "$out"
    return 0
  fi
  cp "$FARM/worker.mjs" "$FARM/worker.mjs.prev"
  # Same filesystem: the lanes see either the old file or the new one, never half of it.
  cp "$out/worker.mjs" "$FARM/worker.mjs.new" && mv "$FARM/worker.mjs.new" "$FARM/worker.mjs"
  rm -rf "$out"
  log "worker.mjs rebuilt (old kept as worker.mjs.prev); lanes switch at their next claim"
}

wake_lanes() {
  local status queued heavy want stopped=() mem room n
  status=$(set -a; . "$FARM/farm.env"; set +a
    curl -sf -H "Authorization: Bearer $CHESS_FARM_TOKEN" "$FARM_URL/api/chess-farm/status") || return 0
  queued=$(grep -oE '^\{"queued":[0-9]+' <<<"$status" | grep -oE '[0-9]+$')
  heavy=$(grep -oE '"heavy":\{"queued":[0-9]+' <<<"$status" | grep -oE '[0-9]+$')
  want=$(( ${queued:-0} - ${heavy:-0} ))
  [ "$want" -gt 0 ] || return 0
  for i in $(seq 1 $LANES); do
    systemctl --user is-active -q "chess-farm@$i" || stopped+=("$i")
  done
  [ ${#stopped[@]} -gt 0 ] || return 0
  mem=$(awk '/MemAvailable/ {print int($2 / 1024)}' /proc/meminfo)
  room=$(( (mem - 3072) / 1536 ))
  n=$want
  [ "$n" -gt ${#stopped[@]} ] && n=${#stopped[@]}
  [ "$n" -gt "$room" ] && n=$room
  [ "$n" -gt 0 ] || { log "$want normal jobs waiting, no memory to wake a lane (${mem} MB free)"; return 0; }
  for i in "${stopped[@]:0:$n}"; do systemctl --user start "chess-farm@$i"; done
  log "$want normal jobs waiting: woke lanes ${stopped[*]:0:$n}"
}

update_checkout
wake_lanes
exit 0
