# Findings and Decisions: Client portal

## Requirements
- Public, read-only event view protected by an unguessable token.
- Show confirmed date, headcount, selected menu, and current lifecycle status.
- Require no client membership or account in the operator organization.
- Follow current authored/generated ownership boundaries.
- Verify the core flow with a temporary Playwright test and delete it afterward.
- Run the repository-required `bun run check` gate.

## Research Findings
- The checkout is on `main` with extensive pre-existing authored, generated, documentation, and planning changes.
- No relevant prior memory entry was found for a Capsule client portal.
- The entire current app is mounted inside `AuthGate` in `src/app/App.tsx`; a public client route must sit outside that authenticated branch.
- The browser root already uses `BrowserRouter` plus Clerk/Convex providers, so public UI can reuse the same React application without an organization session if its data call is intentionally anonymous.
- `convex/http.ts` is generated and cannot be edited directly; any public data seam must either come from Manifest generation or a separate author-owned Convex module imported through the generated router if an established pattern exists.
- Existing event and kitchen modules already expose event detail and event-menu areas; discovery still needs to pin the exact relations and field names.
- `Event` stores `clientId`, `title`, `startsAt`, `endsAt`, `expectedHeadcount`, and `stage`; these are the required portal facts without needing a new domain entity.
- Selected menu content is modeled as `EventDish` selections joined to `Dish`, rather than a single `Event.menuId`. The portal should present the currently selected dish lines.
- `convex/authStatus.ts` demonstrates that author-owned Convex query modules are an accepted seam. A feature-scoped `convex/clientPortal.ts` can provide an authenticated share-link query and an anonymous token-verifying read query without hand-editing generated `convex/queries.ts` or `convex/http.ts`.
- A stateless HMAC-signed event token avoids schema/regeneration churn in the heavily dirty generated tree. The operator query still verifies tenant access, while the public query returns only the explicit portal projection and never returns contact, pricing, notes, or raw tenant data.
- Current event stage labels are centralized in `src/features/events/eventStatus.ts` and can be reused by the portal UI.
- The Convex runtime already uses Web Crypto in `convex/lib/encryption.ts`, so HMAC signing and constant-time verification can use the same supported runtime rather than a Node-only crypto import.
- `events`, `eventDishes`, `dishes`, and `organizations` all have tenant indexes; the public projection can verify the signed event id, scope every related row by the event tenant, and include only organization display branding.
- Domain gating guidance reinforces keeping this portal read-only and avoiding new approval/revocation workflows not requested by the product task.
- Generated `getEvent` authorizes `eventAccess` or `salesAccess`, then tenant-scopes the document. The share-link endpoint must mirror that exact capability boundary instead of allowing every tenant member.
- Existing tenant branding provides safe public-facing display name, address, primary, and accent colors. Clerk-hosted logo data is not stored in Convex, so the anonymous view will use the durable organization branding only.
- Dish descriptions are non-encrypted catalog content; internal `specialInstructions`, Event contact fields, venue details, pricing, and operational notes will be omitted from the public DTO.
- `src/foundation/base.manifest` explicitly forbids role-name lists in policies. The share-token operation will call the generated `queries.getEvent` through a Convex action so the existing capability-based Event read policy remains the single authorization source.
- The operator event page already has a document-action cluster; a one-click `Copy client portal` action fits there and reduces sharing friction without adding a management workflow.
- The public page will follow Capsule's warm editorial visual language but run outside `AppShell` and `AuthGate`, with tenant colors applied as validated CSS custom properties.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Preserve every pre-existing modification | Shared dirty worktree policy and user ownership |
| Use an author-owned Convex module with a signed opaque-looking URL token | Provides a narrow public read boundary without editing generated ownership paths or adding storage lifecycle the request does not require |
| Return a purpose-built portal DTO | Prevents accidental exposure of full Event, Client, Dish, or tenant records |
| Reuse generated `getEvent` from the share action | Honors capability inheritance without duplicating forbidden role-name allowlists |
| Put the public route outside `AuthGate` and `AppShell` | Allows account-free access while keeping all operator routes unchanged |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Existing root Codex planning files belong to payroll export | Use `codex-plans/client-portal/` and leave them untouched |
| PowerShell wildcard arguments caused `rg` to exit nonzero | Use concrete paths or file discovery for future searches |
| Optional Convex source search returned no textual auth-propagation note | Use the supported `ctx.runQuery` action pattern and verify behavior/type shape through local code and focused checks |

## Resources
- `AGENTS.md`
- `.aboardai/context/*.md` supplied by the user

## Visual/Browser Findings
- Desktop rendering presents a refined editorial event sheet with clear operator branding, a dominant event title, current-status block, confirmed date/headcount, six-step progress rail, and selected menu hierarchy.
- Tenant green and accent colors remain restrained and readable against the warm paper surface; the layout has a single memorable invitation/menu-document character rather than a generic dashboard.
- Playwright confirmed the real unavailable state and populated view, then reloaded at 390px with no horizontal overflow.
- The shared Convex dev deployment did not yet contain `clientPortal:getEvent`; syncing it would have published unrelated dirty work, so runtime token verification and direct real-component browser verification were kept separate.

## Verification Outcome
- Passed: `bun run typecheck`, targeted Prettier, `bun run secrets`, HMAC round-trip/tamper rejection, temporary Playwright (1 test), and `bun run build`.
- The temporary Playwright spec and both disposable fixture files were deleted after the pass.
- `bun run check` is blocked by Event API-path findings already tracked in https://github.com/Angriff36/capsule/issues/40.
- The full suite reported 487 passing and 13 failing tests; the generated Invoice permission cascade is already tracked in https://github.com/Angriff36/capsule/issues/32, with other failures from concurrent mappings/navigation changes.
- The new query must be synced by the normal Convex dev/deploy workflow before a live token URL can resolve in the shared dev deployment.
