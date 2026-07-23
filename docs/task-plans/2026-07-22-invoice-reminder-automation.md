# Invoice Reminder Automation — completed 2026-07-22

## Outcome

Capsule can configure invoice reminder offsets relative to the invoice due date,
schedule durable deliveries when an invoice is sent, email a tenant-branded
message with a current PDF and Stripe Checkout link, and suppress later jobs
after the invoice or any prior Checkout Session reports payment.

## Implementation

- Authored Convex action/scheduler worker with encrypted recipient resolution,
  durable `manifestEvents` configuration/delivery records, deterministic provider
  idempotency, and bounded delivery retries.
- Shared schedule parser/labels, client email renderer, and server invoice PDF.
- Invoice-detail schedule form, current schedule display, automatic setup after
  Send, and Send reminder now action.
- Convex environment contract for Resend, Stripe, sender address, and public app
  origin.

## Verification

- `bun run codegen` — passed.
- `bun run typecheck` — passed.
- `bun run check:commercial-manifest` — passed.
- `bun run test -- tests/commercial-manifest-integration-guard.test.ts tests/finance-routes.test.ts tests/proofs/invoice-payment-lifecycle.runtime.test.ts` — 13 tests passed.
- `bun run secrets` — passed.
- `bun run build` — passed.
- Focused Bun smoke — schedule math, branded email, payment URL, and valid PDF
  bytes passed.
- `bun run check` — passed toolchain, ownership, proof registry, and Manifest pin,
  then stopped on unrelated direct-hook violations tracked in
  `Angriff36/capsule#40`.
- `bun run format:check` — feature source is formatted; repository-wide check is
  blocked only by 17 protected `.aboardai/**` JSON state files.
