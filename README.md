# CapsuleX

Catering and event operations workspace: React UI, Convex data plane, Clerk authentication. Assembled from Manifest Convex application proofs.

## Docs

| Doc                                                                        | What                                         |
| -------------------------------------------------------------------------- | -------------------------------------------- |
| [docs/architecture/overview.md](docs/architecture/overview.md)             | System map                                   |
| [docs/architecture/boundaries.md](docs/architecture/boundaries.md)         | Authored vs generated                        |
| [docs/systems/auth.md](docs/systems/auth.md)                               | Clerk + AuthGate + membership                |
| [docs/systems/events.md](docs/systems/events.md)                           | First domain slice                           |
| [docs/systems/navigation-shell.md](docs/systems/navigation-shell.md)       | AppShell / nav                               |
| [docs/generation/manifest-builder.md](docs/generation/manifest-builder.md) | How this repo is produced                    |
| [docs/operations/local-dev.md](docs/operations/local-dev.md)               | Clone → env → run                            |
| [PRESET.md](PRESET.md)                                                     | Manifest assembly receipt (do not duplicate) |
| [AGENTS.md](AGENTS.md)                                                     | Agent commands                               |
| [CLAUDE.md](CLAUDE.md)                                                     | Agent behavior rules                         |

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
