---
name: capsule-backend-deploy
description: Deploy Capsule's self-hosted Convex backend from a release sha.
version: 1.0.0
author: Angriff36
license: UNLICENSED
platforms: [linux]
metadata:
  hermes:
    tags: [DevOps, Deployment, Capsule, Convex]
---

# Capsule production backend deploy

One repo script does the deploy: `scripts/deploy-backend.sh`. This skill tells
you when to run it and how to report. It adds no deploy commands of its own.
Full runbook in the repo: `docs/operations/production-backend-deploy.md`.

## When to Use

- The owner gives you a backend handoff line from a Capsule release, or tells
  you to deploy the Capsule backend and gives the release sha.
- The owner asks if the Capsule production backend is behind the frontend.

**To load this skill is NOT an authorization to deploy.** Deploy only when the
owner tells you to, in the current conversation. With a sha and no instruction
to deploy, run `--dry-run` at most.

## Quick Reference

```bash
# The handoff line (the WORK PC release gives it):
bash scripts/deploy-backend.sh --expect <full 40-character main sha> --verify <query>,<query>

# A query with required arguments has its own --verify flag with a JSON payload:
bash scripts/deploy-backend.sh --expect <sha> --verify 'events:getOne={"eventId":"<id>"}'

# Checks only. No fetch, no install, no deploy, no network:
bash scripts/deploy-backend.sh --expect <sha> --dry-run
```

Machine split:

- WORK PC (Claude, Windows): release review → merge and push `main` → Vercel
  frontend deploy → backend handoff line with the expected `main` sha.
- PRODUCTION PC (you, Linux): run the handoff line → runtime verification →
  frontend HTTP verification → STOP.

## Procedure

1. Find the Capsule checkout on this machine. Do not assume a path. The correct
   checkout has a git `origin` that contains `Angriff36/capsule`, and it has
   `scripts/deploy-backend.sh`. If the script is absent, bring the checkout to
   `main` first (`git fetch origin main && git checkout main && git pull --ff-only origin main`).
2. From that checkout, run the handoff line exactly as given. Do not change the
   sha. Do not add, remove, or replace steps.
3. Read the last line of the output and report it to the owner word for word:
   - `RESULT: PASS - backend deployed from <sha>; N queries respond; frontend HTTP 200`
   - `RESULT: FAIL - <reason> (expected sha: <sha>)`
4. STOP.

## Pitfalls

- A Vercel release deploys the frontend only. It never deploys this backend.
- The script aborts if `HEAD` is not the expected sha after the fast-forward.
  Do not deploy from a different commit. Ask for a new handoff line.
- The script aborts on tracked local changes, and on untracked files under
  `convex/` (the Convex CLI would deploy them). Do not stash, reset, or delete
  them without the owner's instruction.
- The runtime probe goes to the address in `CONVEX_SELF_HOSTED_URL`: the same
  backend that the deploy used. There is no second backend address.
- An argument error from a `--verify` query is a FAIL, not a pass. The handoff
  line must give the JSON payload for a query that has required arguments.
- The active Bun must equal `.bun-version`. If the script says so, put the
  pinned Bun first in `PATH` and run the same line again.
- `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` must already be
  on this machine (shell or `.env.local` of the checkout). Never print, log, or
  send their values.
- `Server Error` from `/api/query` BEFORE the deploy is the expected answer for
  a query that the backend does not have yet. It is not a fault in the probe.
- `function-spec` is a secondary check only. The `/api/query` runtime probe is
  the proof.
- On FAIL: report and stop. Do not roll back Vercel, do not change
  infrastructure or settings, do not edit code, do not start reviews or audits.

## Verification

The script does the verification itself: each query answers
`"status":"success"` through `POST <CONVEX_SELF_HOSTED_URL>/api/query`, and the production
frontend returns HTTP 200. The deploy is good only when the last line is
`RESULT: PASS` with the expected sha.
