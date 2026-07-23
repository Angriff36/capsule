# Invoice Reminder Automation Plan

## Goal

Implement configurable automated invoice payment reminder emails that include tenant branding, an invoice PDF, and a Stripe payment link, and stop after payment is received.

## Constraints

- Preserve all unrelated dirty and untracked work.
- Do not hand-edit generated or Builder-owned files.
- Do not add or expand tests unless the owner asks; run existing verification only.
- Read domain-gating guidance before changing Manifest policies or guards.
- Use `bun run manifest:regen` as the only regeneration path if Manifest changes are required.
- Do not commit, push, deploy, merge, or alter global configuration.

## Phases

1. **Live-state audit** — complete
   - Inspect current invoice, payment, branding, PDF, email, scheduler, and Stripe seams.
   - Identify any partial implementation and overlapping live edits.
2. **Design and scoped implementation** — complete
   - Reuse current authored patterns and modify only invoice-reminder-specific seams.
3. **Focused verification** — complete
   - Run relevant existing checks without adding tests.
4. **Repository gate** — complete
   - Run `bun run check` and separate feature failures from baseline/concurrent-work failures.
5. **Closeout** — complete
   - Record files, behavior, verification, and any proven blocker.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| Initial combined status/memory command returned exit 1 because `rg` found no matching memory entry | 1 | Treat no memory match as expected; continue from the live checkout |
| Parallel generator/auth inspection returned exit 1 after locating the generator because one requested path/search had no match | 1 | Use the proven `orchestration.ts` path and inspect files separately |
| Invoice/UI plus authored-seam inspection returned exit 1 because an `rg` regex was malformed | 1 | Keep the useful authored-seam output; rerun the UI read and schema searches with literal patterns |
| Parallel API-hook/tsconfig inspection returned exit 1 with no output because one requested optional file/search did not exist or match | 1 | Rerun with existence guards and non-failing searches |
| API-hook/tsconfig retry hit a PowerShell parser error from nested regex quoting | 2 | Avoid the complex regex and use separate fixed-string searches |
| Third API-hook/tsconfig inspection reported missing optional `convex/tsconfig.json` but returned the needed root TypeScript and hook evidence | 3 | Use root `tsconfig.json`; no separate Convex tsconfig exists in this checkout |
| Combined environment/docs patch missed a concurrently changed exact documentation line | 1 | Re-read the current file and reapplied the docs-only change with its live text |
| Targeted Prettier command could not infer a parser for `.env.example` after formatting several feature files | 1 | Exclude `.env.example` and format only supported source/docs files; its simple key/value additions need no formatter |
| Focused typecheck rejected the route `id` string where the new Convex action requires `Id<"invoices">` | 1 | Narrow the already-validated invoice route id at the action boundary with the generated `Id` type |
| Commercial integration guard rejected direct `convex/react` action hooks in `InvoiceDetailPage.tsx` | 1 | Move authored action-hook wiring behind a thin finance seam so the page consumes feature hooks and governed generated invoice commands stay unchanged |
| Full `bun run check` stopped at the unrelated event integration guard for direct Convex hooks in `EventAllergenBriefingPage.tsx` and `EventIncidentPanel.tsx` | 1 | Confirmed existing GitHub blocker issue #40; do not modify concurrent event feature work in this invoice-reminder task |
| First planning-file closeout patch used an incorrect multi-hunk context order | 1 | Re-read exact anchors and applied the status/error updates independently |
| Repository-wide `format:check` failed on 17 unrelated `.aboardai/**` state/event JSON files, including protected feature-board data | 1 | Preserve `.aboardai/**` exactly as instructed; feature source files were formatted directly and passed typecheck/build |

## Implementation decision

- Add an authored `convex/invoiceReminders.ts` scheduler/delivery module; do not alter generated cron or mutation files.
- Store schedule configuration, Stripe Checkout session references, skipped jobs, failures, and successful deliveries in `manifestEvents` keyed to the invoice.
- Schedule durable one-off jobs at configurable offsets from `invoice.dueDate`; every job verifies the latest config and live invoice balance/status before doing provider work.
- Use an active billing contact email, then active primary contact, then client account email.
- Create a fresh Stripe Checkout Session for each delivered reminder and poll previously created sessions before later sends to stop after Stripe payment receipt.
- Send through Resend with a deterministic idempotency key and a server-generated branded PDF attachment.
- Integrate the scheduler into the existing invoice Send flow and replace the manual-download reminder UX with schedule configuration plus Send now.
