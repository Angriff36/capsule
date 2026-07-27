# CapsuleX UI Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch implementation subagents while the owner's Ralph loop is active in this shared checkout.

**Goal:** Normalize every authored CapsuleX route around a reusable, accessible “botanical operations folio” UI system while improving weak screens and preserving the strongest Finance compositions.

**Architecture:** Build a three-level authored UI layer: native-control primitives, recurring document components, and route archetypes. Migrate one reference screen first, then migrate route workspaces in independently verifiable batches while a source audit tracks remaining direct-control and legacy-style drift.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind utility classes already present in the checkout, authored CSS variables in `src/styles/app.css`, React Router, Vitest gates already present in the repository.

## Global Constraints

- `DESIGN.md` remains the presentation authority.
- Read `C:/Projects/Manifest/mintlify/llms-full.txt` before implementation changes.
- Do not edit generated files, schemas, wiring, generated contract tests, or Manifest source.
- Do not add or expand tests unless the owner separately requests them.
- Do not change Manifest-owned rules, permissions, lifecycles, calculations, or command behavior.
- Do not stash, reset, overwrite, or reformat Ralph-loop work.
- Before each task, run `git status --short` and `git diff --name-only`; skip any target file currently modified by Ralph or another session.
- Every control must retain native semantics, visible keyboard focus, accessible naming, and truthful disabled/busy behavior.
- Motion must respect `prefers-reduced-motion`.
- No deployment commands.
- `bun run check` must pass before completion is claimed.
- A model that did not author the diff must approve it before merge.

---

### Task 1: Establish the UI migration inventory and drift audit

**Files:**

- Create: `scripts/check-ui-contract.ts`
- Create: `docs/ui-migration-inventory.md`
- Modify: `package.json`

**Interfaces:**

- Produces: `bun run ui:audit` for a non-blocking report.
- Produces: `bun run ui:audit -- --check` for the final zero-drift gate.
- Produces: an inventory row for every explicit route in `src/app/App.tsx`.

- [ ] **Step 1: Recheck shared-checkout ownership**

Run:

```powershell
git status --short
git diff --name-only
```

Expected: Ralph-owned files may be dirty. None of this task's three target
files may be dirty. If one is dirty, stop this task and wait for ownership to
clear.

- [ ] **Step 2: Create the source audit**

Implement `scripts/check-ui-contract.ts` with these exported values:

```ts
export type UiAuditFinding = {
  file: string;
  line: number;
  kind:
    | "raw-button"
    | "raw-input"
    | "raw-select"
    | "raw-textarea"
    | "legacy-button-class"
    | "legacy-field-class";
  source: string;
};

export function auditUiSource(rootDir: string): UiAuditFinding[];
```

The script must:

- Recursively scan authored `.tsx` files under `src/app`, `src/features`, and
  `src/ui`.
- Ignore generated paths and the primitive implementation files themselves.
- Detect raw native controls and legacy `btn`, `field-input`, and
  `field-label` classes.
- Print deterministic findings grouped by file.
- Exit `0` in report mode and exit `1` in `--check` mode when findings remain.
- Accept a repeated `--allow <relative-path>` option only for temporary,
  documented migration exceptions.

- [ ] **Step 3: Register the report command**

Add this script to `package.json`:

```json
"ui:audit": "bun scripts/check-ui-contract.ts"
```

Do not add the audit to `bun run check` yet because the baseline is expected
to contain violations until Task 13.

- [ ] **Step 4: Record the route inventory**

Create `docs/ui-migration-inventory.md` with columns:

```markdown
| Route | Component | Archetype | State | Notes |
| --- | --- | --- | --- | --- |
```

Populate every explicit route from `src/app/App.tsx`. Use only these states:
`reference`, `pending`, `migrated`, `concurrent`, or `intentional-exception`.
Mark `/finance/taxes` and `/finance/profit-margins` as `reference`; mark the
rest `pending` unless a file is currently dirty, in which case mark it
`concurrent`.

- [ ] **Step 5: Verify the baseline report**

Run:

```powershell
bun run ui:audit
bun run typecheck
bunx prettier --check scripts/check-ui-contract.ts docs/ui-migration-inventory.md package.json
```

Expected: audit exits `0` and reports existing drift; typecheck and Prettier
exit `0`.

- [ ] **Step 6: Commit the isolated inventory task**

Run:

```powershell
git add scripts/check-ui-contract.ts docs/ui-migration-inventory.md package.json
git diff --cached --name-only
git commit -m "chore(ui): inventory design-system migration"
```

Expected: the staged list contains only the three task files.

---

### Task 2: Build native-control primitives and canonical tokens

**Files:**

- Create: `src/ui/Button.tsx`
- Create: `src/ui/Field.tsx`
- Create: `src/ui/StatusChip.tsx`
- Modify: `src/ui/primitives.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**

- Produces:

```ts
export type ButtonVariant = "primary" | "secondary" | "danger" | "quiet";
export type ButtonSize = "compact" | "default" | "hero";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  icon?: React.ReactNode;
}

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: ButtonVariant;
}

export interface FieldShellProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  children: React.ReactElement;
  className?: string;
}

export type TextFieldProps = FieldShellProps &
  React.InputHTMLAttributes<HTMLInputElement>;
export type SelectFieldProps = FieldShellProps &
  React.SelectHTMLAttributes<HTMLSelectElement> & {
    children: React.ReactNode;
  };
export type TextAreaFieldProps = FieldShellProps &
  React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export type StatusTone =
  | "neutral"
  | "success"
  | "information"
  | "warning"
  | "danger";
```

- Preserves: the existing `StatusChip({ status })` import surface through a
  compatibility re-export in `src/ui/primitives.tsx`.

- [ ] **Step 1: Recheck target ownership**

Run `git status --short` and confirm none of the five target files are dirty.

- [ ] **Step 2: Normalize tokens in `src/styles/app.css`**

Consolidate button, field, focus, rule, and motion values under semantic custom
properties. Keep the existing `DESIGN.md` values:

```css
--control-height-compact: 28px;
--control-height-default: 32px;
--control-height-hero: 40px;
--control-radius: 3px;
--focus-color: var(--color-accent);
--motion-fast: 140ms;
--motion-standard: 220ms;
```

Add `@media (prefers-reduced-motion: reduce)` rules that remove control
transforms and nonessential section entrance animation.

- [ ] **Step 3: Implement `Button` and `IconButton`**

`Button` must:

- Default to `type="button"`, `variant="secondary"`, and `size="default"`.
- Set `aria-busy` when `busy` is true.
- Disable interaction when either `busy` or `disabled` is true.
- Preserve button width while displaying a compact busy indicator.
- Render icon and label in stable inline slots.

`IconButton` must require `label`, set `aria-label`, and use a minimum 40px
isolated target.

- [ ] **Step 4: Implement field primitives**

Use `React.useId()` when the caller does not supply an `id`. Connect label,
description, and error with `htmlFor`, `aria-describedby`, and
`aria-invalid`. Do not move form state into the primitives.

- [ ] **Step 5: Implement `StatusChip`**

Keep current event-stage label mapping, add explicit `tone`, and require text
content in addition to color. Unknown statuses use the neutral tone.

- [ ] **Step 6: Convert `src/ui/primitives.tsx` into the compatibility barrel**

Re-export the new primitive modules while retaining `PageHeader`, `Section`,
`EmptyState`, `ErrorState`, `Skeleton`, and `TableSkeleton` until Task 3
replaces their implementations.

- [ ] **Step 7: Verify controls**

Run:

```powershell
bun run typecheck
bun run test
bun run build
bunx prettier --check src/ui/Button.tsx src/ui/Field.tsx src/ui/StatusChip.tsx src/ui/primitives.tsx src/styles/app.css
```

Expected: every command exits `0`.

- [ ] **Step 8: Commit**

Stage only the five task files and commit:

```powershell
git commit -m "feat(ui): add canonical control primitives"
```

---

### Task 3: Build reusable document components and route archetypes

**Files:**

- Create: `src/ui/Document.tsx`
- Create: `src/ui/Feedback.tsx`
- Create: `src/ui/WorkspaceTabs.tsx`
- Create: `src/ui/index.ts`
- Modify: `src/ui/primitives.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**

- Produces:

```ts
export type MastheadScale = "journal" | "object" | "working";
export interface EditorialMastheadProps {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  facts?: React.ReactNode;
  actions?: React.ReactNode;
  scale?: MastheadScale;
}

export type RuleTone = "fine" | "strong" | "brand" | "accent";
export interface DocumentSectionProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  rule?: RuleTone;
  inset?: boolean;
  children: React.ReactNode;
}

export interface FormFolioProps
  extends React.FormHTMLAttributes<HTMLFormElement> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export interface WorkingLedgerProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  controls?: React.ReactNode;
  children: React.ReactNode;
}

export interface EmptyStateProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  size?: "compact" | "section" | "authored";
}

export interface ActionBarProps {
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
  danger?: React.ReactNode;
}

export interface WorkspaceTab {
  key: string;
  label: React.ReactNode;
  to: string;
  current?: boolean;
}
```

- [ ] **Step 1: Recheck target ownership**

Run `git status --short`; do not proceed if a target file is dirty.

- [ ] **Step 2: Implement document composition**

Implement `EditorialMasthead`, `DocumentSection`, `FormFolio`,
`WorkingLedger`, `MetricStrip`, and `ActionBar` in `src/ui/Document.tsx`.
Components own structure and class names only; they accept rendered content
and do not import domain hooks.

- [ ] **Step 3: Implement feedback composition**

Implement `EmptyState` and `FeedbackBanner` in `src/ui/Feedback.tsx`.
`FeedbackBanner` accepts `tone`, `title`, `detail`, and optional action.

- [ ] **Step 4: Implement tabs**

`WorkspaceTabs` renders semantic navigation with links, `aria-current="page"`
for the current tab, horizontal overflow on narrow screens, and the saffron
active underline.

- [ ] **Step 5: Add canonical styles**

Add `.editorial-masthead`, `.document-section`, `.form-folio`,
`.working-ledger`, `.metric-strip`, `.action-bar`, `.workspace-tabs`, and
`.empty-state` component classes. Preserve the existing botanical frame,
working-paper sheet, typography, and dark-mode palette.

- [ ] **Step 6: Publish one import surface**

`src/ui/index.ts` exports all supported primitives and document components.
`src/ui/primitives.tsx` re-exports compatibility names so migrations can be
incremental.

- [ ] **Step 7: Verify and commit**

Run `bun run typecheck`, `bun run test`, and `bun run build`. Stage only Task
3 files and commit:

```powershell
git commit -m "feat(ui): add document workspace components"
```

---

### Task 4: Prove the system on Event Staffing

**Files:**

- Modify: `src/features/events/EventStaffingTab.tsx`
- Modify: `docs/ui-migration-inventory.md`
- Modify: `src/styles/app.css` only if a generic responsive ledger rule is
  missing; do not add Staffing-specific button or field rules.

**Interfaces:**

- Consumes: `DocumentSection`, `FormFolio`, `WorkingLedger`, `EmptyState`,
  `Button`, `SelectField`, `TextField`, and `StatusChip` from `src/ui`.
- Preserves: `EventStaffingTab({ eventId, startsAt, endsAt })`.

- [ ] **Step 1: Confirm the file is not concurrent**

Run:

```powershell
git status --short src/features/events/EventStaffingTab.tsx
git diff -- src/features/events/EventStaffingTab.tsx
```

Expected: no output. If output appears, skip this task.

- [ ] **Step 2: Replace the assignment form**

Use `FormFolio` with a two-field responsive grid and a normal-width primary
`Button`. Keep the existing submit handler, generated hook calls, reset
behavior, and failure classification unchanged.

- [ ] **Step 3: Replace the assignment list**

Use `WorkingLedger` with ruled rows. Each row retains name, role, call time,
conflicts, status, and `Unassign`. Use `EmptyState size="compact"` when no
assignments exist.

- [ ] **Step 4: Replace the open-shift form and list**

Use `DocumentSection`, `FormFolio`, and a second `WorkingLedger`. Preserve
claim, fill, and cancel command semantics. Render Cancel as a danger variant;
render Claim as the one primary row action.

- [ ] **Step 5: Verify responsive and keyboard behavior**

Run the app on its configured port:

```powershell
bun run dev
```

Inspect the Staffing tab at wide desktop, 1024px, and 390px. Verify tab order,
focus visibility, form labels, row wrapping, empty states, and disabled busy
actions. Stop only the dev process started for this task.

- [ ] **Step 6: Update inventory, verify, and commit**

Mark the Event Staffing route/tab `migrated`. Run:

```powershell
bun run typecheck
bun run test
bun run build
bun run ui:audit
```

Commit only the Staffing, inventory, and any generic CSS change:

```powershell
git commit -m "feat(events): normalize staffing workspace"
```

---

### Task 5: Normalize the remaining Event dossier

**Files:**

- Modify: `src/features/events/EventDetailPage.tsx`
- Modify: `src/features/events/EventDetailTabs.tsx`
- Modify: `src/features/events/EventTabIntro.tsx`
- Modify: `src/features/events/EventOverviewTab.tsx`
- Modify: `src/features/events/EventMenuTab.tsx`
- Modify: `src/features/events/EventEquipmentPanel.tsx`
- Modify: `src/features/events/EventClientTab.tsx`
- Modify: `src/features/events/EventPhotosTab.tsx`
- Modify: `src/features/events/EventTimelineTab.tsx`
- Modify: `src/features/events/EventLayoutsTab.tsx`
- Modify: `src/features/events/RecurringEventPanel.tsx`
- Modify: `src/features/events/EventMarginTab.tsx`
- Modify: `src/features/events/EventInventoryPanel.tsx`
- Modify: `src/features/events/EventIncidentPanel.tsx`
- Modify: `src/features/events/EventGuestPanel.tsx`
- Modify: `src/features/events/EventWeatherPanel.tsx`
- Modify: `src/features/events/EventBattleBoardLayoutsPanel.tsx`
- Modify: `src/features/events/EventsListPage.tsx`
- Modify: `src/features/events/EventTemplatesPage.tsx`
- Modify: `src/features/events/EventCapacityPlannerPage.tsx`
- Modify: `src/features/events/EventAllergenBriefingPage.tsx`
- Modify later when clean: `src/features/events/EventCreatePage.tsx`
- Modify: `docs/ui-migration-inventory.md`

**Interfaces:**

- Consumes the Task 2 and Task 3 UI public API.
- Preserves all route paths, generated hook calls, command handlers, tab keys,
  query parameters, and event lifecycle behavior.

- [ ] **Step 1: Split the batch around concurrent files**

Run `git status --short` against the listed paths. Move any dirty file to the
end of the batch and mark its inventory row `concurrent`. Do not block clean
Event files behind Ralph's active `EventCreatePage.tsx` work.

- [ ] **Step 2: Normalize the stable object masthead and tabs**

Use `EditorialMasthead scale="object"`, `ActionBar`, and `WorkspaceTabs`.
Preserve event identity, lifecycle state, client, venue, timing, and existing
navigation.

- [ ] **Step 3: Normalize each tab's local sections**

Replace ad hoc borders, native controls, and empty regions with the shared
components. Use `DocumentSection` for descriptive work, `WorkingLedger` for
rows, and `FormFolio` for inline mutation forms.

- [ ] **Step 4: Normalize Event list and supporting routes**

Use `EditorialOverview` composition for capacity and templates; use ruled
service rows for the Event list. Preserve the existing editorial hierarchy
where it already conforms.

- [ ] **Step 5: Return to deferred Event files**

Re-run `git status --short`. Migrate `EventCreatePage.tsx` only after Ralph's
diff has been committed and the file is clean.

- [ ] **Step 6: Verify and commit**

Run typecheck, existing tests, build, and `ui:audit`. Inspect `/events`, one
event detail route with every reachable tab, `/events/templates`,
`/events/capacity`, and `/events/new`. Mark migrated inventory rows and commit:

```powershell
git commit -m "feat(events): unify the event dossier UI"
```

---

### Task 6: Normalize Workforce routes

**Files:**

- Modify: `src/features/workforce/WorkforceWorkspaceNav.tsx`
- Modify: `src/features/workforce/RosterPage.tsx`
- Modify: `src/features/workforce/ShiftSwapRequestsPage.tsx`
- Modify: `src/features/workforce/TimeSheetPage.tsx`
- Modify: `src/features/workforce/TimeOffRequestsPage.tsx`
- Modify: `src/features/workforce/MessagesPage.tsx`
- Modify: `src/features/workforce/QualificationsPage.tsx`
- Modify: `src/features/workforce/TrainingPage.tsx`
- Modify: `src/features/workforce/PerformanceReviewsPage.tsx`
- Modify: `src/features/workforce/StaffUtilizationPage.tsx`
- Modify: `src/features/workforce/ShiftSwapRequestsPage.css`
- Modify: `src/features/workforce/TrainingPage.css`
- Modify: `src/features/workforce/StaffUtilizationPage.css`
- Modify: `docs/ui-migration-inventory.md`

**Interfaces:**

- Uses `LedgerWorkspace` composition through `EditorialMasthead`,
  `WorkspaceTabs`, `FormFolio`, `WorkingLedger`, `MetricStrip`, and shared
  controls.
- Preserves scheduling, approval, availability, time, qualification,
  training, messaging, and review behavior.

- [ ] **Step 1: Recheck ownership and migrate navigation**

Skip dirty files. Convert the workspace navigation to `WorkspaceTabs`.

- [ ] **Step 2: Migrate roster, swaps, time, and time-off**

Use dense ledgers with visible row boundaries. Keep approval and destructive
actions proportionate; do not introduce additional guards or confirmation
steps.

- [ ] **Step 3: Migrate messaging, qualifications, training, reviews, and utilization**

Use `DocumentSection`, `WorkingLedger`, `MetricStrip`, shared fields, and
canonical buttons. Remove superseded CSS only after confirming no remaining
consumer with `rg`.

- [ ] **Step 4: Verify and commit**

Run typecheck, existing tests, build, and audit. Inspect each `/staff/*` route
at desktop and mobile, update inventory, and commit:

```powershell
git commit -m "feat(workforce): unify roster and time workspaces"
```

---

### Task 7: Normalize Inventory and Procurement routes

**Files:**

- Modify: `src/features/inventory/InventoryWorkspaceNav.tsx`
- Modify: `src/features/inventory/DemandLedgerPage.tsx`
- Modify: `src/features/inventory/StockBookPage.tsx`
- Modify: `src/features/inventory/StockCountPage.tsx`
- Modify: `src/features/inventory/InventoryAuditLogPage.tsx`
- Modify: `src/features/inventory/WasteCostReportPage.tsx`
- Modify: `src/features/inventory/LotTraceabilityPage.tsx`
- Modify: `src/features/inventory/PurchasingPage.tsx`
- Modify: `src/features/inventory/VendorOrderPage.tsx`
- Modify: `src/features/inventory/VendorContractsPage.tsx`
- Modify: `src/features/inventory/StockCountPage.css`
- Modify: `src/features/inventory/InventoryAuditLogPage.css`
- Modify: `src/features/inventory/WasteCostReportPage.css`
- Modify: `src/features/inventory/LotTraceabilityPage.css`
- Modify: `docs/ui-migration-inventory.md`

**Interfaces:**

- Uses the `LedgerWorkspace` and `ReconciliationFolio` compositions.
- Preserves all demand, reservation, count, purchase, receipt, vendor, waste,
  audit, and traceability commands and facts.

- [ ] **Step 1: Normalize navigation and mastheads**

Use shared tabs and mastheads while retaining current route labels and counts.

- [ ] **Step 2: Normalize ledgers and forms**

Use `WorkingLedger` for demand, stock, count lines, purchasing queues, orders,
contracts, waste, audit, and lot rows. Use `FormFolio` for scan, adjustment,
order, receipt, and filter controls.

- [ ] **Step 3: Preserve operational density**

Keep quantities, units, provenance, shortages, and status visible. Use mono
data styling for quantities and dates. Do not replace working rows with
summary-card grids.

- [ ] **Step 4: Verify and commit**

Run the standard task gates, inspect every `/inventory/*` route at desktop and
mobile, update inventory, and commit:

```powershell
git commit -m "feat(inventory): normalize supply ledgers"
```

---

### Task 8: Normalize Logistics and Production routes

**Files:**

- Modify: `src/features/logistics/LogisticsWorkspaceNav.tsx`
- Modify: `src/features/logistics/PackListsPage.tsx`
- Modify: `src/features/logistics/PackListDetailPage.tsx`
- Modify: `src/features/logistics/DeliveriesPage.tsx`
- Modify: `src/features/logistics/VehicleSchedulePage.tsx`
- Modify: `src/features/logistics/RoutePlannerPage.tsx`
- Modify: `src/features/logistics/VehicleFleetPage.tsx`
- Modify: `src/features/logistics/VehicleMaintenancePage.tsx`
- Modify: `src/features/production/ProductionWorkspaceNav.tsx`
- Modify: `src/features/production/PrepBoardPage.tsx`
- Modify: `src/features/production/KitchenDisplayPage.tsx`
- Modify: `src/features/production/ProductionYieldDashboardPage.tsx`
- Modify: `src/features/production/KitchenDisplayPage.css`
- Modify: `src/features/production/ProductionYieldDashboardPage.css`
- Modify: `docs/ui-migration-inventory.md`

**Interfaces:**

- Uses `ExecutionBoard`, `LedgerWorkspace`, and shared controls.
- Preserves packing, loading, dispatch, delivery, route, maintenance, prep,
  claim, completion, quality, and yield behavior.

- [ ] **Step 1: Normalize workspace navigation and route hierarchy**

Use shared tabs and mastheads without changing route ownership or operational
grouping.

- [ ] **Step 2: Normalize execution boards**

Give missing, blocked, due, and exception work stronger hierarchy than
completed work. Use ruled rows and semantic feedback; retain existing command
availability and consequences.

- [ ] **Step 3: Normalize fleet, route, maintenance, and yield forms**

Use shared fields, form folios, action bars, and ledgers. Preserve map/route
specialized regions and kitchen-display high-contrast mode.

- [ ] **Step 4: Verify and commit**

Run standard gates; inspect `/logistics/*`, `/kitchen/prep`,
`/kitchen/display`, and `/kitchen/yield`; update inventory and commit:

```powershell
git commit -m "feat(operations): unify dispatch and production UI"
```

---

### Task 9: Normalize Clients and Commercial routes

**Files:**

- Modify: `src/features/clients/ClientsWorkspaceNav.tsx`
- Modify: `src/features/clients/ClientsPage.tsx`
- Modify: `src/features/clients/ClientDetailPage.tsx`
- Modify: `src/features/clients/LeadPipelinePage.tsx` after Ralph commits it
- Modify: `src/features/clients/ProposalsPage.tsx`
- Modify: `src/features/clients/ContractsPage.tsx`
- Modify: `src/features/clients/ContractDocumentPage.tsx`
- Modify: `src/features/clients/ClientRetentionPage.tsx`
- Modify: `src/features/clients/ClientContactsPanel.tsx`
- Modify: `src/features/clients/ClientCommunicationPanel.tsx`
- Modify: `src/features/clients/ProposalMenuSelectionPanel.tsx`
- Modify: `src/features/clients/LeadPipelinePage.css`
- Modify: `docs/ui-migration-inventory.md`

**Interfaces:**

- Uses `ObjectDossier`, `LedgerWorkspace`, document sections, form folios, and
  shared controls.
- Preserves client, lead, proposal, contract, communication, retention, and
  document behavior.

- [ ] **Step 1: Defer Ralph-owned commercial files**

Mark any dirty commercial target `concurrent`; do not merge around live
changes in `LeadPipelinePage.tsx`.

- [ ] **Step 2: Normalize account and document workspaces**

Use object mastheads for client and contract detail, ruled ledgers for
accounts and pipeline, and bounded folios for edits and creation.

- [ ] **Step 3: Normalize commercial actions**

Keep one primary action per decision region, separate destructive actions,
and preserve generated capability failure display.

- [ ] **Step 4: Finish deferred files, verify, and commit**

Return after Ralph commits. Run standard gates, inspect `/clients/*`, update
inventory, and commit:

```powershell
git commit -m "feat(clients): unify commercial workspaces"
```

---

### Task 10: Move Finance reference screens onto the shared system

**Files:**

- Modify: `src/features/finance/FinanceWorkspaceNav.tsx`
- Modify: `src/features/finance/InvoicesPage.tsx`
- Modify: `src/features/finance/InvoiceDetailPage.tsx`
- Modify: `src/features/finance/RevenueTrendsPage.tsx`
- Modify: `src/features/finance/FoodCostPercentagePage.tsx`
- Modify: `src/features/finance/ProfitMarginReportsPage.tsx`
- Modify: `src/features/finance/TaxRatesPage.tsx`
- Modify: `src/features/finance/PaymentsPage.tsx`
- Modify: `src/features/finance/PaymentMethodsPage.tsx`
- Modify: `src/features/finance/CloseoutPage.tsx`
- Modify: `src/features/finance/PayrollPage.tsx`
- Modify: `src/features/finance/TipDistributionPage.tsx`
- Modify: `src/features/finance/FoodCostPercentagePage.css`
- Modify: `src/features/finance/ProfitMarginReportsPage.css`
- Modify: `src/features/finance/taxWorkspace.css`
- Modify: `src/features/finance/TipDistributionPage.css`
- Modify: `docs/ui-migration-inventory.md`

**Interfaces:**

- Uses `ReconciliationFolio`, `MetricStrip`, `WorkingLedger`, shared tabs,
  fields, and buttons.
- Preserves the current Tax and Profit Margins compositions as visual
  references while replacing duplicated implementation.

- [ ] **Step 1: Capture reference screenshots**

Capture Tax and Profit Margins at desktop and mobile before edits. Store
temporary images under `.artifacts/`; do not commit them.

- [ ] **Step 2: Replace duplicate controls and sections**

Adopt shared controls and document components without flattening the editorial
hierarchy or changing calculations, date ranges, totals, and empty states.

- [ ] **Step 3: Normalize the remaining Finance routes**

Apply the same folio grammar to invoices, payments, methods, closeout,
payroll, tips, revenue, and food cost. Keep currency and dates in tabular mono
rhythm.

- [ ] **Step 4: Compare against references, verify, and commit**

Capture after screenshots at the same viewports. Confirm the shared-component
version is equal or stronger in hierarchy, spacing, boundary definition, and
responsive behavior. Run standard gates, update inventory, and commit:

```powershell
git commit -m "feat(finance): adopt shared folio components"
```

---

### Task 11: Normalize Culinary routes without erasing their book identity

**Files:**

- Modify: `src/features/kitchen/KitchenBookNav.tsx`
- Modify: `src/features/kitchen/KitchenCatalogPage.tsx`
- Modify: `src/features/kitchen/ComponentDetailPage.tsx`
- Modify: `src/features/kitchen/IngredientDetailPage.tsx`
- Modify: `src/features/kitchen/DishDetailPage.tsx`
- Modify: `src/features/kitchen/MenuDetailPage.tsx`
- Modify: `src/features/kitchen/EventMenuPage.tsx`
- Modify: `src/features/kitchen/AllergenMatrixPage.tsx`
- Modify: `src/features/kitchen/import/ComponentImportPage.tsx`
- Modify: `src/features/kitchen/ComponentCostPanel.tsx`
- Modify: `src/features/kitchen/ComponentNutritionPanel.tsx`
- Modify: `src/features/kitchen/ComponentVersionHistoryPanel.tsx`
- Modify: `src/features/kitchen/IngredientPriceTrendPanel.tsx`
- Modify: `src/features/kitchen/VendorPriceComparisonPanel.tsx`
- Modify: `src/features/kitchen/DishPrepTasksPanel.tsx`
- Modify: `src/features/kitchen/MenuProfitabilityPanel.tsx`
- Modify: `src/features/kitchen/culinary-studio/CulinaryStudio.css`
- Modify: `src/features/kitchen/culinary-studio/CulinaryStudioSurfaces.css`
- Modify: `src/features/kitchen/culinary-studio/CulinaryCatalogCards.css`
- Modify: `src/features/kitchen/command-deck/KitchenCommandDeck.css`
- Modify: `src/features/kitchen/command-deck/KitchenCommandDeckSurfaces.css`
- Modify: `src/features/kitchen/MenuProfitabilityPanel.css`
- Modify: `docs/ui-migration-inventory.md`

**Interfaces:**

- Uses shared controls and document components while preserving the Component
  Book catalog/detail composition and genuine two-pane workbenches.
- Preserves all component, ingredient, dish, menu, allergen, import, cost,
  nutrition, and version behavior.

- [ ] **Step 1: Normalize book navigation and native controls**

Adopt shared tabs, buttons, fields, and status chips while preserving the
distinctive culinary catalog hierarchy.

- [ ] **Step 2: Normalize detail documents**

Use `EditorialMasthead scale="object"` and `DocumentSection` for ingredients,
procedures, costing, nutrition, versions, prices, prep tasks, and menu uses.

- [ ] **Step 3: Preserve specialized workbenches**

Keep the component-import and command-deck layouts specialized. Replace only
their duplicated controls, feedback, and generic document sections.

- [ ] **Step 4: Verify and commit**

Inspect every `/kitchen/*` route, run standard gates, update inventory, and
commit:

```powershell
git commit -m "feat(kitchen): unify the culinary document system"
```

---

### Task 12: Normalize remaining authored routes and shell-adjacent screens

**Files:**

- Modify: `src/features/facilities/EquipmentCatalogPage.tsx`
- Modify: `src/features/facilities/EquipmentMaintenanceBoard.css`
- Modify: `src/features/reports/ReportsPage.tsx`
- Modify: `src/features/admin/AdminWorkspaceNav.tsx`
- Modify: `src/features/admin/PermissionsPage.tsx`
- Modify: `src/features/admin/AnnouncementsPage.tsx`
- Modify: `src/features/admin/BrandingPage.tsx`
- Modify: `src/features/admin/PersonalDataExportPage.tsx`
- Modify: `src/features/admin/IntegrationsPage.tsx`
- Modify: `src/features/admin/RolePermissionAuditPanel.tsx`
- Modify: `src/features/admin/TeamRolesPanel.tsx`
- Modify: `src/features/notifications/EmailNotificationSettingsPage.tsx`
- Modify: `src/features/staff/MyDayPage.tsx`
- Modify: `docs/ui-migration-inventory.md`

**Interfaces:**

- Uses shared overview, dossier, ledger, form, feedback, tabs, and controls.
- Preserves admin capability visibility and all existing report, facility,
  notification, export, branding, and personal-work behavior.

- [ ] **Step 1: Normalize facilities and reports**

Use working ledgers and editorial overview composition. Preserve maintenance
and report data behavior.

- [ ] **Step 2: Normalize Admin and settings**

Use shared tabs, fields, action bars, status chips, and bounded sections.
Do not add new policy gates, confirmations, or approvals.

- [ ] **Step 3: Normalize personal and notification screens**

Use a compact working-page masthead and ledger/form composition appropriate
to high-frequency personal work.

- [ ] **Step 4: Verify and commit**

Run standard gates, inspect all routes, update inventory, and commit:

```powershell
git commit -m "feat(ui): normalize remaining workspaces"
```

---

### Task 13: Eliminate drift, run the full visual matrix, and obtain independent review

**Files:**

- Modify: `scripts/check-ui-contract.ts`
- Modify: `package.json`
- Modify: `docs/ui-migration-inventory.md`
- Modify only when audit findings require it: remaining authored `.tsx` and
  feature CSS files reported by `bun run ui:audit -- --check`.

**Interfaces:**

- Consumes: the zero-finding result from all migration tasks.
- Produces: `bun run check` including the enforced UI contract.

- [ ] **Step 1: Run the blocking audit**

Run:

```powershell
bun run ui:audit -- --check
```

Expected: exit `0` with zero raw-control or legacy-control findings. For each
remaining finding, migrate the source to the public UI API. Do not add a broad
allowlist to make the command green.

- [ ] **Step 2: Close the route inventory**

Every explicit authored route must be `reference`, `migrated`, or a narrowly
explained `intentional-exception`. No `pending` or `concurrent` rows may
remain.

- [ ] **Step 3: Add the UI audit to the repository check**

Insert `bun run ui:audit -- --check` after `bun run typecheck` in the
`package.json` `check` command.

- [ ] **Step 4: Run the visual verification matrix**

For every route archetype, inspect at 1440px, 1024px, and 390px:

- One populated route.
- One truthful zero-data route or section.
- Loading, error, busy, and disabled states where reachable.
- Keyboard-only navigation and visible focus.
- Dark mode if exposed by the current shell.
- Reduced-motion mode.

At minimum include Home, Events list, Event Staffing, Component Book, Component
detail, Demand, Stock, Prep, Roster, Pack Lists, Clients, Invoices, Tax,
Profit Margins, Reports, Facilities, and Admin.

- [ ] **Step 5: Run the complete repository gate**

Run fresh:

```powershell
bun run check
```

Expected: exit `0`. Read the full output; do not infer success from partial
gates.

- [ ] **Step 6: Obtain independent cross-model review**

Because Codex authored the diff, use an eligible non-author model. Preferred
command:

```powershell
agent -p --trust --model cursor-grok-4.5-high-fast "Review the UI normalization changes against DESIGN.md and docs/superpowers/specs/2026-07-25-ui-normalization-design.md. Ensure they preserve behavior, generated boundaries, accessibility, responsive behavior, and the botanical operations folio direction. Review the changes AND ensure they do NOT add tedium for app users via guardrails and policies that barely matter — this is a catering app, not a bank. Changes should REDUCE user tedium and let users actually use the app instead of being policy-denied every time they try to do anything. Flag any new guard, policy, approval, or validation that blocks a reasonable user action without a proportionate real-world reason. Return APPROVE or REJECT with concrete findings."
```

Expected: explicit `APPROVE`. A `REJECT` verdict must be fixed and reviewed
again; it must not be merged over.

- [ ] **Step 7: Commit the final gate**

Stage only the audit, package script, inventory, and any final authored UI
fixes. Commit:

```powershell
git commit -m "chore(ui): enforce the CapsuleX design contract"
```

- [ ] **Step 8: Hand off without deploying**

Report:

- Final branch and HEAD.
- `bun run check` evidence.
- Audit finding count.
- Route inventory totals.
- Independent reviewing model and verdict.
- Any intentional exception with its exact file and reason.

Do not deploy or merge without the owner's separate instruction.
