#!/bin/bash
# Prints the next 4-card job's prompt and advances queue4_next.
W=~/Downloads/quiz-cards/trivial-pursuit
n=$(cat $W/queue4_next.txt); i=$((n+1)); line=$(sed -n "${i}p" $W/queue4.txt)
[ -z "$line" ] && { echo "QUEUE EMPTY"; exit 0; }
echo $i > $W/queue4_next.txt
echo "=== JOB4 $i"
echo "Read /var/home/mantas/Downloads/quiz-cards/trivial-pursuit/PROMPT.md and follow it exactly (CARDS there = the cards below). Do the cards one after another; write each card's JSON as soon as it is done."
echo "Your cards:"
for c in $line; do echo "- ${c%%=*}  photo: ${c#*=}"; done
