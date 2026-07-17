# Loop Safety & Guardrails — capsule

Per loop-engineering `docs/safety.md`. Machine-enforced rules live in
`loop-constraints.md` (the `loop-constraints` skill reads it every run);
this file is the human-readable policy.

## Path denylist (never auto-edit)

```
.env
.env.*
**/secrets/**
**/credentials/**
convex/schema.ts
convex/_generated/**
generated/**            # Manifest output — regenerate via the manifest skill
src/**/auth/**
src/**/payments/**
src/**/billing/**
```

## Auto-merge policy

**No auto-merge. Ever.** The loop proposes on `loop/<run-id>` branches in
`.loop-worktrees/`; the human merges.

## Tool scopes (least privilege per role)

| Role               | Allowed                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| loop-constraints   | Read only                                                                                            |
| loop-triage        | Read, read-only git, read-only `gh` (run/pr/issue list+view); writes STATE.md + loop-run-log.md only |
| loop-budget        | Read; writes loop-budget.md + loop-run-log.md only                                                   |
| loop-guard         | Read; writes loop-ledger.json; `npx @cobusgreyling/loop-context --check`                             |
| minimal-fix (L2)   | Edit/Write inside its `.loop-worktrees/<run-id>` worktree only; `bun run typecheck` / `bun run test` |
| loop-verifier (L2) | Read-only + `codex exec -s read-only`; runs tests; never edits                                       |

Declared as `allowed-tools` frontmatter in each `.claude/skills/*/SKILL.md`.

## Human gates (always)

- Anything on the denylist
- Convex schema or deploy (`convex deploy` / `bun run deploy` forbidden to the loop)
- Manifest pipeline changes
- Pushes, merges, PR closes
- Third failed attempt on the same item (loop-guard escalates)

## Kill switch

- Add a `loop-pause-all` line to STATE.md — every tick checks it first and exits
- Delete the `capsule-loop-tick` entry from `.claude/scheduled_tasks.json` to stop the heartbeat

## Secrets

No credentials in STATE.md, prompts, or the run log. Redact CI log excerpts
before writing them to state.
