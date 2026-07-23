# Lead pipeline CRM implementation

## Outcome

Capsule now has a durable Lead entity and a `/clients/pipeline` workspace for prospective inquiries before a Client, ClientContact, or Proposal exists.

## Implemented

- Added lead identity, source, estimated value, stage, probability, notes, encrypted contact facts, and optional downstream links.
- Added reversible pipeline updates with 0–100 probability and non-negative value validation.
- Added generated, tenant-validated client/contact conversion and sent-proposal linking.
- Added a four-column pipeline board with weighted forecast metrics, capture, inline updates, explicit conversion, and explicit proposal creation/send.
- Added the pipeline route and Clients workspace navigation entry.
- Regenerated all owned Convex, schema, client-hook, wiring, proof, diagram, and generated-contract artifacts through Builder.

## Verification

- `bun run typecheck`
- Targeted Prettier check for authored UI files
- `bun run check:commercial-manifest`
- `bun run test -- tests/clients-routes.test.ts tests/manifest-convex.contract.test.ts` — 350 passed
- `bun run secrets`
- `bun run build`
- Temporary Playwright Chromium flow — 1 passed; spec and harness deleted

`bun run check` passed its early toolchain/ownership/proof/registry gates and then stopped at unrelated Event integration-guard violations already tracked in GitHub issues #56, #58, and #60.
