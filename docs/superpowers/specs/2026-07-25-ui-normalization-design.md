# CapsuleX UI Normalization Design

**Date:** 2026-07-25  
**Status:** Approved direction; pending owner review of written specification  
**Authority:** `DESIGN.md` remains the presentation authority. This document defines how authored React screens adopt it consistently.

## Objective

Normalize every authored CapsuleX screen around a reusable, accessible UI
system while improving the strongest existing visual direction. Finance Tax
and Profit Margins are reference-quality examples, not immutable templates.
The finished app should feel like one beautifully maintained catering
operations folio: editorial at the page level, precise and dense where real
work happens, and unmistakably consistent from workspace to workspace.

The implementation must improve presentation only. It must not redefine
Manifest-owned domain rules, permissions, lifecycles, constraints,
calculations, or consequences.

## Design Direction: The Botanical Operations Folio

CapsuleX should combine the composure of a service book with the urgency and
clarity of a live catering operation:

- Warm working paper sits inside the pale botanical application frame.
- Iowan Old Style creates memorable route and section titles; Archivo carries
  controls and working copy; IBM Plex Mono carries dates, money, counts, and
  other operational facts.
- Deep culinary green behaves primarily as ink, rules, and decisive actions.
- Saffron appears as a scarce editorial gesture: active-tab underline, focus
  ring, important count, or one small route accent.
- Fine rules, edge treatments, and aligned baselines create structure.
  Repeated floating cards do not.
- Empty space is deliberate and sectional. It must not make a working screen
  look unfinished.
- Motion is quiet and useful: small lift on primary actions, subtle row
  movement on hover, and restrained route/section entrance. Motion must
  respect `prefers-reduced-motion`.

The defining visual memory should be a large, calm editorial heading followed
by a beautifully ruled operational document that makes the next action
obvious.

## Scope

### Included

- Authored route and feature UI under `src/app/**`, `src/features/**`, and
  `src/ui/**`.
- Shared authored CSS, including `src/styles/app.css` and feature-owned style
  sheets.
- Reusable primitives, composed patterns, and route archetypes.
- Desktop, tablet, and mobile behavior for migrated screens.
- Accessibility, focus visibility, empty/loading/error states, and truthful
  disabled states.
- A screen inventory and migration ledger covering every route registered in
  `src/app/App.tsx`.

### Excluded

- Generated files and generated contract tests.
- Manifest source, Convex projections, schemas, wiring, or generated client
  bindings.
- Domain-policy or workflow changes.
- Invented data, sample activity, or decorative metrics.
- Deployment. Production deployment remains human-authorized.
- New or expanded tests unless the owner separately requests them. Existing
  verification gates remain mandatory.

## Component Architecture

The UI system has three levels. Screens should consume the highest useful
level instead of rebuilding lower-level markup.

### Level 1: Tokens and Native-Control Primitives

Tokens in `src/styles/app.css` remain the single runtime source for colors,
type, spacing, radii, rules, elevation, motion, and responsive breakpoints.
`DESIGN.md` remains the written authority.

The primitive API should include:

- `Button`
  - Variants: `primary`, `secondary`, `danger`, `quiet`.
  - Sizes: `compact`, `default`, and `hero`.
  - Renders a real button by default and supports a link-shaped composition
    without duplicating visual rules.
  - Standardizes height, padding, radius, typography, focus, busy, disabled,
    icon, and destructive presentation.
- `IconButton`
  - Requires an accessible label.
  - Uses the shared target size and focus treatment.
- `TextField`, `SelectField`, and `TextAreaField`
  - Own their visible label, optional description, error text, required
    indicator, disabled state, and stable control spacing.
  - Preserve native form behavior and accept normal React control props.
- `FieldGroup`
  - Aligns related controls without inventing form semantics.
- `StatusChip`
  - Variants map only to real semantic states: neutral, success, information,
    warning, and danger.
- `Rule`
  - Provides fine, strong, brand, and saffron treatments without ad hoc border
    declarations.

No feature component should set its own button height, radius, font family, or
focus ring after migration.

### Level 2: Document Components

These components encode CapsuleX's recurring operational grammar:

- `EditorialMasthead`
  - Eyebrow, title, concise description, optional facts, and one primary
    action region.
  - Supports journal, object, and compact working-page scales.
- `WorkspaceTabs`
  - Handles active state, keyboard focus, overflow, small-screen scrolling,
    and the restrained saffron underline.
- `DocumentSection`
  - Rule-led section with eyebrow, serif heading, supporting copy, optional
    actions, and content.
  - Variants: `plain`, `brand-rule`, `accent-rule`, and `inset`.
- `WorkingLedger`
  - Header, optional count/totals, controls, rows, and empty/loading/error
    states.
  - Supports dense operational lists without forcing table markup where a
    responsive list is more appropriate.
- `FormFolio`
  - A visibly bounded working form with strong top or left rule, aligned field
    grid, and consistent action footer.
  - Used for creation, assignment, filtering, and compact edit workflows.
- `MetricStrip`
  - Ruled metrics with truthful zeros and mono data rhythm.
- `EmptyState`
  - Variants: compact ledger, full section, and authored first-use state.
  - Requires a truthful title and description; action is optional.
- `FeedbackBanner`
  - Consistent information, warning, and failure presentation without raw
    exceptions or oversized alert cards.
- `ActionBar`
  - Groups one primary decision with secondary and destructive actions while
    preserving hierarchy and small-screen wrapping.

### Level 3: Route Archetypes

Routes compose document components through a small set of recognizable
archetypes:

- `EditorialOverview`: home, reports, analytical overview pages.
- `ObjectDossier`: event, client, component, menu, invoice, and other detail
  pages.
- `LedgerWorkspace`: inventory, purchasing, staffing, time, logistics, and
  finance registers.
- `ExecutionBoard`: prep, packing, delivery, quality, and live operations.
- `ReconciliationFolio`: closeout, margin, payroll, tax, and variance review.

Archetypes standardize composition and responsive behavior. They do not own
business data or command logic.

## Interaction and Visual Rules

### Actions

- One filled primary action per immediate decision region.
- Secondary actions use a visible strong hairline border.
- Destructive actions remain separate and use danger ink and border.
- Low-emphasis navigation uses the quiet variant or a text link, not a naked
  unstyled button.
- Loading actions preserve their width, expose busy state, and prevent
  duplicate submission.
- Disabled actions require an adjacent or discoverable reason when the reason
  is not obvious.

### Forms

- Every text input, select, and textarea has a defined border in its resting
  state and a saffron focus treatment.
- Labels sit above controls; descriptions and errors sit below.
- Controls align to a predictable grid and collapse to one column on narrow
  screens.
- Inline forms still receive a visual boundary through `FormFolio`, a rule,
  or an inset surface.
- Placeholder text never replaces a label.

### Ledgers and Lists

- Rows use fine separators and aligned columns, not floating cards.
- Hover uses soft inset color and at most a two-pixel horizontal shift.
- Primary identity appears first; status and actions remain quiet but visible.
- Empty, loading, and error rows preserve the ledger's boundaries.
- Dense desktop rows reflow into labeled value groups on mobile instead of
  shrinking into unreadable columns.

### Page Hierarchy

- Each route has one memorable serif focal title.
- Event and other object-detail pages keep identity and lifecycle context
  stable above local tabs.
- Sections use one serif heading plus small uppercase metadata; ordinary form
  labels and buttons remain Archivo.
- The sheet should feel filled by meaningful composition, even when data is
  empty. A zero-data route still has masthead, controls when useful, and a
  carefully bounded empty section.

### Responsive and Accessible Behavior

- All interactive targets remain at least 32px high; isolated icon targets
  remain at least 40px square.
- Keyboard focus is visible on every control.
- Color never carries state alone.
- Tabs, action groups, and field grids wrap or scroll without clipping.
- Reduced-motion preferences disable nonessential transforms and entrances.
- Semantic HTML is preserved: real buttons, labels, fieldsets, headings,
  lists, tables, and landmarks where appropriate.

## Event Staffing Reference Redesign

The current Staffing tab is the representative weak screen and the first
proof that the new system works.

It should become a compact workforce dossier inside the existing Event object
context:

1. A `DocumentSection` introduces staffing, coverage, and availability
   conflicts.
2. Assignment uses a bounded `FormFolio` with person and role fields, followed
   by one normal-width primary `Button`. The action must not stretch across an
   otherwise empty column.
3. Assigned staff appear in a ruled `WorkingLedger` with name, role, call
   time, assignment state, and a restrained unassign action.
4. Open shifts use a second `WorkingLedger` with role, description, claim
   state, and one clear creation action.
5. Zero states remain inside their ledger boundaries, so the screen looks
   intentionally empty rather than unfinished.
6. Mobile presentation stacks field groups and converts rows to labeled
   blocks while preserving event context.

No staffing behavior or domain gate changes as part of this visual migration.

## Migration Strategy

Migration is system-first, then screen-by-screen:

1. Inventory every registered authored route and classify its archetype,
   current quality, native-control count, and special CSS.
2. Implement tokens and Level 1 primitives.
3. Implement Level 2 document components.
4. Migrate Event Staffing as the reference proof.
5. Migrate the remaining Event dossier tabs.
6. Migrate workspaces in batches: Workforce; Inventory and Procurement;
   Logistics and Production; Clients and Commercial; Finance; Reports,
   Facilities, Admin, and remaining utility screens.
7. Remove superseded feature CSS only when no consumer remains.
8. Add an automated source audit that reports remaining direct authored
   controls and forbidden per-screen button/input styling. The audit begins as
   visibility, then becomes a gate after the migration reaches zero approved
   exceptions.

Each migration batch must begin by rechecking `git status` and the target-file
diff. Files actively modified by the Ralph loop or another session are skipped
until ownership is clear; they are never stashed, reset, or overwritten.

## Verification

No new or expanded tests are added unless the owner asks. Verification uses
the repository's existing gates and browser inspection:

- `bun run typecheck`
- `bun run format:check`
- `bun run test`
- `bun run build`
- `bun run check` before any completion claim

Visual verification covers representative routes for every archetype at:

- Wide desktop matching the supplied screenshots.
- Narrow desktop/tablet.
- Mobile.
- Keyboard-only interaction.
- Empty, populated, loading, error, disabled, and busy states where the
  current data and authored fixtures make them reachable.

The final screen inventory must show every authored route as migrated,
intentionally excepted with a concrete reason, or blocked by concurrent work.

## Success Criteria

- Every authored route is inventoried and reviewed against `DESIGN.md`.
- Shared primitives own recurring button, field, status, section, ledger,
  empty-state, and action-group presentation.
- Direct feature-level control styling is eliminated except for documented
  cases where the control is genuinely unique.
- Event Staffing has clear boundaries, balanced action hierarchy, and
  deliberate empty states without changing behavior.
- The strongest Finance screens remain visually coherent after adopting the
  same primitives.
- No generated surface is hand-edited.
- No Manifest policy or workflow behavior changes.
- No concurrent Ralph-loop work is overwritten or stashed.
- Existing `bun run check` passes before the work is called complete.
