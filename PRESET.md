# convex-application v1.3.5

Assembled by Builder from Manifest-published Convex application proofs.
Status: **complete** (`verifyConvexApplicationAssembly` passed).

## Requirements
- [x] **Convex schema, queries, mutations, crons, HTTP, sagas, react (+ registry extras)** (convex-core)
- [x] **Consumer wiring contract and bindings** (wiring-contract)
- [x] **Agent context / LLM documentation** (agent-context)
- [x] **Docs and diagrams** (docs-diagrams)
- [x] **Frontend Convex API consumption contract** (frontend-convex-api)
- [x] **Shared validation synchronized with Convex API** (synced-validation)
- [x] **Seed / fixture support for Convex apps** (seed-fixtures)
- [x] **Generated contract tests** (contract-tests)
- [x] **Complete application assembly verification** (assembly-verification)

## Required companions
- wiring
- llm-context
- mermaid
- zod
- contract-tests

## Auth context seam
- Generated Convex surfaces import `getAuthContext` from `./lib/authContext`.
- Author module path: `convex/lib/authContext.ts` (fail-closed; customize IdP claims).
