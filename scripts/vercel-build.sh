#!/usr/bin/env bash
# Vercel build entry (vercel.json buildCommand).
#
# Production: `convex deploy --cmd 'vite build'` — a main push ships the
# Convex backend and the UI together (AGENTS.md invariant since cc24315;
# removing this reintroduces the query-skew Server Errors).
#
# Preview/development: plain `vite build` with baked-in fallbacks for the
# dev Convex deployment and the dev Clerk publishable key (pk_test_* is a
# public client-side key, not a secret), so PR preview deployments can sign
# in without per-branch Vercel env setup. Explicit env vars still win.
set -euo pipefail

if [ "${VERCEL_ENV:-}" = "production" ]; then
  convex deploy --cmd 'vite build'
else
  export VITE_CONVEX_URL="${VITE_CONVEX_URL:-https://tangible-skunk-448.convex.cloud}"
  export VITE_CLERK_PUBLISHABLE_KEY="${VITE_CLERK_PUBLISHABLE_KEY:-pk_test_Z29sZGVuLWtvaS0xMS5jbGVyay5hY2NvdW50cy5kZXYk}"
  vite build
fi
