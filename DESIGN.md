---
version: alpha
name: CapsuleX
description: CapsuleX is an event-centered catering operations system that makes one governed plan legible across commercial, culinary, inventory, production, workforce, logistics, quality, finance, and reporting work through warm working paper, pale botanical framing, deep culinary-green ink, restrained saffron gestures, editorial serif display type, and dense rule-led operational documents.

colors:
  canvas: "#dfe8da"
  panel: "#fffefa"
  inset: "#f1f3ed"
  sage: "#dfe8da"
  sage-2: "#cbd9c6"
  ink: "#24322d"
  ink-2: "#53615b"
  ink-3: "#7b867f"
  brand: "#31574f"
  line: "#dde1d9"
  line-2: "#c8cec5"
  rail: "#f7f8f4"
  rail-2: "#edf1ea"
  rail-ink: "#46534e"
  rail-dim: "#87918b"
  accent: "#c8783f"
  accent-deep: "#9c572d"
  accent-soft: "#f3e2d4"
  success: "#3d7253"
  success-soft: "#e4efe2"
  info: "#40598a"
  info-soft: "#e4e9f4"
  warning: "#8a641c"
  warning-soft: "#f5ecd4"
  danger: "#a23a2b"
  danger-soft: "#f7e2dc"
  on-brand: "#ffffff"

typography:
  journal-display:
    fontFamily: Iowan Old Style
    fontSize: clamp(39px, 5vw, 68px)
    fontWeight: 400
    lineHeight: 0.92
    letterSpacing: -0.045em
  object-display:
    fontFamily: Iowan Old Style
    fontSize: clamp(35px, 4.7vw, 66px)
    fontWeight: 400
    lineHeight: 0.92
    letterSpacing: -0.05em
  section-display:
    fontFamily: Iowan Old Style
    fontSize: clamp(26px, 3.25vw, 47px)
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: -0.035em
  section-heading:
    fontFamily: Iowan Old Style
    fontSize: 30px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: -0.02em
  card-heading:
    fontFamily: Iowan Old Style
    fontSize: 22px
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: -0.01em
  breadcrumb:
    fontFamily: Iowan Old Style
    fontSize: 19px
    fontWeight: 400
    fontStyle: italic
    lineHeight: 1.3
    letterSpacing: 0
  body-large:
    fontFamily: Archivo Variable
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: 0
  body:
    fontFamily: Archivo Variable
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0
  button:
    fontFamily: Archivo Variable
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0.06em
  label:
    fontFamily: Archivo Variable
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0.04em
  eyebrow:
    fontFamily: Archivo Variable
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0.09em
  mono-data:
    fontFamily: IBM Plex Mono
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.02em
  micro:
    fontFamily: Archivo Variable
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.06em

rounded:
  xs: 3px
  sm: 5px
  md: 10px
  ledger: 14px
  sheet: 22px
  pill: 9999px

spacing:
  xxs: 3px
  xs: 6px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  section: 42px
  sheet-x: 48px
  sheet-y: 44px

components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    height: 40px
    padding: 0 22px
  button-ghost:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    borderColor: "{colors.line-2}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    height: 40px
    padding: 0 20px
  button-danger:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.danger}"
    borderColor: "{colors.danger}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    height: 40px
    padding: 0 20px
  text-link:
    backgroundColor: transparent
    textColor: "{colors.brand}"
    typography: "{typography.label}"
    padding: 0
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    borderColor: "{colors.line-2}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    height: 32px
    padding: 0 10px
  status-chip:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-brand}"
    typography: "{typography.micro}"
    rounded: "{rounded.pill}"
    height: 30px
    padding: 0 15px
    variants: solid semantic fill — success, warning, danger, brand
  meta-chip:
    backgroundColor: "{colors.inset}"
    textColor: "{colors.ink-2}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: 28px
    padding: 0 14px
  fact-pair:
    labelTypography: "{typography.label}"
    labelTransform: uppercase
    valueTypography: "{typography.body}"
    textColor: "{colors.ink}"
    gap: 6px
  section-rule:
    labelTypography: "{typography.eyebrow}"
    labelTransform: uppercase
    ruleColor: "{colors.ink}"
    ruleHeight: 1.5px
    trailingTypography: "{typography.body}"
    trailingColor: "{colors.ink-3}"
  attention-band:
    backgroundColor: "{colors.sage}"
    borderColor: "{colors.sage-2}"
    padding: 17px 0 19px
    bleed: full sheet width
  navigation-rail:
    backgroundColor: "{colors.panel}"
    borderColor: "{colors.line}"
    textColor: "{colors.rail-ink}"
    activeBackgroundColor: "{colors.brand}"
    activeTextColor: "{colors.on-brand}"
    activeRounded: "{rounded.sm}"
    width: 94px
    placement: inside the workspace sheet, divided by a hairline
  workspace-sheet:
    backgroundColor: "{colors.panel}"
    borderColor: "{colors.brand}"
    rounded: "{rounded.sheet}"
    padding: 44px 48px
  editorial-masthead:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.journal-display}"
    padding: 6px 0 39px
  attention-ledger:
    backgroundColor: "#eef2e9"
    textColor: "{colors.ink}"
    rounded: "{rounded.ledger}"
    padding: 23px
  outlook-strip:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    borderColor: "{colors.line}"
    padding: 18px 0 23px
  service-list:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    borderColor: "{colors.line}"
    typography: "{typography.body}"
  recipe-index-row:
    backgroundColor: "{colors.panel}"
    hoverBackgroundColor: "{colors.inset}"
    textColor: "{colors.ink}"
    borderColor: "{colors.line}"
    typography: "{typography.body}"
  culinary-detail-section:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    borderColor: "{colors.ink}"
    typography: "{typography.body}"
---

## Overview

CapsuleX is the operating system for organizations that plan, produce, staff, deliver, and execute catered events. It should feel like a beautifully maintained service book rather than a generic administration dashboard. The application sits inside a pale botanical frame. Its working surfaces are warm white, its primary ink is a deep culinary green, and its hierarchy comes from editorial serif type, fine rules, measured negative space, and dense operational lists.

One governed Event is the product spine. Client planning, menu composition, ingredient demand, stock, purchasing, prep, staffing, packing, delivery, quality, billing, closeout, and reporting are different working views of the same operational reality. The interface must reveal those relationships without redefining their rules. Manifest owns entities, lifecycles, permissions, constraints, calculations, and consequences; CapsuleX owns how operators understand and act on that truth.

The system has two complementary modes. Overview pages are spacious and journal-like, giving one operational subject clear dominance. Working pages become denser for recipes, events, costing, staffing, execution, and reconciliation, but retain the same typography, rules, and material palette. The interface should remain calm when the operation becomes busy.

The Galley images stored in [`docs/design-references/galley`](docs/design-references/galley) are the primary compositional reference. Capsule may adopt their editorial clarity, botanical atmosphere, document hierarchy, and dense culinary-workspace principles. Capsule must not copy Galley's identity, text, logo, proprietary imagery, or exact layouts.

**Key Characteristics:**

- Warm-white working sheets inside pale sage application framing.
- A slim light icon rail instead of a dominant dark sidebar.
- Characterful serif display type paired with precise Archivo interface text.
- Deep green as structural ink and primary action color.
- Saffron used as a small editorial gesture, not a broad surface fill.
- Fine rules, ledgers, and document sections preferred over repeated cards.
- One dominant focal point on overview pages.
- Dense, readable working documents for every operational discipline.
- Event context and downstream consequences remain visible across system boundaries.
- Governed actions expose real availability, blockers, and lifecycle outcomes.
- Truthful loading, empty, and zero-data states without invented activity.

## Product Experience Contract

### One shared reality

- Every workspace must make its relationship to the governed Event, Client, or Organization clear.
- A system may summarize another system's facts, but it links to the owning workspace for editing.
- Cross-system consequences are described as effects of Manifest commands and reactions, never recreated in component state or UI middleware.
- Generated capability metadata determines action inputs, lifecycle transitions, invalidation, and failure categories. A visible button is not proof that an action is currently legal.

### Truthful capability

- “Generated” means a contract exists; it does not by itself mean an end-to-end workflow has been verified.
- A workflow can ship only when its queries, commands, auth, empty/error states, and required reactions are proven in the current projection.
- Projection blockers appear as explicit unavailable or degraded states. The UI must not silently simulate missing search, precision, concurrency, encryption, or automation semantics.
- Planned systems stay out of primary navigation until their first coherent operator outcome ships.

### Role-shaped work

The visual language stays consistent across roles, but information priority changes with the job. Sales sees client decisions and commercial readiness; kitchen sees quantities, deadlines, and blockers; inventory sees demand and shortage; workforce sees coverage and time; logistics sees packed/loaded/delivered state; finance sees governed balances and closeout. Role shaping changes emphasis and available commands, not domain meaning.

## Colors

### Brand & Accent

- **Culinary Green** (`#31574f`): Primary actions, active navigation, strong links, and structural emphasis.
- **Main Ink** (`#24322d`): Display headings, object names, and primary body text.
- **Saffron** (`#c8783f`): Hand-drawn underlines, small counts, and editorial cues.
- **Deep Saffron** (`#9c572d`): Hover states and warning-adjacent editorial labels.

Green should usually behave like ink rather than a large fill. Dark green panels are allowed only when a task needs a singular high-contrast working mode; they are not the default expression of “premium.” Saffron should remain scarce enough to preserve meaning.

### Surface & Background

- **Botanical Canvas** (`#dfe8da`): Application atmosphere around the working sheet.
- **Working Paper** (`#fffefa`): Route surface, controls, lists, and reading areas.
- **Soft Inset** (`#f1f3ed`): Hover rows, quiet groupings, and secondary content.
- **Light Rail** (`#f7f8f4`): Desktop navigation surface.
- **Rail Hover** (`#edf1ea`): Navigation and module hover surface.
- **Attention Sage** (`#eef2e9`): Open-decision and exception ledger.

### Text & Rules

- **Secondary Ink** (`#53615b`): Supporting explanations and secondary values.
- **Quiet Ink** (`#7b867f`): Helper copy, timestamps, placeholders, and labels.
- **Fine Rule** (`#dde1d9`): Standard row and section separation.
- **Strong Rule** (`#c8cec5`): Masthead boundaries and emphasized divisions.

### Semantic

- **Success** (`#3d7253`) / **Success Soft** (`#e4efe2`)
- **Information** (`#40598a`) / **Information Soft** (`#e4e9f4`)
- **Warning** (`#8a641c`) / **Warning Soft** (`#f5ecd4`)
- **Danger** (`#a23a2b`) / **Danger Soft** (`#f7e2dc`)

Semantic color reinforces labels and icons but never carries state alone.

### Gradient System

Capsule does not use gradients as generic component fills. The current canvas uses a restrained pale-sage field with a soft white radial lift at the upper left. Any future rich gradient must be attached to real culinary media or an intentional full-page atmosphere, never buttons, cards, or status.

## Typography

### Font Family

- **Display:** `Iowan Old Style`, falling back to `Palatino Linotype`, `Book Antiqua`, Palatino, Georgia, and serif.
- **Body/UI:** `Archivo Variable`, falling back to Archivo, `system-ui`, and sans-serif.
- **Operational data:** `IBM Plex Mono`, falling back to `Cascadia Mono`, `ui-monospace`, and monospace.
- **Icons:** Thin 16px geometric SVG icons from `src/ui/icons.tsx`.

The serif creates identity; Archivo carries controls and dense information; IBM Plex Mono is reserved for dates, amounts, counts, keyboard shortcuts, and other values that benefit from fixed rhythm.

### Hierarchy

| Role            | Font            |    Size | Weight | Line Height | Letter Spacing | Notes                                    |
| --------------- | --------------- | ------: | -----: | ----------: | -------------: | ---------------------------------------- |
| Journal Display | Iowan Old Style | 39–68px |    400 |        0.92 |       -0.045em | Page-defining editorial title.           |
| Object Display  | Iowan Old Style | 35–66px |    400 |        0.92 |        -0.05em | Event, recipe, menu, or client name.     |
| Section Display | Iowan Old Style | 26–47px |    400 |        0.98 |       -0.035em | Dominant section or empty-state line.    |
| Section Heading | Iowan Old Style |    30px |    400 |        1.00 |        -0.02em | Ledger and working-document sections.    |
| Card Heading    | Iowan Old Style |    22px |    400 |        1.10 |        -0.01em | Small document blocks and annotations.   |
| Breadcrumb      | Iowan Old Style |    19px | 400 it |        1.30 |              0 | Route context above a page title.        |
| Body Large      | Archivo         |    16px |    400 |        1.70 |              0 | Page descriptions and important help.    |
| Body            | Archivo         |    15px |    400 |        1.60 |              0 | Default interface and document copy.     |
| Button          | Archivo         |    14px |    600 |        1.00 |         0.06em | Primary and secondary actions, uppercase.|
| Label           | Archivo         |    14px |    700 |        1.40 |         0.04em | `fact-pair` labels, uppercase.           |
| Eyebrow         | Archivo         |    14px |    700 |        1.40 |         0.09em | `section-rule` labels, uppercase.        |
| Mono Data       | IBM Plex Mono   |    15px |    500 |        1.40 |         0.02em | Times, money, counts, and relative time. |
| Micro           | Archivo         |    13px |    600 |        1.40 |         0.06em | Chip text, uppercase.                    |

**Floors.** Body never falls below 15px and supporting metadata never below 13px. Uppercase is a deliberate device for labels, chips, and buttons — it is never a way to make text small. There is no type role under 13px.

### Principles

- Use one memorable serif headline per major region; do not make every label decorative.
- Use size and composition before bold weight.
- Keep interface controls in Archivo even when they sit next to a serif object name.
- Uppercase text is limited to short eyebrows, table headings, and operational metadata.
- Body copy should remain compact; this is an operating system, not a magazine article.
- Links may use saffron underline gestures only when the gesture contributes to editorial hierarchy.

## Layout

### Spacing System

The base UI rhythm is compact: `3px`, `6px`, `8px`, `12px`, `16px`, `24px`, and `32px`. Editorial pages add larger intervals at `42px`, `44px`, and `48px` around primary sections.

Spacing changes with the mode of work. Overview pages use open intervals to create one clear focal point. Tables, recipe components, procedures, forms, and event records use smaller repeated spacing with strong alignment.

### Grid & Container

- The global shell uses a fixed 72px desktop rail and a flexible route region.
- The route region receives 18–22px of botanical frame before the working sheet.
- The working sheet is capped at 1440px and uses 48px horizontal / 44px vertical desktop padding.
- Home uses a `1.55fr / 0.68fr` journal grid: service brief left, decision ledger right.
- Supporting metrics use a four-column ruled strip, collapsing to two columns on mobile.
- Service and catalog lists use full-width rows with a strong leading identifier and quiet trailing state.
- Detail pages use a full-width reading flow; secondary information may form an inset side region only when it remains subordinate.
- Split-pane workbenches are reserved for tasks that require source/result comparison.

### Whitespace Philosophy

Whitespace establishes editorial authority and focus. It is not permission to leave an empty canvas below a small card grid. A route should use its available sheet: large object title and brief, then meaningful rule-led content. Dense work should become denser by reducing interval size, not by surrounding every element with a box.

## Elevation & Depth

Capsule is primarily flat. Depth comes from the botanical frame, working-paper sheet, surface tint, borders, and small overlaps.

| Level    | Treatment                                          | Use                                                     |
| -------- | -------------------------------------------------- | ------------------------------------------------------- |
| Flat     | No shadow, panel or transparent surface            | Titles, lists, tables, and document sections            |
| Ruled    | 1px `line` or `line-2`                             | Ledgers, catalog rows, metadata, and section boundaries |
| Inset    | Pale sage or `inset` fill                          | Attention areas, hover rows, and quiet empty regions    |
| Sheet    | 22px radius, subtle green border, broad low shadow | Primary route surface                                   |
| Floating | 10px radius and restrained shadow                  | Command palette, module drawer, and menus               |

Heavy drop shadows, glass panels, glow, and layered floating cards are not part of the system.

## Shapes

### Radius Scale

| Token    |  Value | Role                                       |
| -------- | -----: | ------------------------------------------ |
| `xs`     |    3px | Inputs, standard buttons, compact controls |
| `sm`     |    5px | Cards, rows, utility surfaces              |
| `md`     |   10px | Menus and compact grouped panels           |
| `ledger` |   14px | Attention and authored empty-state regions |
| `sheet`  |   22px | Primary route sheet                        |
| `pill`   | 9999px | Status chips, tags, icon-nav active state  |

### Image Treatment

Culinary imagery is functional and specific. Use it for a recipe hero, step photograph, venue context, or import source—not as decorative dashboard wallpaper. Images should be calm, naturally lit, and cropped with intent. A recipe may render without an image; missing media must not create a broken card or fake placeholder photography.

Botanical forms may appear in the outer frame or an authored zero state. They should remain low contrast and must never interfere with reading or controls.

## Components

### **`navigation-rail`**

94px light vertical rail that lives **inside** the workspace sheet, separated from the document by a single hairline rather than floating as its own surface. It carries a 42px circular Capsule mark and 46px icon targets. Active navigation uses a brand-green filled rounded rectangle, not a circle. Only shipped, canonical workspaces remain persistent. Planned modules live in the bottom overflow drawer and do not compete with available work; legacy Capsule-Pro areas without current Manifest authority do not appear as promises.

### **`workspace-sheet`**

Warm-white route surface inside the botanical canvas. Desktop radius is 22px with a subtle green border and broad low-opacity shadow. Default desktop padding is 44px 48px. The sheet is the **only** rounded surface on the page: it holds the rail and the whole document, and its children are separated by rules, bands, and spacing rather than by nested cards.

### **`editorial-masthead`**

Italic serif breadcrumb, large serif page title, a row of `fact-pair` values, and one primary route action aligned right. The breadcrumb carries the route's context — a date on an operational page, a collection name on an object page — in saffron with a fine underline. No decorative underline sits beneath the title itself. Search and filtering belong below or beside the masthead according to page density.

### **`button-primary`**

Deep-green pill action with 40px height and an Archivo 14px semibold uppercase label, tracked 0.06em. Use once per immediate decision region. Secondary actions beside it are `text-link`, not a second filled button.

### **`fact-pair`**

The primary way operational values appear: a bold uppercase Archivo label, a colon, and the value in regular body weight on the same line — `VENUE: Willow Barn`. Pairs sit in a horizontal row separated by generous gaps and wrap as a group. Prefer a row of fact-pairs to a table whenever the values are read rather than compared.

### **`section-rule`**

A document section opens with a bold uppercase label, then a fine dark rule running to the right margin, then optional quiet trailing context on the far right. This is the only section divider on a working page. Do not introduce a card, a heading block, or a coloured header bar in its place.

### **`attention-band`**

Exceptions and open decisions sit in a pale-sage band that bleeds the full width of the sheet, bounded top and bottom by a sage hairline. It is the one surface change permitted inside the sheet, and it exists so that what needs a decision outranks everything else on the page without becoming a card.

### **`button-ghost`**

Warm-white secondary action with a strong hairline border. Hover uses the soft inset surface. It must remain visibly secondary to the filled primary action.

### **`button-danger`**

Warm-white action with danger text and restrained danger border. Destructive actions stay separate from routine primary actions and require explicit confirmation.

### **`text-link`**

Small uppercase Archivo link in brand green, often paired with a directional arrow. Used for “View all,” “Open brief,” and low-emphasis navigation. Hover shifts toward deep saffron.

### **`input`**

32px warm-white control with 3px radius and strong hairline border. Focus uses saffron. Search may use a full pill shape when it is a global or catalog-level search affordance.

### **`status-chip`**

30px pill with a **solid** semantic fill and white uppercase text at 13px, tracked 0.06em. Reserved for real lifecycle state and severity — delivered, ready, blocked, critical, high. Its weight is the point: a solid chip is a claim about state, so it must be earned.

### **`meta-chip`**

28px pill on the pale inset surface with dark sentence-case text. Carries tags, allergens, dietary markers, and counts — facts that qualify an object rather than state it. Do not turn ordinary metadata into either chip; most values belong in a `fact-pair`.

### **`attention-ledger`**

Pale-sage inset region for exceptions and open decisions. It uses a serif heading, circular count, numbered ruled entries, and plain-language reason. The empty state is “nothing is asking for you,” not a celebratory analytics card.

### **`outlook-strip`**

Rule-led metrics beneath the primary focal point. Values use display or mono rhythm; labels stay small and quiet. It replaces generic equal-weight KPI cards and must preserve truthful zeros.

### **`service-list`**

Full-width ordered list with a date block, serif object name, client or context, count, relative time, and status. Rows use fine bottom rules. Hover introduces a quiet inset fill and small horizontal movement.

### **`recipe-index-row`**

Recipe Book catalog row with a strong serif recipe name, category/cuisine context, real tags, active state, and version availability. Optional imagery remains secondary. Search and filters operate on live Recipe data; no sample recipes are injected to fill the page.

### **`culinary-detail-section`**

Full-width recipe or dish section introduced by an uppercase label and horizontal rule. Recipe identity, current version, ingredients, procedures, costing, and operational uses remain distinct sections. Sections with no backing capability are omitted or explained honestly.

### **`recipe-import-workbench`**

Future two-pane source/result workspace based on the stored import reference. The source pane is quiet and document-like; the parsed recipe pane receives stronger action hierarchy. This component must not ship until import behavior exists.

### **`event-dossier`**

The cross-system object view. It keeps event identity, lifecycle, owner, client, venue, headcount, timing, and readiness in a stable masthead, then organizes linked work as a service brief rather than a tab dump. Sections summarize culinary, demand, production, staffing, logistics, commercial, quality, and closeout facts and link to their owning workspaces.

### **`working-ledger`**

A dense, ruled list for stock, purchasing, prep, assignments, time, and financial facts. It supports deterministic sorting, compact filters, explicit totals, row-level exceptions, and one clear batch or creation action. It is preferred over grids of summary cards.

### **`execution-board`**

A state-forward operational surface for prep, packing, delivery, incidents, and other live work. Group rows by real responsibility or lifecycle stage, not decorative columns. Claims, blockers, quality failures, missing items, and deadlines receive stronger hierarchy than completed work.

### **`reconciliation-folio`**

A quiet, document-like closeout surface that compares governed planned and actual facts, calls out unresolved variances, and makes finalization consequential. Currency and quantities use tabular rhythm; totals never outrun their verified precision contract.

## System Workspace Patterns

| System               | Primary artifact                      | Default archetype                   | Distinctive composition                                                 |
| -------------------- | ------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| Home                 | Today's operational attention         | Operational journal                 | One next service or exception ledger, then a ruled outlook              |
| Events               | Governed event plan                   | Pipeline + event dossier            | Stage spine, service brief, readiness, linked work                      |
| Culinary             | Recipe, dish, menu                    | Book + detail document              | Catalog index, full-width recipe sections, event menu composition       |
| Inventory            | Demand and stock position             | Working ledger                      | Demand/available/reserved/shortage alignment by ingredient and location |
| Procurement          | Purchase need and vendor order        | Queue + order folio                 | Demand provenance beside order/receipt progress                         |
| Production & quality | Prep task and production batch        | Execution board                     | Due work, claims, blockers, batch yield, quality gates                  |
| Workforce            | Assignment, shift, availability, time | Roster + time sheet                 | Event coverage, availability conflicts, check-in/out, qualifications    |
| Logistics            | Pack list and delivery                | Dispatch manifest                   | Missing → packed → loaded → dispatched → delivered trace                |
| Commercial           | Client, proposal, contract, invoice   | Account dossier + document pipeline | Client context beside governed commercial documents                     |
| Closeout & reports   | Event closeout and saved report       | Reconciliation folio                | Planned/actual facts, unresolved issues, explicit finalization          |

Each system's authoritative experience and implementation status lives in [`docs/systems/index.md`](docs/systems/index.md). This file owns shared presentation language, not domain rules or slice status.

## Recipe Book Patterns

### Catalog

- Route family begins at `/kitchen/recipes`.
- Masthead uses “Recipe book,” a live result count, catalog search, and one “New recipe” action.
- Default order must be deterministic and useful; search covers real name, category, cuisine, description, and tags.
- Recipes, Dishes, and Ingredients are sibling working views. Menus are a separate composition surface.
- Empty state: “Every kitchen needs a house book,” explanation, and “Create first recipe.”

### Detail

- Collection link above a large serif recipe name.
- Identity facts appear directly below the title: category, cuisine, status, and tags supported by live data.
- Ingredients and procedures use ruled full-width sections rather than isolated cards.
- Edit controls stay close to the field or section they mutate.
- Destructive actions remain visually subordinate.
- Do not invent yield, prep time, allergens, nutrition, costing, media, or procedures when the current entity graph does not provide them.

### Workbench

- Two panes only when the operator must compare source and parsed result.
- The primary editing pane receives the stronger border and action hierarchy.
- Controls remain aligned to the content they mutate.
- Mobile collapses to a deliberate source/result mode switch instead of squeezing both panes.

## Do's and Don'ts

### Do

- Use the botanical canvas and working-paper sheet as the default application frame.
- Give every overview page one unmistakable operational focal point.
- Use serif type for page and object identity, Archivo for controls and dense work.
- Prefer rules, ledgers, and open document sections to repeated containers.
- Use saffron for the breadcrumb and for time-critical cues only — a countdown, a "next" marker, the edge of the service that is running out of time. It is never decoration and never an underline beneath a title.
- Keep planned modules visually quiet or hidden.
- Design loading skeletons to match the final composition.
- Write authored empty states with one clear next action.
- Preserve live data, route behavior, authentication, tenancy, and calculations.
- Preserve Event context and show where a fact is owned before offering edits.
- Render policy denial, guard failure, constraint blocks, and concurrency conflicts as distinct operator outcomes.

### Don't

- Do not use a dark admin-template sidebar as the primary brand expression.
- Do not start every page with four equal KPI cards.
- Do not use purple gradients, glassmorphism, glow, or landing-page gimmicks.
- Do not make every section a rounded card.
- Do not use pills for ordinary labels or values.
- Do not use fake recipes, fake events, fake revenue, or decorative activity.
- Do not let “SOON” modules define the navigation.
- Do not transplant Capsule-Pro components without recomposing their hierarchy.
- Do not infer a workflow is ready from artifact counts or generated hook presence alone.
- Do not duplicate domain status, calculations, permissions, or cross-system consequences in presentation code.
- Do not copy Galley trademarks, text, proprietary imagery, or exact layouts.

## Responsive Behavior

### Breakpoints

| Name          |       Width | Key Changes                                                          |
| ------------- | ----------: | -------------------------------------------------------------------- |
| Small Mobile  |      <520px | Masthead actions stack, title scale reduces, one-column controls     |
| Mobile        |   520–767px | Rail becomes mobile menu, sheet frame reduces to 10px, ledgers stack |
| Tablet        |  768–1024px | Primary/secondary journal columns collapse, full sheet remains       |
| Desktop       | 1024–1440px | 72px rail, split journal grid, four-column outlook strip             |
| Large Desktop |     >1440px | Sheet caps at 1440px and botanical frame expands around it           |

### Touch Targets

Navigation icons use 42px targets. Primary page actions should use 40px height when isolated. Dense table and form controls may remain 32px on desktop, but mobile interaction surfaces should approach 40px where the composition allows.

### Collapsing Strategy

- Desktop icon rail becomes a compact mobile menu.
- Journal grids collapse with the primary service or recipe content first.
- Four-column metrics become two columns.
- Catalog metadata reduces before names, primary status, or actions disappear.
- Tables become structured rows when horizontal scrolling would obscure core context.
- Split workbenches become a mode switch or sequential flow.
- Large serif titles wrap naturally; they are not replaced by small generic headings.

## Accessibility

- Maintain semantic heading order inside every working document.
- Icon-only controls require accessible names and visible focus.
- Keyboard focus uses a 2px saffron outline with 2px offset.
- Color reinforces but never replaces text or icon status.
- Body text, controls, focus, and semantic states must meet WCAG AA contrast.
- Respect `prefers-reduced-motion`; page and hover transitions reduce to effectively zero.
- Dense tables and ledgers require meaningful headers and row relationships.
- Empty, loading, and error states must be announced appropriately without mounting protected queries before authentication.

## Iteration Guide

1. Start from the owning document in [`docs/systems/`](docs/systems), then identify one operator outcome and one route family.
2. Trace its canonical entities, commands, relationships, policies, and reactions in `C:\projects\Manifest-source\src`.
3. Check [`docs/generation/projection-status.md`](docs/generation/projection-status.md) and verify the current generated queries, hooks, mutations, and reaction paths.
4. Use Capsule-Pro only to recover behavior, terminology, and edge cases for matching concepts; do not copy its architecture or presentation.
5. Choose the page archetype before styling: operational journal, catalog, dossier, working ledger, execution board, workbench, or reconciliation folio.
6. Write focused coverage before implementation, including lifecycle and role-based denials.
7. Connect only real live data; omit or explain unavailable capability.
8. Verify loading, populated, empty, error, denied, conflict, desktop, mobile, keyboard, and reduced-motion states.

The authoritative vertical-slice sequence lives in [`docs/product/implementation-plan.md`](docs/product/implementation-plan.md). Do not maintain a second parity list here.

## Implementation Sources

- Product purpose and evidence hierarchy: `C:\projects\Manifest-source\capsule-product-definition.md` (read-only)
- Canonical domain behavior: `C:\projects\Manifest-source\src` (read-only)
- CapsuleX system map and status: [`docs/systems/index.md`](docs/systems/index.md)
- Design tokens and implemented components: [`src/styles/app.css`](src/styles/app.css)
- Shared application shell: [`src/app/shell`](src/app/shell)
- Generated capability contract: `src/generated/manifest-wiring-contract.json` (generated; do not edit)
- Current projection evidence: [`docs/generation/projection-status.md`](docs/generation/projection-status.md)
- Stored visual references: [`docs/design-references/galley`](docs/design-references/galley)

## Known Gaps

- The display serif uses system fallbacks; no bundled proprietary serif font is currently included.
- Implemented domain UI currently includes Event planning, Culinary planning, and the Inventory/Procurement demand-to-order workspace. Production, Workforce, Logistics, Commercial, and Closeout remain planned.
- Manifest 3.6.12 has structurally corrected the previously recorded PX001–PX003 reaction projection defects. Cross-system automation must not be presented as end-to-end verified until the authenticated runtime reaction tests identified in [`docs/generation/projection-status.md`](docs/generation/projection-status.md) pass.
- Search, exact decimal/money handling, and several canonical product decisions remain open or degraded; system docs identify where they affect experience design.
- Recipe import, rich media, multilingual views, training modules, vehicles/returns, facilities, notifications, and other Capsule-Pro-only capabilities are outside the current canonical source boundary.
- Mobile shell behavior exists, but every domain archetype still requires implementation and visual verification when its slice ships.
- The current design system lives primarily in `src/styles/app.css`; component-level extraction should happen only when a repeated production need appears.

## Stored References

- [`landing-page.png`](docs/design-references/galley/landing-page.png) — Recipe Book brand, editorial type, botanical framing, and product narrative.
- [`recipe-dashboard.png`](docs/design-references/galley/recipe-dashboard.png) — overview-to-detail relationship.
- [`recipe-single.png`](docs/design-references/galley/recipe-single.png) — desktop culinary detail hierarchy.
- [`recipe-pages.png`](docs/design-references/galley/recipe-pages.png) — desktop and mobile cookbook patterns.
- [`recipe-cookbook-import.png`](docs/design-references/galley/recipe-cookbook-import.png) — source-to-recipe split workbench.
