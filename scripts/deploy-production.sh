#!/usr/bin/env bash
# The ONE production deployment command (owner rule, 2026-09-20). Run it on the
# WORK PC, on the branch to release:
#
#   bash scripts/deploy-production.sh [--reviewer <model>]
#
# It is ONLY the orchestrator. The authoritative pieces stay where they are:
#   scripts/release.sh          merge, gate, the one main push, archive
#   scripts/deploy-backend.sh   the self-hosted Convex deploy, ON the Linux box
#
# 1. Review, then scripts/release.sh. With --reviewer <model> an independent
#    review ALREADY approved this branch (AGENTS.md merge gate) and the name is
#    passed on. With no --reviewer this script runs the documented primary
#    review (Codex gpt-5.6-sol) and continues only on `VERDICT: APPROVE`.
# 2. Takes the [release] commit on origin/main and waits until the production
#    address serves the Vercel build OF that commit (<site>/version.json).
# 3. scripts/release-backend-scope.ts decides if anything since the previous
#    [release] commit changed the backend. Frontend-only: PASS, stop.
# 4. Backend changed: SSH to the production box, find the production Capsule
#    checkout by its git origin (no path is assumed), fast-forward main, require
#    HEAD == the release sha, and run scripts/deploy-backend.sh --expect <sha>
#    with --verify for the list queries that the release added.
# 5. One last line: RESULT: PASS ... or RESULT: FAIL ...
#
# Run again after a failure: on `main`, at the [release] commit, it skips step
# 1 and continues from step 2 (the backend deploy is idempotent).
# It holds no credentials: SSH uses the user's own key and host configuration,
# the Vercel check reads a public file. It never rolls back Vercel and never
# edits settings.
set -uo pipefail

PROD_SSH="oc@pop-os"
ORIGIN_MATCH="Angriff36/capsule"
VERCEL_WAIT_SECONDS=900

reviewer=""
fail() {
  echo ""
  echo "RESULT: FAIL - $1"
  exit 1
}
while [ $# -gt 0 ]; do
  case "$1" in
    --reviewer) reviewer="${2:-}"; [ -n "$reviewer" ] || fail "--reviewer needs a model name"; shift 2 ;;
    --ssh-host) PROD_SSH="${2:-}"; shift 2 ;;
    *) fail "unknown argument $1" ;;
  esac
done

cd "$(dirname "${BASH_SOURCE[0]}")/.." || fail "cannot go to the repository root"
mkdir -p .artifacts
branch="$(git symbolic-ref --short -q HEAD || true)"
[ -n "$branch" ] || fail "detached HEAD. Check out the branch to release"

# The mandated review text (AGENTS.md, merge gate). The reviewer is a model
# that did not write the diff, so Codex never reviews Codex commits.
run_review() {
  local log=.artifacts/deploy-production-review.log prompt=.artifacts/deploy-production-review-prompt.md
  # A branch that already landed on main (a GitHub-side merge) has an empty
  # diff against origin/main: a review here would approve nothing.
  if git merge-base --is-ancestor HEAD origin/main; then
    fail "$branch is already on origin/main, so there is no diff for an automatic review. Run this again with --reviewer <model>, the model whose review approved that merge"
  fi
  if git log origin/main..HEAD --format='%an %ae %(trailers:key=Co-Authored-By,valueonly)' | grep -qiE 'codex|gpt-'; then
    fail "commits on $branch name Codex/GPT as an author. A model never approves its own diff: get a review from another model, then run this again with --reviewer <model>"
  fi
  command -v codex >/dev/null 2>&1 || fail "the codex CLI is not available. Get an independent review, then run this again with --reviewer <model>"
  {
    echo "Merge review — regressions and data-corrupting bugs only; feature design gaps go to a GitHub issue."
    echo ""
    echo "Review the committed diff \`git diff origin/main...$(git rev-parse HEAD)\` (branch $branch). Ignore uncommitted working-tree files."
    echo ""
    echo "Review only for concrete release blockers caused by this diff: regressions, data loss or corruption, security or tenant-isolation failures, financial integrity failures, unsafe migration/deployment behavior, and direct task violations. Do not block release for feature design gaps, adjacent improvements, speculative hardening, or hypothetical edge cases."
    echo ""
    echo "Review the changes AND ensure they do NOT add tedium for app users via guardrails and policies that barely matter — this is a catering app, not a bank. Changes should REDUCE user tedium and let users actually use the app instead of being policy-denied every time they try to do anything. Flag any new guard, policy, approval, or validation that blocks a reasonable user action without a proportionate real-world reason."
    if git diff --name-only origin/main...HEAD | grep -qE '^src/(app|features|ui|styles)/'; then
      echo ""
      echo "This diff touches authored UI. Read DESIGN.md in the repository root and apply the 'If the diff touches authored UI' review text in AGENTS.md (section 'Merge gate') in full: DESIGN.md is the presentation authority; an unamended DESIGN.md plus a changed visual language is a REJECT."
    fi
    echo ""
    echo "A rejection must identify a concrete problem in the changed code and a plausible user or production failure. End with exactly one line: \`VERDICT: APPROVE\` or \`VERDICT: REJECT\`."
  } > "$prompt"
  echo "deploy-production: independent review by Codex gpt-5.6-sol (log: $log)"
  codex -c model="gpt-5.6-sol" review - < "$prompt" > "$log" 2>&1 || fail "the review command failed. Read $log"
  # The log echoes the prompt; the verdict is in the reviewer's last message.
  local answer
  answer="$(awk '/^codex$/ { buffer = "" ; next } { buffer = buffer "\n" $0 } END { print buffer }' "$log")"
  case "$answer" in
    *"VERDICT: REJECT"*) fail "the review REJECTED $branch. Read $log, fix the blocker, run this again" ;;
    *"VERDICT: APPROVE"*) reviewer="gpt-5.6-sol" ;;
    *) fail "the review gave no verdict. Read $log. If it approved, run this again with --reviewer gpt-5.6-sol" ;;
  esac
}

# 1. Review and release, or continue a release that is already on main.
git fetch origin --quiet || fail "git fetch failed"
if [ "$branch" = "main" ]; then
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || fail "you are on main and it differs from origin/main. Check out the branch to release"
  case "$(git log -1 --format=%s)" in
    "[release] "*) echo "deploy-production: main is at a [release] commit. Continuing that release." ;;
    *) fail "you are on main. Check out the branch to release" ;;
  esac
else
  [ -n "$reviewer" ] || run_review
  bash scripts/release.sh --reviewer "$reviewer" || fail "scripts/release.sh failed (above). Nothing after it ran"
  git fetch origin --quiet || fail "git fetch failed after the release"
fi
sha="$(git rev-parse origin/main)"
printf '%s' "$sha" | grep -Eq '^[0-9a-f]{40}$' || fail "cannot read the release sha on origin/main"
case "$(git log -1 --format=%s "$sha")" in
  "[release] "*) ;;
  *) fail "origin/main ($sha) is not a [release] commit" ;;
esac
[ "$(git rev-parse HEAD)" = "$sha" ] || fail "the working tree is not at the release commit $sha"
echo "deploy-production: release commit $sha"

# 2. The Vercel production deployment for that commit.
bun scripts/verify-vercel-release.ts --sha "$sha" --wait "$VERCEL_WAIT_SECONDS" || fail "the Vercel production deployment for $sha did not succeed (above)"

# 3. Does this release change the backend?
scope="$(bun scripts/release-backend-scope.ts --sha "$sha")" || fail "cannot decide if $sha changes the backend (above)"
echo "$scope" | sed 's/^/deploy-production: scope /'
case "$scope" in
  *"backend=unchanged"*)
    echo ""
    echo "RESULT: PASS - frontend deployed at $sha; backend unchanged"
    exit 0
    ;;
  *"backend=required"*) ;;
  *) fail "scripts/release-backend-scope.ts gave no answer" ;;
esac
verify="$(printf '%s\n' "$scope" | sed -n 's/^verify=//p' | tr -d '\r')"
printf '%s' "$verify" | grep -Eq '^[A-Za-z0-9_,]*$' || fail "unexpected --verify list: $verify"

# 4. The backend deploy, ON the production box. The remote script is fixed text;
#    only the sha and the query list (both checked above) are passed to it.
echo "deploy-production: backend deploy on $PROD_SSH"
remote_log=.artifacts/deploy-production-backend.log
ssh -o BatchMode=yes -o ConnectTimeout=20 "$PROD_SSH" bash -l -s -- "$sha" "$ORIGIN_MATCH" "$verify" <<'REMOTE' 2>&1 | tee "$remote_log"
set -uo pipefail
sha="$1"; origin_match="$2"; verify="${3:-}"
stop() { echo ""; echo "RESULT: FAIL - $1"; exit 1; }
# The production checkout: a Capsule clone (by git origin) that holds the
# self-hosted credentials. No path is assumed.
found=()
while IFS= read -r gitdir; do
  dir="$(dirname "$gitdir")"
  case "$(git -C "$dir" remote get-url origin 2>/dev/null || true)" in *"$origin_match"*) ;; *) continue ;; esac
  grep -Eqs '^CONVEX_SELF_HOSTED_ADMIN_KEY=.+' "$dir/.env.local" || continue
  found+=("$dir")
done < <(find "$HOME" -maxdepth 4 -type d -name .git -not -path '*/node_modules/*' 2>/dev/null)
[ "${#found[@]}" -eq 1 ] || stop "expected exactly one production Capsule checkout on this box (origin $origin_match, self-hosted credentials in .env.local); found ${#found[@]}: ${found[*]:-none}"
cd "${found[0]}" || stop "cannot enter ${found[0]}"
echo "production checkout: ${found[0]}"
git fetch origin main || stop "git fetch failed on the production box"
git checkout -q main || stop "cannot check out main on the production box"
git pull --ff-only origin main || stop "main cannot fast-forward on the production box"
[ "$(git rev-parse HEAD)" = "$sha" ] || stop "the production box is at $(git rev-parse HEAD), not at the release $sha"
if [ -n "$verify" ]; then
  exec bash scripts/deploy-backend.sh --expect "$sha" --verify "$verify"
fi
exec bash scripts/deploy-backend.sh --expect "$sha"
REMOTE
ssh_status="${PIPESTATUS[0]}"
[ "$ssh_status" = "0" ] || fail "the backend deploy on $PROD_SSH failed or SSH did not connect (exit $ssh_status; log: $remote_log). The frontend is live at $sha; run this command again to continue"
grep -q "^RESULT: PASS - backend deployed from $sha" "$remote_log" || fail "the production box did not report RESULT: PASS for $sha (log: $remote_log)"

echo ""
echo "RESULT: PASS - frontend and backend deployed at $sha"
