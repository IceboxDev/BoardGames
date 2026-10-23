#!/bin/bash
# Prints the next job's agent prompt and advances the queue pointer.
W=~/Downloads/quiz-cards/trivial-pursuit
n=$(cat $W/queue_next.txt); i=$((n+1)); line=$(sed -n "${i}p" $W/queue.txt)
[ -z "$line" ] && { echo "QUEUE EMPTY"; exit 0; }
echo $i > $W/queue_next.txt
echo "JOB $i"
echo "Read /var/home/mantas/Downloads/quiz-cards/trivial-pursuit/PROMPT.md and follow it exactly (CARDS there = the cards below). Photos are in /var/home/mantas/Downloads/Photos-1-001/."
echo "Your cards:"
for c in $line; do echo "- ${c%%=*}  photo: ${c#*=}"; done
