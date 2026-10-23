#!/bin/bash
# Pop the next Stage 4 batch: prints "<n> <fstart> <wstart> <ids…>".
cd ~/Downloads/quiz-cards/trivial-pursuit
line=$(grep -vxF -f enrich_launched.txt enrich_queue.txt | head -1)
[ -z "$line" ] && { echo EMPTY; exit; }
echo "$line" >> enrich_launched.txt; echo "$line"
