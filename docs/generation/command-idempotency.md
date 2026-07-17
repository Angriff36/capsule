# Native command idempotency

**Created:** 2026-07-17  
**Updated:** 2026-07-17 — landed via `@angriff36/manifest@3.6.21` + `bun run manifest:regen`  
**Scope:** Runtime behavior of **Manifest-governed commands** in Capsule (Convex mutations).  
**Not covered here:** Builder filesystem regen — see [manifest-builder.md](./manifest-builder.md) and [operations/commands.md](../operations/commands.md).

Capsule commands are compiled from `.manifest` proofs and emitted as Convex mutations. Whether calling a command twice is safe depends on **command semantics and projection behavior**, not on the regen pipeline.

Authority: Manifest semantics (`C:/Projects/Manifest/docs/spec/semantics.md` § Idempotency, § Commands, § Reactions) and the Convex projection in `@angriff36/manifest` (Capsule pin: see root `package.json` → `@angriff36/manifest`).

---

## Terms

| Term                           | Meaning                                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Idempotent command**         | A second identical invocation (same inputs, same target document) produces the same observable state as the first, without duplicate side effects.                 |
| **Safe retry**                 | A failed or timed-out call can be retried without corrupting data. Not all commands are safe to retry.                                                             |
| **Native command idempotency** | Idempotency enforced by the **generated command surface** (guards, transitions, version checks, optional idempotency stores) — not by UI dedupe or manual patches. |

---

## Convex projection (Manifest 3.6.21+)

When Capsule is regenerated on `@angriff36/manifest` **3.6.21** or newer, the Convex projection emits:

### Optional `idempotencyKey` on every governed mutation

- Generated mutations accept `idempotencyKey: v.optional(v.string())`.
- Schema table `commandIdempotencyKeys` (configurable via `commandIdempotencyTable`; disable with `enableCommandIdempotency: false`).
- When `idempotencyKey` is **provided**:
  - First successful call runs policies → guards → constraints → writes → emits → reactions and stores `{ key, command, result }`.
  - Duplicate calls with the **same key** return the cached `result` **before** re-running guards, writes, emits, or reactions.
- When `idempotencyKey` is **omitted**, behavior matches prior projections (no command-layer dedupe).

**Caller contract:** scope keys per logical operation (include command name, tenant, target id, and payload fingerprint in the key string). Keys are global within the table — reuse across different commands is unsafe.

This mirrors reference-runtime `IdempotencyStore` semantics at the Convex storage boundary.

### Lifecycle transitions — same-state writes allowed

Transition checks reject illegal `from → to` jumps, but **`from === to` is allowed** (no-op patch). Repeating a lifecycle command when the document is already in the target state succeeds without tripping transition errors.

### `createVia*` — retry-safe when keyed

Allocating `createVia*` mutations still create a new document on each **unkeyed** call. With a stable `idempotencyKey`, a retry after timeout returns the cached `{ docId }` instead of inserting a second row.

### Emits and reactions — keyed dedupe at the source command

Duplicate **unkeyed** successful executions still emit events and run reaction chains again. With `idempotencyKey`, the cached result short-circuits before emits/reactions run — downstream side effects do not repeat for that key.

Reaction **delivery** remains at-least-once at the platform layer; idempotency keys protect the **source mutation**, not every downstream consumer.

---

## Still not idempotent by default

| Mechanism                   | Behavior                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **`version` (OCC)**         | Concurrency control, not deduplication. Stale version → `ConcurrencyConflict: VERSION_MISMATCH`. Refresh and retry with current version. |
| **Unkeyed mutations**       | No command-layer dedupe. UI double-submit or blind retries can duplicate creates, emits, and reactions.                                  |
| **Guards / business rules** | May reject a second call even when transitions would allow same-state writes.                                                            |

---

## Capsule pin status

Verify the installed Manifest version:

```bash
node -p "require('./package.json').devDependencies['@angriff36/manifest']"
```

Capsule consumes `@angriff36/manifest@3.6.21` (semver `^3.6.21` in `package.json`). Regenerated `convex/mutations.ts` exposes `idempotencyKey` and `commandIdempotencyKeys` — verify with `grep idempotency convex/mutations.ts` or `bun run manifest:regen` after Manifest bumps.

---

## Caller rules (UI, agents, integrations)

1. **Pass `idempotencyKey`** on retried or user-triggered commands when 3.6.21+ output is live. Generate a stable UUID (or deterministic hash) per user action; never reuse across different commands or payloads.
2. **Always pass the latest `version`** for update commands when the generated hook exposes it.
3. **Treat version conflicts as refresh-and-retry**, not as hard failures of the operator's input.
4. **Do not blindly retry** unkeyed commands unless guards/transitions make the second call a no-op.
5. **Never patch around non-idempotent behavior** in `convex/lib/**` or generated mutations — change the Manifest proof and regen.
6. **Design proofs and tests** assuming reaction delivery can be at-least-once when keys are absent.

---

## Builder regen vs command idempotency

| Concern                | Tool                                  | Idempotent when…                                                                                                                                                |
| ---------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regenerate owned files | `bun run manifest:regen`              | Builder applies only when conflict-free; updates ownership ledger                                                                                               |
| Run a business command | Convex mutation (e.g. `Event_submit`) | With **`idempotencyKey`** (3.6.21+): duplicate key returns cached result. Without key: only when semantics + guards + transitions make the second call a no-op. |

---

## Verification commands

```bash
# Structural: idempotency table + optional arg (after 3.6.21 regen)
rg "commandIdempotencyKeys|idempotencyKey" convex/

# Contract tests
bun run test -- tests/manifest-convex.contract.test.ts

# Runtime proofs
bun run test:proofs

# Full gate
bun run check
```

Runtime proof debt for several reaction paths is tracked in [projection-status.md](./projection-status.md).

---

## Related docs

- [manifest-builder.md](./manifest-builder.md) — generated vs authored boundary, regen flow
- [operations/commands.md](../operations/commands.md) — full command catalog
- [projection-status.md](./projection-status.md) — structural vs runtime proof status
