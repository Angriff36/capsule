# Credit Memo Issuance Findings

## Checkout baseline
- Branch: `main`
- Starting HEAD: `b080022`
- The checkout contains extensive existing modified and untracked work.
- Overlap already exists in `src/sales/invoice-core.manifest`, `src/sales/invoice.manifest`, `src/features/finance/InvoiceDetailPage.tsx`, `src/features/finance/InvoicesPage.tsx`, `src/features/finance/financeRoutes.ts`, and generated files.
- Existing work must be preserved exactly; active concurrent rewriting is a stop condition.

## Tooling
- `bun` is available and is the repository-mandated runner.
- `npx` exists, satisfying the Playwright skill prerequisite, but repository commands must use Bun.

## Existing billing model
- `Invoice` is tenant-scoped and client-linked, with optional Event and has-many Payment relationships.
- Invoice status already permits `paid -> partial`; `recordRefund` moves paid/partial invoices back to partial by reducing `amountPaid` and increasing `amountDue`.
- Issued invoices enforce `amountDue == total - amountPaid`, so a credit memo should not force a negative balance into the existing amount-due invariant without explicitly redesigning that invariant.
- Finance commands use `financeAccess` and generated React hooks imported from `src/lib/manifest-convex-react`.
- `InvoiceDetailPage` is the natural operator surface: it already displays lifecycle actions, balance, deposits, and related payments and uses compact inline forms/actions.
- The existing commercial billing documentation currently covers invoice, payment, refund, write-off, and void, but not credit memos.

## Binding domain guidance
- Money corrections belong on Invoice/Payment/closeout, not operational entities.
- Guards must address real financial harm and avoid invented role/lifecycle tedium.
- Do not describe unbuilt follow-on behavior as owner-deferred or shrink the product surface to a minimum allowlist.

## Exploration errors
- A second parallel read failed because the memory `rg` command returned exit code 1 for no matches, which rejected the combined script. Resolution: run repo reads separately and treat no memory matches as a normal result.

## Overlapping work baseline
- The invoice domain and detail UI contain pre-existing uncommitted deposit, reminder, tax, and PDF work. These edits are user/concurrent-session work and are not part of this feature.
- Baseline hashes were captured for `invoice-core.manifest`, `invoice.manifest`, `InvoiceDetailPage.tsx`, `CommercialLifecyclePolicy.ts`, and `app.manifest` so concurrent mutation can be detected before editing.
- `app.manifest` is also shared by several other active feature slices; any edit there must be minimal and rechecked immediately before applying.

## Domain and generated patterns
- There is no existing CreditMemo/credit-disposition model or comparable remaining-credit ledger in Manifest source.
- Existing generated bindings provide `useInvoiceRecordRefund`, but that command represents money returned against a Payment, not an accounting credit memo.
- A new Manifest entity will generate list/get/create-command hooks and Convex persistence when added to the root entry and regenerated through Builder.
- Existing invoice status/policy helpers are not required for a separate credit memo issue form; the invoice detail page can expose it specifically for eligible paid invoices.

## Playwright setup
- The repository does not declare Playwright in `package.json`.
- Another untracked temporary `client-portal-verification.spec.ts` already exists and must not be modified or deleted.
- This feature's temporary spec needs a unique path/name and must be removed after its run.

## Chosen implementation
- Add a durable `CreditMemo` Manifest entity tied to the paid source Invoice and Client, with a unique memo number, reason, amount, remaining amount, and issued/applied timestamps.
- A single issue command accepts `carry_forward` or `apply_to_balance`. Carry-forward memos remain available client credit; apply-to-balance requires a same-client open target invoice.
- Track nullable `creditMemoAmount` on the paid source invoice to cap cumulative issued credits against money actually paid without breaking pre-existing records.
- Track nullable `amountCredited` on target invoices and update the amount-due invariant to `total - amountPaid - amountCredited`.
- Generated event reactions record the credit against the paid source and, when a target is present, apply it transactionally to the target invoice. A nullable target uses the established optional `fanOut ... where id = payload...` no-op pattern for carry-forward.
- Add the issue form and related-credit ledger to `InvoiceDetailPage`; default to carry forward and only show eligible same-client open invoices as apply targets.
- Update commercial billing documentation after the generated contract is in place.

## Concurrency check
- Target hashes remained unchanged through 05:04 local time, at least 19 minutes after their last edits. The overlapping files appear stable rather than actively rewritten, so scoped edits can proceed with post-edit hash/diff review.

## Browser verification approach
- The normal app server is listening on IPv6 localhost:7811, but its fresh browser state remains at the real Clerk/Convex session check and cannot provide deterministic disposable finance data.
- Local `@playwright/test` and `playwright` packages are now available in `node_modules`.
- The required temporary Playwright test will run the real `InvoiceDetailPage` through a temporary Vite harness that aliases only the generated data hooks and branding hook to disposable in-memory records. This exercises the authored React UI and both user outcomes without touching real accounts or durable data.
- Generated mutation/reaction behavior is verified separately from the emitted Convex source and repository gates; the Playwright harness does not substitute for backend verification.

## Verification setup error
- The earlier unrelated `client-portal-verification.spec.ts` disappeared before inspection because its owning session deleted its temporary test as required. No action was taken on that session's files.

## Generated cumulative-credit defect
- Review of the generated `Invoice_recordCreditMemo` mutation found that the constraint using `priorCreditMemoAmount` compiled to `doc.priorCreditMemoAmount` before the local computed value was declared.
- Since that field does not exist, `amountPaid - undefined` becomes `NaN` and valid credit memo issuance would be rejected at runtime.
- The authored constraint now inlines the nullable `creditMemoAmount` fallback while retaining the computed value for the subsequent mutation.

## Full-gate baseline blocker
- `bun run check` passed toolchain, Builder ownership, proof emission/validation, and registry pinning, then stopped at `check:event-manifest`.
- The failures are confined to pre-existing untracked concurrent files `src/features/events/EventAllergenBriefingPage.tsx` and `src/features/events/EventIncidentPanel.tsx`, which directly use Convex hooks. The credit memo files are not implicated.
- Another active session also extended the new `CreditMemo` entity with client-merge staging/reassignment fields and reactions after this feature's initial regeneration. Those unrelated additions are being preserved and were not authored or reverted here.
- The event integration failure is already tracked as `Angriff36/capsule#40`: https://github.com/Angriff36/capsule/issues/40
