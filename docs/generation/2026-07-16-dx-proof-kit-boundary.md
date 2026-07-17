# DX Proof Kit — dependency boundary

**Created:** 2026-07-16  
**Updated:** 2026-07-16  
**Status:** Binding for Capsule consumption of published Manifest proof-kit + governed creation

## Ownership

| Surface                                                          | Owner    | Notes                                                                    |
| ---------------------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| Capability catalog + proof-registry schemas/emit/validate        | Manifest | Derived from IR + projection metadata; never hand-maintained inventories |
| Integration guard engine                                         | Manifest | App supplies feature roots / exceptions / rollout only                   |
| `@angriff36/manifest/proof-kit`                                  | Manifest | Core APIs; **must not** import `convex-test`                             |
| `@angriff36/manifest/proof-kit/convex-test`                      | Manifest | Optional adapter; `convex-test` + `convex` are optional peers            |
| Runtime proof cases, scenario fixtures, product-decision markers | Capsule  | Application-owned                                                        |
| Feature-root guard wrappers                                      | Capsule  | Thin config over Manifest engine                                         |

## Dependency rule

- Capsule installs `convex-test` (and `@edge-runtime/vm`) as **devDependencies**.
- Compatible pin for Capsule’s installed Convex **1.42.x**: `convex-test@0.0.54` (official peer `convex@^1.32.0`).
- Importing `@angriff36/manifest` or `@angriff36/manifest/proof-kit` must succeed with **no** `convex-test` installed.
- Only `@angriff36/manifest/proof-kit/convex-test` may reference `convex-test`.
- Capsule must pin `@angriff36/manifest` to an **exact published registry version** (no `^`, no `file:`, `.tgz`, `link:`, `workspace:`, or absolute/local paths).
- Gate: `bun run check:manifest-registry` (`scripts/check-manifest-registry-pin.ts`), part of `bun run check`.

## Capsule pin

**Published:** `@angriff36/manifest@3.6.17` (`[release] v3.6.17` / tag `v3.6.17`) — atomic initialization + createVia param locals + multi-file ownership re-attach.

Capsule must pin the exact registry version (no `^`).

~~**Published target:** `@angriff36/manifest@3.6.16` — createVia regen blocked by param scope + multi-file ownership loss.~~

> **Correction (2026-07-16) @RYANSIGNED:** Consumable pin is **3.6.17**. Registry-only (`bun run check:manifest-registry`). Governed creation proofs: `tests/culinary-governed-creation.runtime.test.ts`.

> **Correction (2026-07-17):** Consumable pin is **3.6.20** — first release with
> working relation resolution in command evaluation (guards, constraints,
> actions, emit payloads) and pre-state draft defaults. 3.6.17 relation guards
> throw unconditionally; 3.6.18/3.6.19 generate broken code (undefined
> `__resolveRelation` / unresolved emit payloads) — never pin them. Proofs:
> `tests/proofs/shift-lifecycle.runtime.test.ts`,
> `tests/proofs/relation-guarded-creation.runtime.test.ts`.
