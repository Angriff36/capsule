# Findings: Email notification subscriptions

## Requirements
- Four independently configurable email categories: event updates, invoice reminders, low-stock alerts, and shift changes.
- Turning off one category must not disable all email.
- Delivery logic must honor the saved preference; a UI-only implementation is not complete.
- Emails need branded HTML summaries and deep links back into the app.
- Explore first, plan second, then implement following existing patterns.
- Verification must use a temporary Playwright test that is deleted after it runs.
- Final response must be one parseable `<summary>` block in the exact requested structure, including Verification Status.

## Initial repository state
- Branch: `main`; repository root: `C:/Projects/capsule`.
- The checkout has extensive pre-existing modified and untracked files across generated outputs, UI, Manifest sources, docs, tests, and planning artifacts.
- Shared route files `src/app/App.tsx` and `src/app/nav.ts` are already modified, so any edits there require careful baseline/diff comparison.
- `src/features/notifications/` already exists as an untracked directory and must be inspected before assuming it is available scope.
- Only the root `AGENTS.md` applies to normal source paths; nested copies found are under worktrees or dependencies.

## Governing constraints
- Do not hand-edit generated Convex, Manifest wiring/client bindings, schema assemblies, generated tests, or diagram companions.
- If Manifest source changes are needed, use only `bun run manifest:regen` for generated output.
- Do not create permanent tests; existing gates can be run.
- `bun run check` is required before completion.
- Preserve `.aboardai/**`; never move or stash it.

## Memory guidance used
- Prior project guidance says a settings surface is incomplete unless the server behavior is enforced and the route/sidebar exposure ships.
- Re-check the live source because this checkout is changing rapidly; memory is not treated as current implementation evidence.

## Research Findings
- `src/features/notifications/` contains existing untracked in-app notification derivation/tray files last modified at 04:07; they must be treated as user-owned baseline and inspected for reuse without overwriting.
- The local Vite and Convex development processes are already running, which is useful for later Playwright verification; they must not be restarted without need.
- Multiple Codex/Claude processes are active. A separate Claude process started at 06:04, and shared `src/app/nav.ts` changed at 06:02, so concurrent edit risk is current rather than merely historical.
- `npx` is installed, satisfying the Playwright skill prerequisite. Repository package-manager commands must still follow the Bun conventions.
- AboardAI's execution state names this feature as the current feature, and its feature event stream contains this Codex session's exact commands. The 06:04 Claude process is a separate `claude -p` process that launched a read-only `convex logs --history 20` command, consistent with a previous feature finishing runtime verification rather than a second implementation of this feature.
- Relevant source timestamps remained unchanged through the process inspection. Continue only with narrow reads/new feature files first, and re-check shared files immediately before patching them.
- Domain restraint guidance applies if a Manifest entity is introduced: avoid extra role gates and lifecycle restrictions; preference ownership is the only meaningful boundary.
- No email provider dependency or existing email-send implementation was found in package/source searches. This feature should establish category persistence, delivery eligibility, and branded HTML generation without inventing a paid/provider-specific transport.
- Tenant branding already has a shared authored UI helper at `src/features/admin/tenantBranding.ts`; Organization branding is Manifest-backed.
- Convex authentication is normalized through `convex/lib/authContext.ts`, which should be inspected before implementing per-user ownership.
- Existing app deep links use route helper modules under feature directories; email links should use validated app-relative paths and an explicit application origin.
- `getAuthContext` maps Clerk's trusted `identity.subject` to Manifest `user.id`; per-user preference ownership should use this auth subject directly instead of relying on a client-selected Person row.
- Existing self-service Manifest modules compare entity owner/person ids to `user.id` and use `guard user.id != null`, establishing the ownership pattern.
- `Person.authSubjectId` is optional, and `MyDayPage` falls back to a manually selected Person. Storing preferences on Person would exclude valid signed-in users and would risk widening Person command policies; a separate owner-scoped preference entity is safer and simpler.
- Existing in-app notifications already derive event, invoice-overdue, low-stock, and staffing conditions with durable deep-link paths. Email category preferences should remain separate so disabling email does not hide the in-app tray.
- The tenant branding helper resolves a Manifest Organization record plus Clerk logo and provides the display name, address, primary color, and accent color needed by an email HTML renderer.
- `SavedReportDefinition` proves the generated `createVia<Command>` pattern for trusted owner stamping: seed an empty row, run a command that mutates `ownerId = user.id`, then use row/version command hooks for updates.
- A preference entity can use the same governed creation shape with one idempotent `configure` command, four booleans defaulting to `true`, a unique `[tenantId, ownerId]` constraint, and owner/system read policy. The command itself must reject rows owned by someone else.
- The root Manifest entry imports modules directly. A new `src/identity/email-notification-subscription.manifest` should import only `foundation/base.manifest` to avoid adding another daisy chain.
- `useCreate<Entity>` and `use<Entity>Configure` hooks will be generated automatically after `bun run manifest:regen`; authored UI should consume those generated hooks rather than direct database mutation.
- Authored top-level Convex modules use `getAuthContext`/`requireTenant`, typed generated server functions, and tenant indexes. The email preparation query can follow that seam while keeping preference writes inside generated Manifest mutations.
- Organization branding is already read server-side by `convex/clientPortal.ts`, confirming branded HTML can use the same tenant record as other public output.
- `Topbar.tsx` already contains user-owned NotificationTray changes but is stable. A surgical account-area link can avoid those modified lines; `App.tsx` and `app.manifest` also have existing changes that must be preserved line-for-line.
- `bun run manifest:regen` completed conflict-free and generated the preference table, indexes, schemas, list/get queries, configure mutation, React hooks, diagram, and ownership-ledger updates. `bun run codegen` also completed and synced the authored Convex query.
- Generated `configure` currently checks the row-level read policy before command guards. Because a create-via seed has `ownerId = null`, an owner-only read policy can prevent governed creation even when the write/execute policies allow unowned seeds. The creation surface must be inspected/fixed before UI verification.
- Builder generated no create-via surface because the same `configure` command was written to support both first configuration and later updates. Established create-via commands (`WeeklyPurchasingConfig.configure`, `SavedReportDefinition.createDefinition`) are one-time commands guarded by an unset timestamp/state.
- Split initial `configure` (`configuredAt == null`) from owner-only `updateSubscriptions` (`configuredAt != null`). This gives Builder an unambiguous governed creation command while retaining low-tedium updates through a second generated mutation.
- The corrected regeneration produced both `useCreateEmailNotificationSubscription` / `EmailNotificationSubscription_createViaConfigure` and `useEmailNotificationSubscriptionUpdateSubscriptions`; Convex codegen accepted and uploaded the authored delivery query.
- `bun run typecheck` passes after the corrected generation, confirming UI, shared renderer, authored Convex query, generated data model, and API bindings agree.
- The running application responds at `http://localhost:7811/settings/email`, but no E2E/Clerk test credentials are exposed to this process and the repository has no root Playwright config. A fresh Playwright context cannot cross Clerk safely.
- Existing feature verification logs establish the accepted pattern for this checkout: a disposable Vite harness importing the real component, with only Clerk/generated-hook boundaries mocked, followed by deletion of all feature-specific artifacts.
- The captured Playwright accessibility snapshot proves the real settings component, four checked switches, branded iframe content, app CTA, and preferences deep link all rendered. Pointer actionability stayed unstable while the iframe/font layout settled, so the verification uses keyboard activation of the native button switches, which also proves accessible operation without bypassing application event handlers.
- Final generated-code review confirmed create-via still preflights read policy against an `ownerId = null` draft. Allowing `ownerId == null or ownerId == user.id` is the narrow established creation-seed exception; configured rows cannot remain unowned because the command stamps trusted `user.id` and the entity constraint requires ownership.
- The UI now supplies a stable per-user idempotency key on first configuration to prevent duplicate rows from rapid/retried initial toggles.
- Generated idempotency storage is global by key, not tenant-scoped. The first-write key therefore includes both the active Clerk organization id and user id, preventing cross-organization collisions for users who belong to multiple workspaces.
- Required `bun run check` passed toolchain, Builder ownership (346 paths), proof emission/registry, and Manifest registry pin, then stopped on unrelated direct Convex hook usage in `EventAllergenBriefingPage.tsx` and `EventIncidentPanel.tsx`. This pre-existing shared-checkout blocker is already tracked at https://github.com/Angriff36/capsule/issues/40.
- Final scoped verification passes: typecheck, focused Prettier, secrets scan, production build, 326 generated contract tests, delivery utility assertions, and the temporary Playwright flow. Scoped diff hygiene is clean and no temporary browser artifacts remain.

## Technical Decisions
| Decision | Rationale |
|---|---|
| Prefer authored seams and existing generated APIs | Matches repository ownership rules and avoids hand-maintained parallel contracts. |
| Server HTML builder escapes dynamic content and accepts only HTTP(S) same-origin deep links rooted at `/` | Prevents branded content and CTA fields from becoming injection or open-redirect surfaces. |
| Unconfigured users are subscribed to every category | Maintains backward compatibility and makes each opt-out explicit. |

## Issues Encountered
| Issue | Resolution |
|---|---|
| High-risk dirty shared checkout | Check recent activity and overlapping notification files before editing. |
| Possible live concurrent writer | Identify the active process/work scope and confirm relevant file timestamps are stable before touching shared seams. |
| A combined planning-file patch used an imprecise table-row context | Split the updates by file and matched exact current wording; no partial source change occurred. |
