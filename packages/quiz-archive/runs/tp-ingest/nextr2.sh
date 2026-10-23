#!/bin/bash
cd ~/Downloads/quiz-cards/trivial-pursuit
line=$(grep -vxF -f r2_launched.txt r2_queue.txt | head -1)
[ -z "$line" ] && { echo EMPTY; exit; }
echo "$line" >> r2_launched.txt; echo "$line"
