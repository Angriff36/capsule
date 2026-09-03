#!/bin/bash
# lint_specs.sh — pre-planning gate that checks every spec in specs/* has the
# required sections (per SPEC_TEMPLATE.md) and at least one acceptance criterion.
# Malformed specs silently produce a broken IMPLEMENTATION_PLAN.md / ACCEPTANCE_TESTS.md,
# so run this before PLAN mode and halt if it exits non-zero.
#
# Checks per spec, printing a structured error line for each problem:
#   - "_Serves JTBD(s):_" line   (which JTBD from AUDIENCE_JTBD.md it supports)
#   - "## Job Statement"         section
#   - "## Acceptance Criteria"   section, with >= 1 criterion ("- [ ]" / "- [x]")
#   - "## Out of Scope"          section
#   - "## Open Questions"        section
#
# Exit 0 when every spec is well-formed (or there are none to lint), 1 otherwise.
# Usage: ./lint_specs.sh [specs_dir]   (default: specs)

set -u

SPECS_DIR="${1:-specs}"

if [ ! -d "$SPECS_DIR" ]; then
    echo "lint_specs: '$SPECS_DIR' not found — nothing to lint" >&2
    exit 0
fi

# Only .md files are specs; ignore the template if it lives here.
mapfile -t SPECS < <(find "$SPECS_DIR" -type f -name '*.md' ! -name 'SPEC_TEMPLATE.md' | sort)

if [ "${#SPECS[@]}" -eq 0 ]; then
    echo "lint_specs: no specs in '$SPECS_DIR/' — nothing to lint"
    exit 0
fi

errors=0

# require HEADER FILE — emit a structured error unless the exact header line exists.
require() {
    local header="$1" file="$2"
    if ! grep -qF "$header" "$file"; then
        echo "$file: missing \"$header\""
        errors=$((errors + 1))
    fi
}

for spec in "${SPECS[@]}"; do
    require "_Serves JTBD(s):_" "$spec"
    require "## Job Statement" "$spec"
    require "## Acceptance Criteria" "$spec"
    require "## Out of Scope" "$spec"
    require "## Open Questions" "$spec"

    # At least one acceptance criterion inside the Acceptance Criteria section
    # (a checkbox list item between that header and the next "## " header).
    criteria=$(awk '
        /^## Acceptance Criteria[[:space:]]*$/ { in_sec = 1; next }
        /^## / { in_sec = 0 }
        in_sec && /^[[:space:]]*- \[[ xX]\]/ { count++ }
        END { print count + 0 }
    ' "$spec")
    if [ "$criteria" -eq 0 ]; then
        echo "$spec: no acceptance criteria (need >= 1 \"- [ ]\" under \"## Acceptance Criteria\")"
        errors=$((errors + 1))
    fi
done

echo ""
if [ "$errors" -gt 0 ]; then
    echo "lint_specs: FAIL — $errors problem(s) across ${#SPECS[@]} spec(s)"
    exit 1
fi
echo "lint_specs: OK — ${#SPECS[@]} spec(s) well-formed"
exit 0
