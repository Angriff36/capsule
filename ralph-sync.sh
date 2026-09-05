#!/usr/bin/env bash
# Sourced by loop.sh. Keep synchronization on the feature branch; never push trunk.
ralph_refresh_base() {
    RALPH_REMOTE=${RALPH_REMOTE:-origin}
    RALPH_BASE_BRANCH=${RALPH_BASE_BRANCH:-main}
    RALPH_BASE_REF="refs/remotes/$RALPH_REMOTE/$RALPH_BASE_BRANCH"
    git fetch --no-tags "$RALPH_REMOTE" "+refs/heads/$RALPH_BASE_BRANCH:$RALPH_BASE_REF" || return 1
    RALPH_BASE_SHA=$(git rev-parse "$RALPH_BASE_REF") || return 1
}

ralph_sync_base() {
    ralph_refresh_base || return 1
    if git merge-base --is-ancestor "$RALPH_BASE_SHA" HEAD; then
        echo "Ralph: current with $RALPH_REMOTE/$RALPH_BASE_BRANCH (${RALPH_BASE_SHA:0:8})."
        return 0
    fi
    echo "Ralph: integrating newer $RALPH_REMOTE/$RALPH_BASE_BRANCH changes into $(git branch --show-current)."
    # Preserve user work. The agent handles dirty trees and conflicts explicitly.
    if [ -z "$(git status --porcelain)" ] && ! git rev-parse -q --verify MERGE_HEAD >/dev/null; then
        git merge --no-edit "$RALPH_BASE_SHA" && return 0
    fi
    echo "Ralph: integration needs agent attention; it is the first task this iteration."
    return 0
}

ralph_integration_prompt() {
    cat <<EOF

AUTOMATIC WORKSPACE MAINTENANCE (before plan work, even if all boxes are checked):
Worktree: $(git rev-parse --show-toplevel)
Required upstream: $RALPH_BASE_REF at $RALPH_BASE_SHA
User-owned paths present at loop startup (preserve these changes):
${RALPH_INITIAL_DIRTY:-none}
Integrate that commit into this branch now if it is not already an ancestor.
Handle Git maintenance yourself. Resolve merge conflicts preserving both shipped
features and this branch's work. Regenerate generated files through their owning
tool. Preserve unrelated uncommitted work; do not bulk-stage or discard it.
Stage only your own changes; this overrides any earlier git add -A instruction.
Do not reset, force-push, push trunk, or deploy production. If a conflict requires
an actual product choice, explain that choice rather than asking the user to run Git.
After integration, install dependencies if changed and run project validation.

For a runnable web app, starting and verifying the local preview is part of your
task. Inspect the listening process AND served source/build identity. Ensure the
frontend and local backend serve this checkout, following project commands.
Handle startup yourself. Only stop a process after proving it belongs to this
project; never kill all Node processes. Use a free port if another checkout must
stay running, and give the user the exact working URL.
Set RALPH_PREVIEW_CHECK_CMD in .ralph.env to a repeatable read-only check that
fails if the preview is unreachable or serves another checkout. Run it before
claiming completion. For a non-web project, set RALPH_PREVIEW_CHECK_CMD='true'
and explain why a browser preview is not applicable. Do not use a plain HTTP 200
as proof of checkout identity. Do not claim deployment from a branch push.
For Windows Vite apps with src/main.tsx, ralph-preview.ps1 can start a verified
preview: powershell.exe -NoProfile -File ./ralph-preview.ps1 -Ensure
Its default port is 7812. Configure the check with the same command without
-Ensure. Adjust the port in both commands if occupied. This only manages the
frontend; verify the local backend separately using the project's instructions.
EOF
}

ralph_ready_to_finish() {
    ralph_refresh_base || return 1
    if ! git merge-base --is-ancestor "$RALPH_BASE_SHA" HEAD; then
        echo "Ralph: upstream advanced; another integration iteration is required."
        return 1
    fi
    if git rev-parse -q --verify MERGE_HEAD >/dev/null || [ -n "$(git ls-files -u)" ]; then
        echo "Ralph: merge is unfinished."
        return 1
    fi
    # Reload the check configured by the agent during this iteration.
    if [ -f .ralph.env ]; then . ./.ralph.env; fi
    if [ -z "${RALPH_PREVIEW_CHECK_CMD:-}" ]; then
        echo "Ralph: preview verification has not been configured; continuing."
        return 1
    fi
    bash -c "$RALPH_PREVIEW_CHECK_CMD" || {
        echo "Ralph: preview verification failed; continuing to repair it."
        return 1
    }
}
