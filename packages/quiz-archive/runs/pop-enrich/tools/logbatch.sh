#!/bin/bash
# logbatch.sh <name> <ids...>: fill Russian/mark reasons, then log the batch
R=/var/home/mantas/Downloads/quiz-cards/publish-or-perish/enrich-report
T=/var/home/mantas/Downloads/quiz-cards/publish-or-perish/tools/fill_reasons.py
n=$1; shift
cd /var/home/mantas/Documents/Projects/Personal/BoardGames
[ -f $R/$n.reasons.orig.json ] || cp $R/$n.reasons.json $R/$n.reasons.orig.json
python3 -I $T $R/$n.reasons.json "$@" && timeout 600 pnpm -s quiz-ingest log --reasons=$R/$n.reasons.json --by=enrich-agent "$@" 2>&1 | tail -4
