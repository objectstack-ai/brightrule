#!/usr/bin/env bash
# Build the BrightRule EE image.
#
#   deploy/objectos-ee/build.sh [extra docker build args…]
#
# IMAGE (default brightrule-objectos-ee:local) names the result; OS_EE_IMAGE
# picks the base EE image (default ghcr.io/objectstack-ai/objectos-ee:18.6.0,
# which must match the @objectstack/* version in package.json).
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

pnpm build
rm -rf deploy/objectos-ee/.build
pnpm exec tsc -p deploy/objectos-ee/tsconfig.qa.json

docker build \
  -f deploy/objectos-ee/Dockerfile \
  --build-arg "OS_EE_IMAGE=${OS_EE_IMAGE:-ghcr.io/objectstack-ai/objectos-ee:18.6.0}" \
  -t "${IMAGE:-brightrule-objectos-ee:local}" \
  "$@" \
  .
