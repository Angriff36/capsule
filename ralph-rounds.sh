#!/usr/bin/env bash
# Sourced by loop.sh. What a round really did (AC-160, PL-LOOP-COMPLETION):
# a provider error is never a done round, an all-complete claim dies when
# specs/ change, and rounds that change nothing get a diagnosis (never a stop).

RALPH_CLAIM_FILE=${RALPH_CLAIM_FILE:-.ralph-complete}
RALPH_STALL_ROUNDS=${RALPH_STALL_ROUNDS:-3}
RALPH_STALL_LOG=()
RALPH_CLAIM_STATE=none

# codex exec --json also writes "turn.completed" after a provider error such as
# a 429. The round is done only when the turn's last answer is a real one (same
# rule as ralph-worker.ps1: no answer, or an "API Error:" answer, is a failure).
ralph_codex_answer_ok() {
    local log="$1" last
    grep -q '"type":"turn.completed"' "$log" || return 1
    grep -q '"type":"turn.failed"' "$log" && return 1
    last=$(grep '"type":"agent_message"' "$log" | tail -n 1)
    [ -n "$last" ] || return 1
    ! printf '%s' "$last" | grep -qE '"text":"( *"|API Error)'
}

ralph_specs_hash() {
    git rev-parse -q --verify HEAD:specs 2>/dev/null || echo none
}

# $1: box contents to count in IMPLEMENTATION_PLAN.md (' ' = open, 'xX' = ticked).
ralph_plan_count() {
    local n
    n=$(grep -cE "^[[:space:]]*[-*] \[[$1]\]" IMPLEMENTATION_PLAN.md 2>/dev/null)
    echo "${n:-0}"
}

# Start of a round: an all-complete claim holds only for the specs/ it was made
# against. Sets RALPH_CLAIM_STATE to none, current or stale.
ralph_claim_check() {
    RALPH_CLAIM_STATE=none
    [ -f "$RALPH_CLAIM_FILE" ] || return 0
    local claimed now
    claimed=$(sed -n 's/^specs=//p' "$RALPH_CLAIM_FILE")
    now=$(ralph_specs_hash)
    if [ "$claimed" = "$now" ]; then
        RALPH_CLAIM_STATE=current
        return 0
    fi
    echo "Ralph: the all-complete claim from commit $(sed -n 's/^commit=//p' "$RALPH_CLAIM_FILE" | cut -c1-8) is stale: specs/ changed ($claimed -> $now)."
    rm -f "$RALPH_CLAIM_FILE"
    RALPH_CLAIM_STATE=stale
}

ralph_claim_prompt() {
    [ "$RALPH_CLAIM_STATE" = stale ] || return 0
    cat <<EOF

SPECS CHANGED: specs/ changed after the plan was last all ticked. That claim is
void. Compare the changed specs with IMPLEMENTATION_PLAN.md and src/ first.
EOF
}

# End of a passed round: no open box (and at least one ticked) is an
# all-complete claim, recorded with the specs/ tree it was made against.
ralph_claim_record() {
    if [ "$(ralph_plan_count ' ')" -eq 0 ] && [ "$(ralph_plan_count xX)" -gt 0 ]; then
        [ "$RALPH_CLAIM_STATE" = current ] && return 0
        printf 'specs=%s\ncommit=%s\ntime=%s\n' "$(ralph_specs_hash)" \
            "$(git rev-parse HEAD)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$RALPH_CLAIM_FILE"
    else
        rm -f "$RALPH_CLAIM_FILE"
    fi
}

# A round with no new plan tick and no new commit made no progress. After
# RALPH_STALL_ROUNDS such rounds in a row, say which rounds and why, every
# round, until one makes progress. Never stops the loop (owner rule 2026-09-20).
# $1 round, $2 exit code, $3 failure category, $4 HEAD before, $5 ticks before.
ralph_progress_note() {
    if [ "$(git rev-parse HEAD)" != "$4" ] || [ "$(ralph_plan_count xX)" != "$5" ]; then
        RALPH_STALL_LOG=()
        return 0
    fi
    RALPH_STALL_LOG+=("round $1 exit $2${3:+ ($3)}")
    [ "${#RALPH_STALL_LOG[@]}" -ge "$RALPH_STALL_ROUNDS" ] || return 0
    local msg
    msg="Ralph: no progress in ${#RALPH_STALL_LOG[@]} rounds in a row (no plan tick, no commit): $(IFS=';'; echo "${RALPH_STALL_LOG[*]}"). Last failure: ${RALPH_LAST_FAILURE:-none}. The loop keeps going."
    echo "$msg"
    printf '## %s — no progress\n\n- %s\n\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$msg" >> .ralph-failures.md
}
