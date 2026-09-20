# Production backend deploy (runbook)

One script does the work: `scripts/deploy-backend.sh`. Agents and people do not
write deploy commands by hand. They decide WHEN to run the script, and they hand
off between the two machines.

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

| Machine                      | Does                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| WORK PC (Claude, Windows)    | release review → `bash scripts/release.sh --reviewer <model>` (merge, push `main`, Vercel frontend deploy) → gives the backend handoff line |
| PRODUCTION PC (Hermes, Linux) | runs the handoff line → runtime verification → frontend HTTP verification → STOP                                                            |

The WORK PC never runs the backend deploy. The script refuses any system that
is not Linux.

## The handoff

`scripts/release.sh` prints the handoff line at the end of a release. It always
has this shape:

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

The deploy is HUMAN-AUTHORIZED. The owner gives the handoff line to the
production-box agent, or runs it. To read this runbook, or to load the Hermes
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

`tests/deploy-backend-script.test.ts` runs the script offline: a throwaway git
checkout with a local bare `origin`, stub `bun`/`npx`/`curl`, and `.invalid`
addresses. It never contacts production.
