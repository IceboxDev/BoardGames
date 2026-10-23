#!/bin/bash
# Pop the next Stage 3 job: pending shard writers first, then unlaunched queue lines.
cd ~/Downloads/quiz-cards/trivial-pursuit
if [ -s stage3_pending.txt ]; then line=$(head -1 stage3_pending.txt); sed -i 1d stage3_pending.txt
else line=$(grep -vxF -f stage3_launched.txt stage3_queue.txt | head -1); fi
[ -z "$line" ] && { echo "EMPTY"; exit; }
echo "$line" >> stage3_launched.txt; echo "$line"
