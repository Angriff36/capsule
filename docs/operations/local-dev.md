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
# Convex server env (targets whatever CONVEX_DEPLOYMENT points at — usually local).
# ALWAYS use the wrapper on Windows — bare `bunx convex env set` often stores a
# trailing CR on the secret (NOT a .gitattributes/Git issue; see issue #83):
#   bun run convex:env-set -- CLERK_JWT_ISSUER_DOMAIN https://YOUR.clerk.accounts.dev
#   bun run convex:env-set -- CONVEX_FIELD_ENCRYPTION_KEY <32-byte-secret>
# Production cloud deployment:
#   bun run convex:env-set -- --prod CONVEX_FIELD_ENCRYPTION_KEY <32-byte-secret>

bun run dev:convex   # terminal 1 → http://127.0.0.1:3210
bun run dev          # terminal 2 → http://localhost:7811 (also 127.0.0.1)
```

### Git LF vs Convex secrets (do not confuse)

| Layer                                         | What enforces LF / trim              | What it does **not** cover    |
| --------------------------------------------- | ------------------------------------ | ----------------------------- |
| `.gitattributes` + repo `core.autocrlf=false` | Files in Git                         | Convex dashboard/CLI env vars |
| `.editorconfig` `end_of_line = lf`            | Editor saves                         | Same — not Convex secrets     |
| `bun run convex:env-set`                      | Strips CR/LF before `convex env set` | N/A — this is the secret path |

**Do not** set `git config --global core.autocrlf true`. That fights
`.gitattributes` and brings back phantom dirty files. Capsule wants LF:
global and this repo’s local `core.autocrlf` should both be `false`. If you
already set global to `true`, run:
`git config --global core.autocrlf false`.

**Encryption key:** Prefer `bun run convex:env-set` (no trailing CR). Local
ciphertext written while the key still had a trailing `\r` is decrypted via
legacy materials in `convex/lib/encryption.ts` — cleaning the env alone must
not drop those fallbacks or `listEvent` / client reads fail with
“Encryption key material may have drifted.”

Vite listens on all interfaces (`host: true`) so both `localhost` and
`127.0.0.1` work. If the UI spins with a blank/error shell, confirm **both**
processes are up — a live Vite with a dead Convex backend looks like “the
app won’t load.”

If the browser keeps full-reloading while you are not editing app code,
check the Vite terminal for `page reload <path>`. Non-source paths
(`docs/`, `.gitattributes`, `.pw-verify/`, …) are ignored in
`vite.config.ts` watch — do not remove that ignore list.


Optional seed (needs a deployment URL):

```bash
bun run seed
```

## One local truth

```bash
bun run check
```

toolchain → typecheck → format:check (Prettier) → secrets → test:coverage → build → baseline:decay. CI runs the same script.

Full command reference (build from scratch, regen, maintenance, features): [commands.md](./commands.md) (essentials) · [operations/commands.md](./operations/commands.md) (full).

## Reset local state

- Frontend: delete `dist/`, restart Vite
- Convex: dashboard / CLI against the **dev** deployment only
- Env: recreate `.env.local` from `.env.example`
