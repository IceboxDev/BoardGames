#!/usr/bin/env bash
# The analysis farm's AWS fleet: Free-plan c7i-flex.large instances, each lane
# the same worker as ws21's. Run from the laptop, against any AWS account with
# credits: `AWS_PROFILE` picks it (default `boardgames`), its region comes from
# the profile. Everything the fleet needs is made per account by `up`.
#
#   fleet.sh credits        the account's remaining Free-plan credits
#   fleet.sh hours [N=8]    how long N machines can run on them (keeps $RESERVE, default 5)
#   fleet.sh up [N=8]       launch N instances (Stockfish is built at boot), print their IPs
#   fleet.sh start          start stopped fleet instances
#   fleet.sh ips            the running instances' public IPs
#   fleet.sh status         state of every fleet instance
#   fleet.sh down           terminate the fleet and remove its key pair and firewall group
#
# Then on ws21: `FLEET_HOURS=<h> ~/chess-farm/aws-attach.sh <ip>...` copies the
# worker over, opens the SSH tunnel through which the instance reaches ws21's
# farm API, and arms the deadline: the lanes drain (no new claims) before it and
# the machine stops at it. Nothing on ws21 is exposed: ws21 dials out.
#
# Switching to another account: README's "AWS accounts".
set -euo pipefail
export AWS_PROFILE="${AWS_PROFILE:-boardgames}"
AWS_REGION="${AWS_REGION:-$(aws configure get region --profile "$AWS_PROFILE" 2>/dev/null || true)}"
export AWS_REGION="${AWS_REGION:-eu-north-1}"
# Measured on the first account (2026-10-15…24): $157 for ~1,600 machine-hours,
# instance + public IPv4 + 8 GB disk.
RATE="${RATE:-0.095}"
RESERVE="${RESERVE:-5}"
TAG=chess-farm
TYPE=c7i-flex.large
KEY=chess-farm-ws21
SG_NAME=chess-farm
WS21=mantas@mantas-kandratavicius-ws21.wahtari.net
HERE="$(cd "$(dirname "$0")" && pwd)"

fleet_ids() {
  aws ec2 describe-instances --filters "Name=tag:Name,Values=$TAG" \
    "Name=instance-state-name,Values=${1:-pending,running,stopping,stopped}" \
    --query 'Reservations[].Instances[].InstanceId' --output text
}

# Let ws21 in, and only ws21: its public address changes (a reboot gave it a new
# one), so the group's old rules go and its current address comes in.
allow_ws21() {
  local group ws21_ip old
  group="$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$SG_NAME" --query 'SecurityGroups[0].GroupId' --output text)"
  ws21_ip="$(ssh "$WS21" 'curl -s https://checkip.amazonaws.com')"
  for old in $(aws ec2 describe-security-groups --group-ids "$group" --query 'SecurityGroups[0].IpPermissions[?ToPort==`22`].IpRanges[].CidrIp' --output text); do
    [ "$old" = "$ws21_ip/32" ] || aws ec2 revoke-security-group-ingress --group-id "$group" --protocol tcp --port 22 --cidr "$old" >/dev/null
  done
  aws ec2 authorize-security-group-ingress --group-id "$group" --protocol tcp --port 22 --cidr "$ws21_ip/32" >/dev/null 2>&1 || true
}

credits() {
  aws freetier get-account-plan-state --region us-east-1 \
    --query 'accountPlanRemainingCredits.amount' --output text
}

case "${1:-}" in
  credits)
    echo "$AWS_PROFILE ($(aws sts get-caller-identity --query Account --output text), $AWS_REGION): \$$(credits) left"
    ;;
  hours)
    n="${2:-8}"
    left="$(credits)"
    # The credits figure trails usage by up to a day: count the last day of a
    # running fleet against it.
    running="$(fleet_ids pending,running | wc -w)"
    awk -v c="$left" -v r="$RESERVE" -v rate="$RATE" -v n="$n" -v run="$running" 'BEGIN {
      spend = c - r - run * rate * 24; if (spend < 0) spend = 0
      printf "$%.2f left, keeping $%.2f (and $%.2f for a day of the %d running): %.0f machine-hours = %.1f h for %d machines\n",
        c, r, run * rate * 24, run, spend / rate, spend / rate / n, n }'
    ;;
  up)
    n="${2:-8}"
    # ws21's key, so ws21 (not this laptop) is who logs in.
    if ! aws ec2 describe-key-pairs --key-names "$KEY" >/dev/null 2>&1; then
      pub="$(ssh "$WS21" 'test -f ~/.ssh/chess_farm_ed25519 || ssh-keygen -q -t ed25519 -N "" -f ~/.ssh/chess_farm_ed25519; cat ~/.ssh/chess_farm_ed25519.pub')"
      aws ec2 import-key-pair --key-name "$KEY" --public-key-material "fileb://<(echo "$pub")" >/dev/null 2>&1 ||
        aws ec2 import-key-pair --key-name "$KEY" --public-key-material "$(echo -n "$pub" | base64 -w0)" >/dev/null
    fi
    sg="$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$SG_NAME" --query 'SecurityGroups[0].GroupId' --output text)"
    if [ "$sg" = "None" ]; then
      sg="$(aws ec2 create-security-group --group-name "$SG_NAME" --description "chess farm: SSH from ws21 only" --query GroupId --output text)"
    fi
    allow_ws21
    ami="$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 --query Parameter.Value --output text)"
    aws ec2 run-instances --image-id "$ami" --instance-type "$TYPE" --count "$n" \
      --key-name "$KEY" --security-group-ids "$sg" \
      --instance-initiated-shutdown-behavior stop \
      --user-data "fileb://$HERE/user-data.sh" \
      --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$TAG}]" \
      --query 'Instances[].InstanceId' --output text
    # shellcheck disable=SC2046
    aws ec2 wait instance-running --instance-ids $(fleet_ids pending,running)
    bash "$HERE/fleet.sh" ips
    ;;
  start)
    ids="$(fleet_ids stopped)"
    [ -z "$ids" ] && { echo "no stopped fleet instances"; exit 0; }
    allow_ws21
    # shellcheck disable=SC2086
    aws ec2 start-instances --instance-ids $ids >/dev/null && aws ec2 wait instance-running --instance-ids $ids
    bash "$HERE/fleet.sh" ips
    ;;
  ips)
    aws ec2 describe-instances --filters "Name=tag:Name,Values=$TAG" "Name=instance-state-name,Values=running" \
      --query 'Reservations[].Instances[].PublicIpAddress' --output text
    ;;
  status)
    aws ec2 describe-instances --filters "Name=tag:Name,Values=$TAG" \
      --query 'Reservations[].Instances[].[InstanceId,State.Name,PublicIpAddress,LaunchTime]' --output table
    ;;
  down)
    ids="$(fleet_ids)"
    if [ -n "$ids" ]; then
      # shellcheck disable=SC2086
      aws ec2 terminate-instances --instance-ids $ids >/dev/null && aws ec2 wait instance-terminated --instance-ids $ids
    fi
    sg="$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$SG_NAME" --query 'SecurityGroups[0].GroupId' --output text)"
    [ "$sg" != "None" ] && aws ec2 delete-security-group --group-id "$sg"
    aws ec2 delete-key-pair --key-name "$KEY" >/dev/null || true
    echo "fleet removed"
    ;;
  *)
    sed -n '2,16p' "$0"
    exit 1
    ;;
esac
