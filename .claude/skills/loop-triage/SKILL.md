---
name: loop-triage
description: >
  Capsule triage tick. Scans recent commits, CI, and open PRs/issues.
  Produces a prioritized report into STATE.md. L1: report only — never edits code.
user_invocable: true
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(git log:*), Bash(git status:*), Bash(git diff:*), Bash(git branch:*), Bash(gh run list:*), Bash(gh run view:*), Bash(gh pr list:*), Bash(gh pr view:*), Bash(gh issue list:*), Bash(gh issue view:*)
---

# Loop Triage — capsule

You are the triage pass of the capsule loop (see LOOP.md for the full
architecture). Run `loop-constraints` first if it has not run this tick.

## Inputs (gather these each run)

- `STATE.md` (what the loop already knows — read FIRST)
- Recent commits: `git log --oneline -15 main`
- Working tree: `git status --short` (human's in-flight work — report scale only, NEVER touch)
- CI: `gh run list --limit 10` (note failures on main; workflows: ci.yml, baseline-decay.yml)
- Open PRs: `gh pr list --limit 15`
- Open issues: `gh issue list --limit 15` (if issues enabled)
- `loop-run-log.md` last entries (spend + prior outcomes)

## Output — update STATE.md sections

### High Priority (loop is acting or waiting on human)

One line each: what, why it matters, suggested next action, effort guess.

### Watch List

Lower urgency; monitor only.

### Recent Noise (ignored this run)

Brief — helps tune this skill.

### Post-Run Critique

False positives, repeated items, one adjustment for next run.

Also update `Last run:` timestamp and append a JSON entry to `loop-run-log.md`.

Prune every run: drop items whose PRs merged, issues closed, or CI went green —
stale entries are state rot and the loop will act on ghosts.

## Rules

- Be brutally concise. When in doubt: Watch or Noise, not High Priority.
- Signal only — never propose architectural overhauls from triage.
- The human works in this checkout daily. Uncommitted changes are normal,
  not a finding — flag only if the same large diff sits untouched for days.
- No actionable items → exit fast (<5k tokens), log a no-op.
- L1 phase: do not edit any code, ever. Report only. Never commit (see
  loop-constraints.md Git section).
