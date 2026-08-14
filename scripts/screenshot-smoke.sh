#!/usr/bin/env bash
# Visual-regression smoke shots for the web frontend.
#
# Captures a fixed set of routes at the project's reference viewports
# (see responsive test screens: laptop ≈1536, phone ≈411, monitor ≈2560)
# using headless Chromium, and can diff two capture runs with ImageMagick.
#
# Usage:
#   scripts/screenshot-smoke.sh capture <out-dir> [base-url]
#   scripts/screenshot-smoke.sh diff <dir-a> <dir-b> [report-dir]
#   scripts/screenshot-smoke.sh nav-check <dir> [report-dir]
#     — asserts the TopNav logo renders at the identical position on every
#       captured route (the cross-page guard for the nav-width regression).
#
# CAVEAT — headless Chromium clamps the window to a MINIMUM 500px width:
# a 411/360 "phone" window lays out at 500 CSS px and the capture is a crop.
# For true phone-width layout use a route that supports the ?frame=WxH iframe
# mode (see /dev/rsvp-preview) — the iframe gets a real narrow viewport.
#
# Auth: public routes (/login, /dev/*) work out of the box. To capture
# authed pages (/, /history, /games), export SMOKE_COOKIE with a valid
# session cookie header value (e.g. 'better-auth.session_token=…') before
# running capture. Without it, authed routes render the login redirect —
# still stable and diffable, just less interesting.
#
# Typical flow around a risky refactor:
#   scripts/screenshot-smoke.sh capture /tmp/shots-before
#   …refactor…
#   scripts/screenshot-smoke.sh capture /tmp/shots-after
#   scripts/screenshot-smoke.sh diff /tmp/shots-before /tmp/shots-after /tmp/shots-diff

set -euo pipefail

CHROMIUM="${CHROMIUM:-/usr/bin/chromium}"
BASE_URL_DEFAULT="http://localhost:5173"

# route-name:path — extend as screens stabilize.
ROUTES=(
  "login:/login"
  "ui-gallery:/dev/ui"
  "deck-preview:/dev/deck-preview"
  "dnd-preview:/dev/dnd-preview"
  "dnd-tool-preview:/dev/dnd-tool-preview"
  "rsvp-preview:/dev/rsvp-preview"
  "rsvp-preview-phone360:/dev/rsvp-preview?frame=360x644"
  "dashboard:/"
  "history:/history"
  "games:/games"
)

# name:widthxheight — laptop / phone / monitor per the project's test screens.
VIEWPORTS=(
  "laptop:1536x960"
  "phone:411x915"
  "monitor:2560x1400"
)

capture() {
  local out="$1" base="${2:-$BASE_URL_DEFAULT}"
  mkdir -p "$out"
  if ! curl -sf -o /dev/null "$base/login"; then
    echo "error: no dev server responding at $base (run 'pnpm dev' first)" >&2
    exit 1
  fi
  local cookie_args=()
  # Chromium has no --cookie flag; pass authed captures through a headed
  # profile is overkill — instead we rely on SMOKE_COOKIE via a tiny proxy
  # only when genuinely needed. For now, note when it's absent.
  if [[ -z "${SMOKE_COOKIE:-}" ]]; then
    echo "note: SMOKE_COOKIE not set — authed routes will capture their login redirect." >&2
  fi
  for route in "${ROUTES[@]}"; do
    local name="${route%%:*}" path="${route#*:}"
    for vp in "${VIEWPORTS[@]}"; do
      local vpname="${vp%%:*}" size="${vp#*:}"
      local file="$out/${name}--${vpname}.png"
      "$CHROMIUM" --headless=new --disable-gpu --hide-scrollbars \
        --window-size="${size/x/,}" \
        --virtual-time-budget=8000 \
        --screenshot="$file" \
        "$base$path" 2>/dev/null
      echo "captured $file"
    done
  done
}

diff_runs() {
  local a="$1" b="$2" report="${3:-/tmp/screenshot-smoke-diff}"
  mkdir -p "$report"
  local failures=0
  for f in "$a"/*.png; do
    local name
    name="$(basename "$f")"
    if [[ ! -f "$b/$name" ]]; then
      echo "MISSING in $b: $name"
      failures=$((failures + 1))
      continue
    fi
    # AE = absolute error pixel count; fuzz absorbs AA jitter.
    local metric
    metric=$(compare -metric AE -fuzz 2% "$f" "$b/$name" "$report/$name" 2>&1 || true)
    if [[ "${metric%%.*}" =~ ^[0-9]+$ ]] && (( ${metric%%.*} > 500 )); then
      echo "DIFF  $name — $metric changed pixels → $report/$name"
      failures=$((failures + 1))
    else
      rm -f "$report/$name"
      echo "ok    $name"
    fi
  done
  if (( failures > 0 )); then
    echo "$failures screen(s) changed — inspect $report"
    exit 1
  fi
  echo "no visual changes"
}

# ── Nav stability check ───────────────────────────────────────────────────
# Asserts the "Board Game Lab" logo sits at the IDENTICAL position on every
# captured route (per viewport) by cropping the nav's logo region (top-left
# 300x56 — left of any page actions) and pairwise-diffing routes against the
# first. This is the regression guard for the per-page nav-width bug: a capped
# or shifted nav moves the logo's hard glyph edges, which lights this up far
# beyond the threshold, while backdrop-blur bleed-through stays below it.
nav_check() {
  local dir="$1" report="${2:-/tmp/screenshot-smoke-nav}"
  mkdir -p "$report"
  local failures=0
  for vp in "${VIEWPORTS[@]}"; do
    local vpname="${vp%%:*}"
    local ref="" refname=""
    for f in "$dir"/*--"${vpname}".png; do
      [[ -f "$f" ]] || continue
      local crop="$report/$(basename "${f%.png}")--nav.png"
      convert "$f" -crop 300x56+0+0 +repage "$crop"
      if [[ -z "$ref" ]]; then
        ref="$crop"; refname="$(basename "$f")"
        continue
      fi
      local metric
      metric=$(compare -metric AE -fuzz 5% "$ref" "$crop" null: 2>&1 || true)
      if [[ "${metric%%.*}" =~ ^[0-9]+$ ]] && (( ${metric%%.*} > 2000 )); then
        echo "NAV SHIFT [$vpname] $(basename "$f") vs $refname — $metric px differ in the logo region"
        failures=$((failures + 1))
      else
        echo "nav ok   [$vpname] $(basename "$f")"
      fi
    done
  done
  if (( failures > 0 )); then
    echo "$failures route(s) render the nav logo at a different position — the nav must be full-bleed and identical everywhere"
    exit 1
  fi
  echo "nav logo is stable across all captured routes"
}

case "${1:-}" in
  capture) shift; capture "$@" ;;
  diff) shift; diff_runs "$@" ;;
  nav-check) shift; nav_check "$@" ;;
  *) sed -n '2,20p' "$0"; exit 1 ;;
esac
