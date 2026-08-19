#!/bin/sh
# Vercel build entry (vercel.json buildCommand caps at 256 chars, so the
# branching lives here). Production must keep deploying Convex + UI together —
# see AGENTS.md "Pushing main deploys BOTH frontend and Convex backend".
set -eu

if [ "${VERCEL_ENV:-}" = "production" ]; then
  exec convex deploy --cmd 'vite build'
fi

# Preview / development builds: UI only, against the shared preview Convex
# deployment. Vercel Preview env vars win when set; otherwise fall back to
# public values. The Clerk key is the *publishable* pk_test_ key (already
# shipped inside production JS bundles) — never put sk_ secrets here.
export VITE_CONVEX_URL="${VITE_CONVEX_URL:-https://tangible-skunk-448.convex.cloud}"
export VITE_CLERK_PUBLISHABLE_KEY="${VITE_CLERK_PUBLISHABLE_KEY:-pk_test_Z29sZGVuLWtvaS0xMS5jbGVyay5hY2NvdW50cy5kZXYk}"
exec vite build
