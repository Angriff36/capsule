# Production deploy (runbook)

ONE command does the whole production release, from the WORK PC, on the branch
to release:

```bash
bash scripts/deploy-production.sh --reviewer <model>
```

It is only the orchestrator. The authoritative pieces do the work:
`scripts/release.sh` (merge, gate, the one `main` push, archive) and
`scripts/deploy-backend.sh` (the self-hosted Convex deploy, ON the Linux box).
Agents and people do not write deploy commands by hand, and nobody copies a
handoff between machines.

## What the one command does

1. Review and release. `--reviewer <model>` names the independent reviewer that
   ALREADY approved the branch (`AGENTS.md`, merge gate); the name goes to
   `scripts/release.sh`. With no `--reviewer`, the script runs the primary
   review itself (`codex -c model="gpt-5.6-sol" review -`) and continues only
   when the reviewer's last message has `VERDICT: APPROVE`. A REJECT, no
   verdict, no `codex` CLI, or Codex-authored commits stop the run.
2. Release commit. It takes the `[release]` commit on `origin/main` (the full
   sha) and runs `scripts/verify-vercel-release.ts`: the production address
   must serve the build OF that commit. Every build writes `<site>/version.json`
   with its commit (`vite.config.ts`, from `VERCEL_GIT_COMMIT_SHA`); the script
   reads it until it equals the release sha. Read-only, no Vercel credential. A
   failed or stale deployment never matches.
3. Backend or not. `scripts/release-backend-scope.ts` decides
   (`src/lib/releaseBackendScope.ts`). It compares the release with the PREVIOUS
   `[release]` commit on `main`, so a branch that landed through a GitHub-side
   merge is included. The backend deploy is necessary when that range changed a `.manifest` file, `convex/`, `convex.json`, the dependency
   pins (`package.json`, `bun.lock`), or a `src/` module that `convex/` code
   imports. Frontend-only: `RESULT: PASS - frontend deployed at <sha>; backend unchanged`.
4. Backend deploy. It opens SSH to the production box (`oc@pop-os`, the user's
   own SSH key and host configuration; no credential is in the repository). On
   the box it finds the production checkout by its git origin plus the
   self-hosted credential names in `.env.local` (no path is assumed, exactly
   one must match), fast-forwards `main`, requires `HEAD` = the release sha, and
   runs `scripts/deploy-backend.sh --expect <sha>`, with `--verify` for the
   zero-argument `list*` queries that the release added to `convex/queries.ts`.
5. Result. The last line is one of:
   - `RESULT: PASS - frontend and backend deployed at <sha>`
   - `RESULT: PASS - frontend deployed at <sha>; backend unchanged`
   - `RESULT: FAIL - <reason>`

Every failure stops the run at once. After a FAIL that came after the release
(Vercel, SSH, backend), run the same command again: on `main`, at the
`[release]` commit, it skips step 1 and continues. The backend deploy is
idempotent.

One-time condition on the WORK PC: `ssh oc@pop-os` works with a key
(`BatchMode`, no password prompt). It was true on 2026-09-20.

## Facts

- Vercel deploys the production frontend from `main` (`scripts/release.sh`).
- Production Convex is SELF-HOSTED on the owner's Linux production box.
- A Vercel release does NOT deploy that backend. The Vercel build is UI-only
  (`scripts/vercel-build.sh`, `CONVEX_SELF_HOSTED_URL` set).
- A release that changes `.manifest` files, `convex/`, or generated Convex files
  is thus not complete until the Linux box deploys the backend from the release
  commit. Until then, new queries answer `Server Error` in production.
- Convex Cloud `impartial-mule-193` is only the fallback. This workflow never
  touches it.

## Machine split

| Machine                       | Does                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| WORK PC (Windows)             | `scripts/deploy-production.sh`: review, `scripts/release.sh`, Vercel verification, backend decision    |
| PRODUCTION PC (Linux, pop-os) | `scripts/deploy-backend.sh`, started over SSH by the command above: deploy, runtime check, HTTP check |

`convex deploy` never runs against production from the WORK PC.
`scripts/deploy-backend.sh` refuses any system that is not Linux.

## The manual path (only when SSH from the WORK PC is not possible)

`scripts/release.sh` prints the backend line at the end of a release. Someone
on the production box (the owner, or Hermes with the skill below) runs it. It
always has this shape:

```bash
bash scripts/deploy-backend.sh --expect <full 40-character main sha> --verify <new query>,<new query>
```

- `--expect` is the release commit on `main`. The script aborts if `HEAD` is a
  different commit after the fast-forward.
- `--verify` is optional. It names the queries that the release added, so the
  runtime check proves that they exist. The WORK PC adds it to the handoff when
  the release added queries. The script always checks `queries:listEvent`.
  - Queries with no arguments: one comma list, `--verify listA,listB`. A name
    with no module is in the `queries` module.
  - A query with required arguments: its own flag with the JSON payload,
    `--verify 'events:getOne={"eventId":"<id>"}'`. The flag can be repeated.
  - Every error answer is a FAIL. An argument error is never counted as a pass.

## Authorization

A production deploy needs the same authorization as a release: the owner's
instruction, or an independent APPROVE under the merge gate (`AGENTS.md`). On
the manual path, the owner gives the backend line to the production-box agent,
or runs it. To read this runbook, or to load the Hermes
skill, is not an authorization. An agent that has only the expected sha, and no
instruction from the owner to deploy, runs `--dry-run` at most.

## Procedure on the production box

1. Go to the Capsule checkout on that box. No document records its path: find
   it, and let the script verify it (`origin` must be `Angriff36/capsule`).
2. Run the handoff line. Do not change it. Do not add steps.
3. Read the last line:
   - `RESULT: PASS - backend deployed from <sha>; N queries respond; frontend HTTP 200`
     → report it and STOP.
   - `RESULT: FAIL - <reason> (expected sha: <sha>)` → report the reason and
     STOP. Do not repair by hand, do not deploy from a different commit.

If the checkout is older than this script (first use), bring it to `main` first:
`git fetch origin main && git checkout main && git pull --ff-only origin main`.

## What the script does

1. Checkout: `origin` is the Capsule repository; no tracked local changes; no
   untracked or git-ignored file under `convex/`, and no untracked root
   `convex.json` (the Convex CLI bundles every file on disk
   there, so such a file would deploy code that the release commit lacks);
   `git fetch origin main`, `git checkout main`, `git pull --ff-only origin main`;
   `HEAD` equals `--expect`. If the pull brought a newer copy of the script, it
   runs that copy.
2. Machine: Linux; the active Bun equals `.bun-version`; the names
   `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` are set in the
   shell or in `.env.local` on the box. It never prints their values.
3. Deploy (the documented commands, `AGENTS.md`): `bun install --frozen-lockfile`,
   then `npx convex deploy -y`.
4. Runtime verification: `POST <CONVEX_SELF_HOSTED_URL>/api/query` with
   `{"path":"<query>","args":<payload>,"format":"json"}` for each query. The
   address is the effective `CONVEX_SELF_HOSTED_URL` (the shell value, else
   `.env.local`): the SAME backend that the deploy used. The script holds no
   second backend address.
   `"status":"success"` means that the function ran. `Server Error` means that
   the backend does not have it. `npx convex function-spec` is a secondary check
   and gives only a warning.
5. Frontend verification: the production URL returns HTTP 200.
6. `RESULT: PASS` or `RESULT: FAIL`, with the sha.

## Dry run

```bash
bash scripts/deploy-backend.sh --expect <sha> --dry-run
```

It checks the origin, tracked changes, `HEAD`, the Bun version, and the
credential names. It does not fetch, check out, install, deploy, or use the
network. It prints the commands that a real run does.

## Known failures

- `bun is X; .bun-version pins Y` → put the pinned Bun first in `PATH` on the
  box, then run the handoff line again.
- `CONVEX_DEPLOYMENT is set in this shell` → `unset CONVEX_DEPLOYMENT`. If the
  Convex CLI itself says `CONVEX_DEPLOYMENT must not be set when
CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY are set`, the name is
  in `.env.local` on the box: remove that line there.
- `CONVEX_DEPLOY_KEY is set` or `CONVEX_DEPLOYMENT_TOKEN is set` → a Convex
  Cloud deploy key is in the shell, `.env.local`, or `.env` on the box. The
  Convex CLI gives it priority over the self-hosted names, so the deploy would
  not go to the self-hosted backend. Remove it on the box.
- `HEAD is <sha>` → `main` moved after the handoff. Ask the WORK PC for a new
  handoff line. Do not deploy.

## Hermes skill

The skill is in the repository: `docs/operations/hermes/skills/devops/capsule-backend-deploy/SKILL.md`.
To load it from the checkout, add the checkout's `docs/operations/hermes/skills` directory to
`skills.external_dirs` in `~/.hermes/config.yaml` on the production box. The
skill holds no machine-local path.

## Never part of this workflow

Vercel rollback, Vercel/Clerk/infrastructure settings, code edits, reviews,
audits, a deploy from a commit that the handoff did not name.

## Test

`tests/deploy-production-script.test.ts` runs the orchestrator offline: the real
`scripts/release.sh` against a local bare `origin`, with stub `bun`, `ssh` and
`codex`. `tests/release-backend-scope.test.ts` covers the backend decision.
`tests/deploy-backend-script.test.ts` runs the backend script offline: a throwaway git
checkout with a local bare `origin`, stub `bun`/`npx`/`curl`, and `.invalid`
addresses. It never contacts production.
