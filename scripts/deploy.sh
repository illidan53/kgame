#!/usr/bin/env bash
# 发布到 https://k8s-game.nphunter.gg
# 前提：基础设施已用 infra/ 创建（pulumi up），并且已登录：aws sso login --profile nphunter-sso
set -euo pipefail
cd "$(dirname "$0")/.."
export AWS_PROFILE="${AWS_PROFILE:-nphunter-sso}"

echo "==> 测试"
node test/g2-sim.test.js >/dev/null
node test/g4-reconciler.test.js >/dev/null

echo "==> 构建"
node scripts/build.mjs

out() { (cd infra && pulumi stack output "$1" -s prod); }
BUCKET=$(out bucketId)
DIST_ID=$(out distributionId)
URL=$(out url)

# 先传带哈希的资源，最后传 index.html，避免访问者拿到指向尚未上传资源的新页面
echo "==> 上传到 s3://$BUCKET"
aws s3 cp dist/assets "s3://$BUCKET/assets" --recursive --exclude "*" --include "*.js" \
  --content-type "text/javascript; charset=utf-8" --cache-control "public, max-age=31536000, immutable"
aws s3 cp dist/assets "s3://$BUCKET/assets" --recursive --exclude "*" --include "*.css" \
  --content-type "text/css; charset=utf-8" --cache-control "public, max-age=31536000, immutable"
aws s3 cp dist/index.html "s3://$BUCKET/index.html" \
  --content-type "text/html; charset=utf-8" --cache-control "no-cache, max-age=0, must-revalidate"

echo "==> 刷新 CloudFront"
INV=$(aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/" "/index.html" --query Invalidation.Id --output text)
aws cloudfront wait invalidation-completed --distribution-id "$DIST_ID" --id "$INV"

echo "==> 冒烟测试 $URL"
page=$(curl -fsS "$URL/")
grep -q "Kube 游乐场" <<<"$page"
for asset in $(grep -oE 'assets/[A-Za-z0-9._-]+' <<<"$page" | sort -u); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/$asset")
  echo "$asset: $code"
  [ "$code" = "200" ]
done
echo "==> 完成：$URL"
