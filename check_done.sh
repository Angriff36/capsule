#!/bin/bash
# check_done.sh — exit 0 when IMPLEMENTATION_PLAN.md has no unchecked task
# items left (`- [ ]`), exit 1 otherwise. loop.sh calls this after each
# iteration to halt cleanly once the plan is exhausted.
# Usage: ./check_done.sh [plan_file]   (default: IMPLEMENTATION_PLAN.md)

PLAN="${1:-IMPLEMENTATION_PLAN.md}"

if [ ! -f "$PLAN" ]; then
    echo "check_done: $PLAN not found — treating as not done" >&2
    exit 1
fi

# Unchecked item = a list line whose checkbox is empty: "- [ ]"
if grep -Eq '^[[:space:]]*- \[ \]' "$PLAN"; then
    exit 1  # work remains
fi

exit 0  # no unchecked items
