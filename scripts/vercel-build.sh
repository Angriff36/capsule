#!/usr/bin/env bash
# Vercel build entry — the inline buildCommand outgrew Vercel's 256-char cap.
#
# Production: convex deploy --cmd 'vite build' ships the Convex backend
# together with the UI (see AGENTS.md "Deploying" — do not remove).
#
# Preview/dev: bake public defaults so PR previews are testable. Project env
# vars still win via ${VAR:-...}. The pk_test_ Clerk publishable key is
# public (already shipped in production JS), not a secret.
set -euo pipefail

if [ "${VERCEL_ENV:-}" = "production" ]; then
  convex deploy --cmd 'vite build'
else
  VITE_CONVEX_URL="${VITE_CONVEX_URL:-https://tangible-skunk-448.convex.cloud}" \
  VITE_CLERK_PUBLISHABLE_KEY="${VITE_CLERK_PUBLISHABLE_KEY:-pk_test_Z29sZGVuLWtvaS0xMS5jbGVyay5hY2NvdW50cy5kZXYk}" \
    vite build
fi
