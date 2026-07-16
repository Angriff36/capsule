# CapsuleX

Catering and event operations workspace: React UI, Convex data plane, Clerk authentication. Assembled from Manifest Convex application proofs (`PRESET.md`).

## Requirements

- [Bun](https://bun.sh) **1.3.4** (see `packageManager` / `.bun-version`)
- Node **>= 20** (see `.nvmrc`)
- Clerk application + Convex project

## Fresh clone → running app

```bash
bun install --frozen-lockfile
cp .env.example .env.local
# Fill VITE_CONVEX_URL and VITE_CLERK_PUBLISHABLE_KEY in .env.local
# Set Convex server env:
#   bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://YOUR.clerk.accounts.dev
#   bunx convex env set CONVEX_FIELD_ENCRYPTION_KEY <32-byte-secret>

bun run dev:convex   # terminal 1
bun run dev          # terminal 2 → http://localhost:7811
```

Optional seed (needs a deployment URL):

```bash
bun run seed
```

## One local truth

```bash
bun run check
```

Runs typecheck, lint (Biome on authored code), secret scan, tests, and production build.

## Layout

- `src/` — UI shell, auth gate, events/kitchen features
- `convex/` — schema, queries, mutations, author-owned auth seams
- `schemas/`, `wiring/` — Manifest contracts (generated)
- `tests/` — Vitest
- `AGENTS.md` — instructions for automated contributors

## Reset local state

- Frontend: delete `dist/`, restart Vite
- Convex: use the Convex dashboard / CLI for the **dev** deployment only; never reset production from local docs
- Env: recreate `.env.local` from `.env.example`

## CI

GitHub Actions workflow `.github/workflows/ci.yml` runs `bun run check` on push/PR.
Branch protection requires a GitHub remote (not configured until the repo is published).
