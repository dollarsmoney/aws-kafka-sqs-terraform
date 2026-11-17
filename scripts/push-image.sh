#!/usr/bin/env bash
# Build the arm64 app image and push it to ECR as :<git-sha> and :latest.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INFRA="$ROOT/infra"
PLATFORM="${PLATFORM:-linux/arm64}"

REGION="$(terraform -chdir="$INFRA" output -raw region 2>/dev/null || true)"
REGION="${REGION:-${AWS_REGION:-us-east-1}}"

REPO_URL="$(terraform -chdir="$INFRA" output -raw ecr_repository_url 2>/dev/null || true)"
if [[ -z "$REPO_URL" || "$REPO_URL" == *"No outputs"* ]]; then
  REPO_NAME="${PROJECT:-orders-demo}"
  REPO_URL="$(aws ecr describe-repositories --region "$REGION" --repository-names "$REPO_NAME" \
    --query 'repositories[0].repositoryUri' --output text)"
fi
REGISTRY="${REPO_URL%%/*}"

TAG="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"

echo "==> Logging in to $REGISTRY"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

echo "==> Building $REPO_URL:$TAG ($PLATFORM) and pushing"
docker buildx build \
  --platform "$PLATFORM" \
  -t "$REPO_URL:$TAG" \
  -t "$REPO_URL:latest" \
  --push \
  "$ROOT/app"

echo "==> Pushed $REPO_URL:$TAG and :latest"
