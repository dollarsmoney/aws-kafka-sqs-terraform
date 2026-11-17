#!/usr/bin/env bash
# Pull the latest image and restart containers on EC2 via SSM Run Command.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGION="$(terraform -chdir="$ROOT/infra" output -raw region)"
INSTANCE_ID="$(terraform -chdir="$ROOT/infra" output -raw instance_id)"

echo "==> Redeploying on $INSTANCE_ID"
CMD_ID="$(aws ssm send-command \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --comment "orders-demo redeploy" \
  --parameters 'commands=["/opt/app/deploy.sh"]' \
  --query Command.CommandId --output text)"

aws ssm wait command-executed --region "$REGION" --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" || true

aws ssm get-command-invocation \
  --region "$REGION" --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
  --query '[Status, StandardOutputContent, StandardErrorContent]' --output text
