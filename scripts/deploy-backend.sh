#!/usr/bin/env bash
# The ONE production backend deploy (owner rule, 2026-09-19).
#
#   bash scripts/deploy-backend.sh --expect <release sha> [--verify <query>[,<query>]] [--dry-run]
#
# Production Convex is SELF-HOSTED on the owner's Linux box. A Vercel release
# builds the UI only, so the backend is deployed ON THAT BOX, from the exact
# release commit, by this script. Runbook: docs/operations/production-backend-deploy.md.
#
# 1. Verifies the checkout: origin is the Capsule repo, no tracked local
#    changes, main fast-forwards, HEAD is exactly --expect.
# 2. Verifies the machine: Linux, the Bun pinned in .bun-version, the
#    self-hosted credential NAMES present (values are never printed).
# 3. Runs the documented deploy (AGENTS.md): bun install --frozen-lockfile,
#    then npx convex deploy -y.
# 4. Verifies runtime: POST <backend>/api/query for a baseline query and every
#    --verify query, then the production frontend returns HTTP 200.
# 5. Prints RESULT: PASS or RESULT: FAIL with the sha.
#
# --backend-url / --frontend-url replace the two production addresses below
# (the offline test uses them; also for an address change).
# --dry-run runs only the local checks of 1 and 2 (no fetch, no checkout, no
# install, no deploy, no network) and prints what a real run would do.
# This script never rolls back Vercel, never edits settings, never edits code.
set -uo pipefail

BACKEND_URL="https://pop-os.tail78dd9e.ts.net"
FRONTEND_URL="https://capsule-tau-eight.vercel.app/"
ORIGIN_MATCH="Angriff36/capsule"
BASELINE_QUERY="queries:listEvent"
CREDENTIAL_NAMES="CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY"

expected=""
verify=""
dry_run=0
original_args=("$@")

fail() {
  echo ""
  echo "RESULT: FAIL - $1 (expected sha: ${expected:-none})"
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --expect) expected="${2:-}"; shift 2 ;;
    --verify) verify="$verify,${2:-}"; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    --backend-url) BACKEND_URL="${2:-}"; shift 2 ;;
    --frontend-url) FRONTEND_URL="${2:-}"; shift 2 ;;
    *) fail "unknown argument $1" ;;
  esac
done
case "$expected" in
  "") fail "--expect <release sha> is required. The release handoff gives it" ;;
esac
if ! printf '%s' "$expected" | grep -Eq '^[0-9a-f]{40}$'; then
  fail "--expect must be the full 40-character commit sha"
fi

# The value is set in the shell, or .env.local carries a non-empty line for it.
has_name() {
  [ -n "${!1:-}" ] || grep -Eqs "^$1=.+" .env.local
}

# 1. The checkout. The script finds its own repository; no path is assumed.
cd "$(dirname "${BASH_SOURCE[0]}")/.." || fail "cannot go to the repository root"
origin="$(git remote get-url origin 2>/dev/null || true)"
case "$origin" in
  *"$ORIGIN_MATCH"*) ;;
  *) fail "origin is not the $ORIGIN_MATCH repository" ;;
esac
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  fail "tracked files have local changes. Deploy only from a clean checkout"
fi
start_sha="$(git rev-parse HEAD)"
if [ "$dry_run" = 0 ]; then
  [ "$(uname -s)" = "Linux" ] || fail "the production backend deploy runs on the Linux production box only"
  git fetch origin main || fail "git fetch failed"
  git checkout -q main || fail "cannot check out main"
  git pull --ff-only origin main || fail "main cannot fast-forward"
fi
head_sha="$(git rev-parse HEAD)"
if [ "$head_sha" != "$expected" ]; then
  fail "HEAD is $head_sha. Do not deploy from a commit the release did not name"
fi
# The pull can bring a newer copy of this script: run that copy, once.
if [ "$dry_run" = 0 ] && [ -z "${CAPSULE_DEPLOY_REEXEC:-}" ] && ! git diff --quiet "$start_sha" HEAD -- scripts/deploy-backend.sh; then
  export CAPSULE_DEPLOY_REEXEC=1
  exec bash "${BASH_SOURCE[0]}" "${original_args[@]}"
fi

# 2. The machine.
pinned="$(tr -d '[:space:]' < .bun-version)"
active="$(bun --version 2>/dev/null || true)"
if [ "$active" != "$pinned" ]; then
  fail "bun is ${active:-not found}; .bun-version pins $pinned. Put bun $pinned first in PATH"
fi
for name in $CREDENTIAL_NAMES; do
  has_name "$name" || fail "$name is not set in the shell or in .env.local"
done
if [ -n "${CONVEX_DEPLOYMENT:-}" ]; then
  fail "CONVEX_DEPLOYMENT is set in this shell. The Convex CLI refuses it together with the self-hosted names. Unset it and run again"
fi

queries="$BASELINE_QUERY"
for name in $(printf '%s' "$verify" | tr ',' ' '); do
  case "$name" in
    *:*) queries="$queries $name" ;;
    *) queries="$queries queries:$name" ;;
  esac
done

if [ "$dry_run" = 1 ]; then
  echo "dry run: checkout, sha, bun $pinned and credential names are good."
  echo "dry run: a real run would now do:"
  echo "  bun install --frozen-lockfile"
  echo "  npx convex deploy -y"
  for query in $queries; do echo "  POST $BACKEND_URL/api/query  $query"; done
  echo "  GET  $FRONTEND_URL"
  echo ""
  echo "RESULT: DRY-RUN PASS - nothing was deployed (sha: $head_sha)"
  exit 0
fi

# 3. The documented deploy.
bun install --frozen-lockfile || fail "bun install failed"
npx convex deploy -y || fail "convex deploy failed"

# 4. Runtime verification. "success" means the function ran on the backend;
#    "Server Error" means the backend does not have it.
bad=0
count=0
for query in $queries; do
  count=$((count + 1))
  body="$(curl -s -m 30 -X POST "$BACKEND_URL/api/query" -H 'Content-Type: application/json' \
    -d "{\"path\":\"$query\",\"args\":{},\"format\":\"json\"}" || true)"
  case "$body" in
    *'"status":"success"'*) echo "  ok    $query" ;;
    *) echo "  FAIL  $query -> $body"; bad=1 ;;
  esac
done
[ "$bad" = 0 ] || fail "a production query does not respond after the deploy"

# Secondary only: the deployed function spec. A miss here is a warning; the
# runtime probe above is the proof.
if [ -n "$verify" ]; then
  spec="$(npx convex function-spec 2>/dev/null || true)"
  for query in $queries; do
    case "$spec" in
      *":${query##*:}\""*) echo "  spec  $query" ;;
      *) echo "  warn  $query is not in function-spec output (runtime probe passed)" ;;
    esac
  done
fi

code="$(curl -s -o /dev/null -m 30 -w '%{http_code}' "$FRONTEND_URL" || true)"
[ "$code" = "200" ] || fail "the production frontend returned HTTP ${code:-none}"

echo ""
echo "RESULT: PASS - backend deployed from $head_sha; $count queries respond; frontend HTTP 200"
