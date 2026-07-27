# Findings & Decisions

Archived: 2026-07-16

## Requirements

- Keep Capsule-V2's visual design style while adapting its design goal to CapsuleX.
- Thoroughly understand current CapsuleX structure and its more complete Manifest-generated support.
- Use Capsule-Pro and Capsule-V2 as read-only product and design references.
- Use canonical Manifest sources from `C:/projects/Manifest-source/src`.
- Bring over every system for which canonical Manifest source exists and which existed in Capsule-Pro.
- Maintain a consistent docs structure with exactly one authoritative source of truth per system.
- Use Graphify and ask questions where answers materially affect the design.
- Respect generated/authored ownership boundaries.

## Research Findings

- Active checkout is `C:/projects/capsule` (CapsuleX), not Capsule-V2 or Capsule-Pro.
- CapsuleX is Bun + Vite + React + Convex + Clerk, assembled from Manifest proofs.
- Project instructions designate generated Convex/domain/client/assembly surfaces as do-not-edit.
- Prior Capsule-V2 work established `PARITY.md` as a slice tracker and Manifest-first CI ownership guardrails, but all current facts must be re-verified.
- Prior Capsule-Pro work confirms Manifest-governed prep list, inventory demand, and procurement flows; the canonical source model should be examined rather than copying app-local glue.
- Current branch is `main`, three commits ahead of `origin/main`, with extensive pre-existing modified generated/assembly files. `DESIGN.md`, `docs/design-references/`, and `codex-plans/` are untracked.
- Existing authored Convex seam changes include `convex/lib/authContext.ts` and `convex/lib/encryption.ts`; these are user-owned changes and will be preserved.
- `graphify.exe` is installed at `C:/Users/Ryan/AppData/Local/Programs/Python/Python311/Scripts/graphify.exe`.
- `graphify-out/` already exists as ignored scratch output in CapsuleX; Capsule-Pro has an existing `GRAPH_REPORT.md` that can serve as reference evidence but should not replace a fresh CapsuleX analysis.
- The copied `DESIGN.md` already defines a strong Capsule-V2 visual language and explicitly warns against copying Capsule-Pro presentation code; its goal and implementation-source sections still name Capsule V2 and point at the sibling repo.
- CapsuleX currently has real authored UI only for the shell, home, auth, and Events; Kitchen and event creation remain placeholders, while most domain breadth exists as `.manifest` sources plus generated Convex/client support.
- Current docs are intentionally small: architecture overview/boundaries, auth, events, navigation shell, generation, and local development. There is no domain-wide system index or authority map yet.
- The assembled local `src/` already contains Manifest source groupings for foundation, identity, culinary, operations, sales, workforce, production, inventory, procurement, logistics, finance, quality, and insights.
- `package.json` declares Bun 1.3.4 and Manifest `3.6.10`; the preset receipt says `convex-application` `1.3.4`, complete with no blockers.
- Graphify supports headless extraction, updates, architectural queries, path/affected traversal, and report generation. A fresh update/extraction can be kept in ignored `graphify-out/`.
- Fresh Graphify update completed successfully: 3,495 nodes, 3,501 edges, and 258 communities. It is AST-extracted evidence (no semantic LLM pass), so claims must be corroborated with source/docs inspection.
- Graphify's principal hubs include Manifest wiring bindings/contracts, generated React hooks, Convex mutations/queries/data model, app routing/shell, event UI, auth seams, and individual schema contracts. This confirms the repo is generation-heavy with a comparatively small authored UI layer.
- Graphify's natural-language BFS queries corroborate the documented generation boundary and expose the `manifest-context-summary.json` as the densest domain node, but generic cross-domain questions are too lossy for a complete capability inventory. The inventory must be built from the canonical sources and summary JSON directly.
- Current generated context reports 45 entities, 219 commands, 219 events, 79 constraints, 129 policies, 55 enums, and multi-tenancy enabled, compiled with Manifest 3.6.10 on 2026-07-16.
- Current docs have clean authority for generation, authored/generated boundaries, auth, navigation, and the Events slice, but no explicit distinction among domain contract authority, product-behavior authority, UI design authority, and implementation-status tracking.
- The existing Events doc is implementation-oriented and accurately labels create as a placeholder. The Navigation doc says Kitchen is a placeholder and everything beyond Home/Events is planned.
- `C:/projects/Manifest-source/src` contains exactly 36 canonical `.manifest` proofs across 13 domain folders; CapsuleX contains the same 36 relative paths.
- Capsule-Pro's current `manifest/source` is much larger and includes legacy/platform/AI/communications/training/maintenance capabilities that are absent from the canonical `Manifest-source/src` set. Those extra files are reference-only and are not implied target scope.
- Scope rule: canonical target systems come from `Manifest-source/src`; Capsule-Pro supplies workflow history, UX lessons, and edge cases only for matching concepts.
- All 36 CapsuleX `.manifest` inputs are byte-for-byte SHA-256 matches with `Manifest-source/src`; the canonical corpus is 9,288 lines. CapsuleX is not missing any canonical proof at the source-input level.
- The canonical proofs are behavior-rich, not schema stubs: examples include stock receive/adjust/recount/transfer, inventory reserve/release/consume, component draft/publish/retract/retire, menu publish/unpublish, event-dish service composition, prep task claim/start/block/complete, quality pass/fail/reinspect, time clock/correction, qualification grant/revoke/expire, and payroll prepare/finalize/void.
- The design task is therefore mainly to expose generated domain capability through coherent authored workflows and to document what is already modeled versus what remains UI/integration work.
- Tier-1 product purpose: Capsule is the operating system for organizations that plan, produce, staff, deliver, and execute catered events; one governed Event is the shared spine across commercial, culinary, inventory, staffing, logistics, financial, quality, and reporting work.
- Product definition requires important changes to propagate through declared Manifest behavior and explicitly forbids re-creating consequences in UI code or middleware.
- Primary users span sales/planning, chefs/production, inventory/procurement/vendors, staffing/training, drivers/logistics, onsite teams, and finance/admin; authorization varies by tenant, role, assignment, and work state.
- The copied CapsuleX `DESIGN.md` is byte-for-byte identical to Capsule-V2's file. It therefore needs more than a name change: its goal, iteration sequence, implementation sources, known gaps, and module boundaries must be adapted to CapsuleX's full generated model.
- Capsule-V2's `PARITY.md` mixes canonical and non-canonical areas. Facilities, notifications, platform settings, marketing, knowledge base, public flows, and some CRM concepts are not in the 36-proof canonical boundary and must not be promoted as current CapsuleX system scope.
- CapsuleX's navigation is also byte-for-byte copied from Capsule-V2 and currently advertises unsupported legacy concepts such as Facilities/equipment/work orders, cycle counts, drivers/vehicles, leads/deals, budgets, and API keys. This pass should document the corrected information architecture; code changes to nav should occur with the relevant implementation slice unless the user asks otherwise.
- Canonical domain decisions D001–D047 cover the full selected source set, including explicit lifecycle/auth/relationship choices for foundation, events, culinary, inventory, procurement, production, workforce, logistics, sales/billing, closeout, quality, reports, and the confirmation-to-purchasing cascade.
- Canonical open decisions remain for timezone/local-time, reapproval, encrypted lists, guest/headcount synchronization, component publish completeness, allergen derivation, Menu↔Dish composition, stock mutation side effects, station/training/vehicle concepts, alternate-key reactions, proposal/contract event creation/confirmation, closeout aggregation, allergen automation, and cascade actor capability.
- Canonical projection blockers must be rechecked against current Manifest 3.6.10 output before being presented as current CapsuleX limitations. The most product-visible categories are search, optimistic concurrency, encrypted fields, decimal/money precision, command-only write enforcement, readiness guards, and public read surfaces.
- Capsule-Pro provides rich reference coverage for components, menus, prep, inventory, procurement, staffing, sales, billing, allergens, and reports; delivery and incidents have little or no obvious route-level coverage, so the canonical model—not Capsule-Pro UI—must lead those experiences.
- Current CapsuleX assembly is materially more complete than the old Capsule-V2 assumptions: `ASSEMBLY_REPORT.json` says complete/exportAllowed, 0 errors, 20/20 verification passes, 430 files, auth seam present, and no blockers.
- Generated Convex surfaces expose 219 public mutations and 214 public queries (plus 4 internal queries). The old PB026 claim that all policy-gated reads are internal is stale for this assembled checkout and must not be repeated as current truth.
- The generated wiring contract records command parameter ownership, guards, emitted events, proven lifecycle transitions, invalidation hints, and typed failure categories. UI designs should use this metadata to produce honest action availability and error states.
- Graphify proves the current Event detail path end to end in five hops: `EventDetailPage` → generated `useEventApprove` hook → generated React wiring → `api` → generated `mutations.ts` → `Event_approve`.
- Authored code should keep consuming generated hooks/contracts; `src/lib/api.ts` remains the single Convex API import seam used by generated client wiring.
- The generated context exposes 99 relationships. Event is the main join point: Client/Venue/Guest, EventDish, IngredientDemand, reservations, prep/batches, assignments/shifts/time, pack/delivery, commercial documents/payments, payroll, closeout, incidents, and allergen checks all connect directly or through event-owned work.
- `manifest-context-summary.json` does not project reactions/sagas/schedules/workflows/approvals as top-level collections, so cross-domain automation claims must be verified from `.manifest` source/IR rather than inferred from this context view.
- The implemented CSS faithfully carries the intended palette, editorial type, icon rail, sheet frame, small saffron accent, and dense control primitives.
- The current Home page does not yet meet its own design brief: after the masthead it falls back to three equal generic cards and primarily explains app plumbing. It should eventually become the event-centered service desk/attention ledger specified by the product model.
- Current routes are exactly Home, Events list/detail, Event create placeholder, Kitchen placeholder, and generic planned pages generated from the copied nav.
- Canonical sources declare 11 cross-domain reactions: Event cancellation fans out to deliveries, reservations, invoices, pack lists, prep tasks, and purchase needs; Event approval confirms demand; confirmed demand creates a purchase need; adding a vendor-order line marks a need ordered; failed quality blocks prep; and settled payment applies to invoice.
- Current generated `Event_approve` and `Event_cancel` fan-outs dereference `payload.payload.eventId` even though the local payload object is flat (`payload.eventId`), so those reactions will fail before their downstream commands run.
- Current generated `Payment_settle` uses a direct `ctx.db.patch` on the invoice with `{ paymentAmount, paymentId }` rather than invoking `Invoice_applyPayment`; this bypasses the governed command and does not update the invoice fields/guards as intended.
- Current `Event_beginExecution` does correctly hydrate prep/pack/delivery relations and enforce the readiness guard, so the older `count_of` denial blocker is resolved in this generated output.
- Assembly completeness proves artifact production and structural verification, not end-to-end reaction correctness. Local projection status needs its own authoritative, source-backed document.
- Current generated reaction audit found 6 reaction-bearing mutation blocks, 16 invalid `payload.payload.*` references, 2 direct target patches, and 8 generated `runMutation` calls. `IngredientDemand_confirm` also inserts `purchaseNeeds` directly instead of dispatching `PurchaseNeed_create`, bypassing its policy/guards/defaults/event emission.
- The two direct target patches are `Payment_settle`→Invoice and `QualityCheck_fail`→PrepTask; both write command parameters as document fields rather than execute the governed target commands.
- The existing design brief's strong core can be retained. The sections requiring substantive adaptation are metadata/overview, system workspace patterns, do/don't governance, iteration order, local implementation sources, and known gaps.
- Documentation implementation assigns the 43 business entities across ten operator-system owners, with separate platform docs for auth, navigation, generation, and projection status.
- Local Markdown link validation passed with zero missing targets.
- The first entity-owner validation reported Event twice because PowerShell `-match` is case-insensitive and matched the lowercase `event-closeout.manifest` source path; rerun must use case-sensitive matching before treating it as a real ownership conflict.
- Capsule-Pro Graphify confirms its procurement area used separate requisition/vendor list and detail routes, status/priority configuration, generated Manifest client calls, and command-oriented detail actions. This supports the CapsuleX purchase-queue/order-folio split while leaving Capsule-Pro component architecture behind.
- Capsule-Pro Graphify also surfaced mature allergen, invoice, import, and claim/release surfaces, but cross-area natural-language traversals were noisy. Only exact matching route/symbol evidence was used; canonical Manifest remains the authority for interactions not cleanly traced.

## Technical Decisions

| Decision                                                                                | Rationale                                                                                                                                                                    |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use a system authority matrix before adding docs                                        | Prevents multiple docs from claiming canonical status.                                                                                                                       |
| Prefer current Manifest source names and relationships over Capsule-Pro UI/module names | The new app has more complete generation support and should not inherit obsolete glue boundaries.                                                                            |
| Treat the 36 canonical proofs as the bounded product domain for this design pass        | This follows the user's explicit source path and avoids accidentally importing Capsule-Pro-only legacy systems.                                                              |
| Use Event as the cross-system product spine                                             | This is the tier-1 product principle and is reflected in canonical relationships and reactions.                                                                              |
| Do not copy Capsule-V2's parity list wholesale                                          | It contains areas that the current canonical Manifest model deliberately omits or defers.                                                                                    |
| Treat current assembly evidence as the readiness baseline                               | Current 3.6.10 output supersedes stale projection-blocker claims when directly verified.                                                                                     |
| Preserve the visual system but redesign page archetypes around operational documents    | The tokens/frame are strong; the gap is workflow composition and information hierarchy, not branding.                                                                        |
| Add a local generation-status authority                                                 | Current assembly receipts overstate runtime readiness for cross-domain reactions; verified local limitations must live in one place without changing canonical domain truth. |

## Issues Encountered

| Issue                                                                                                | Resolution                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Superpowers bootstrap executable is absent                                                           | Logged in the plan; continue with available project and skill instructions.                                                                   |
| Graphify MCP is unavailable                                                                          | Used the locally installed Graphify CLI directly; fresh update succeeded.                                                                     |
| Large dirty generated worktree                                                                       | Do not touch or revert it; constrain authored work to docs/plans and evaluate diffs path-by-path.                                             |
| First findings patch used a mismatched expected line                                                 | Corrected the patch context after a targeted `rg`; no project content was changed by the failed attempt.                                      |
| Combined reaction/design inspection command exited without output                                    | Split it into two simpler PowerShell commands and used `Select-String`; both completed successfully.                                          |
| Parallel validation call was marked failed because `git diff --no-index` returns 1 when files differ | Treat the expected design difference as evidence; rerun structural validation separately and avoid combining expected non-zero diff commands. |
| Graphify findings patch targeted a progress line in the wrong file                                   | Split the update by file and reapplied with exact context.                                                                                    |

## Resources

- `C:/projects/capsule/AGENTS.md` instructions supplied by the user
- `C:/projects/capsule/DESIGN.md`
- `C:/projects/Capsule-V2`
- `C:/projects/capsule-pro`
- `C:/projects/Manifest-source/src`

## Visual/Browser Findings

- Dashboard/detail reference: a pale botanical frame and narrow icon rail surround a large white working sheet; overview cards are sparse and editorial, while the component detail becomes a dense rule-led form/table without abandoning the same typography or palette.
- Import reference: a true task workbench uses two balanced document panes (source at left, governed result at right), with a single dominant completion action and inline match/validation status. This pattern should be reserved for genuine compare-and-resolve flows, not generic two-column layouts.
- The memorable design trait is the contrast between calm botanical atmosphere and highly specific operational documents. CapsuleX should extend that contrast across event dossiers, production ledgers, stock books, staffing rosters, dispatch manifests, and closeout folios.
