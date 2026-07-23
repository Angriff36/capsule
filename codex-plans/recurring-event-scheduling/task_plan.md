# Task Plan: Recurring event scheduling

## Goal
Allow operators to configure weekly, monthly, or annual Event recurrence with an end condition, then generate due future Event instances as Drafts from a cron-driven source-of-truth workflow.

## Current Phase
Complete (repository gate blocked by tracked shared-checkout failures)

## Phases

### Phase 1: Requirements and discovery
- [x] Capture user requirements and repository constraints
- [x] Trace current Event domain, create UI, generated wiring, and cron patterns
- [x] Identify overlap with the pre-existing dirty worktree
- **Status:** complete

### Phase 2: Implementation plan
- [x] Define source-first domain and authored seam changes
- [x] Define UI behavior and recurrence boundary semantics
- [x] Record verification strategy
- **Status:** complete

### Phase 3: Implementation
- [x] Implement authored Manifest/UI/seam changes
- [x] Regenerate only through `bun run manifest:regen` if domain source changes
- [x] Preserve unrelated user changes
- **Status:** complete

### Phase 4: Verification
- [x] Run focused existing tests and typecheck as appropriate
- [x] Run `bun run check` and record tracked baseline blockers
- [x] Create, run, and delete a temporary Playwright verification spec
- **Status:** complete with external blockers

### Phase 5: Delivery
- [x] Review final diff and confirm temporary test removal
- [x] Archive completed plan under `docs/task-plans/`
- [x] Prepare the exact required `<summary>` block
- **Status:** complete

## Key Questions
1. Does Event already contain recurrence fields or a suitable template/entity pattern in the current dirty checkout?
2. What is the established generated cron/reaction shape, and what authored Convex seams are allowed?
3. How are Event records created today while preserving generated policies and Draft lifecycle state?
4. Can browser verification use an already-running app and existing authenticated sample tenant without destructive production actions?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Keep feature planning in a scoped subdirectory | The shared checkout already has unrelated planning files; isolation preserves concurrent/user work. |
| Treat all current working-tree changes as pre-existing until proven otherwise | The initial status is heavily dirty and must not be overwritten or reverted. |
| Store recurrence configuration on the source Event | This directly marks the Event recurring and keeps one operator-visible source of truth. |
| Support both end-on-date and after-occurrences | Both are familiar, explicit end conditions and avoid forcing operators into one planning style. |
| Anchor calendar math to the source start and occurrence sequence | Weekly/monthly/annual dates stay deterministic; month-end clamping does not accumulate drift. |
| Materialize Drafts up to 90 days ahead | Operators get useful review lead time without creating an unbounded series in one transaction. |
| Use a per-series durable scheduler with a revision token | Current Convex schedule projection cannot securely run a multi-tenant cron sweep; stale jobs self-cancel and the upstream limitation will be filed as a blocker. |
| Keep generated Event lifecycle commands authoritative except the internal materializer | Configuration/stop remain Manifest commands; the internal seam is the smallest projection-gap workaround and is not public. |
| Add a focused dossier panel | Operators can mark an already-planned Event recurring without complicating initial Event creation. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `rg: src\**\*.manifest` invalid Windows filename syntax | 1 | Switch to `rg` include globs via `-g '*.manifest'`. |
| `rg: playwright.config.*` invalid Windows filename syntax | 1 | Resolve config filenames with `rg --files -g` first. |
| Invalid `examples*` Windows path passed to `rg` | 1 | Search the package root using `-g` patterns. |
| Effect-lowering `rg` returned exit 1 with no matches | 1 | Locate render functions first, then inspect exact ranges. |
| Import-pattern `rg` had an unclosed group after PowerShell quoting | 1 | Use simpler patterns/literal reads. |
| `bunx manifest validate src/app.manifest` treated source as JSON IR | 1 | Use the source-oriented `scan`/compiler path documented by the CLI; do not repeat validate with a `.manifest` argument. |
| `bunx manifest scan src` reports 181 opaque per-module errors on the existing multi-file project | 1 | Treat scan as an unsuitable baseline command here; `src/app.manifest` itself scanned OK, and the approved Builder regeneration remains the authoritative compile/assembly check. |
| First typecheck: encrypted Event fields have no generated `*KeyId` columns | 1 | Inspect the generated encryption envelope shape and clone only schema-declared fields. |
| Event schema range helper matched multiple `events: defineTable` strings | 1 | The encryption implementation already proved the storage shape; use a single-match `rg`/first result if further schema inspection is needed. |
| Focused Event guard reports seven pre-existing violations in CommandFailure, allergen briefing, incident, and timeline files | 1 | Confirm the recurrence panel introduced no violation; keep unrelated work untouched and verify/update the existing tracked blocker before full-gate reporting. |
| Full `bun run check` stops at the same Event guard baseline | 1 | Confirmed coverage in open issues #40 and #56; ran downstream gates independently. |
| Repository format check reports unrelated inventory files | 1 | Removed Playwright's temporary `.last-run.json`; recurrence-authored files pass focused Prettier. |
| Coverage suite reports 14 failures across stale mappings, guards, navigation, and invoice authorization | 1 | Confirmed recurrence contract tests pass and existing issues #32, #40, #56, #61, #62, and #65 cover the failures. |
| Baseline decay reports root entry count 58 over cap 57 | 1 | Removed this task's screenshot/harness output; remaining `output/` artifacts belong to concurrent work and were preserved. |

## Constraints
- Do not hand-edit generated or Builder-owned paths.
- Use `bun run manifest:regen` as the only regeneration entry.
- Read domain-gating restraint before changing Manifest policy or guards.
- Do not add permanent tests; the requested Playwright spec must be temporary and removed.
- `bun run check` must pass before claiming completion.
- File the schedule-projection limitation as a GitHub issue before delivery.
