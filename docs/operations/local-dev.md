# Local development

## Prerequisites

- Bun **1.3.4** (`packageManager` / `.bun-version`)
- Node **>= 20** (`.nvmrc`)
- Clerk application + Convex project

## Fresh clone → running app

```bash
bun install --frozen-lockfile
cp .env.example .env.local
# Fill VITE_CONVEX_URL and VITE_CLERK_PUBLISHABLE_KEY
# Convex server env:
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

toolchain → typecheck → format:check (Prettier) → secrets → test:coverage → build → baseline:decay. CI runs the same script.

## Reset local state

- Frontend: delete `dist/`, restart Vite
- Convex: dashboard / CLI against the **dev** deployment only
- Env: recreate `.env.local` from `.env.example`
