# Capsule commands (essentials)

Run everything from the **Capsule repo root**.  
Full reference: [operations/commands.md](./operations/commands.md).  
Manifest CLI safe vs unsafe: [generation/manifest-cli-safety.md](./generation/manifest-cli-safety.md).

---

## First time

```bash
bun install --frozen-lockfile
cp .env.example .env.local
# VITE_CONVEX_URL, VITE_CLERK_PUBLISHABLE_KEY

bun run convex:env-set -- CLERK_JWT_ISSUER_DOMAIN https://YOUR.clerk.accounts.dev
bun run convex:env-set -- CONVEX_FIELD_ENCRYPTION_KEY <32-byte-secret>
# Production (Vercel app → cloud Convex): set the same vars with --prod, then
# the release push to main deploys (see AGENTS.md § Deploying). Local env set
# does not affect prod (impartial-mule-193).
# Windows: if env list warns about trailing \r on this key, do not "clean" it
# without migrating ciphertext — decrypt/create will fail as Server Error.

bun run dev:convex    # terminal 1
bun run dev           # terminal 2 → http://localhost:7811
```

---

## Daily dev

```bash
bun run dev:convex
bun run dev
```

---

## Agent MCP (IDE → Capsule commands)

```bash
# .env.local: CONVEX_URL + CAPSULE_AGENT_JWT (Clerk JWT with role + tenantId)
bun run agent:mcp
```

Setup and Cursor config: [generation/capsule-agent-mcp.md](./generation/capsule-agent-mcp.md).

---

## Change domain → regenerate

Edit `src/**/*.manifest` and/or `manifest.config.yaml`, then:

```bash
bun run manifest:regen          # only regen command
bun run codegen
bun run dev:convex
```

Do **not** hand-edit Builder-owned files (`convex/schema.ts`, `convex/mutations.ts`, `schemas/**`, `src/generated/**`, etc.). See `.builder/ownership.json`.

Command retry / duplicate-call behavior: [generation/command-idempotency.md](./generation/command-idempotency.md).

---

## Change UI

Edit `src/app/**`, `src/features/**`, `src/ui/**`. Import Convex via `src/lib/api.ts`.

```bash
bun run dev
bun run typecheck
bun run test
```

---

## Before you ship / claim done

```bash
bun run check
```

---

## Quick lookup

| Do this        | Command                              |
| -------------- | ------------------------------------ |
| Install        | `bun install --frozen-lockfile`      |
| Run app        | `bun run dev` + `bun run dev:convex` |
| Regen          | `bun run manifest:regen`             |
| Convex codegen | `bun run codegen`                    |
| All tests      | `bun run test`                       |
| Full CI gate   | `bun run check`                      |
| Release        | `bash scripts/release.sh --reviewer <model>` |
| Deploy (human) | `bun run deploy`                     |
