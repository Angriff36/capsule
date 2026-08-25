# CapsuleX

Catering and event operations workspace: React UI, Convex data plane, Clerk authentication. Assembled from Manifest Convex application proofs.

## Docs

| Doc                                                                              | What                                         |
| -------------------------------------------------------------------------------- | -------------------------------------------- |
| [docs/architecture/overview.md](docs/architecture/overview.md)                   | System map                                   |
| [docs/architecture/boundaries.md](docs/architecture/boundaries.md)               | Authored vs generated                        |
| [docs/systems/auth.md](docs/systems/auth.md)                                     | Clerk + AuthGate + membership                |
| [docs/systems/events.md](docs/systems/events.md)                                 | First domain slice                           |
| [docs/systems/navigation-shell.md](docs/systems/navigation-shell.md)             | AppShell / nav                               |
| [docs/generation/manifest-builder.md](docs/generation/manifest-builder.md)       | How this repo is produced                    |
| [docs/generation/command-idempotency.md](docs/generation/command-idempotency.md) | Native command idempotency (runtime)         |
| [docs/commands.md](docs/commands.md)                                             | Essential commands (start here)              |
| [docs/operations/commands.md](docs/operations/commands.md)                       | Full command reference                       |
| [docs/operations/local-dev.md](docs/operations/local-dev.md)                     | Clone → env → run                            |
| [PRESET.md](PRESET.md)                                                           | Manifest assembly receipt (do not duplicate) |
| [AGENTS.md](AGENTS.md)                                                           | Agent commands                               |
| [CLAUDE.md](CLAUDE.md)                                                           | Agent behavior rules                         |

## Quick start

```bash
bun install --frozen-lockfile
cp .env.example .env.local
# Fill VITE_CONVEX_URL and VITE_CLERK_PUBLISHABLE_KEY — see docs/operations/local-dev.md

bun run dev:convex   # terminal 1
bun run dev          # terminal 2 → http://localhost:7811
```

## One local truth

```bash
bun run check
```

Runs toolchain pin check, typecheck, Prettier (`format:check`), secret scan, tests with coverage ratchet, production build, and baseline decay checks. CI runs the same script (`.github/workflows/ci.yml`). See [`BASELINE.md`](BASELINE.md).

## Deploying to Vercel (production)

Live app: **https://capsule-tau-eight.vercel.app** (Vercel project `capsule`,
team `ryans-projects-471134dd`, GitHub-linked, production branch `main`).
Backend: Convex prod deployment **impartial-mule-193**
(https://impartial-mule-193.convex.cloud — dashboard:
https://dashboard.convex.dev/d/impartial-mule-193). Auth: Clerk dev instance
`golden-koi-11` (test keys — swap for a Clerk production instance before real
customers).

**Branch and release rule (owner, 2026-08-25):** never push `main` by hand (`.githooks/pre-push` blocks it). Work on a branch; commit and push to that branch at once and often — those pushes are chores: Vercel ignores non-`main` refs (`vercel.json` `ignoreCommand`), so no build and no Convex prod deploy. Dev uses the LOCAL Convex backend. ONE merge to `main` at the end of the branch — `bash scripts/release.sh --reviewer <model>` — is the only production build and prod deploy; it then renames the branch to `archive/<branch>`.

How a change reaches production:

1. **Work on a branch.** Commit and push to the branch as you go. Nothing
   builds; nothing deploys.
2. **Release once.** After the cross-model review APPROVES, run
   `bash scripts/release.sh --reviewer <model>` from the branch. It merges into
   `main`, pushes `main` one time, and archives the branch.
3. **That one `main` push builds on Vercel** and its build
   (`scripts/vercel-build.sh`) runs `convex deploy --cmd 'vite build'`, so the
   Convex backend (impartial-mule-193) and the UI ship together. Backend env
   vars live on the deployment: `npx convex env set KEY value --prod`
   (CLERK_JWT_ISSUER_DOMAIN is already set to the golden-koi-11 issuer).

Manual deploys are human-only (`npx convex deploy -y`;
`vercel deploy --prod --yes --archive=tgz` — `--archive` is REQUIRED, the
repo exceeds Vercel's 15k-file upload limit without it).

Frontend env vars (`VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY`) are baked
in at **build time** from the Vercel project's Production env — changing one
requires a redeploy, and `vercel env add NAME production` to update.

Config files that make deploys work (do not delete):

- `vercel.json` — SPA rewrite of every route to `index.html`; without it any
  client-side route 404s on refresh. Its `ignoreCommand` skips every build
  that is not `main` (branch pushes cost nothing).
- `.githooks/pre-push` + `scripts/release.sh` — the branch/release rule above.
- `.vercelignore` — keeps worktrees/transcripts/generated docs out of the
  upload. Patterns are root-anchored (`/generated`) on purpose: a bare
  `generated` also matches `src/generated` and breaks the build.
- `package.json` `prepare` script ends in `|| exit 0` because Vercel's build
  container has no `.git` and a bare `git config` there kills `bun install`.

Adding a new public domain? Add it to Clerk's allowed origins too (Backend
API `PATCH /v1/instance` with the sk key, or the Clerk dashboard), or OAuth
sign-ins won't round-trip back to the app.

Known confusion: several retired `capsule-pro-*` Vercel projects still exist
with deployment protection ON — their URLs bounce to a Vercel login. The real
app is `capsule-tau-eight` only.
