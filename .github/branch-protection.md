# Branch protection (intended)

CI job name for pull requests: **`check`** (workflow: `.github/workflows/ci.yml`
→ job `name: check`). It is NOT required on `main`: releases are local merge
commits gated by `scripts/release.sh` (see Local enforcement below).

## Desired rules

- Restrict who can push `main` to the owner (the release script pushes as the owner)
- Do not allow force pushes to `main`
- Do not allow deletions of `main`
- Do NOT require a pull request or the `check` status on `main`: releases are
  local merge commits made by `scripts/release.sh`, which runs `bun run check`
  itself before the push. CI runs on pull requests only.

## Local enforcement (2026-08-25)

Until GitHub can protect `main`, the repo enforces it locally:
`.githooks/pre-push` rejects any push to `refs/heads/main` unless
`CAPSULE_RELEASE=1`, which only `scripts/release.sh` (`bash scripts/release.sh`) sets.
Vercel builds `main` only, and only a commit whose subject starts with
`[release]` (`vercel.json` `ignoreCommand`) — a merge made on GitHub (PR
button, auto-merge) lands on `main` but does not deploy; the next release
carries it.

## Current blocker (2026-07-16)

Private repo on GitHub Free cannot enable classic branch protection or repository rulesets via API:

```text
HTTP 403 — Upgrade to GitHub Pro or make this repository public
```

Evidence: `gh api repos/Angriff36/capsule/branches/main/protection` and
`gh api repos/Angriff36/capsule/rulesets` both return that message.

## Smallest next action

Owner enables GitHub Pro (or temporarily public) and applies the rules above,
or imports a ruleset JSON once the API accepts it. Re-verify the required check
name is still exactly `check` after any CI rename. Also set the repo to
merge-commit only (no squash, no rebase merges) so a PR title cannot produce a
`[release]` commit on `main` — owner setting, see AGENTS.md § Deploying.
