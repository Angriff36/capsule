# Task Plan: Client Communication Log

## Goal
Implement a manual communication log that records calls, emails, and meetings against a Contact or Event with date, medium, summary, and author, then verify the user flow with a temporary Playwright test and the repository gate.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements and discovery
- [x] Capture feature and repository constraints
- [x] Trace existing Contact, Event, authored UI, and generated command patterns
- [x] Confirm the narrowest safe domain model and route surface
- **Status:** complete

### Phase 2: Plan
- [x] Define domain, regeneration, UI, and verification changes
- [x] Identify pre-existing changes in every target file
- **Status:** complete

### Phase 3: Implementation
- [x] Implement the authored Manifest model
- [x] Regenerate only through `bun run manifest:regen`
- [x] Implement the Contact/Event communication UI
- **Status:** complete

### Phase 4: Verification
- [x] Run focused existing checks
- [x] Create, run, and delete a temporary Playwright feature test
- [x] Run `bun run check` (blocked by documented unrelated repository failures)
- [x] Inspect the final diff for scope and generated ownership
- **Status:** complete with external gate blockers

### Phase 5: Delivery
- [x] Record resolved issues in the shared fixes log
- [x] Keep the plan in place because the full repository gate remains blocked
- [ ] Provide the exact required summary
- **Status:** in_progress

## Key Questions
1. Does the current Manifest source already define Contact, Client, Event, and user identity relationships suitable for a communication entry?
2. Which existing feature pages provide the least tedious Contact and Event access points?
3. Can the required browser verification run against the known local Vite URL without changing durable production data?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Preserve the existing dirty tree and use feature-scoped plan files | The checkout contains broad pre-existing authored and generated work that is outside this feature. |
| Do not add permanent tests | Repository instructions prohibit adding or expanding tests unless the owner asks; the user requested only a temporary Playwright test that must be deleted. |
| Add `ClientCommunication` as an immutable authored entity | A record-only model fits the requested audit-style history without inventing edit/delete lifecycle or approvals. |
| Use trusted `authorId` and readable `authorName` snapshot | The server proves who acted; the team sees a useful name even when Person synchronization is incomplete. |
| Mount one shared panel in Contact and Event contexts | Reuses the generated hooks and gives users the history where they already work, with no new navigation burden. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Trusted `authorId from context.actorId` remained a required generated Convex mutation arg and was not injected | 1 | Removed the trusted parameter and authored `mutate authorId = user.id`; regenerate, verify the surface, and file the required Capsule blocker issue. |
| Initial UI patch collided with a concurrently landed implementation | 1 | Stopped editing, verified target hashes were stable, preserved the landed implementation, and reviewed it before verification. |
| Playwright skill wrapper failed because `/bin/bash` is unavailable on this Windows host | 1 | Use the wrapper's underlying `npx --package @playwright/cli playwright-cli` command directly. |
| Targeted Prettier invocation included `.manifest` files, which have no registered parser | 1 | Supported TSX/Markdown files were formatted; keep Manifest formatting under Builder regeneration and do not repeat the unsupported invocation. |
| First temporary Playwright run could not find the Contact selector after opening the composer | 1 | Inspect the captured accessibility context, correct the harness/component state cause, and rerun only after a targeted change. |
| Moving Playwright output outside the Vite watch root did not stop the composer from remaining closed | 2 | Replace the functional disclosure toggle with an explicit current-state update, then run one final targeted attempt. |
| Explicit disclosure state still reset immediately in the disposable Vite page | 3 | Broaden diagnosis to Vite's first-load dependency optimization reload; wait for the harness network to settle before interaction and assert the disclosure state directly. |
| Settled-load run proved the form opens, but `getByLabel(..., exact)` did not resolve the accessible Contact combobox | 4 | Use Playwright's role/name locators shown by the captured accessibility tree. |
| PowerShell rejected a direct pipeline from a `for` loop during the stability check | 1 | Collected loop output in a variable, then piped the completed collection; all feature files were stable. |
| `bun run check` stopped at `check:event-manifest` on pre-existing direct Convex hooks in Event allergen/incident files | 1 | Preserve the unrelated files; blocker is already tracked in https://github.com/Angriff36/capsule/issues/40; run remaining gates individually. |
| `bun run test:coverage` reported 13 failures from existing Event/finance/nav drift plus governed-creation expectations missing TaxRate and new ClientCommunication | 1 | Do not edit or expand permanent tests without owner approval; record exact evidence and continue with build/format/baseline checks. |
| `bun run format:check` reports 200 unrelated AboardAI/Playwright/scratch files | 1 | Feature files were targeted-formatted; preserve external state and track repository config in issue #46. |
| `bun run baseline:decay` reports root entry count 56 above cap 44 | 1 | Do not violate root-entry architecture; track the stale threshold in issue #47. |

## Notes
- Full repository gate remains blocked by issues #32, #40, #46, and #47; feature-scoped generated ownership, integration, TypeScript, secret, Playwright, and build checks pass.
