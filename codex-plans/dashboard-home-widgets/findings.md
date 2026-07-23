# Findings: Dashboard Home Widgets

## Requirements
- User-specific dashboard pinning for up to six widgets.
- Widget catalog: upcoming events, invoice aging, low-stock alerts, staff schedule gaps, recent activity, and cash forecast.
- Widget data must refresh through Convex subscriptions.
- Follow existing app structure and visual patterns.
- Create, run, and delete a temporary Playwright test covering core behavior.
- Run the repository-required verification gate before claiming completion.

## Repository State
- Active checkout: `C:\Projects\capsule`, branch `main`.
- The worktree already contains a very broad authored/generated dirty delta and many untracked feature files.
- Existing `codex-plans/` files belong to other work, so this task uses `codex-plans/dashboard-home-widgets/`.
- No dashboard/widget-specific memory registry hit was found; implementation decisions must come from the current checkout.

## Research Findings
- `/` already renders `src/features/home/HomePage.tsx`; no route change is required.
- The current home page is clean relative to Git and already consumes live Convex subscriptions through generated hooks for events, invoices, prep tasks, pack lists, and closeouts.
- `HomeAttentionPolicy` is a clean, authored projection layer over subscription rows and can remain intact if useful, but the requested catalog needs inventory, shifts, payments, and activity facts too.
- The generated schema has no existing user-preference/settings table. It does have events, invoices, inventory items, shifts, payments, people, and `manifestEvents`.
- Existing generated query exports include list subscriptions for events, invoices, inventory items, shifts, and payments. Manifest event history is internal-only in the generated queries and cannot be consumed directly by the browser.
- `App.tsx` already imports `HomePage`; shared routing does not need editing.
- `authStatus.getAuthStatus` deliberately exposes role/tenant readiness but not the auth subject; per-user persistence needs either the existing Clerk client identity or a Manifest model keyed from trusted runtime context.
- Data required for computed widget views is present: invoices carry due/status/amount-due fields, inventory items carry on-hand/reorder values, shifts carry staff/event/time/status, payments carry amount/status/settlement time, and people map names to shifts.
- `src/app.manifest` is already dirty from several unrelated root-module additions. If the feature introduces a Manifest preference entity, the change must be a single additive `use` line plus a new module and must preserve those additions.
- `src/styles/app.css` is heavily modified by unrelated feature work. Dashboard styling should live in a new feature-local stylesheet imported by `HomePage` to avoid overlapping that shared file.
- The project already uses a trusted `user.id` ownership pattern in `SavedReportDefinition`: row ownership is stamped by a command and owner-only reads are enforced in Manifest.
- Manifest supports typed lists, including `list<Enum>`, so pinned widget identifiers can be a typed field rather than opaque JSON.
- Generated governed creation exposes a `createVia<Command>` mutation/hook for the SavedReport precedent, allowing the UI to create an owned preference row without client-supplying ownership.
- Manifest's analyzer recognizes `length(self.prop) <= N` constraints, so the six-widget maximum can be enforced on the persisted list.
- Baseline SHA-256 hashes were captured for the only likely shared target (`src/app.manifest`) and the existing home page; they will be rechecked immediately before patching to detect overlap.
- `VendorOrder.totalAmount/status` provides a real projected-outflow counterpart to invoice receivables, so cash forecast can show net expected cash rather than masquerading as an invoice-only forecast.
- `EventAssignment` supplies event staffing status directly. Upcoming events with no active assignments plus assignments missing start/end times form an honest schedule-gap signal.
- `npx` is available, satisfying the Playwright skill prerequisite. The repo has no Playwright config/package yet, so the required temporary spec will need self-contained configuration/tooling and must be removed afterward.

## Technical Decisions
| Decision | Rationale |
|---|---|
| Preserve generated files and use authored seams | Required by repository ownership rules. |
| Keep the dashboard inside the existing home feature | The route and shell are already correct, limiting overlap with dirty shared files. |
| Derive widget summaries client-side from generated list subscriptions | It preserves Convex real-time updates and avoids duplicating domain calculations in a hand-authored backend. |
| Put dashboard styles in `src/features/home/HomeDashboard.css` | Avoids collisions in the heavily dirty global stylesheet while keeping the UI authored and cohesive. |
| Model pins as `list<DashboardWidget>` on one user-owned preference row | This makes the six allowed widgets explicit and lets the backend enforce the maximum instead of trusting only the UI. |
| Build recent activity from subscribed domain rows ordered by `updatedAt/createdAt` | Browser access to `manifestEvents` is internal-only; current domain changes still produce a useful live cross-area feed without opening a new event-log API. |
| Treat cash forecast as 30-day receivables minus open vendor orders | Uses real current records and communicates the calculation explicitly. |
| Persist pins in Clerk user metadata instead of the Manifest domain | Layout is identity-owned UI state; this avoids coupling Home availability to a new domain function while preserving user-specific persistence. |

## Issues Encountered
| Issue | Resolution |
|---|---|
| Combined inspection command failed before returning output | Re-ran each read-only check independently. |
| Core-file read exited nonzero because optional `playwright.config.ts` is absent | Captured the successfully returned files and will discover Playwright setup separately. |
| PowerShell array slice was followed by invalid `-ErrorAction` syntax | Re-ran with valid slices and targeted anchors. |
| Installed Manifest CLI lacks the documented compile `--dry-run` option | Fall back to safe compile output under `generated/ir`, then use Builder regen for owned files. |
| Prettier does not support `.manifest` parsing | Do not force-format the valid domain file; use Manifest compilation as its syntax check. |
| Generated `createViaConfigure` applies default read before ownership mutation; a strict owner-only policy rejects its draft. `uuid` plus a Person ref also emits `v.id("people")`, which cannot hold Clerk subjects. | Store the trusted auth subject as `string` and permit null-owner draft evaluation; persisted configured rows remain owner-only. |
| `convex/personalDataExport.ts` uses a conventional `by_ownerId` index for owner-scoped entities. | Mark DashboardPreference.ownerId `indexed` in authored Manifest source. |
| First browser run reached the real app but the current browser Convex endpoint reported `queries:listDashboardPreference` was not registered. | Verify the exact deployment/URL match and function spec; do not treat generated source as runtime proof. |
| Direct local push proved the stale catalog is caused by local invoice data that predates required `lineItems`/`taxBreakdown` fields. | Escalated as GitHub issue #49. Do not mutate unrelated invoice data now that the dashboard no longer needs a new schema function. |

## Resources
- `AGENTS.md`
- `.aboardai/context/*.md`

## Visual/Browser Findings
- The signed-in Playwright flow opened the customizer, selected and saved all six widgets, confirmed all six cards rendered, reloaded to prove the Clerk-backed selection persisted, restored the original pins, and deleted the temporary spec.
- `output/playwright/dashboard-home-widgets.png` shows the dashboard inside the existing Capsule shell with a readable two-column operating board, live-subscription indicators, and all six widgets pinned.
