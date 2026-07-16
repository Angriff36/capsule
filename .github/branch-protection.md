# Branch protection (intended)

CI job name that must stay required on `main`: **`check`**  
(workflow: `.github/workflows/ci.yml` → job `name: check`)

## Desired rules

- Require pull request before merge (1 review when collaborators exist)
- Require status check: `check`
- Require branches to be up to date before merge
- Do not allow force pushes to `main`
- Do not allow deletions of `main`

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
