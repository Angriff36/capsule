# Capsule command reference

**Created:** 2026-07-17  
**Scope:** Commands run from the **Capsule repo root** unless noted.

> **Essentials only?** See [../commands.md](../commands.md). This file is the full reference.

Capsule is a live Manifest project assembled by Builder. Domain meaning lives in
`src/**/*.manifest` and `manifest.config.yaml`. Builder-owned generated trees
must not be hand-edited — regenerate them with the commands below.

Related: [local-dev.md](./local-dev.md), [manifest-builder.md](../generation/manifest-builder.md), [command-idempotency.md](../generation/command-idempotency.md), [AGENTS.md](../../AGENTS.md).

---

## Prerequisites

| Requirement  | Version / note                                                     |
| ------------ | ------------------------------------------------------------------ |
| Bun          | **1.3.4** (`.bun-version`, `packageManager`)                       |
| Node         | **>= 20** (`.nvmrc`)                                               |
| Builder repo | Sibling checkout at `../builder` (devDependency `file:../builder`) |
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

bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://YOUR.clerk.accounts.dev
bunx convex env set CONVEX_FIELD_ENCRYPTION_KEY <32-byte-secret>

# 3. Run (two terminals)
bun run dev:convex    # terminal 1 — Convex sync
bun run dev           # terminal 2 — Vite → http://localhost:7811

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
bun run dev:convex
bun run dev
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

```bash
bun run check:event-manifest
bun run check:culinary-manifest
bun run check:supply-manifest
bun run check:production-manifest
bun run check:workforce-manifest
```

### Deploy

```bash
bun run deploy                 # convex deploy (human gate — not for loops/agents)
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
bun run dev:convex             # terminal 1
bun run dev                    # terminal 2
```

---

## Quick reference

| Intent             | Command                              |
| ------------------ | ------------------------------------ |
| Install deps       | `bun install --frozen-lockfile`      |
| Start app          | `bun run dev` + `bun run dev:convex` |
| Plan Builder regen | `bun run manifest:regen`             |
| Convex codegen     | `bun run codegen`                    |
| Emit proof kit     | `bun run proof:emit`                 |
| Full CI locally    | `bun run check`                      |
| Deploy             | `bun run deploy`                     |

---

## Builder repo commands (reference only)

Run from `../builder` when developing Builder itself — **not** required for normal Capsule work.

```bash
npm run builder -- --help
npm run test
npm run typecheck
npm run lint
```

Capsule consumes Builder via `@angriff36/manifest-builder` (`file:../builder`). After changing Builder CLI code, run `bun install` in Capsule to refresh the link.
