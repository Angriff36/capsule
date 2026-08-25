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
  convex deploy --cmd 'vite build'
elif [ -n "${VERCEL:-}" ]; then
  echo "capsule vercel-build: refusing non-production Vercel build (VERCEL_ENV=${VERCEL_ENV:-unset}). Only main deploys."
  exit 1
else
  vite build
fi
