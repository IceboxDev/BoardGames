#!/usr/bin/env bash
# The analysis farm's AWS fleet: Free-plan c7i-flex.large instances that search
# the OPPONENT positions (MultiPV 3, depth 40) while ws21 searches yours.
# Run from the laptop (it has the `boardgames` AWS profile):
#
#   fleet.sh up [N=8]   launch N instances (Stockfish is built at boot), print their IPs
#   fleet.sh start      start stopped fleet instances (they stop themselves when idle)
#   fleet.sh ips        the running instances' public IPs
#   fleet.sh status     state of every fleet instance
#   fleet.sh down       terminate the fleet and remove its key pair and firewall group
#
# Then on ws21: `~/chess-farm/aws-attach.sh <ip>...` copies the worker over and
# opens the SSH tunnel through which the instance reaches ws21's farm API.
# Nothing on ws21 is exposed: ws21 dials out to the instances.
set -euo pipefail
export AWS_PROFILE="${AWS_PROFILE:-boardgames}" AWS_REGION="${AWS_REGION:-eu-north-1}"
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

case "${1:-}" in
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
    ws21_ip="$(ssh "$WS21" 'curl -s https://checkip.amazonaws.com')"
    aws ec2 authorize-security-group-ingress --group-id "$sg" --protocol tcp --port 22 --cidr "$ws21_ip/32" >/dev/null 2>&1 || true
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
