#!/usr/bin/env bash
# Vercel build entry — vercel.json buildCommand caps at 256 chars, so the
# branch lives here. Production must keep deploying Convex together with the
# UI (AGENTS.md invariant since cc24315; do not remove). Previews build the
# UI only: Vercel does not inject VITE_* project env on preview, so fall back
# to the public dev Convex URL and Clerk publishable key (pk_test_ keys are
# public by design and ship in the JS bundle). Real env vars always win.
set -euo pipefail

if [ "${VERCEL_ENV:-}" = "production" ]; then
  convex deploy --cmd 'vite build'
else
  export VITE_CONVEX_URL="${VITE_CONVEX_URL:-https://tangible-skunk-448.convex.cloud}"
  export VITE_CLERK_PUBLISHABLE_KEY="${VITE_CLERK_PUBLISHABLE_KEY:-pk_test_Z29sZGVuLWtvaS0xMS5jbGVyay5hY2NvdW50cy5kZXYk}"
  vite build
fi
