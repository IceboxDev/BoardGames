#!/usr/bin/env bash
# Vercel's build step (vercel.json `buildCommand`, which Vercel caps at 256
# characters). Vercel clones without LFS objects: point the clone at GitHub and
# pull them, skipping the quiz archive's card photos and page snapshots — the
# web build never reads them.
set -euo pipefail
git remote add origin https://github.com/IceboxDev/BoardGames.git 2>/dev/null ||
  git remote set-url origin https://github.com/IceboxDev/BoardGames.git
git lfs install --local
git lfs pull --exclude="packages/quiz-archive/**"
pnpm --filter "@boardgames/web..." build
