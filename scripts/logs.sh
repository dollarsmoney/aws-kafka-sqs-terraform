#!/usr/bin/env bash
# Usage: scripts/logs.sh [service] [lines]   e.g. scripts/logs.sh worker 50
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE="${1:-}"
LINES="${2:-100}"
REGION="$(terraform -chdir="$ROOT/infra" output -raw region)"
INSTANCE_ID="$(terraform -chdir="$ROOT/infra" output -raw instance_id)"

CMD_ID="$(aws ssm send-command \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters "commands=[\"cd /opt/app && docker compose logs --no-color --tail $LINES $SERVICE\"]" \
  --query Command.CommandId --output text)"

aws ssm wait command-executed --region "$REGION" --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" || true

aws ssm get-command-invocation \
  --region "$REGION" --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
  --query StandardOutputContent --output text
