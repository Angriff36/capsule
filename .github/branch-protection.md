# Branch protection (intended)

CI job name that must stay required on `main`: **`check`**  
(workflow: `.github/workflows/ci.yml` → job `name: check`)

## Desired rules

- Require pull request before merge (1 review when collaborators exist)
- Require status check: `check`
- Require branches to be up to date before merge
- Do not allow force pushes to `main`
- Do not allow deletions of `main`

## Local enforcement (2026-08-25)

Until GitHub can protect `main`, the repo enforces it locally:
`.githooks/pre-push` rejects any push to `refs/heads/main` unless
`CAPSULE_RELEASE=1`, which only `scripts/release.sh` (`bash scripts/release.sh`) sets.
Vercel builds `main` only (`vercel.json` `ignoreCommand`).

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
name is still exactly `check` after any CI rename.
