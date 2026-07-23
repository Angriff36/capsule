# Findings & Decisions: Tax Rate Configuration

## Requirements
- Define named tax rates such as state sales tax, local food tax, and service tax.
- Store a percentage and applicability rules for food, service, and rental.
- Automatically apply matching rates to invoice line items.
- Report collected tax totals for remittance.
- Follow existing Capsule/Manifest generation and UI patterns.
- Verify core behavior with a temporary Playwright test, then delete it.
- Finish with the exact user-required `<summary>` structure.

## Research Findings
- The checkout started dirty with broad intentional/generated work already present; changes must be narrowed and compared carefully.
- Existing Vite and Convex local processes are running; no active Builder regeneration process was found.
- `npx` is available at `C:\Program Files\nodejs\npx.ps1`.
- No relevant tax/invoice entry was found in the memory registry search, so current repository files are the source of truth.
- The current invoice model stores only aggregate `subtotal`, `taxAmount`, `discountAmount`, and `total`; both invoice Manifest files explicitly say `InvoiceLine` is not modeled yet.
- Invoice issue currently accepts tax as a manually entered amount and enforces only aggregate total consistency.
- The approved-event reaction creates an invoice with zero tax, so tax configuration must integrate without making that existing lifecycle brittle.
- `InvoiceDetailPage.tsx` already has concurrent deposit/reminder/PDF work; any line-item additions must be surgical and preserve those changes.
- The domain-gating rule says financial integrity is a valid place for proportionate constraints, but new role or lifecycle friction should not be invented.
- `InvoiceIssueForm.tsx` currently asks users to enter subtotal, tax, and total separately; this is the main tedium and inconsistency point to replace with categorized line entry and computed totals.
- The finance workspace has route constants and a shared tab bar; a dedicated Tax page can fit without altering top-level navigation.
- `InvoicesPage.tsx` creates invoices through `useCreateInvoice` and presently passes the four manually entered money totals directly.
- The root Manifest imports both `invoice-core.manifest` and `invoice.manifest`; new tax/line entities can be authored as a separate sales module and imported directly from the root to respect the no-daisy-chain rule.
- Generated entity creation follows a `createVia<first command>` pattern (for example `useCreateInvoice` → `Invoice_createViaIssue`), so a `TaxRate.define` and `InvoiceLine.add` command will naturally produce React hooks after regeneration.
- Existing finance authorization uses `financeAccess`; tax configuration and invoice lines should reuse it rather than invent a specialty role.
- Manifest supports quantity × money calculations (`Equipment.totalValue`, `VendorOrderLine.lineTotal`), so invoice line subtotal and tax can be derived from quantity/unit price rather than accepted as arbitrary amounts.
- The UI can add a dedicated configuration page while invoice detail uses reactive lists of `TaxRate` and `InvoiceLine`; no custom Convex seam is needed for basic persistence and display.
- Manifest reaction fan-out only matches one scalar field by equality, so a fully server-selected multi-applicability tax fan-out would require extra mapping/collection entities and a deep reaction chain.
- Manifest supports governed `json` properties and command parameters. Storing line-item and tax-allocation snapshots atomically on `Invoice.issue` avoids partial invoice/line writes while preserving named-rate remittance evidence.
- The generated create mutation returns `{ docId }`; separate child creation is possible but would not be atomic across client-side calls.
- Applicability lists can be represented cleanly on `TaxRate` with three booleans; the authored calculator can query active rates, match them to each line category, round each rate allocation to cents, and pass the complete snapshots into the governed invoice command.
- Builder regeneration completed conflict-free and generated list/get/create/revise/activate TaxRate hooks plus Invoice JSON validators and storage.
- Generated Invoice create paths default both snapshots to empty arrays, preserving approved-event and older manual callers that do not provide itemization.
- TypeScript passed after generation and the authored files were formatted with targeted Prettier only.
- A short stability check found no active Codex/Builder process and no further writes to the task plan, tax manifest, or calculator; the existing feature work was safe to continue without racing another session.
- The new tax guards protect financial integrity only (valid name/rate/applicability) and reuse `financeAccess`; they do not introduce a new role, approval, or lifecycle denial.
- Playwright directly verified stacked state/local food rates, service-only applicability, tax-exempt suppression, atomic invoice snapshots, and proportionally collected remittance totals.
- The temporary Playwright spec, harness, and config were deleted after the passing run; pre-existing report image/PDF artifacts were preserved.
- `bun run check` is blocked before feature verification by unrelated Event direct-API integration violations tracked in issue #40; full runtime tests also reproduce the pre-existing Event-to-Invoice finance authorization problem tracked in issue #32.
- A current shared-tree typecheck is blocked by concurrent proposal-PDF work passing `organizationName` to a type that does not declare it; the production Vite build succeeds.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Govern `TaxRate` in Manifest and snapshot calculated invoice lines/tax allocations on `Invoice.issue` | Named configuration stays editable while issued invoices retain the exact historical basis used for tax and remittance. |
| Reuse the finance workspace visual language | Keeps the new configuration/reporting surface coherent with the authored UI instead of introducing a disconnected design system. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| The worktree contains many unrelated edits and untracked files | Preserve them, use task-specific plan files, and only edit files proven necessary. |
| Manifest constraints cannot reference computed properties | Inlined the three applicability booleans in `taxRateComplete`; regeneration then passed. |

## Resources
- `AGENTS.md`
- `.aboardai/context/codex-implementation.md`
- `.aboardai/context/computer-use.md`
- `.aboardai/context/review-changes.md`

## Visual/Browser Findings
- Invoice lines automatically combined a 6.25% state rate and 1.5% local food rate on a $1,000 food line ($77.50 tax, $1,077.50 total).
- After changing the food line to $200 and adding two $100 service units, the composer recalculated $34 tax and a $434 total from the applicable named rates.
- Choosing a tax-exempt client immediately reduced tax to $0 and total to $400.
- The submitted payload contained two itemized snapshots and the named tax breakdown; remittance showed $13.13 collected with $9.38, $0.75, and $3.00 allocated to the three rates.
