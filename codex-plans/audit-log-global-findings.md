# Findings: Global Org-Level Audit Log

## Requirements

- Record every create, update, delete, and state-transition mutation across domains.
- Store actor identity, timestamp, entity type, entity ID, and changed fields.
- Keep records organization-scoped.
- Allow organization admins to access the log for security and compliance review.

## Initial Repository State

- Active branch is `main`, ahead of `origin/main` by three commits.
- The worktree already contains extensive modified and untracked work across Manifest sources, generated outputs, UI, docs, and tests.
- All pre-existing changes are treated as user-owned.
- No relevant audit-log entry was found in the memory registry, so implementation decisions will use current checkout evidence.
- No audit-log source, UI, test, generated table, or runtime reference currently exists in the checkout; the previous timed-out attempt did not leave an implementation.
- The generated Convex mutation module currently exposes 298 mutations, so hand-instrumenting each generated mutation is both ownership-invalid and brittle.
- `src/foundation/base.manifest` is the shared authored foundation and defines tenant scoping plus the `adminAccess` capability inherited by `admin`, `owner`, and `system`.
- `src/app.manifest` is the sole Manifest compile entry and imports all domain modules.
- The feature's admin-only read requirement aligns with the existing `adminAccess` capability and does not require a new role.
- Binding domain guidance permits audit-trail updates and warns against unrelated mutation guards; this feature should observe successful writes without adding workflow tedium.
- The pinned package is `@angriff36/manifest@3.6.41`.
- Manifest ships an `AuditSink` contract and durable adapters, but its documented guarantee is one record per generic `RuntimeEngine.runCommand` attempt.
- Capsule's generated Convex projection does not call `RuntimeEngine`; it emits direct Convex mutation handlers using `ctx.db`.
- Generated handlers call `getAuthContext(ctx)` and have actor `id`, normalized `role`, and `tenantId` available before writes.
- Existing `manifestEvents` rows have event type/entity/entity ID/payload/timestamp, but no actor, and several generated commands successfully patch/insert without emitting an event. They cannot serve as the global audit log.
- The audit feature must cover generated direct commands and nested reaction writes while avoiding audit recursion and idempotency metadata writes.
- Convex projection options in Manifest 3.6.41 expose auth, encryption, events, idempotency, policy, tenant, soft-delete, computed, and dispatcher configuration, but no audit sink, mutation-wrapper, middleware, or custom database hook.
- `convex/lib/authContext.ts` is itself Builder-owned, so app-local edits there would be overwritten and would violate the ownership contract.
- Builder's local checkout is clean except for pre-existing `package.json` and `package-lock.json` changes; those changes are unrelated and must remain untouched.
- Builder currently emits only the auth-context authored seam for projection mutations and supplies `authContextImport`; no audit seam is present.
- Official Convex guidance confirms database triggers are implemented by replacing the built-in mutation constructor with a `customMutation` wrapper around `ctx.db`; unwrapped mutations do not trigger. Capsule's generated import must therefore be changed at the projection/assembly seam for complete coverage.
- The wrapper approach is transactional: audit rows can be inserted in the same mutation as the entity change.
- `convex-helpers` is not currently a Capsule dependency.
- Manifest supports required `json` properties, suitable for a structured list of changed field names and before/after values.
- The existing admin UI has an `AdminWorkspaceNav`, lazy routes under `/admin`, and a server-derived auth-status role check. Audit log should join that workspace and use generated tenant/admin policy enforcement for data access.
- Builder's current preset has no target-repo overlay/config hook after `collectGeneration`; generated Convex surfaces and only fixed auth/encryption seams are assembled before ownership is applied.
- Capsule documentation says projection behavior belongs in Manifest and must be consumed through a released pin plus `bun run manifest:regen`, not by patching `convex/mutations.ts`.
- No existing open or closed issue matching global/Convex audit logging was found in either `Angriff36/capsule` or `Angriff36/Manifest`.
- Filed Capsule issue #43 to track the proven projection blocker: `https://github.com/Angriff36/capsule/issues/43`.
- The local Manifest checkout is also dirty with unrelated documentation work, so it must not be used as an implementation workspace without explicit cross-repo scope and isolation.

## Decisions

- Use feature-specific planning files because the standard planning files belong to the prior payroll-export task.
- Inspect authored Manifest and UI seams before considering regeneration.
- Do not infer feature completeness from generated files alone.
- Investigate whether the pinned Manifest/Builder toolchain supports cross-cutting audit emission before choosing an authored Convex seam; global instrumentation must cover generated creates, updates, deletes, and commands without editing generated output.
- Do not implement audit by reading `manifestEvents`; it is incomplete and lacks required identity/diff data.
- First exhaust a supported Convex database-trigger or mutation-wrapper approach. If none exists without generator support, this is a proven projection blocker that must be escalated rather than papered over with partial logging.
- A correct implementation can use a Builder-emitted audited-mutation seam plus a generated import rewrite, with an authored `AuditLog` Manifest entity and admin UI. This is technically viable but crosses into the sibling Builder checkout, so the implementation boundary must be handled explicitly and without touching its unrelated package changes.
- The safest product boundary is: first add a supported audit/mutation-wrapper import option to the Manifest Convex projection and release it; then pin/regenerate Capsule and add the AuditLog entity/UI. Landing only the model/UI now would falsely imply coverage and must not be called complete.
- No product code was changed because every app-only implementation path tested against the ownership/runtime model is incomplete or forbidden.

## Resources Read

- `AGENTS.md` instructions supplied in the task context
- `.aboardai/context/codex-implementation.md`
- `.aboardai/context/computer-use.md`
- `.aboardai/context/review-changes.md`
- Planning-with-files `SKILL.md`
- `node_modules/@angriff36/manifest/projections/convex/options.d.ts`
- `scripts/manifest-regen.ts`
- `.builder/ownership.json`
- `C:/Projects/builder/src/lib/manifest-project/convexApplicationPreset.ts` search results
- Official Convex database-trigger guidance: `https://stack.convex.dev/triggers`
- `package.json`
- `src/features/admin/AdminWorkspaceNav.tsx`
- `src/features/admin/PermissionsPage.tsx`

## Errors

- A regex intended to search projection internals was malformed after PowerShell quote parsing; the next search used simple literal alternatives against explicit files.
- A Builder search included a nonexistent `tests/` path and returned exit 1 after still producing the relevant `src/` results; subsequent searches will use discovered paths only.
- The first local Manifest source search assumed a `packages/manifest/src` layout that this checkout does not use; use `rg --files C:/Projects/Manifest` to discover its actual source root if further upstream inspection is needed.
