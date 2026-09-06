#!/usr/bin/env bash
# Vercel build entry — vercel.json buildCommand caps at 256 chars, so the
# branch lives here. Production must keep deploying Convex together with the
# UI (AGENTS.md invariant since cc24315; do not remove).
#
# Only main deploys (vercel.json ignoreCommand, owner rule 2026-08-25). Branch
# pushes are chores: no Vercel build, no Convex prod deploy. Dev work talks to
# the LOCAL Convex backend. `bun run check` also runs this file off Vercel;
# that path is a plain vite build and deploys nothing.
set -euo pipefail

if [ "${VERCEL_ENV:-}" = "production" ]; then
  # package.json `build` also runs this file so a Vite-preset override
  # cannot ship UI-only (QA 191: frontend 3dd95bb1, mule search still
  # hyphen-split leftover).
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
  vite build
fi
