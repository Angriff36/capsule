# Task Plan: Email notification subscriptions

## Goal
Let each signed-in user independently control event update, invoice reminder, low-stock, and shift-change email categories, with notification emails rendered as branded HTML summaries containing safe deep links into Capsule.

## Current Phase
Complete

## Phases

### Phase 1: Requirements and discovery
- [x] Capture feature and verification requirements
- [x] Confirm no concurrent work overlaps this feature
- [x] Trace existing notification, identity, branding, routing, and Convex patterns
- [x] Read domain restraint guidance if Manifest changes are required
- **Status:** complete

### Phase 2: Implementation plan
- [x] Choose the smallest authored seams and generated-domain path
- [x] Record persistence, delivery, rendering, and UX decisions
- [x] Define focused verification
- **Status:** complete

### Phase 3: Implementation
- [x] Add per-user category persistence and enforcement
- [x] Add branded HTML summary rendering with deep links
- [x] Add settings UI and route exposure
- [x] Regenerate only through `bun run manifest:regen` if the domain changes
- **Status:** complete

### Phase 4: Verification
- [x] Run focused existing tests without adding permanent tests
- [x] Create, run, and delete the required temporary Playwright spec
- [x] Run `bun run check`
- [x] Inspect the final diff for unrelated changes
- **Status:** complete (repository gate is blocked by unrelated event files tracked in issue #40)

### Phase 5: Delivery
- [x] Retain the completed feature plan in its isolated `codex-plans/` folder for this shared session
- [x] Provide the exact required `<summary>` block as the final output
- **Status:** complete

## Key Questions
1. Does a notification delivery/subscription model already exist, and is it authored in Manifest or an authored Convex seam?
2. What existing current-user identity key should own preferences?
3. What branding source and deep-link route helpers already exist?
4. Can Playwright authenticate locally, or is a focused public preview/harness required?

## Decisions Made
| Decision | Rationale |
|---|---|
| Preserve every pre-existing dirty and untracked path | The shared checkout contains extensive user/concurrent work. |
| Use a feature-specific planning directory | Existing `codex-plans/` files belong to other tasks. |
| Do not add permanent tests | Root instructions prohibit adding or expanding tests unless the owner asks; the requested Playwright file is explicitly temporary. |
| Add an owner-scoped Manifest `EmailNotificationSubscription` row | Trusted `user.id` ownership works for every signed-in user and does not depend on optional Person linkage. |
| Default all four categories on and omit a global off switch | Existing users keep current behavior, while each category remains independently controllable as requested. |
| Use one-time governed `configure` plus `updateSubscriptions` | Matches Builder create-via inference while keeping subsequent preference writes explicit and server-authorized. |
| Add a provider-neutral Convex delivery-preparation query | It performs the server-side category check and returns branded HTML/deep-link payloads without choosing a paid email vendor. |
| Expose `/settings/email` from the account area, not primary admin navigation | These are personal preferences for every user, not an organization admin setting. |
| Use a refined dispatch-digest visual direction | It fits Capsule's operational aesthetic while making four independent channels and the email preview easy to scan. |
| Verify UI with a temporary Playwright spec against the existing `http://localhost:7811` server | The repo defines that URL, the server is already running, and the user explicitly requires a temporary spec. |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| Parallel inspection returned exit 1 because `rg` was given a non-existent `src/ui/icons.ts` candidate | 1 | Re-run only the known `src/ui/icons.tsx` path and keep the baseline diff command separate. |
| Complex quoted regex for generated Convex search was mangled by PowerShell and failed to parse | 1 | Replace it with a simple alternation pattern that does not embed quoted function calls. |
| Combined planning-file patch used an imprecise findings-table context and was rejected without changes | 1 | Split updates by file and match the exact existing wording. |
| Focused Prettier check included `.manifest` files, for which no parser exists, and found three TS files needing formatting | 1 | Exclude Manifest sources and run Prettier only on the authored TS/TSX files. |
| The root has no `playwright.config.ts`; the probe logged a non-terminating missing-file error | 1 | Use an isolated temporary Playwright config and Vite harness under `output/playwright/`, then delete the whole feature directory. |
| Temporary Playwright config used CommonJS `__dirname` in this ESM repository | 1 | Derive the harness directory with `fileURLToPath(import.meta.url)` and `path.dirname`. |
| First browser run used four parent traversals from `output/playwright/<feature>`, resolving outside the repository | 1 | Correct all harness imports and Vite `repoRoot` to three parent traversals. |
| Combined verification-log patch had an invalid empty hunk separator and was rejected | 1 | Split the planning and fixes updates into valid per-file patches. |
| `bun run check` stopped at `check:event-manifest` on two unrelated untracked Event pages | 1 | Preserved those owners; confirmed existing GitHub issue #40 and ran feature-scoped typecheck, formatting, secrets, contract, build, and Playwright gates. |
