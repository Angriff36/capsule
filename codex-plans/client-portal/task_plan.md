# Task Plan: Client portal

## Goal
Expose a secure read-only tokenized event view showing confirmed date, headcount, selected menu, and lifecycle status without requiring an organization account.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements and discovery
- [x] Capture user requirements and repository constraints
- [x] Trace event/menu data, routing, public Convex seams, and current dirty changes
- [x] Record findings
- **Status:** complete

### Phase 2: Plan the implementation
- [x] Choose the smallest authored/domain change matching existing patterns
- [x] Define token lifecycle, public read boundary, UI route, and failure states
- [x] Confirm generated paths remain untouched except through approved codegen
- **Status:** complete

### Phase 3: Implement
- [x] Add the tokenized read model and public route
- [x] Build the read-only client experience
- [x] Preserve unrelated user changes
- **Status:** complete

### Phase 4: Verify
- [x] Run focused static verification
- [x] Create, run, and delete a temporary Playwright spec
- [x] Run `bun run check` (attempted; shared baseline blocked by issues #40 and #32)
- **Status:** complete — scoped checks pass; repository gate remains blocked outside this feature

### Phase 5: Delivery
- [x] Review exact feature diff and worktree status
- [x] Retain planning evidence because the repository-wide gate is not green
- [x] Prepare the required tagged summary with blockers disclosed
- **Status:** complete

## Key Questions
1. What public/token patterns already exist in Convex HTTP or authored seams?
2. Where do event date, guest count, menu selection, and lifecycle status live now?
3. Can the feature be implemented without editing generated files directly?
4. What disposable browser state can prove public access and token rejection?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Treat all pre-existing changes as user-owned | The checkout was extensively dirty before this feature began |
| Keep planning artifacts feature-scoped | Existing root planning files belong to an unrelated payroll task |
| Sign event and tenant ids with a domain-separated HMAC key | Produces durable, tamper-resistant links without new storage or a second lifecycle |
| Call generated `queries.getEvent` from the share action | Keeps Manifest's capability and tenant policy authoritative |
| Return only an explicit anonymous DTO | Prevents contact, pricing, operational, and internal menu notes from leaking |
| Present EventDish selections as the event menu | This is the live source of selected food for an event |
| Add the public route outside `AuthGate` and `AppShell` | Clients need no account while operator routes stay protected |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Combined initial lookup stopped on an empty `rg` memory match | 1 | Reran independent reads with no-match handling |
| PowerShell passed `vite.config.*` and `playwright.config.*` literally to `rg` | 1 | Use `rg --files` or explicit paths instead of wildcard path arguments |
| Combined local API lookup exited 1 when an optional auth-propagation text search had no matches | 1 | Rerun required file reads independently and treat optional no-match searches as non-errors |
| Integration patch missed a concurrently added `ClientCommunicationPanel` import | 1 | Waited 25 seconds for the file to stabilize, re-read the exact current version, and applied a narrow additive patch |
| Targeted Prettier check found style differences in five portal-touched files | 1 | Run targeted Prettier write only on those files, then recheck |
| Convex API type cycle made the share action and downstream generated hooks infer `any` | 1 | Add explicit action return and Event document types; keep the generated Event query as the policy source |
| Temporary Playwright run could not connect to `127.0.0.1:7811` | 1 | Use the repository-documented `http://localhost:7811`, which the running Vite server answered during preflight |
| Public-route Playwright navigation waited on full `load` and never reached the assertion | 1 | Wait for `domcontentloaded`, which is sufficient for a Vite SPA with long-lived Clerk/Convex connections |
| Live dev deployment did not contain `clientPortal:getEvent` | 1 | Do not sync the broad dirty checkout; verify the real unavailable/populated components in a disposable harness and retain separate token/runtime checks |
| First fixture-adjustment patch mixed planning context into the spec hunk | 1 | Split application/spec edits from correctly targeted planning-file hunks |
| Recursive cleanup of the scoped Playwright result directory was blocked before execution | 1 | Enumerated its contents and deleted the sole `.last-run.json` artifact with `apply_patch` |
| Production build is blocked by unrelated `ClientsPage` import of missing generated `useCreateClientMerge` | 1 | Preserve the concurrent Client merge work; record the baseline failure and continue to the required full gate |
| `bun run check` stops at unrelated Event API-path guard violations | 1 | Preserve `EventAllergenBriefingPage` and `EventIncidentPanel`; run remaining relevant checks separately and report the baseline blocker |
| Final line-number lookup repeated a PowerShell-incompatible `rg` wildcard | 1 | Search the concrete `src/features/clientPortal` directory root instead |
