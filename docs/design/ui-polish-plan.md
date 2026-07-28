# UI Polish Plan — from "works" to "wow"

**Date:** 2026-07-28. **Scope:** visual/UX only — zero behavior changes, zero manifest changes. Runs parallel to the functional gap-closure work (`capsule-fixes.txt` P0–P5); do not touch those items' logic, only their presentation.

## Diagnosis

Codebase survey (2026-07-28, ~99 rendered pages, 72k lines under `src/features`): CapsuleX **already has** a real design system — the editorial theme in `src/styles/app.css` (warm paper canvas, deep green ink `#31574f`, terracotta accent `#c8783f`, Archivo + serif display, full dark mode), shared primitives (`src/ui/primitives.tsx`), skeletons in 84 files, a shell with command palette and recents. The "developer screen" feel comes from **four specific, fixable failures**, not a missing design language:

1. **`StatusChip` leaks raw enum values.** Used 104× across 70 files, but its label map (`src/features/events/eventStatus.ts`) covers only the 10 Event stages. Everything else — vendor orders, shifts, proposals, deliveries, conflict statuses — renders the raw DB string (`pending_approval`, `partially_received`) in a gray fallback chip. This is the single biggest "unfinished" signal, and it's one component.
2. **Silently-broken color classes.** `text-success`, `text-error`, `bg-surface`, `text-ink-1`, `text-ok-darker`, `bg-error-soft` (~40 uses) and `btn-secondary` (20 uses) are **not defined** in the `@theme` block — they render as unstyled default text. Error banners aren't red; success toasts aren't green. E.g. `ImportRunDetailPage.tsx:359`, `PrepBoardPage.tsx:427`.
3. **Two competing style systems.** 30 bespoke feature CSS files (`supply-table`, `working-ledger`, `data-table`, `journal-grid`, …) duplicate the shared primitives. `PageHeader` is used on only ~19 of 103 pages; 90 pages hand-roll their `<h1>`. 93 direct `toLocaleDateString()` calls bypass `src/lib/format.ts`; money is sometimes `$${x.toFixed(2)}`.
4. **No landing pages — workspace roots redirect into CRUD lists.** `/finance`→invoices, `/staff`→roster, `/inventory`→demand, etc. (11 `<Navigate>` routes in `App.tsx`). Only Home and Kitchen have real overviews. Users land in a dense table with no orientation. The `src/ui/charts/` kit (StatCard, BarChart, DashboardGrid) already exists and is barely used.

Plus smaller leaks: dead "Future workspaces" drawer in the sidebar (opens to zero links) and `PlannedAreaPage.tsx` roadmap-speak ("Planned — not yet built… one proven vertical slice at a time"); `NAV_GROUPS` (Operate/People/Business/System) defined in `nav.ts` but the sidebar renders one flat 12-item list; `EventCreatePage.tsx` is one flat sheet of 62 form fields; 3 user-visible `JSON.stringify` dumps; raw Convex IDs in admin/import subtitles and `EventSourceProvenancePanel`; 114 ad-hoc "No X" empty strings vs 11 uses of the shared `EmptyState`; no mobile nav at all (`max-md:hidden`).

## North star

Commit **harder** to the identity that's already there: *a beautifully composed service document*. The best screens (EventsListPage, PrepBoard's KPI strip, Home's journal dashboard) already read like a well-set catering BEO — paper surface, ledger tables, eyebrow labels, serif display headings, tight radii. The plan is not "redesign" — it is **promote the editorial system to law, and make every screen obey it**. A user should never see a snake_case word, a raw ID, an unformatted date, or a colorless status — and should land on an overview that tells them *what needs attention today*, not a table.

---

## Phase 0 — Kill the silent failures (mechanical, highest wow-per-hour)

Pure sweeps; safe to delegate to composer-2.5 with grep-verifiable done-criteria.

**0.1 Status label registry.**
- Create `src/lib/statusLabels.ts`: one `formatStatusLabel(value: string): string` (Title Case, de-snake, curated overrides map for domain terms — "PO sent", "On-site", "Closed out"), plus per-domain chip color maps (order/shift/proposal/delivery/conflict statuses → existing `ok/info/warn/danger/mute` token classes).
- Change `StatusChip` fallback in `src/ui/primitives.tsx` to run `formatStatusLabel(status)` instead of rendering `status` raw. That alone fixes ~90 call sites without touching them.
- Sweep the 53 non-chip raw enum renders (`{event.eventType}` in `EventDetailPage.tsx:196`, `{client.clientType} · {client.status}`, `{lead.source}`, etc.) through the same helper.
- **Done when:** grep for rendered snake_case finds nothing; the four ad-hoc `.replace(/_/g," ")` sites use the shared helper.

**0.2 Define or replace the phantom classes.**
- Decision: **replace, don't add** — map `text-success`→`text-ok`, `text-error`→`text-danger`, `bg-surface`→`bg-panel`, `text-ink-1`→`text-ink`, `bg-error-soft`→`bg-danger-soft`, `text-ok-darker`→`text-ok`. Add `.btn-secondary` to `app.css` (it has 20 real callers; style: panel surface, `line-2` border, ink text — between primary and ghost).
- **Done when:** grep for `success|error|surface|ink-1|ok-darker` utility classes in `src/features` returns zero, and every color utility used resolves to a `@theme` token.

**0.3 One formatter.**
- Sweep the 93 `toLocale*` calls and money `toFixed(2)` sites through `src/lib/format.ts` (`formatDate`, `formatTime`, `formatMoney`). Delete the shadow `formatDate` in `ImportRunDetailPage.tsx:324`.
- **Done when:** grep for `toLocaleDateString|toLocaleTimeString|toLocaleString(` in `src/features/**/*.tsx` returns zero (allow `lib/format.ts` internals).

**0.4 Hide the plumbing.**
- Raw Convex/external IDs (`ImportRunDetailPage.tsx:351`, `ParallelRunDashboardPage.tsx:849/853`, `PersonalDataExportPage.tsx:296`) → move behind a copy-to-clipboard "Reference" affordance or a `<details>`; never in a page subtitle. Import/migration admin screens may keep an "External ID" column — that's their job — but styled as `font-mono text-ink-3`, not headline content.
- The 3 rendered JSON dumps (`EventSourceProvenancePanel.tsx:83`, `SyncErrorsPanel.tsx:134`, `ImportRunDetailPage.tsx:722`) stay collapsible-only, restyled as an intentional "raw record" inspector (mono, inset surface, copy button) — for provenance these are a feature, not a leak.

## Phase 1 — One system, everywhere

**1.1 Adopt the existing global ledger vocabulary.** (Corrected 2026-07-28: `supply-masthead`/`supply-table`/`working-ledger`/`operations-stage`/`data-table` already live in `app.css` — they are shared, just domain-named. The ~29 per-feature CSS files are page-specific layout, not duplicated systems.) So 1.1 collapses into 1.2: put every page on the shared masthead/ledger classes; no extraction or renaming churn needed.

**1.2 `PageHeader` (or the new masthead) on all ~103 pages.** Kill the 90 hand-rolled `<h1>`s. Every page gets: eyebrow (workspace name), title, one-line lead written for the *user's job* (not the entity name), actions right-aligned.

**1.3 Empty states with a next step.** Replace the 114 ad-hoc "No X" strings with `EmptyState` — and upgrade `EmptyState` to accept a CTA (the `PurchasingPage.tsx:420` two-link pattern is the model). Every list empty state answers "so what do I do?": "No proposals yet — create one from an event, or start from a quote."

**1.4 One failure banner.** Collapse `FailureBanner`/`CrmFailureBanner`/`FinanceFailureBanner`/`ReportsFailureBanner`/`SupplyFailureBanner`/`CulinaryFailureBanner` into one shared component with a domain prop. Guard-rejection copy speaks user language ("Assign a driver first"), never "Action failed unexpectedly" — coordinate with `capsule-fixes.txt` items 6–7, which fix the *logic*; this phase owns the *copy and styling*.

## Phase 2 — Information hierarchy on the money screens

Screen-by-screen passes, in traffic order. Design-taste work — route to a taste ≥ 7 model, verify each in the prod UI.

| Screen | Fix |
|---|---|
| `ProposalsPage.tsx` (1,290 lines) | Split: list route + create route (inline mega-form out). Adopt shared masthead + ledger table. Mapped status chips. This is the sales front door — it should be the flagship. |
| `EventCreatePage.tsx` (62 flat fields) | Progressive disclosure: 4 sections — *Basics* (client, date, type, headcount), *Venue & logistics*, *Money*, *Details* — collapsed accordion or stepped, with only Basics required to save a draft. No new validation; same submit. |
| `MyDayPage.tsx` | Field staff on a phone: card-first layout, big touch targets, mapped chips, shared EmptyState. This page plus mobile nav (Phase 3) is the mobile story. |
| `RosterPage.tsx` | Move the two inline create forms behind "Add" disclosure buttons; coverage table first, forms second. |
| `EventDetailPage.tsx` | Already good; fix `:196` raw eventType, align tab bar styling with the shared system. |
| `PurchasingPage.tsx`, `StockBookPage.tsx` | Formatting sweeps land in Phase 0; here: reconcile to shared ledger classes. |
| `InvoiceDetailPage.tsx` | Adopt shared system; invoice should visually echo the printed artifact (it's a service document — lean into the editorial look). |

## Phase 3 — Wayfinding: "I know exactly where to go"

**3.1 Grouped sidebar.** `NAV_GROUPS` already exists in `nav.ts` and is dead data — render it. Icon rail gains subtle group separators + tooltips; the module drawer becomes the labeled full-nav (grouped, with descriptions) instead of the dead "Future workspaces" popover. Delete `PlannedAreaPage` roadmap copy path entirely.

**3.2 Workspace landing pages replace redirects.** For each of the 11 `<Navigate>` roots, a one-screen overview built from the existing `src/ui/charts` kit: 3–4 `StatCard`s (from queries the workspace's list pages already run), an "attention" list (items needing action — matches Home's `attention-ledger` pattern), and prominent links into the sub-pages. Order of build: Finance, Staff, Logistics, Inventory, Clients, Facilities. Kitchen/Home already have theirs. *This is the single biggest "wow, I know where I am" change.*

**3.3 Workspace sub-nav parity.** 7 of 12 areas have `*WorkspaceNav`; give the remaining areas the same second tier so depth is always visible.

**3.4 Mobile nav.** (Corrected 2026-07-28: a mobile "Menu" dropdown already exists in the Topbar for `max-md` — the survey's "no mobile nav" was wrong.) Optional polish only: a bottom tab bar (Home, Events, My Day, More) would beat the dropdown for field staff, but the dropdown covers the need.

## Phase 4 — The wow layer

Only after 0–3; polish on a clean base.

- **Arrival motion:** staggered fade/rise on masthead → KPI strip → table (CSS only, `animation-delay`, respect `prefers-reduced-motion`). One well-orchestrated page load beats scattered micro-interactions.
- **Display type on the mastheads:** the serif `--font-display` is defined but underused — page titles on landing pages and detail mastheads use it; tables/controls stay Archivo.
- **Paper depth:** the Home canvas gradient + grain treatment extended to all workspace landing pages so "overview = paper journal, working list = crisp ledger" becomes the recognizable rhythm.
- **Chip color audit:** every status family gets a deliberate hue story (draft=mute, in-motion=info, needs-you=warn/accent, done=ok, dead=danger) — consistent across domains so color itself becomes navigation.

## Guardrails

- No behavior, guard, route-logic, or manifest changes. Presentation, copy, and navigation structure only. New routes limited to the landing pages (3.2) and the Proposals create split (Phase 2).
- Don't touch files while `capsule-fixes.txt` items are mid-flight on them (`MenuProfitabilityPanel`, delivery/pack pages' logic, signature flow); presentation passes on those screens wait for the fixes to land.
- Every phase-0 sweep has a grep-based done-check (listed above); add them to a `scripts/` lint or a checklist, not to CI gates without owner sign-off.
- `bun run check` green after every commit; verify Phase 2/3 screens in the actual prod UI (three of last session's bugs were invisible to static gates).
- Per repo rules: no new tests unless the owner asks; no new dependencies (charts kit, primitives, and Tailwind tokens cover everything above).

## Execution routing (per model rubric)

- Phase 0 sweeps + Phase 1.2/1.3 adoption: composer-2.5, one sweep per commit, grep proof in the commit message.
- Phase 1.1 (promoting the ledger system), Phase 2 screens, Phase 3.2 landing pages, Phase 4: taste ≥ 7 (fable-5 / opus-4.8 / gpt-5.6-sol), verified in-browser.
- Independent review of each phase's diff by a non-author model per the merge gate, including the standard "does not add user tedium" clause.

**Suggested order:** 0.1 → 0.2 → 0.3 (one day, transforms perceived quality) → 3.1 + dead-drawer removal (an hour, removes the "under construction" smell) → 1.2/1.3 → 3.2 landing pages → Phase 2 screens → 1.1/1.4 consolidation → 3.4 mobile → Phase 4.
