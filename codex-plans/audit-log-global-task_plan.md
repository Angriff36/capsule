# Task Plan: Global Org-Level Audit Log

## Goal

Complete and verify an organization-wide audit log that records every write mutation with actor identity, timestamp, entity type, entity ID, action, and changed fields, and exposes it only to organization admins.

## Current Phase

Phase 2 — blocked

## Phases

### Phase 1: Discover current implementation

- [x] Inspect current branch, dirty changes, and audit-related authored/generated files
- [x] Trace mutation coverage, actor/org attribution, changed-field capture, and admin read access
- [x] Identify the smallest missing implementation scope
- **Status:** complete

### Phase 2: Implement missing authored source

- [ ] Change only authored Manifest/UI/seam files required by the feature
- [ ] Regenerate exclusively with `bun run manifest:regen` if Manifest source changes
- [ ] Preserve all unrelated user changes
- **Status:** blocked — Manifest 3.6.41/Builder cannot emit the required audited Convex mutation wrapper; tracked by Capsule issue #43

### Phase 3: Verify

- [ ] Run focused existing checks for the audit feature
- [ ] Run `bun run check`
- [ ] Inspect exact diff and generated ownership impact
- **Status:** pending — no incomplete implementation will be presented as verifiable

### Phase 4: Independent review and delivery

- [ ] Run required Codex gpt-5.6-sol review with the anti-tedium prompt after implementation exists
- [ ] Verify any review findings against source and fix confirmed issues
- [x] Provide the required tagged feature summary with the proven blocker
- **Status:** delivery pending after blocker report

## Proven Blocker

- Issue: https://github.com/Angriff36/capsule/issues/43
- Required platform change: Manifest Convex projection support for a custom/audited mutation wrapper, carried through Builder, so every generated and nested database write is captured transactionally.
- Unsafe alternatives rejected: hand-editing Builder-owned output, deriving partial logs from `manifestEvents`, or shipping an empty AuditLog UI/model.

## Scope Constraints

- Do not add or expand tests unless the owner asks.
- Do not hand-edit generated or Builder-owned paths.
- Do not commit, push, deploy, merge, or change global configuration.
- Do not disturb unrelated dirty or untracked work.
- Do not invent restrictive audit policies beyond admin read access specified by the feature.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| Combined context/status/memory read returned exit 1 and truncated output because `rg` found no audit-log memory match | 1 | Treat memory as having no relevant hit; use focused live-repo commands with bounded output |
| Projection search regex was malformed by PowerShell quoting | 1 | Use simple expressions against explicit generator/options files |
| Builder search named a nonexistent `tests/` directory | 1 | Use `rg --files`-discovered Builder paths only |
| Local Manifest search assumed a nonexistent `packages/manifest/src` path | 1 | Discover actual paths with `rg --files` before any further upstream search |
