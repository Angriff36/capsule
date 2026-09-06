#!/bin/bash
# Usage: ./loop.sh [plan | plan-work "work description"] [max_iterations] [--branch <name>]
# Examples:
#   ./loop.sh                                   # Build mode, unlimited iterations
#   ./loop.sh 20                                # Build mode, max 20 iterations
#   ./loop.sh plan                              # Full plan mode, unlimited iterations
#   ./loop.sh plan 5                            # Full plan mode, max 5 iterations
#   ./loop.sh plan-work "user auth" --branch ralph/user-auth
#                                               # Scoped plan on a work branch
#   ./loop.sh --branch ralph/user-auth          # Build on a work branch
#   ./loop.sh 20 --resume                        # Resume, skipping iterations in .ralph-checkpoint
#   ./loop.sh plan --dry-run                     # Print rendered prompt + command, then exit
#   ./loop.sh 20 --allow-dirty                   # Legacy flag; user edits are preserved automatically
#
# --branch <name> checks out <name> (creating it from the current HEAD if new), so
# the loop targets that branch's IMPLEMENTATION_PLAN.md and pushes to that remote.
# --resume reads .ralph-checkpoint (written after each successful push) and starts
# the iteration counter there, so a crash/restart doesn't repeat completed iterations.

# Pull --branch/--resume/--dry-run/--allow-dirty out first; keep everything else positional.
BRANCH=""
RESUME=0
DRY_RUN=0
ALLOW_DIRTY=0
POSITIONAL=()
while [ $# -gt 0 ]; do
    case "$1" in
        --branch) BRANCH="$2"; shift 2 ;;
        --branch=*) BRANCH="${1#*=}"; shift ;;
        --resume) RESUME=1; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        --allow-dirty) ALLOW_DIRTY=1; shift ;;
        *) POSITIONAL+=("$1"); shift ;;
    esac
done
set -- "${POSITIONAL[@]}"

# The agent preserves pre-existing work instead of asking the owner to manage Git.
# --allow-dirty remains accepted for compatibility with existing launch commands.
RALPH_INITIAL_DIRTY=$(git status --porcelain 2>/dev/null)

# Parse mode
if [ "${1:-}" = "plan" ]; then
    # Full planning mode
    MODE="plan"
    PROMPT_FILE="PROMPT_plan.md"
    MAX_ITERATIONS=${2:-0}
elif [ "${1:-}" = "plan-work" ]; then
    # Scoped planning mode — scope the plan to one body of work at creation time
    if [ -z "${2:-}" ]; then
        echo "Error: plan-work requires a work description"
        echo "Usage: ./loop.sh plan-work \"description of the work\" [max_iterations] [--branch <name>]"
        exit 1
    fi
    MODE="plan-work"
    PROMPT_FILE="PROMPT_plan_work.md"
    WORK_DESCRIPTION="$2"
    export WORK_SCOPE="$WORK_DESCRIPTION"
    MAX_ITERATIONS=${3:-5}  # Default 5 for scoped planning
elif [[ "${1:-}" =~ ^[0-9]+$ ]]; then
    # Build mode with max iterations
    MODE="build"
    PROMPT_FILE="PROMPT_build.md"
    MAX_ITERATIONS=$1
else
    # Build mode, unlimited (no arguments or invalid input)
    MODE="build"
    PROMPT_FILE="PROMPT_build.md"
    MAX_ITERATIONS=0
fi

# If --branch was given, switch to it (creating it from the current HEAD if new)
# before anything else, so the loop reads/writes the right branch-scoped plan.
# --dry-run must not touch git, so skip the checkout and just note it.
if [ -n "$BRANCH" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
        echo "Dry run: would checkout branch $BRANCH"
    else
        git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" || {
            echo "Error: could not checkout or create branch $BRANCH"
            exit 1
        }
    fi
fi

# Load project-specific config (PROJECT_NAME, TEST_CMD, LINT_CMD, BUILD_CMD,
# MODEL_PLAN, MODEL_BUILD, MODEL_REVIEW). Sourced with `set -a` so the values are
# exported and envsubst can inject them into the prompt on every iteration.
if [ -f ".ralph.env" ]; then
    set -a
    . ./.ralph.env
    set +a
fi

# Route the loop through an alternate provider (session-only). RALPH_PROFILE in
# .ralph.env names a profile in ~/.claude/switch-claude-profile.sh (claude|glm|
# minimax). Sourcing it exports ANTHROPIC_BASE_URL/AUTH_TOKEN and remaps the
# opus/sonnet/haiku model aliases to that provider's models — so MODEL_* below
# keep working unchanged and no API token ever lands in a committable file.
if [ -n "${RALPH_PROFILE:-}" ] && [ -f "$HOME/.claude/switch-claude-profile.sh" ]; then
    . "$HOME/.claude/switch-claude-profile.sh" "$RALPH_PROFILE"
fi

# Backfill the three-tier model defaults (opus/sonnet/sonnet) so a .ralph.env
# predating these keys still renders a valid prompt — envsubst would otherwise
# blank a missing ${MODEL_*} in the templates. Export so envsubst sees them.
: "${MODEL_PLAN:=opus}"
: "${MODEL_BUILD:=sonnet}"
: "${MODEL_REVIEW:=sonnet}"
export MODEL_PLAN MODEL_BUILD MODEL_REVIEW

# Backfill the subagent fan-out caps (read/search and build) so a .ralph.env
# predating these keys still renders a valid prompt — envsubst would otherwise
# blank a missing ${RALPH_MAX_*} in the templates. Export so envsubst sees them.
: "${RALPH_MAX_READ_AGENTS:=250}"
: "${RALPH_MAX_BUILD_AGENTS:=1}"
export RALPH_MAX_READ_AGENTS RALPH_MAX_BUILD_AGENTS

# Top-level agent model per mode. Both planning modes use the plan model.
if [ "$MODE" = "build" ]; then
    MODEL=$MODEL_BUILD
else
    MODEL=$MODEL_PLAN
fi

# Which CLI drives the loop. Default claude so a .ralph.env predating this key
# still works.
: "${RALPH_CLI:=claude}"

# Map RALPH_CLI + model to that provider's headless invocation. Every provider
# reads the prompt from stdin; they differ only in the flags for non-interactive
# mode, structured output, and model selection. Sets CLI_CMD (an argv array) used
# by both --dry-run and the real call, so what dry-run prints is what runs.
# ponytail: flags follow each tool's documented headless mode as of 2026-07;
#           edit a row if a CLI changes its flags or add a new provider here.
build_cli_cmd() {
    local model="$1"
    case "$RALPH_CLI" in
        claude)
            CLI_CMD=(claude -p --dangerously-skip-permissions
                     --output-format=stream-json --model "$model" --verbose) ;;
        amp)  # Sourcegraph Amp: model is server-selected, so no --model flag.
            CLI_CMD=(amp --execute --dangerously-allow-all --stream-json) ;;
        codex)  # OpenAI Codex
            CLI_CMD=(codex exec --dangerously-bypass-approvals-and-sandbox
                     --json --model "$model") ;;
        opencode)
            CLI_CMD=(opencode run --model "$model") ;;
        *)
            echo "Error: unknown RALPH_CLI '$RALPH_CLI' (expected claude|amp|codex|opencode)" >&2
            exit 1 ;;
    esac
}

ITERATION=0
CURRENT_BRANCH=$(git branch --show-current)
CHECKPOINT_FILE=".ralph-checkpoint"

# How many trailing stderr lines to keep in each .ralph-failures.md entry.
# Overridable from .ralph.env if a project's errors are noisier/quieter.
FAILURE_LOG_LINES=${FAILURE_LOG_LINES:-20}

# Bucket a failed iteration for the .ralph-failures.md review log. Buckets match
# the ones a human greps for when spotting patterns across runs. Backpressure
# (tests/lint/build) runs inside the Claude session, so its failures reach us as
# a non-zero Claude exit — we recover the category from the stderr tail.
categorize_failure() {
    local ec="$1" text="$2"
    if [ "$ec" -eq 124 ] || printf '%s' "$text" | grep -qiE 'time?d? ?out'; then
        echo "timeout"
    elif printf '%s' "$text" | grep -qiE 'lint'; then
        echo "lint-fail"
    elif printf '%s' "$text" | grep -qiE 'test|build|typecheck|assert|fail'; then
        echo "backpressure-fail"
    else
        echo "unknown"
    fi
}

# --resume: pick up the iteration counter where the last run left off. The
# checkpoint is written after each successful push, so completed iterations
# aren't repeated. Cross-check against the git tag-per-iteration convention
# (PROMPT_build.md tags each green build) and warn if they disagree.
if [ "$RESUME" -eq 1 ]; then
    CHECKPOINT=$(cat "$CHECKPOINT_FILE" 2>/dev/null)
    if [[ "$CHECKPOINT" =~ ^[0-9]+$ ]]; then
        ITERATION=$CHECKPOINT
        TAG_COUNT=$(git tag | wc -l | tr -d '[:space:]')
        echo "Resuming from checkpoint: $ITERATION iteration(s) done, $TAG_COUNT git tag(s) present"
        [ "$TAG_COUNT" -lt "$ITERATION" ] && \
            echo "Warning: fewer tags ($TAG_COUNT) than checkpoint ($ITERATION) — checkpoint may be ahead of committed work"
    else
        echo "No valid $CHECKPOINT_FILE found — starting from iteration 0"
    fi
fi

# Scoping must happen on a work branch, not on the trunk.
if [ "$MODE" = "plan-work" ] && { [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; }; then
    echo "Error: plan-work should run on a work branch, not $CURRENT_BRANCH"
    echo "Pass --branch <name> or create/checkout a work branch first."
    exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Mode:   $MODE"
echo "Prompt: $PROMPT_FILE"
echo "CLI:    $RALPH_CLI"
echo "Model:  $MODEL"
[ -n "${RALPH_PROFILE:-}" ] && echo "Provider: $RALPH_PROFILE (${ANTHROPIC_BASE_URL:-})"
echo "Branch: $CURRENT_BRANCH"
[ "$MODE" = "plan-work" ] && echo "Work:   $WORK_DESCRIPTION"
[ $MAX_ITERATIONS -gt 0 ] && echo "Max:    $MAX_ITERATIONS iterations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Verify prompt file exists
if [ ! -f "$PROMPT_FILE" ]; then
    echo "Error: $PROMPT_FILE not found"
    exit 1
fi

# Render the prompt by injecting .ralph.env values via envsubst. The whitelist
# leaves any unrelated ${...} in the prompt untouched; if envsubst (gettext)
# isn't installed we fall back to the raw prompt. Shared by --dry-run and the
# loop so what dry-run prints is exactly what gets piped to Claude.
render_prompt() {
    if command -v envsubst >/dev/null 2>&1; then
        envsubst '$PROJECT_NAME $TEST_CMD $LINT_CMD $BUILD_CMD $MODEL_PLAN $MODEL_BUILD $MODEL_REVIEW $RALPH_MAX_READ_AGENTS $RALPH_MAX_BUILD_AGENTS $WORK_SCOPE' < "$PROMPT_FILE"
    else
        cat "$PROMPT_FILE"
    fi
}

# --dry-run: show the rendered prompt and the command that would run, then exit
# without calling Claude or pushing. Lets you sanity-check substitution and model
# selection before spending tokens.
if [ "$DRY_RUN" -eq 1 ]; then
    echo "───────────── DRY RUN: rendered prompt ($PROMPT_FILE) ─────────────"
    render_prompt
    echo ""
    echo "───────────── DRY RUN: command ─────────────"
    build_cli_cmd "$MODEL"
    echo "${CLI_CMD[*]}"
    echo "(dry run — no $RALPH_CLI call, no git push)"
    exit 0
fi

. "$(dirname "${BASH_SOURCE[0]}")/ralph-sync.sh" || exit 1
if [ -z "$CURRENT_BRANCH" ] || [ "$CURRENT_BRANCH" = "${RALPH_BASE_BRANCH:-main}" ]; then
    echo "Error: Ralph needs a work branch. Use --branch ralph/work."
    exit 1
fi

while true; do
    if [ $MAX_ITERATIONS -gt 0 ] && [ $ITERATION -ge $MAX_ITERATIONS ]; then
        echo "Reached max iterations: $MAX_ITERATIONS"
        break
    fi

    ralph_sync_base || { echo "Ralph: cannot fetch upstream; no completion claimed."; exit 1; }

    # Run Ralph iteration with the selected prompt, driven by whichever CLI
    # RALPH_CLI names. build_cli_cmd maps the provider to its headless/output/model
    # flags (see the function above). $MODEL is MODEL_PLAN for plan modes,
    # MODEL_BUILD for build (from .ralph.env; defaults opus/sonnet). MODEL_REVIEW is
    # injected into the prompt for read/review subagents, not the top-level agent.
    build_cli_cmd "$MODEL"
    ITER_START=$(date +%s)
    # Inject .ralph.env values into the prompt via envsubst before piping to Claude.
    PROMPT="$(render_prompt)
$(ralph_integration_prompt)"
    # Tee stderr to a temp file so a failed iteration can be logged with its tail,
    # while still showing it live. ponytail: the process-substitution tee may drop
    # the very last buffered line in a rare race — fine for a diagnostic tail.
    STDERR_LOG=$(mktemp)
    printf '%s' "$PROMPT" | "${CLI_CMD[@]}" 2> >(tee "$STDERR_LOG" >&2)
    EXIT_CODE=$?
    if [ "$(git branch --show-current)" != "$CURRENT_BRANCH" ]; then
        echo "Ralph: agent changed branches unexpectedly; stopping before any push."
        exit 1
    fi
    ELAPSED=$(( $(date +%s) - ITER_START ))

    # On a non-zero exit (Claude CLI crash, or backpressure surfaced through it),
    # append a structured record to .ralph-failures.md — the running input for the
    # "sit on the loop" review practice.
    if [ "$EXIT_CODE" -ne 0 ]; then
        STDERR_TAIL=$(tail -n "$FAILURE_LOG_LINES" "$STDERR_LOG" 2>/dev/null)
        CATEGORY=$(categorize_failure "$EXIT_CODE" "$STDERR_TAIL")
        {
            printf '## %s — iteration %d (%s)\n' \
                "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$((ITERATION + 1))" "$MODE"
            printf -- '- category: %s\n' "$CATEGORY"
            printf -- '- exit_code: %d\n' "$EXIT_CODE"
            printf -- '- stderr (last %s lines):\n\n' "$FAILURE_LOG_LINES"
            printf '```\n%s\n```\n\n' "$STDERR_TAIL"
        } >> .ralph-failures.md
        echo "Logged $CATEGORY failure (exit $EXIT_CODE) to .ralph-failures.md"
    fi
    rm -f "$STDERR_LOG"

    # Push changes after each iteration. Record the completed iteration count to
    # the checkpoint only on a successful push, so --resume never skips work that
    # never made it upstream.
    PUSH_OK=0
    if [ "$EXIT_CODE" -eq 0 ] && [ "$(git branch --show-current)" = "$CURRENT_BRANCH" ] &&
        ! git rev-parse -q --verify MERGE_HEAD >/dev/null &&
        git push -u "$RALPH_REMOTE" "$CURRENT_BRANCH"; then
        PUSH_OK=1
        echo "$((ITERATION + 1))" > "$CHECKPOINT_FILE"
    else
        echo "Failed to push — checkpoint not advanced"
    fi

    # Append one telemetry record per iteration for post-run analysis.
    # ponytail: hand-rolled JSON escape (backslash + quote) instead of a jq
    #           dependency — commit subjects are single-line, so no newlines to escape.
    COMMIT_SUBJECT=$(git log -1 --pretty=%s 2>/dev/null)
    COMMIT_SUBJECT=${COMMIT_SUBJECT//\\/\\\\}
    COMMIT_SUBJECT=${COMMIT_SUBJECT//\"/\\\"}
    printf '{"timestamp":"%s","iteration":%d,"mode":"%s","seconds":%d,"exit_code":%d,"commit":"%s"}\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$((ITERATION + 1))" "$MODE" "$ELAPSED" "$EXIT_CODE" "$COMMIT_SUBJECT" \
        >> .ralph-telemetry.jsonl

    # Halt cleanly once the plan is exhausted (build mode only — plan mode
    # writes the plan, so an empty checklist there just means "not written yet")
    if [ "$MODE" = "build" ] && [ "$EXIT_CODE" -eq 0 ] && [ "$PUSH_OK" -eq 1 ] &&
        ./check_done.sh && ralph_ready_to_finish; then
        echo "Plan complete. Branch includes $RALPH_REMOTE/$RALPH_BASE_BRANCH; local preview check passed."
        echo "Worktree: $(git rev-parse --show-toplevel) | Branch: $CURRENT_BRANCH | Commit: $(git rev-parse --short HEAD)"
        echo "Branch pushed. This is not a production deployment."
        break
    fi

    ITERATION=$((ITERATION + 1))
    echo -e "\n\n======================== LOOP $ITERATION ========================\n"
done
