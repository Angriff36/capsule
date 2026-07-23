# Findings: Equipment event checkout

## Requirements
- Reserve specific equipment items against one event for a start/end date range.
- Prevent overlapping reservations for the same equipment item.
- Provide a checkout checklist where staff confirm equipment left and record condition notes.
- Provide a return checklist where staff confirm equipment returned and record return condition notes.
- Follow authored/generated boundaries and existing Capsule conventions.
- Do not add permanent tests unless the owner asks; use a temporary Playwright verification test and delete it.
- Run `bun run check` before claiming completion.

## Baseline
- The working tree was already broadly dirty before this task, including generated files and unrelated features.
- Existing untracked Equipment sequence diagrams indicate equipment domain work may already be present in the current baseline.
- All pre-existing changes must be preserved.

## Research Findings
- `src/app.manifest` already imports `src/facilities/equipment.manifest`.
- `src/facilities/equipment.manifest` currently models the equipment catalog only; its header explicitly says checkout and maintenance entities are later slices.
- Equipment catalog UI and route wiring already exist (`EquipmentCatalogPage`, lazy-loaded from `src/app/App.tsx`).
- Generated Equipment commands cover register, revise details, update condition, recount, retire, and reactivate; no equipment-event reservation lifecycle appeared in the initial search.
- Inventory reservations are ingredient/inventory-item allocations and should not be repurposed for individually tracked equipment.
- Memory search produced no equipment-checkout-specific prior decision; current checkout evidence is the source of truth.
- Equipment may represent one asset or a pooled asset group (`quantity`), so event reservations need a reserved quantity even though the feature language says specific items.
- `EquipmentCondition` already has `excellent`, `good`, `fair`, `poor`, and `out_of_service`; checkout and return snapshots should reuse this enum.
- Existing equipment authorization intentionally permits inventory or logistics staff; reservation/checklist commands should inherit the same low-tedium access posture.
- The catalog UI uses generated hooks from `src/lib/manifest-convex-react`, `SupplyFailureBanner` for actionable errors, and shared ledger/form styles.
- Existing equipment row actions use browser prompts for quick maintenance actions, but the event checkout workflow needs an explicit checklist surface rather than more prompts.
- Facilities is routed directly at `/facilities`; there is no separate facilities route registry.
- `EventDetailPage` is already the coordination surface for event-specific operational panels (`EventGuestPanel`, `EventInventoryPanel`, incidents, attachments), making an `EventEquipmentPanel` the least disruptive entry point.
- The logistics pack-list UI provides the closest interaction pattern: visible busy state, failure banner, status notice, shared action prompt fields, and status-derived row actions.
- A reservation surface must keep reserve/edit actions separate from checkout and return confirmation so staff can use the checklist without stepping through unrelated event lifecycle gates.
- Binding domain guidance says to gate only on real harm and keep live operations mutable; overlapping reservations are a real allocation harm, while checkout/return condition notes should remain easy to correct through normal lifecycle commands.
- Manifest examples in this repository validate date ordering but do not show cross-row overlap predicates (`exists`, `where`, or `count` did not appear in authored Manifest sources).
- A compound uniqueness rule would only stop identical ranges, not partial overlaps; true double-book prevention must be atomic at the backend command boundary, not only filtered in React.
- The repository is Bun-based and has no permanent Playwright dependency/script; `npx` is installed but project conventions require Bun commands, so temporary verification should use a transient Bun execution path rather than modifying dependencies.
- Capsule currently pins `@angriff36/manifest` 3.6.41.
- Manifest documentation says relationship traversal can resolve related records during command evaluation and defines array `filter`, suggesting an overlap guard may be expressible in source if Convex projection supports the required lambda/expression form; this needs a focused compiler proof before implementation.
- Manifest explicitly supports `count_of(arr, predicate)` and lambda expressions over `hasMany` relationships. A candidate overlap rule is zero active reservations where `existing.startsAt < requestedEndsAt` and `existing.endsAt > requestedStartsAt`.
- This rule naturally permits adjacent reservations where one ends exactly when the next begins.
- Capsule already uses the standard bidirectional pattern needed here: parent `hasMany reservations`, child `belongsTo ... fields [tenantId, ...Id] references [tenantId, id]`.
- The authoritative aggregate conformance fixture is available in the sibling Manifest checkout; the next proof should compile a minimal candidate guard rather than speculate from docs.
- Convex projection has explicit tests proving `hasMany` aggregate guards preload related rows inside mutations and lower lambda expressions without unresolved guards.
- Because the overlap collection belongs to Equipment, the cleanest atomic boundary is likely an Equipment command that checks `self.reservations` and creates an EquipmentReservation, rather than a child create command that would require nested traversal back through Equipment.
- Manifest creation from an arbitrary entity command is not a normal action primitive; cross-entity creation is supported through reaction foreach-create (`fanOut <source> ... run <Target>.create`).
- A viable source-first flow is: `Equipment.reserveForEvent` atomically validates `self.reservations`, emits a reservation-request event, and a same-command reaction creates the linked `EquipmentReservation` row.
- Foreach-create syntax is proven as `on <Event> fanOut <MatchEntity> where ... run <Target>.create params {...}`. For this feature, matching the one Equipment by id provides the source row and preserves same-transaction command semantics.
- Availability must account for pooled catalog rows: reject only when the sum of overlapping active reservation quantities plus the requested quantity exceeds `Equipment.quantity`. This prevents double-booking single assets and supports grouped linens/chairs without needless one-row-per-unit tedium.
- Event date editing establishes the correct browser-to-domain conversion: `datetime-local` values are converted to epoch milliseconds with `new Date(value).getTime()`.
- The equipment panel can default its reserve window from the event's existing `startsAt` and `endsAt` values while still allowing an earlier load-out/later return window.
- Generated hook naming is predictable (`useList<Entity>`, `use<Entity><Command>`), and creation commands additionally expose `useCreate<Entity>`; the equipment panel should consume only generated hooks after regeneration.
- The shared action-prompt implementation is a directory module under `src/ui/action-prompt/`, not a single `.tsx` file.
- Shared action prompts only support text, number, and datetime inputs. Condition capture needs a controlled select and notes textarea, so the feature should use a compact inline checklist form rather than accepting free-text condition values.
- Manifest has no obvious private/internal command declaration; relying on a parent-only public command plus an exposed child creation command would leave a bypass path.
- The Convex projection contains an aggregate hydration planner with multi-hop belongsTo/hasMany support. If mutation guards use it, `EquipmentReservation.reserve` can directly enforce capacity through `self.equipment.reservations`, closing every generated UI/HTTP/agent command path.
- Confirmed: non-create Convex mutations invoke `planAndRenderAggregateHydration` over command checks and support multi-hop belongsTo/hasMany chains. The create branch still needs confirmation; if it omits hydration, the child creation command cannot be the sole safe boundary.
- Confirmed: the Convex create and governed-create branches do not run aggregate hydration. A direct child creation guard cannot safely inspect `self.equipment.reservations` in the generated backend.
- The parent-command/reaction design therefore needs a way to prevent direct public invocation of the child create command; Manifest's trusted/server-owned parameter feature is the next candidate because client surfaces omit trusted inputs while reactions can supply server context.
- Trusted parameters are injected from `context.*`, stripped from client input, and fail closed when required context is absent. This only closes the bypass if the Convex projection exposes a reaction-only context source; ordinary actor/tenant context would not distinguish direct from reaction calls.
- Convex projection diagnostics explicitly say trusted-source parameters are still exposed as normal mutation args unless an auth/create seam injects them. They cannot safely mark the reaction-only creator in this target.
- Decision: generate the `EquipmentReservation` schema, queries, and post-creation lifecycle from Manifest, but implement the one atomic reserve/create operation as an authored Convex seam. This avoids an exposed generated create bypass while keeping checkout/return commands governed and generated.
- This projection limitation is a real source-first gap and must be escalated according to the repository blocker rule rather than hidden behind the seam.
- Existing authored Convex seams authenticate with `getAuthContext` / `requireTenant` from `convex/lib/authContext.ts` and export top-level Convex functions; UI code imports the typed API only through `src/lib/api.ts`.
- The reserve seam must normalize ids, verify Equipment and Event belong to the caller's tenant, enforce the existing inventory/logistics role capabilities, query overlapping reservations in the transaction, and insert the fully initialized reservation row.
- Exact equipment capability roles are inherited from the Manifest role hierarchy: inventory staff/procurement staff/inventory managers and logistics staff/drivers/logistics managers, plus admin/owner/system. Generic managers and unrelated specialties do not automatically receive equipment access.
- `bun run manifest:regen` completed conflict-free. It generated the `equipmentReservations` table, `by_equipmentId` and `by_eventId` indexes, list/get hooks, and cancel/check-out/mark-returned hooks.
- Generated lifecycle mutations correctly enforce tenant, equipment permissions, state transitions, and OCC; mark-returned emits `EquipmentReturned` and invokes the catalog condition update in the same mutation.
- The first generated return reaction used single-target `match id`, which emitted a nonexistent `by_id` index because Convex ids are `_id`. Switched the source to the proven `fanOut Equipment where id = ...` form, whose generator uses direct `ctx.db.get` for id matches.

## Technical Decisions
| Decision | Rationale |
|---|---|
| Extend the facilities equipment domain instead of inventory reservations | Equipment is an owned/rented asset catalog with condition state; ingredient stock reservations have different quantity and consumption semantics. |

## Issues Encountered
| Issue | Resolution |
|---|---|
| Two exploratory reads named files that do not exist | Switched to verified paths from `rg --files` / existing route evidence and recorded the failures to avoid repeating them. |

## Visual and Browser Findings
- The documented local target `http://localhost:7811` is currently listening. Authentication/test state still needs to be observed during Playwright verification.
- Capsule has no development auth bypass; a fresh Playwright test context will reach Clerk sign-in unless a valid storage state is supplied.
- Existing Playwright CLI artifacts indicate a recent local browser session may already be authenticated, but no reusable storage-state file is visible in the artifact directories.
- The most recent CLI snapshot was still on “Checking your session…” rather than a usable authenticated event page. The server at port 7811 is the expected Vite process.
- Local secrets include an agent JWT but no browser test-user credentials. Rather than create or manipulate a real Clerk session, Playwright verification will run the production board in a temporary Vite harness with mocked transport hooks and the production overlap calculator; the temporary spec/harness will be removed afterward.
- The production failure banner exposes classified errors through `role=alert`, and action prompts use accessible headings/buttons, so the temporary Playwright flow can rely on user-visible roles and labels instead of implementation-only selectors except for the board rows/forms.
- Playwright reached the real checklist lifecycle and exposed that the generic status chip renders unknown enum values literally. The equipment board now formats `checked_out` as “checked out” while preserving the raw status on its row data attribute.
- Final temporary Playwright run passed the full reserve → overlap rejection → checkout → changed-condition return flow and captured `output/playwright/equipment-event-checkout.png`.
- Generated return-condition propagation now uses direct `ctx.db.get(equipmentId)` via the fan-out id optimization; no nonexistent `by_id` lookup remains.
- The temporary spec and Playwright last-run metadata were removed after the passing run; the verification screenshot is the only retained browser artifact.
- Generator blocker escalated as https://github.com/Angriff36/capsule/issues/53 with reproduction evidence, workaround, and suggested Manifest projection owner.
- Full `bun run check` reached the event integration guard. The feature's direct hook violation was fixed by moving custom hook construction to the facilities seam; the rerun reports only pre-existing `EventAllergenBriefingPage` and `EventIncidentPanel` violations already tracked in Capsule issue #40.
