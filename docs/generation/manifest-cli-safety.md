# Manifest CLI safety in Capsule (Convex)

**Created:** 2026-07-22  
**Updated:** 2026-07-22 (writer `--dry-run` preview path)  
**Scope:** Which `manifest` CLI commands are safe to run from Capsule, verified against command **implementations**.  
**Related:** [manifest-builder.md](./manifest-builder.md), [operations/commands.md](../operations/commands.md), [AGENTS.md](../../AGENTS.md).

Capsule is Builder-assembled (`convex-application`). Owned trees live in `.builder/ownership.json`. Writing those trees without `bun run manifest:regen` breaks ownership digests.

### Safe preview: `bunx manifest <cmd> --dry-run`

Every Manifest CLI **write / mutate** command accepts `--dry-run`. It computes the
full result, prints `dry-run: would write <path> (<n> bytes)`, and writes
**nothing**. Use this before any CAUTION/UNSAFE writer below when you want to
see intended paths without touching Capsule trees.

Examples:

```bash
bunx manifest compile --all --dry-run
bunx manifest generate --all --dry-run
bunx manifest diagram --dry-run
bunx manifest install-hooks --dry-run
bunx manifest fmt --dry-run
```

Not the same as `generate --check` / `fmt --check` (those fail on drift). Read-only
commands (`validate`, `doctor`, `scan`, …) do not take `--dry-run`.

---

## Verification (this doc)


| Layer           | What was read                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Registry        | All `.command()` registrations in Manifest `packages/cli/src/index.ts`                                                             |
| Implementations | Every non-test module under `packages/cli/src/commands/*.ts` for `writeFile` / `mkdir` / DB apply / hook mutation / in-memory-only |
| Capsule         | `manifest.config.yaml` (`projections.convex.output: convex`), ownership + regen docs                                               |


Plugin CLI commands: none declared in Capsule today.

---

## Prefer these Capsule wrappers


| Intent                                | Command                             | Writes                                                                    |
| ------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------- |
| Regen Convex + companions + ownership | `bun run manifest:regen`            | Owned trees + `.builder/ownership.json`                                   |
| Preview Builder plan                  | `builder generate convex --dry-run` | Nothing                                                                   |
| Preview any Manifest writer           | `bunx manifest <cmd> --dry-run`     | Nothing (lists intended paths)                                            |
| IR + proof kit                        | `bun run proof:emit`                | `generated/ir/`**, `generated/proof/**` (shells `manifest compile --all`) |
| Convex stubs                          | `bun run codegen`                   | `convex/_generated/**`                                                    |
| Seed deployment                       | `bun run seed`                      | Convex data via generated `scripts/seed-convex.ts`                        |


---

## Why `diagram` → `diagrams/` is unsafe

**Implementation:** `diagram.ts` defaults `options.output \|\| 'diagrams'`, then `fs.mkdir` + `fs.writeFile` for each Mermaid artifact (`diagramCommand` ~L129–217).

**Capsule:** Builder can emit `diagrams/**` from `docs-diagrams`, but Capsule sets
`skipDocsDiagrams: true` in `manifest.config.yaml` so regen does **not** rebuild
them. Owned diagram digests are deleted on the next successful regen. Do not
hand-write under `diagrams/`.

**Safe:** `bun run manifest:regen` (committed) or `bunx manifest diagram -o .artifacts/diagrams` (scratch).

---

## Why `generate --all` / `build --all` are especially dangerous here

Capsule `manifest.config.yaml` declares:

```yaml
projections:
  convex:
    output: convex
```

**Implementation:** `generateAllFromConfig` (`generate.ts` ~~L814–864) loops every configured projection and calls `generateCommand` with that projection’s `output`. Non-`nextjs` projections go through `generateWithRegistryProjection` and `writeOrCheckArtifact` → `fs.writeFile` into the projection output dir (~~L662–687).

So bare `manifest generate --all` / `manifest build --all` / `watch --all` will target `**convex/`** without updating `.builder/ownership.json`. That is the core Capsule footgun.

`generate … --check` sets `checkMode` and compares without writing (~L674–681).

`generate … --dry-run` (and the same flag on other writers) lists intended paths and
writes nothing — use that to preview Capsule-dangerous outputs before a real run.

---

## Complete command audit (implementation-verified)

Status meanings:

- **SAFE** — no write, or writes only IR under Capsule `generated/ir` / scratch when used as documented
- **CAUTION** — writes somewhere; OK if pointed at scratch / intentional authored sources
- **UNSAFE** — hits Builder-owned paths, wrong backend, or mutates Capsule glue


| Command                | Status                                                 | Default / key writes                                                                       | Evidence                                                                     |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `init`                 | UNSAFE                                                 | Overwrites `manifest.config.yaml` via `saveConfig`                                         | `init.ts` `initCommand`                                                      |
| `init --ci`            | UNSAFE                                                 | Writes `.github/workflows/…`                                                               | `init-ci.ts` `writeFile` ~L151–152                                           |
| `db init`              | SAFE print/`--list`; CAUTION `--out`; UNSAFE `--apply` | `--apply` runs SQL against `DATABASE_URL` (Postgres)                                       | `db-init.ts` ~L155–174                                                       |
| `compile` / `--all`    | SAFE for Capsule IR                                    | Config `output` → Capsule `generated/ir` (`merged.ir.json`); `writeCompiledFile`           | `compile.ts` `compileAllFromConfig` ~L372–379, `writeCompiledFile` ~L166–179 |
| `generate`             | UNSAFE write; SAFE `--check` / `--dry-run`             | Writes projection artifacts + `generation.manifest.json`                                   | `generate.ts` `writeOrCheckArtifact`, `writeGenerationManifest`              |
| `generate --all`       | UNSAFE write; SAFE `--dry-run`                         | Capsule → writes `convex/`                                                                 | `generateAllFromConfig` + Capsule config                                     |
| `build` / `--all`      | UNSAFE write; SAFE `--dry-run`                         | `compile` then `generate` / `generateAllFromConfig`                                        | `build.ts`                                                                   |
| `analyze`              | SAFE                                                   | In-memory projection size report; **no** `writeFile`                                       | `analyze.ts`                                                                 |
| `seed`                 | CAUTION                                                | Writes seed file unless `--json` (default under cwd)                                       | `seed.ts` ~L648–654                                                          |
| `seed template`        | CAUTION                                                | `writeSeedPack(output)` required `-o`                                                      | `seed-pack-cli.ts` ~L78                                                      |
| `seed fill`            | CAUTION                                                | Rewrites pack dir via `writeSeedPack`                                                      | `seed-pack-cli.ts` ~L114                                                     |
| `seed validate`        | SAFE                                                   | Read-only validate                                                                         | `seed-pack-cli.ts` `seedValidateCommand`                                     |
| `profile`              | SAFE; CAUTION `--export`                               | In-memory RuntimeEngine; optional JSON export                                              | `profile.ts` ~L174–175                                                       |
| `pack` / `unpack`      | CAUTION                                                | Default writes beside input (`.mir` / `.ir.json`)                                          | `pack-unpack.ts`                                                             |
| `generate-from-prompt` | CAUTION                                                | Stdout default; `-o` writes `.manifest`                                                    | `generate-from-prompt.ts` ~L592–593                                          |
| `watch`                | UNSAFE                                                 | Continuous compile + generate (defaults nextjs paths; `--all` hits config projections)     | `watch.ts` `runBuild`                                                        |
| `validate`             | SAFE                                                   | Schema validate; no write                                                                  | `validate.ts`                                                                |
| `ci-gate`              | SAFE; CAUTION `--write-snapshot`                       | Snapshot write only with flag                                                              | `ci-gate.ts` ~L68–69                                                         |
| `fmt`                  | CAUTION                                                | CLI maps non-`--check` to write (`index.ts`); rewrites `.manifest`                         | `fmt.ts` ~L142; `index.ts` fmt action                                        |
| `install-hooks`        | UNSAFE write; SAFE `--dry-run`                         | Writes `.husky/pre-commit` **and** mutates `package.json`                                  | `install-hooks.ts` ~L107–144                                                 |
| `validate-ai`          | SAFE                                                   | Diagnostics only                                                                           | `validate-ai.ts`                                                             |
| `generate-tests`       | UNSAFE in Capsule/context                              | Writes fixtures under package-relative `src/manifest/conformance/…` unless `--dry-run`     | `gen-tests.ts` ~L74–75, 332–355, 362–370                                     |
| `docs`                 | CAUTION                                                | CLI default `-o docs-site`; always `mkdir`+`writeFile`                                     | `docs.ts` ~L951–1013; `index.ts` default                                     |
| `diagram`              | UNSAFE default; SAFE scratch `-o` / `--dry-run`        | Default `diagrams/`                                                                        | `diagram.ts` ~L129–217                                                       |
| `preflight`            | SAFE check; CAUTION `--generate-example`               | Writes `.env.example` (or `-o`) when generating                                            | `preflight.ts` ~L300–305                                                     |
| `check`                | CAUTION                                                | Runs `compileCommand` (writes IR) then `validateCommand`                                   | `check.ts`                                                                   |
| `scan`                 | SAFE                                                   | No write                                                                                   | `scan.ts`                                                                    |
| `harness`              | SAFE                                                   | In-memory harness; no write                                                                | `harness.ts`                                                                 |
| `mock`                 | SAFE (not Convex)                                      | Local HTTP + memory stores; no write                                                       | `mock.ts`                                                                    |
| `routes`               | SAFE                                                   | Stdout                                                                                     | `routes.ts`                                                                  |
| `lint-routes`          | SAFE                                                   | Scan only                                                                                  | `lint-routes.ts`                                                             |
| `audit-routes`         | SAFE                                                   | Scan only                                                                                  | `audit-routes.ts`                                                            |
| `emit registries`      | CAUTION                                                | Default `-o manifest-registry` → `commands.json` + `entities.json`                         | `emit-registries.ts` ~L94–121                                                |
| `audit-governance`     | SAFE                                                   | Detectors; no write                                                                        | `audit-governance.ts`                                                        |
| `enforce-surface`      | SAFE                                                   | Scan only                                                                                  | `enforce-surface.ts`                                                         |
| `audit-bypasses`       | SAFE                                                   | Registry validate                                                                          | `audit-bypasses.ts`                                                          |
| `coverage`             | SAFE                                                   | Report only                                                                                | `coverage.ts`                                                                |
| `wiring-coverage`      | SAFE                                                   | Report only                                                                                | `wiring-coverage.ts`                                                         |
| `wiring-inspect`       | SAFE                                                   | Report only                                                                                | `wiring-inspect.ts`                                                          |
| `wiring-remediate`     | SAFE plan/dry-run/`--no-write`; UNSAFE apply           | `writeFile` when `mode` is `apply`/`one-defect` and write enabled                          | `wiring-remediate.ts` ~L82–131                                               |
| `load-test`            | CAUTION; SAFE `--json`                                 | Default `-o load-tests` writes scripts                                                     | `load-test.ts` ~L708–751                                                     |
| `inspect entity`       | SAFE                                                   | Read-only                                                                                  | `doctor.ts` `inspectEntityCommand`                                           |
| `diff source-vs-ir`    | SAFE                                                   | Read-only                                                                                  | `doctor.ts`                                                                  |
| `diff ir-vs-ir`        | SAFE; CAUTION `-o`                                     | Optional `writeFile`                                                                       | `ir-diff.ts` ~L63                                                            |
| `diff breaking`        | SAFE; CAUTION `-o`                                     | Optional `writeFile`                                                                       | `breaking-change.ts` ~L160–167                                               |
| `migrate`              | CAUTION (not Convex)                                   | Plans SQL/Prisma; “apply” is a **stub** (prints next steps, does not run `prisma migrate`) | `migrate.ts` ~L313–335                                                       |
| `changelog`            | SAFE; CAUTION `-o`                                     | Optional write                                                                             | `changelog.ts` ~L435–447                                                     |
| `duplicates`           | SAFE                                                   | Read merge reports                                                                         | `doctor.ts`                                                                  |
| `runtime-check`        | SAFE                                                   | Read-only                                                                                  | `doctor.ts`                                                                  |
| `cache-status`         | SAFE                                                   | Read-only                                                                                  | `doctor.ts`                                                                  |
| `repl`                 | SAFE (not Convex)                                      | In-memory RuntimeEngine                                                                    | `repl.ts`                                                                    |
| `doctor`               | SAFE                                                   | Read-only diagnostics                                                                      | `doctor.ts`                                                                  |
| `integration-check`    | SAFE                                                   | Governance + in-memory smoke; no write                                                     | `integration-check.ts`                                                       |
| `config validate       | inspect                                                | print-defaults`                                                                            | SAFE                                                                         | Print/validate only         | `config.ts` |
| `versions list         | show                                                   | diff                                                                                       | changelog                                                                    | verify`                     | SAFE        | Read store | `versions.ts` |
| `versions save         | tag`                                                   | CAUTION                                                                                    | Writes `.manifest-versions/` (default store)                                 | `versions.ts` ~L65–115, 516 |
| `versions rollback`    | CAUTION                                                | Stdout or `-o` write                                                                       | `versions.ts` ~L548                                                          |
| `plugins list`         | SAFE                                                   | Print load status                                                                          | `index.ts` plugins handler                                                   |


---

## Builder-owned paths (do not write outside regen)


| Path                                                             | Owner                          |
| ---------------------------------------------------------------- | ------------------------------ |
| `convex/{schema,queries,mutations,http,crons,sagas,computed}.ts` | Builder Convex projection      |
| `schemas/`**, `wiring/**`                                        | Builder companions             |
| `src/generated/**`, `src/lib/manifest-convex-react.ts`           | Builder client wiring          |
| `scripts/seed-convex.ts`                                         | Builder seed binding           |
| `diagrams/**`                                                    | Opted out (`skipDocsDiagrams`) |
| Owned `package.json` / `PRESET.md` / contract tests              | Builder glue                   |


Scratch: `.artifacts/**`. Author: `src/**/*.manifest`, `src/app|features|ui/**`, `convex/lib/**`, auth seams, `docs/`.

---

## Decision flowchart

```text
Change Capsule domain?
  → edit src/**/*.manifest → bun run manifest:regen → bun run codegen

IR / proofs only?
  → bun run proof:emit

Inspect / validate / format .manifest?
  → bunx manifest validate | scan | doctor | fmt --check
  → fmt write only on authored .manifest files

Explore Mermaid?
  → bunx manifest diagram -o .artifacts/diagrams
  → OR bun run manifest:regen for committed diagrams/

Tempted by generate / build / watch / diagram -o diagrams / install-hooks?
  → STOP — ownership or Capsule glue damage
```

---

## Footguns that look official


| Footgun                    | Reality                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run manifest:build`   | Still in Capsule `package.json` (Builder glue). Runs bare `manifest build` → unsafe. [capsule#38](https://github.com/Angriff36/capsule/issues/38) |
| `manifest generate --all`  | Writes Capsule `convex/` off-ledger                                                                                                               |
| `manifest migrate` “apply” | Stub; still not Convex                                                                                                                            |
| `install-hooks`            | Rewrites owned `package.json`                                                                                                                     |


---

## Sources (verified 2026-07-22)

- Manifest: `packages/cli/src/index.ts`, every non-test file under `packages/cli/src/commands/`
- Capsule: `manifest.config.yaml`, `.builder/ownership.json`, `scripts/emit-proof-kit.ts`, regen docs
- Builder: `convexApplicationPreset.ts` (`docs-diagrams`, package script glue)

