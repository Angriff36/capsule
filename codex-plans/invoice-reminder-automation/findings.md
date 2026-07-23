# Invoice Reminder Automation Findings

## Initial state

- Branch: `main`.
- The checkout contains extensive pre-existing authored and generated changes plus untracked feature files.
- No invoice-reminder-specific entry was found in `C:\Users\Ryan\.codex\memories\MEMORY.md`.
- All unrelated changes must remain untouched.

## Live audit discoveries

- `Invoice.sendBalanceReminder` already exists in authored Manifest and generated bindings, but it is a one-shot manual command: it stamps `balanceReminderSentAt` and emits `InvoiceBalanceReminderSent`.
- The current invoice detail UI explicitly tells the operator that the PDF was downloaded and must be attached manually; it does not send email.
- `convex/crons.ts` is currently generated and contains no scheduled jobs.
- Invoice records already have `dueDate`, `amountDue`, `status`, `paidAt`, client linkage, and invoice PDF rendering support.
- Existing payment application logic sets `amountDue` and stamps `paidAt` when the balance reaches zero, which can be used to suppress future reminders.
- Existing untracked `convex/emailNotifications.ts` and authored notification preference work may provide a current email/action seam; it must be inspected without overwriting concurrent work.
- `src/sales/invoice-core.manifest`, invoice UI files, commercial billing docs, and generated outputs contain substantial pre-existing changes from other features. Any edit to them is overlap-sensitive.
- Repository rules require outbound notifications to use emits plus an outbox/EventBus or an explicit worker; Manifest `webhook` is inbound-only.
- Any new Manifest guard must prevent concrete harm and avoid user tedium. For reminders, the essential suppression condition is no outstanding payable balance / already paid, not extra role or lifecycle friction.
- The commercial billing architecture confirms that settled payments already apply to invoices through the generated `PaymentSettled` reaction.
- The existing email notification work is provider-neutral rendering and current-user preference gating only; it does not send email and is aimed at staff subscriptions, not invoice clients.
- There is no email-provider or Stripe SDK dependency. Convex actions are available (`convex/clientPortal.ts` uses one), so a provider HTTP API can be called without adding an SDK if the repo has an accepted env contract.
- The tenant branding seam already resolves organization display name, address, and brand colors. The browser-side invoice PDF builder uses jsPDF, but server delivery will need a server-safe PDF representation or a server-capable shared renderer.
- Generated `convex/crons.ts` is empty. A supported authored registration/import seam or Manifest schedule projection must be proven before adding scheduling.
- Client delivery addresses exist on encrypted `Client.email` / `ClientContact.email`; a background worker cannot safely assume raw `ctx.db` values are plaintext.
- `.env.example` currently has no email-provider, Stripe, or public application-origin contract.
- The existing client portal token is event-scoped only and is not a payment link.
- Manifest does support `schedule ... cron ... run ...`, and the Convex projection is intended to generate cron wiring. The exact projection target limitations still need inspection.
- Manifest's Convex orchestration generator maps schedules directly to generated `api.mutations.<Entity>_<command>` references. It cannot directly register an authored action without a projection change.
- The current auth seam returns anonymous context for scheduled/internal invocations, so a generated scheduled tenant command cannot execute successfully without broader Manifest/Builder system-identity work.
- A supported Capsule-local alternative is to register durable per-invoice jobs through `ctx.scheduler.runAt` from an authenticated authored mutation when the invoice is sent. Scheduled internal actions can re-read the invoice and skip paid/stale jobs.
- Schedule replacement can be made safe without cancelling opaque job ids: persist offsets and a configuration timestamp/due-date snapshot on the invoice, then have each scheduled action verify that its job still matches the current configuration before delivery.
- The generated cron surface cannot solve per-invoice offset scheduling directly because schedule parameters are static and target a command mutation; invoice ids/due dates are dynamic.
- Authored Convex seams already perform direct infrastructure operations (file storage) and locally decrypt only authorized encrypted fields (personal data export), providing patterns for a tightly scoped background delivery worker.
- The current invoice UI calculates its manual reminder relative to the linked event start, not the invoice due date required by this feature. The automation should use `invoice.dueDate` and replace the one-shot/manual copy.
- `manifestEvents` has indexes by type/entity/entityId and can provide a durable delivery/audit ledger without introducing a hand-authored schema table.
- Invoice status/payment data already supports the exact stop predicate: live invoice, positive `amountDue`, and one of `sent`, `viewed`, `overdue`, or `partial`.
- Official Resend email send supports base64 attachment content and an `Idempotency-Key` header; keys are retained for 24 hours.
- Official Stripe Checkout Sessions support a server-created hosted payment URL and expose `payment_status` on retrieval. Stripe recommends a new Session per payment attempt, so each reminder can create a fresh link while later jobs inspect prior session ids for receipt.
- Invoice send is a single generated mutation in `InvoiceDetailPage`; the authored scheduler can be invoked immediately after it succeeds.
- Recipient selection can prefer an active billing contact, then an active primary contact, then the encrypted client account email.
- Schedule configuration and delivery ledger payloads fit the existing `manifestEvents` table without schema edits; its `by_entityId` index permits scoped history reads.
- When configuration occurs after one or more checkpoints, scheduling every missed checkpoint would spam the client. The implementation queues only the most recent missed checkpoint immediately plus all future checkpoints.
- Delivery audit events omit the plaintext recipient address; provider failure messages redact email-shaped text before persistence.
- Final diff inspection confirms the checkout still contains extensive unrelated feature work, including new concurrent equipment changes. The invoice-reminder implementation remains confined to new authored reminder modules plus narrow invoice-detail, env-contract, docs, and generated API registration changes.
- Codegen refreshed all currently present authored Convex modules in `_generated/api.d.ts`; only the `invoiceReminders`/`lib_invoiceReminderPdf` registrations belong to this feature, while other generated imports reflect preserved pre-existing/concurrent work.
- Required full gate status: toolchain, ownership, proof emit/registry, and Manifest registry pin passed; execution then stopped on unrelated event hook violations in concurrent files. This blocker is already tracked as GitHub issue #40.
- Independent production build and secret scan pass. Repository-wide formatting is separately blocked only by 17 protected `.aboardai/**` state files not owned by this task.
- The timed-out attempt already created pure authored helpers for offset parsing/labels, branded reminder email rendering, and a server-safe jsPDF invoice attachment, but it did not create the Convex scheduler/delivery module or wire the UI to it.
- `convex/emailNotifications.ts` is only a signed-in staff preference/rendering query and is not appropriate for client invoice delivery; the new worker must remain a separate authored seam.
- The current schema has no reminder table, but `manifestEvents` supports typed payload records indexed by `entityId`; invoices carry all live stop-state fields and clients/contacts carry encrypted email fields.
- The existing UI reminder still uses event start plus one lead-day value and calls the generated one-shot command before downloading a PDF. It must be replaced with due-date schedule controls backed by the authored mutation/action.
- `.env.example` currently lacks the Resend, Stripe, sender-address, and public app-origin variables needed by server delivery.
