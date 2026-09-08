#!/usr/bin/env bash
# Explicit production entrypoint used by Vercel and deploy:production.
# bun run build is always a local frontend build, independent of environment.
set -euo pipefail

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "capsule vercel-build: production convex deploy + vite build"
  # PR12-01 / AC-028 — production config gate. The build env is the one
  # place the real production frontend env is visible before deploy, so a
  # development Clerk key without explicit owner allowance (issue #265), or
  # a frontend pointed at the wrong Convex deployment, fails here. Empty
  # CONVEX_DEPLOYMENT just skips the deployment-target cross-check.
  bun scripts/check-deployment-config.ts \
    --environment production \
    --expected-deployment "${CONVEX_DEPLOYMENT:-}" \
    --require VITE_CONVEX_URL,VITE_CLERK_PUBLISHABLE_KEY \
    --no-env-files
  convex deploy --cmd 'vite build'
elif [ -n "${VERCEL:-}" ]; then
  echo "capsule vercel-build: refusing non-production Vercel build (VERCEL_ENV=${VERCEL_ENV:-unset}). Only main deploys."
  exit 1
else
  echo "capsule deploy:production: requires VERCEL_ENV=production. Use bun run build for a local build."
  exit 1
fi
