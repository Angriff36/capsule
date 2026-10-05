# Capsule command reference

**Created:** 2026-07-17  
**Scope:** Commands run from the **Capsule repo root** unless noted.

> **Essentials only?** See [../commands.md](../commands.md). This file is the full reference.

Capsule is a live Manifest project assembled by Builder. Domain meaning lives in
`src/**/*.manifest` and `manifest.config.yaml`. Builder-owned generated trees
must not be hand-edited — regenerate them with the commands below.

Related: [local-dev.md](./local-dev.md), [manifest-builder.md](../generation/manifest-builder.md), [manifest-cli-safety.md](../generation/manifest-cli-safety.md), [command-idempotency.md](../generation/command-idempotency.md), [AGENTS.md](../../AGENTS.md).

---

## Prerequisites

| Requirement  | Version / note                                                     |
| ------------ | ------------------------------------------------------------------ |
| Bun          | **1.3.4** (`.bun-version`, `packageManager`)                       |
| Node         | **22.22.2** (`.nvmrc`); alternatives must satisfy `package.json` engines.node                                               |
| Builder CLI | Committed `scripts/manifest-builder`; dependencies use the root lockfile |
| Clerk        | Application + publishable key                                      |
| Convex       | Dev deployment URL                                                 |

---

## 1. Full build from scratch

### A. Fresh clone → running app (normal path)

Use when the repo already exists with generated artifacts and ownership metadata.

```bash
# 1. Clone and install
git clone <capsule-repo-url> capsule
cd capsule
bun install --frozen-lockfile

# 2. Environment (client + Convex server)
cp .env.example .env.local
# Edit .env.local: VITE_CONVEX_URL, VITE_CLERK_PUBLISHABLE_KEY

bun run convex:env-set -- CLERK_JWT_ISSUER_DOMAIN https://YOUR.clerk.accounts.dev
bun run convex:env-set -- CONVEX_FIELD_ENCRYPTION_KEY <32-byte-secret>

# 3. Run (one terminal)
bun run dev          # Convex backend + Vite frontend → http://localhost:7811

# 4. Optional seed (needs deployment URL)
bun run seed

# 5. Verify
bun run check
```

### B. Bootstrap a new Convex application (initial generation)

Use once when creating a **new** app directory from authoritative Manifest source.
Run from the **target app directory** after install (or empty dir + install).

```bash
cd /path/to/new-app

# Dry-run plan
builder generate convex \
  --mode initial \
  --manifest-source /path/to/manifest-source \
  --dry-run

# Apply when conflict-free
builder generate convex \
  --mode initial \
  --manifest-source /path/to/manifest-source \
  --apply

# Post-generate (in the app)
bun install
bun run codegen
bun run dev          # Convex backend + Vite frontend → http://localhost:7811
```

Capsule itself is already initialized — use section **2** for regen, not initial mode.

### C. One-time ownership bootstrap (recovery)

When ownership digests are stale, re-baseline without rewriting app files:

```bash
builder adopt ownership --apply
```

### D. Import editable Manifest source (no projection regen)

Use to copy `.manifest` files + `manifest.config.yaml` from an external tree without regenerating Convex output.

```bash
cd /path/to/capsule

builder migrate manifest-source \
  --from /path/to/manifest-source \
  --dry-run

builder migrate manifest-source \
  --from /path/to/manifest-source \
  --apply
```

---

## 2. Regenerate artifacts

Run from the **Capsule repo root**. Builder defaults `--target` to cwd.

### Primary flow (domain change → generated Convex + client wiring)

```bash
# 1. Edit domain — src/**/*.manifest, manifest.config.yaml

# 2. Regenerate (Builder plans; applies only when conflict-free)
bun run manifest:regen

# Optional: install if Builder changed dependency requirements
bun run manifest:regen -- --install

# 3. Refresh Convex codegen + run
bun run codegen
bun run dev:convex
```

Preview without applying: `builder generate convex --dry-run`

### IR + proof-kit only (no Builder filesystem write)

```bash
bun run proof:emit                # compile IR + emit generated/proof/*
```

Uses `manifest compile --all` (reads `manifest.config.yaml` `src` glob). Do not
reintroduce `shell: true` + `-g src/**/*.manifest` — Linux bash expands the
glob and merge compile collapses to one file (CI “unknown entity” false alarm).

### Convex codegen only

Regenerates `convex/_generated/**` from existing `convex/` sources (after Builder apply).

```bash
bun run codegen
```

### What each generator owns

| Command          | Writes                                                                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest:regen` | `convex/*.ts` (except author seams), `schemas/**`, `wiring/**`, `src/generated/**`, `src/lib/manifest-convex-react.ts`, `scripts/seed-convex.ts`, `diagrams/**`, `.builder/ownership.json`, … |
| `codegen`        | `convex/_generated/**`                                                                                                                                                                        |
| `proof:emit`     | `generated/proof/**`                                                                                                                                                                          |

**Never hand-edit** Builder-owned paths. See `.builder/ownership.json` and
[manifest-builder.md](../generation/manifest-builder.md).

### Manifest CLI — what is safe to run here

Bare `manifest …` is not the Convex regen path. Full inventory (safe vs unsafe,
including why `diagram -o diagrams` fails ownership):
[manifest-cli-safety.md](../generation/manifest-cli-safety.md).

---

## 3. Maintenance commands

### Full CI gate (run before claiming work complete)

```bash
bun run check
```

Runs, in order: `toolchain` → `proof:emit` → `check:proof` → `check:manifest-registry` → domain manifest integration guards → `typecheck` → `format:check` → `secrets` → `test:coverage` → `build` → `baseline:decay`.

### Individual gates

```bash
bun run toolchain              # Bun/Node pin check
bun run typecheck              # tsc --noEmit
bun run format                 # prettier --write .
bun run format:check           # prettier --check .
bun run secrets                # secret scan (must stay green)
bun run test                   # vitest run (all tests)
bun run test:coverage          # vitest + coverage ratchet
bun run test:proofs            # runtime proof + integration guard subset
bun run build                  # vite production build
bun run baseline:decay         # monthly hygiene / root-cap checks
```

### Proof and registry

```bash
bun run proof:emit             # regenerate generated/proof/*
bun run check:proof            # proof registry gate
bun run check:manifest-registry  # @angriff36/manifest must be registry semver (no file:)
```

### Domain integration guards (part of `check`)

~~`bun run check:event-manifest`, `check:culinary-manifest`, `check:supply-manifest`,
`check:production-manifest`, `check:workforce-manifest`~~

> **Correction (2026-09-25):** one runner covers every domain guard in
> `generated/proof/guard.*.json` (culinary, event, supply, production,
> workforce, logistics, commercial, closeout, payroll):

```bash
bun run check:manifest-integration
bun run check:manifest-breaking   # domain IR vs last [release]; acks in scripts/manifest-breaking-acks.json
```

### Branch and release (the only path to production)

**Branch and release rule (owner, 2026-08-25):** never push `main` by hand (`.githooks/pre-push` blocks it). Work on a branch; commit and push to that branch at once and often — those pushes are chores: Vercel ignores non-`main` refs (`vercel.json` `ignoreCommand`), so no build and no Convex prod deploy. Dev uses the LOCAL Convex backend. ONE merge to `main` at the end of the branch — `bash scripts/release.sh --reviewer <model>` — is the only production build and prod deploy; it then renames the branch to `archive/<branch>`.

```bash
git checkout -b feat/<name> main
git push -u origin feat/<name>              # chore push: no build, no deploy
bash scripts/release.sh --reviewer <model>         # ONE merge + ONE main push, then archive/<branch>
```

For parallel review and validation in a private release checkout, the low-level
release command supports:

```bash
bash scripts/release.sh --prepare --reviewer <model>
# Review the printed candidate SHA against its printed base while check runs.
# Only after the full gate passes and the independent reviewer APPROVES:
bash scripts/release.sh --publish --reviewer <model>
```

Do not run a separate full check before preparing a release. Preparation runs
the same `bun run check` on the final merge and leaves local main on that
candidate without pushing. Publishing requires a clean, unchanged candidate,
matching passing proof and reviewer, and unchanged local source branch and origin/main.
It pushes the already-validated commit without another full check. Never publish
a rejected review. If the candidate becomes stale, return to the source branch,
preserve any useful local candidate commit, restore local main to origin/main
after verifying it has no other local work, and prepare/review again.

The existing single-command release remains available after review approval;
it also runs the full check exactly once. Source-to-archive renames at a released
commit no longer regenerate code; ordinary branch and main pushes still do.

The split commands only publish the Git release; they do not deploy the
self-hosted backend. `scripts/deploy-production.sh` remains the complete
production entry point. To finish a split release, check out its published
`main` in the private release checkout and run that orchestrator; it resumes
without repeating the release gate. `--candidate <sha>` is supported by
`--prepare` and retained for `--publish`, so later remote `dev` commits wait
for the next release.

### Deploy

```bash
bun run deploy                 # convex deploy — HUMAN-ONLY manual path; the normal path is `bash scripts/release.sh`
bash scripts/deploy-production.sh --reviewer <model>  # THE production release: release.sh + Vercel check + backend deploy on the Linux box over SSH
bash scripts/deploy-backend.sh --expect <main sha>   # production backend, ON THE LINUX BOX only (deploy-production.sh runs it for you) — docs/operations/production-backend-deploy.md
```

### Reset local state

```bash
# Frontend
rm -rf dist/
bun run dev

# Env
cp .env.example .env.local
# re-fill secrets

# Convex dev deployment — use dashboard or Convex CLI against dev only
```

---

## 4. Feature commands

Typical loop when adding or changing product behavior.

### A. Domain / backend behavior (Manifest-owned)

```bash
# 1. Edit proofs
#    src/<domain>/*.manifest
#    manifest.config.yaml (naming, projection options)

# 2. Regenerate owned application artifacts
bun run manifest:regen

# 4. Convex + proofs
bun run codegen
bun run proof:emit
bun run test:proofs

# 5. Full gate
bun run check
```

### B. Authored UI (Capsule-owned)

Edit only under `src/app/**`, `src/features/**`, `src/ui/**`. Import Convex through
`src/lib/api.ts` and generated hooks from `src/lib/manifest-convex-react.ts`.

```bash
bun run dev                    # hot reload at http://localhost:7811
bun run typecheck
bun run test                   # include new feature tests
bun run check
```

### C. Auth seams (author Convex only)

Safe paths: `convex/lib/**`, `convex/auth.config.ts`, `convex/authStatus.ts`.

```bash
bun run dev:convex
bun run test
bun run check
```

### D. Runtime proof for a new reaction or command

```bash
# Add test under tests/proofs/
bun run test:proofs

# Or single file
bunx vitest run tests/proofs/<your-proof>.runtime.test.ts
```

### E. Local dev (daily)

```bash
bun run dev          # Convex backend + Vite frontend → http://localhost:7811
```

---

## Quick reference

| Intent             | Command                              |
| ------------------ | ------------------------------------ |
| Install deps       | `bun install --frozen-lockfile`      |
| Start app          | `bun run dev` |
| Plan Builder regen | `bun run manifest:regen`             |
| Convex codegen     | `bun run codegen`                    |
| Emit proof kit     | `bun run proof:emit`                 |
| Full CI locally    | `bun run check`                      |
| Release (one/branch) | `bash scripts/release.sh --reviewer <model>` |
| Deploy (manual, human) | `bun run deploy`                   |

---

## Builder CLI

The CLI lives in `scripts/manifest-builder/`. No sibling checkout or global Builder
installation is needed. Use `bun run manifest:regen` and
`bun run manifest:regen:check` from Capsule. See `scripts/manifest-builder/README.md`
for upstream provenance and update instructions.

`bun run build` builds the frontend only. `bun run deploy:production` is the
explicit production entrypoint used by Vercel. `bun run release:receipt` uses
the pinned local Vercel CLI. Deployment still requires configured credentials;
the normal release remains `bash scripts/release.sh --reviewer <model>`.
